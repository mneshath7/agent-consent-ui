import type { ActionIntent, AuthProvider, AuthResult } from "../types";
import { assertValidActionIntent } from "../security";

/**
 * Routes authentication through the browser's native WebAuthn platform
 * authenticator (Face ID / Touch ID / Windows Hello via the OS).
 *
 * The browser renders the biometric prompt in a privileged context the page
 * cannot script, inspect, or spoof. This package only ever sees a pass/fail
 * plus an opaque assertion — never biometric data.
 *
 * Production integrations MUST:
 * 1. Generate the challenge server-side
 * 2. Verify the assertion signature server-side
 * Never trust a client-only WebAuthn check.
 */
export class WebAuthnProvider implements AuthProvider {
  constructor(
    private opts: {
      /** POST here to receive a fresh WebAuthn challenge for this intent */
      challengeEndpoint: string;
      /** POST here to verify the assertion server-side */
      verifyEndpoint: string;
      /** Optional extra fetch options (credentials, signal, etc.) */
      fetchOptions?: Omit<RequestInit, "method" | "body">;
    }
  ) {}

  async isAvailable(): Promise<boolean> {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      return false;
    }
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  }

  async authenticate(intent: ActionIntent): Promise<AuthResult> {
    try {
      assertValidActionIntent(intent);
      const challengeRes = await fetch(this.opts.challengeEndpoint, {
        ...this.opts.fetchOptions,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.fetchOptions?.headers as Record<string, string> | undefined),
        },
        body: JSON.stringify({ intent }),
      });
      if (!challengeRes.ok) {
        return { success: false, reason: "not_available" };
      }
      const challengePayload = await challengeRes.json();
      const publicKeyOptions = challengePayload?.publicKeyOptions;
      const challengeId = challengePayload?.challengeId;
      if (!publicKeyOptions || typeof publicKeyOptions !== "object") {
        return { success: false, reason: "error" };
      }
      if (challengeId !== undefined && typeof challengeId !== "string") {
        return { success: false, reason: "error" };
      }

      // Renders the OS-owned biometric sheet. The page's JS is suspended.
      const credential = (await navigator.credentials.get({
        publicKey: publicKeyOptions,
      })) as PublicKeyCredential | null;

      if (!credential) {
        return { success: false, reason: "user_cancelled" };
      }

      // Convert ArrayBuffers so the payload is JSON-serializable
      const serialized = serializeCredential(credential);

      const verifyRes = await fetch(this.opts.verifyEndpoint, {
        ...this.opts.fetchOptions,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.opts.fetchOptions?.headers as Record<string, string> | undefined),
        },
        body: JSON.stringify({
          credential: serialized,
          intent,
          challengeId,
        }),
      });
      if (!verifyRes.ok) {
        return { success: false, reason: "biometric_failed" };
      }

      const verifyPayload = await verifyRes.json();
      if (!verifyPayload || typeof verifyPayload.assertion === "undefined") {
        return { success: false, reason: "error" };
      }
      return { success: true, assertion: verifyPayload.assertion };
    } catch (err: unknown) {
      const name = err instanceof Error ? (err as DOMException).name : "";
      if (name === "NotAllowedError") {
        return { success: false, reason: "user_cancelled" };
      }
      return { success: false, reason: "error" };
    }
  }
}

/** Convert WebAuthn credential ArrayBuffers to base64url strings for JSON. */
function serializeCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
  };
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
