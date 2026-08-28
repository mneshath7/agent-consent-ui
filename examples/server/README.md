# Express WebAuthn backend example

This example implements the backend contract consumed by `WebAuthnProvider` in the parent package. It uses [`@simplewebauthn/server`](https://simplewebauthn.dev/docs/packages/server) to generate and verify WebAuthn ceremonies.

## Run locally

```bash
cp .env.example .env
# Use a long random SESSION_SECRET before running
npm install
npm run dev
```

The server listens on `http://localhost:8787` by default. The React demo runs on `http://localhost:5173`.

This example has a development-only `x-demo-user-id` selector so it can be exercised without implementing an account system. It deliberately refuses that mode when `NODE_ENV=production`. Replace `getCurrentUser()` with the application’s authenticated session or token middleware before deployment.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/webauthn/registration/challenge` | Generates passkey registration options and a short-lived ceremony ID |
| `POST /api/webauthn/registration/verify` | Verifies registration and stores the credential public key and counter |
| `POST /api/webauthn/challenge` | Generates authentication options bound to the user and canonical action intent |
| `POST /api/webauthn/verify` | Consumes the ceremony, verifies the assertion, checks intent binding, and returns an opaque assertion |
| `GET /health` | Basic liveness check |

The authentication challenge response has this shape:

```json
{
  "publicKeyOptions": { "challenge": "...", "rpId": "localhost" },
  "challengeId": "uuid"
}
```

The verification request from `WebAuthnProvider` has this shape:

```json
{
  "credential": {
    "id": "credential-id",
    "rawId": "base64url",
    "type": "public-key",
    "response": {
      "clientDataJSON": "base64url",
      "authenticatorData": "base64url",
      "signature": "base64url",
      "userHandle": null
    }
  },
  "intent": {
    "kind": "delete",
    "subject": "report.pdf",
    "consequence": "Permanently delete report.pdf",
    "description": "Remove the duplicate report.",
    "reversible": false,
    "requestedBy": { "agentName": "Agent", "agentId": "agent_1" }
  },
  "challengeId": "uuid"
}
```

A successful response is:

```json
{
  "assertion": {
    "userId": "demo-user",
    "intentHash": "sha256-hex"
  }
}
```

The assertion is opaque to the React package. In a real application, the action provider should send it to a backend that issues and enforces the action-specific grant.

## Production requirements

The in-memory maps in `src/store.ts` are for demonstration only. Replace them with durable storage and consume ceremonies atomically. Persist each credential’s ID, public key, counter, transports, device type, backup state, and owning user. Update the signature counter after successful authentication.

The example sets `userVerification: "required"` and verifies the expected origin and RP ID. Keep those checks, configure the exact production origin and RP ID, use HTTPS, protect cookie-authenticated endpoints against CSRF, apply rate limits, and avoid logging assertions or sensitive payment data.

The server hashes the exact validated intent and compares it during verification. This is a useful binding check, but it is not a signature or policy engine. The backend must still derive and enforce the authoritative merchant, amount, recipient, resource, action, expiration, and grant scope.
