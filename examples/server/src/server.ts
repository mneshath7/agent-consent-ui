import crypto from "node:crypto";
import express, { type Request } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { config } from "./config.js";
import {
  consumePending,
  findPasskeyById,
  getUserPasskeys,
  savePasskey,
  savePending,
  users,
  type User,
} from "./store.js";

const app = express();
const ceremonyTtlMs = 5 * 60_000;

const intentSchema = z.object({
  kind: z.string().min(1).max(100),
  subject: z.string().min(1).max(500),
  consequence: z.string().min(1).max(1_000),
  description: z.string().min(1).max(2_000),
  reversible: z.boolean(),
  requestedBy: z.object({
    agentName: z.string().min(1).max(200),
    agentId: z.string().min(1).max(200),
  }),
  detail: z.array(z.object({
    label: z.string().min(1).max(200),
    value: z.string().max(1_000),
  })).max(50).optional(),
}).strict();

const credentialSchema = z.object({
  id: z.string().min(1),
  rawId: z.string().min(1),
  response: z.object({
    clientDataJSON: z.string().min(1),
    authenticatorData: z.string().min(1),
    signature: z.string().min(1),
    userHandle: z.string().nullable().optional(),
  }).strict(),
  type: z.literal("public-key"),
}).strict();

const verificationBodySchema = z.object({
  credential: credentialSchema,
  intent: intentSchema,
  challengeId: z.string().uuid().optional(),
}).strict();

function getCurrentUser(req: Request): User {
  // Replace this development-only selector with real session/JWT middleware.
  const requestedId = req.get("x-demo-user-id") ?? "demo-user";
  if (config.nodeEnv !== "development") {
    throw new HttpError(401, "Attach your authenticated-user middleware before using this example");
  }
  const user = users.get(requestedId);
  if (!user) throw new HttpError(401, "Unknown user");
  return user;
}

function intentHash(intent: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(intent)).digest("hex");
}

function getAllowedOrigins(): string[] {
  return [config.origin];
}

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: "32kb", strict: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-8", legacyHeaders: false }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/api/webauthn/registration/challenge", async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpID,
      userName: user.username,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.webAuthnUserID),
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
        authenticatorAttachment: "platform",
      },
      excludeCredentials: getUserPasskeys(user.id).map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
    });
    const challengeId = crypto.randomUUID();
    savePending(challengeId, {
      userId: user.id,
      options,
      expiresAt: Date.now() + ceremonyTtlMs,
    });
    res.json({ publicKeyOptions: options, challengeId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/webauthn/registration/verify", async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const challengeId = z.string().uuid().parse(req.body?.challengeId);
    const response = req.body?.credential as RegistrationResponseJSON;
    const pending = consumePending(challengeId);
    if (!pending || pending.userId !== user.id || !("rp" in pending.options)) {
      throw new HttpError(400, "Registration ceremony is missing, expired, or belongs to another user");
    }
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.options.challenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: config.rpID,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpError(400, "Registration could not be verified");
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    savePasskey({
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
      userId: user.id,
    });
    res.json({ verified: true, credentialDeviceType, credentialBackedUp });
  } catch (error) {
    next(error);
  }
});

app.post("/api/webauthn/challenge", async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const intent = intentSchema.parse(req.body?.intent);
    const options = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials: getUserPasskeys(user.id).map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports,
      })),
      userVerification: "required",
      timeout: 60_000,
    });
    const challengeId = crypto.randomUUID();
    savePending(challengeId, {
      userId: user.id,
      options,
      intentHash: intentHash(intent),
      expiresAt: Date.now() + ceremonyTtlMs,
    });
    res.json({ publicKeyOptions: options, challengeId });
  } catch (error) {
    next(error);
  }
});

app.post("/api/webauthn/verify", async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const body = verificationBodySchema.parse(req.body);
    const challengeId = body.challengeId;
    if (!challengeId) throw new HttpError(400, "challengeId is required");
    const pending = consumePending(challengeId);
    if (!pending || pending.userId !== user.id || !pending.intentHash) {
      throw new HttpError(400, "Authentication ceremony is missing, expired, or belongs to another user");
    }
    if (pending.intentHash !== intentHash(body.intent)) {
      throw new HttpError(400, "The authorization intent changed during authentication");
    }

    const passkey = findPasskeyById(user.id, body.credential.id);
    if (!passkey) throw new HttpError(401, "Credential is not registered for this user");

    const verification = await verifyAuthenticationResponse({
      response: body.credential as AuthenticationResponseJSON,
      expectedChallenge: pending.options.challenge,
      expectedOrigin: getAllowedOrigins(),
      expectedRPID: config.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.id,
        publicKey: Uint8Array.from(passkey.publicKey),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });
    if (!verification.verified) throw new HttpError(401, "WebAuthn assertion was not verified");

    passkey.counter = verification.authenticationInfo.newCounter;
    // In production, persist this counter atomically in the same database transaction
    // that records the authorization decision or challenge consumption.
    res.json({ verified: true, assertion: { userId: user.id, intentHash: pending.intentHash } });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request" });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  console.error("WebAuthn request failed", error instanceof Error ? error.message : error);
  return res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, () => {
  console.log(`WebAuthn example server listening on ${config.origin.replace(/:\/\/[^/]+/, `://localhost:${config.port}`)}`);
});
