# Agent Consent UI

A React and TypeScript confirmation primitive for consequential actions initiated by AI agents.

`agent-consent-ui` provides a deliberate slide interaction, a pluggable platform-authentication boundary, and action-specific authorization providers. It can be used for payments, file deletion, message sending, document signing, publishing, booking cancellation, deployments, and other actions that a user should explicitly approve.

> **Security principle:** the slider is only intent capture. It does not provide security by itself. Production authorization depends on a platform-owned authenticator and a server that independently verifies the exact intent before issuing a narrow grant.

The current npm-compatible package name is `@slide-to-pay/react`. The repository uses the broader `agent-consent-ui` identity so the project is not limited to payments.

## Features

- Reusable `SlideToAuthorize` React component for consequential agent actions.
- WebAuthn adapter for browser platform authenticators such as Face ID, Touch ID, and Windows Hello.
- Pluggable `ActionProvider` contract for any backend grant or capability system.
- Worked providers for delete actions and Stripe Shared Payment Token requests.
- Deprecated `SlideToPay` compatibility wrapper for existing payment integrations.
- Pointer, touch, and keyboard interaction with reduced-motion support.
- Responsive track sizing through `ResizeObserver`.
- Runtime validation for action intents, authentication results, and authorization grants.
- Demo-only providers isolated behind `@slide-to-pay/react/demo`.
- TypeScript declarations and an MIT license.

## Installation

### Install from npm

```bash
npm install @slide-to-pay/react
```

The package declares React and React DOM as peer dependencies. Your application should already provide React 18 or newer and React DOM 18 or newer.

### Install directly from GitHub

The repository is available at [github.com/mneshath7/agent-consent-ui](https://github.com/neshath/agent-consent-ui). Until a release is published to npm, an application can install the repository directly:

```bash
npm install github:mneshath7/agent-consent-ui
```

For production applications, prefer a tagged package release so dependency resolution is reproducible.

## Quick start: general action authorization

The following example authorizes a destructive file action. The UI displays the intent, invokes the configured authenticator after a completed slide, and then asks the action provider for a scoped grant.

```tsx
import {
  DeleteActionProvider,
  SlideToAuthorize,
  WebAuthnProvider,
} from "@slide-to-pay/react";

const authProvider = new WebAuthnProvider({
  challengeEndpoint: "/api/webauthn/challenge",
  verifyEndpoint: "/api/webauthn/verify",
});

const deleteProvider = new DeleteActionProvider({
  deleteEndpoint: "/api/actions/delete",
});

export function ConfirmDelete() {
  return (
    <SlideToAuthorize
      intent={{
        kind: "delete",
        subject: "Q3_financials_draft.xlsx",
        consequence: "File permanently deleted",
        description: "Instinct wants to remove a duplicate spreadsheet.",
        reversible: false,
        requestedBy: {
          agentName: "Instinct",
          agentId: "agent_instinct",
        },
      }}
      authProvider={authProvider}
      actionProvider={deleteProvider}
      onAuthorized={(grant) => {
        // Pass the narrow, expiring grant to the action executor.
        console.log("authorized", grant.grantId, grant.scope);
      }}
      onDeclined={(reason) => {
        console.log("authorization declined", reason);
      }}
      onError={(error) => {
        console.error("authorization error", error);
      }}
    />
  );
}
```

A successful slide does not directly authorize the action. The component first calls `AuthProvider.authenticate()`, then calls `ActionProvider.requestAuthorization()` only when authentication succeeds.

## Quick start: payment authorization

`SlideToPay` is retained for compatibility with the original payment-only API. New integrations should generally use `SlideToAuthorize` with `kind: "payment"`, but this wrapper remains useful when an application already uses `PurchaseIntent` and `TokenProvider`.

```tsx
import {
  SlideToPay,
  StripeSPTProvider,
  WebAuthnProvider,
} from "@slide-to-pay/react";

const authProvider = new WebAuthnProvider({
  challengeEndpoint: "/api/webauthn/challenge",
  verifyEndpoint: "/api/webauthn/verify",
});

const tokenProvider = new StripeSPTProvider({
  spendRequestEndpoint: "/api/stripe/spend-request",
});

export function ApproveCart() {
  return (
    <SlideToPay
      intent={{
        merchantId: "target_com",
        merchantName: "Target",
        amount: 11879,
        currency: "usd",
        description: "Pasta-night groceries — 21 items",
        requestedBy: {
          agentName: "Instinct",
          agentId: "agent_instinct",
        },
      }}
      authProvider={authProvider}
      tokenProvider={tokenProvider}
      onAuthorized={(token) => {
        // token.tokenId is a scoped payment token, not a card number.
        console.log("payment authorized", token.tokenId);
      }}
    />
  );
}
```

`amount` is represented in the smallest currency unit, such as cents for USD. The Stripe provider calls your backend; it never sends secret Stripe credentials from the browser.

## Demo

The demo presents two flows using the same authorization component: a Target grocery payment and an irreversible file deletion. The demo providers use simulated grants and a client-generated WebAuthn challenge for local illustration only.

From the repository root:

```bash
npm install
cd examples/demo
npm install
npm run dev
```

Then open the Vite URL shown in the terminal. The demo imports mock implementations directly from the source-level demo entry point. These mocks are intentionally excluded from the default production package export and must not be used in a real authorization flow.

The demo can also be built for production:

```bash
cd examples/demo
npm run build
```

## Architecture

The package separates the consent experience into three layers.

| Layer | Responsibility | Security meaning |
|---|---|---|
| `SlideToAuthorize` | Displays intent details and captures a deliberate gesture | UI only; zero security authority |
| `AuthProvider` | Invokes a platform-owned authenticator | Human-presence and user-verification boundary |
| `ActionProvider` | Exchanges successful authentication for a scoped grant | Backend-specific authorization decision |

This allows several applications to share the same consent interaction and authentication contract while using different grant systems.

```text
Application A: payments ─┐
Application B: deletes  ─┼─> shared AuthProvider ─> action-specific grant
Application C: signing  ─┘       WebAuthn / native        Stripe / delete / signing
```

The package does not execute the action itself. The host application receives the grant and passes it to its own action executor or backend workflow.

## API reference

### `SlideToAuthorize`

The primary component for all supported action kinds.

```ts
interface SlideToAuthorizeProps {
  intent: ActionIntent;
  authProvider: AuthProvider;
  actionProvider: ActionProvider;
  onAuthorized: (grant: ActionAuthorization) => void;
  onDeclined?: (reason: string) => void;
  onError?: (error: Error) => void;
  labelIdle?: string;
  labelAuthenticating?: string;
  className?: string;
  disabled?: boolean;
}
```

The component has these stages:

| Stage | Meaning |
|---|---|
| `idle` | Ready for a new authorization attempt |
| `dragging` | The user is moving the thumb |
| `authenticating` | The platform authenticator is being invoked |
| `requesting_grant` | The action backend is issuing a grant |
| `success` | A valid authorization grant was returned |
| `declined` | The user or authenticator declined the request |
| `error` | Availability, network, validation, or provider failure |

A completed pointer gesture must reach the configured 92% threshold. Keyboard users can focus the control and press Space or Enter to invoke the same authorization flow.

### `ActionIntent`

```ts
interface ActionIntent {
  kind: ActionKind;
  subject: string;
  consequence: string;
  description: string;
  detail?: Array<{ label: string; value: string }>;
  reversible: boolean;
  requestedBy: {
    agentName: string;
    agentId: string;
  };
}

type ActionKind =
  | "payment"
  | "send_message"
  | "delete"
  | "sign_document"
  | "share_credential"
  | "publish"
  | "cancel_booking"
  | (string & {});
```

The intent is used for display and is submitted to provider endpoints, but it must never be treated as authoritative by the backend. The server must independently verify or derive the action scope.

### `AuthProvider`

```ts
interface AuthProvider {
  isAvailable(): Promise<boolean>;
  authenticate(intent: ActionIntent): Promise<AuthResult>;
}

interface AuthResult {
  success: boolean;
  assertion?: unknown;
  reason?:
    | "user_cancelled"
    | "biometric_failed"
    | "not_available"
    | "error";
}
```

The package includes `WebAuthnProvider`. Native applications can implement the interface with iOS `LAContext` or Android `BiometricPrompt`, as described in [NATIVE.md](./NATIVE.md).

### `ActionProvider`

```ts
interface ActionProvider {
  requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult
  ): Promise<ActionAuthorization>;
}

interface ActionAuthorization {
  grantId: string;
  scope: Record<string, unknown>;
  expiresAt: number;
}
```

A provider should return a single-use or otherwise tightly constrained grant. The package validates that the grant has a non-empty ID, an object scope, and a future expiration time. The backend remains responsible for enforcing those properties when the grant is consumed.

### `WebAuthnProvider`

```ts
new WebAuthnProvider({
  challengeEndpoint: string;
  verifyEndpoint: string;
  fetchOptions?: Omit<RequestInit, "method" | "body">;
});
```

The provider performs the following sequence:

1. POSTs the action intent to `challengeEndpoint`.
2. Expects `{ publicKeyOptions, challengeId? }` from the server.
3. Invokes `navigator.credentials.get({ publicKey: publicKeyOptions })`.
4. Serializes the assertion’s binary fields to base64url.
5. POSTs `{ credential, intent, challengeId? }` to `verifyEndpoint`.
6. Expects `{ assertion }` after server-side verification.

`fetchOptions` can be used for application-controlled credentials, headers, or an abort signal. The provider always controls the POST method and request body.

### `DeleteActionProvider`

```ts
new DeleteActionProvider({
  deleteEndpoint: string;
});
```

The provider requires `intent.kind === "delete"` and sends the following shape to the configured backend:

```json
{
  "subject": "Q3_financials_draft.xlsx",
  "auth_assertion": "opaque-server-verified-assertion",
  "requested_by": {
    "agentName": "Instinct",
    "agentId": "agent_instinct"
  }
}
```

The expected response is:

```json
{
  "grant_id": "grant_123",
  "resource_id": "resource_456",
  "expires_at": 1770000000000
}
```

The resulting grant scope is `{ resourceId, action: "delete" }`.

### `StripeSPTProvider`

```ts
new StripeSPTProvider({
  spendRequestEndpoint: string;
});
```

The provider is used by the deprecated `SlideToPay` wrapper and sends payment details to your backend. The backend is expected to call Stripe with server-side credentials and return a token-shaped response:

```json
{
  "id": "spt_123",
  "usage_limits": {
    "max_amount": 11879,
    "currency": "usd"
  },
  "expires_at": 1770000000000
}
```

The provider rejects missing authentication assertions, malformed responses, expired tokens, negative limits, and currency mismatches.

### Runtime validation helpers

The default package exports these defensive helpers:

```ts
assertValidActionIntent(intent);
assertValidAuthorization(grant);
assertSuccessfulAuth(auth);
canonicalizeIntent(intent);
assertSameIntent(expectedIntent, receivedIntent);
```

These helpers reduce accidental misuse in client code. They are not cryptographic signatures and do not replace server-side verification.

### Demo-only entry point

The unsafe local providers are available only from the explicit demo entry point:

```ts
import {
  DemoAuthProvider,
  DemoActionProvider,
  DemoTokenProvider,
} from "@slide-to-pay/react/demo";
```

Do not use these classes in production. They simulate grants and do not provide a real server-side authorization boundary.

## Building a custom provider

A custom provider can map the shared contract to any backend capability system.

```ts
import type {
  ActionAuthorization,
  ActionIntent,
  ActionProvider,
  AuthResult,
} from "@slide-to-pay/react";
import {
  assertSuccessfulAuth,
  assertValidActionIntent,
} from "@slide-to-pay/react";

export class EmailSendProvider implements ActionProvider {
  constructor(private readonly endpoint: string) {}

  async requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult,
  ): Promise<ActionAuthorization> {
    assertValidActionIntent(intent);
    assertSuccessfulAuth(auth);

    if (typeof auth.assertion === "undefined") {
      throw new Error("Authentication assertion is required");
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: intent.kind,
        subject: intent.subject,
        auth_assertion: auth.assertion,
        requested_by: intent.requestedBy,
      }),
    });

    if (!response.ok) {
      throw new Error(`Authorization failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      grantId: data.grant_id,
      scope: {
        action: "send_message",
        recipients: data.recipients,
      },
      expiresAt: data.expires_at,
    };
  }
}
```

For a production provider, also validate the response schema, require an unexpired grant, and ensure the backend has independently bound the grant to the exact intent.

## Server-side security requirements

The client-rendered intent is not a security assertion. A secure backend integration should:

1. Generate a fresh, unpredictable WebAuthn challenge server-side.
2. Bind the challenge to the authenticated user, session, origin, relying-party ID, and canonical action intent.
3. Verify the assertion using a standards-compliant WebAuthn relying-party implementation such as [`@simplewebauthn/server`](https://simplewebauthn.dev/).
4. Reject expired, replayed, or already-consumed challenges.
5. Independently derive or verify the merchant, amount, recipients, resource, action, and agent identity.
6. Issue a least-privilege, short-lived grant for one action or resource.
7. Enforce single-use or idempotent consumption of the grant.
8. Apply authorization, CSRF protection where cookie credentials are used, rate limits, and audit logging on the backend.
9. Avoid logging raw WebAuthn assertions, payment credentials, or unnecessary personal data.
10. Keep secret payment-provider credentials exclusively on the server.

See [SECURITY.md](./SECURITY.md) for the project security policy and disclosure process.

## Accessibility

The component supports keyboard activation, live status announcements, pointer capture, touch interaction, responsive sizing, and reduced-motion preferences. The gesture must never be the only way to authorize an action.

Host applications should also ensure that:

- The intent text clearly identifies the recipient, amount or consequence, and requesting agent.
- Focus indicators remain visible against the host theme.
- The host application provides a non-drag equivalent that invokes the same authentication flow.
- Long subjects and descriptions wrap without hiding the action scope.
- Dynamic text sizing does not clip amounts or destructive consequences.

## Theming

The component uses CSS custom properties for its default visual tokens:

```css
:root {
  --s2a-bg: #111318;
  --s2a-fg: #ffffff;
  --s2a-track: #1d2029;
  --s2a-border: #262a33;
}
```

Pass `className` to the root element for host-specific styling. The current component uses inline layout styles and CSS variables for the primary surface colors.

## Native platforms

The React component is the web reference implementation. Native applications should preserve the same trust model while implementing the interfaces with platform APIs:

- iOS: `LAContext` and Face ID or Touch ID.
- Android: `BiometricPrompt` with a strong biometric policy.
- Native gesture: a drag-to-threshold interaction with an accessible confirm alternative.

See [NATIVE.md](./NATIVE.md) for integration sketches.

## Development

The package uses TypeScript, Vite, and Vitest.

```bash
npm install
npm run typecheck
npm run build
npm test
npm run check
```

`npm run check` runs typechecking, the production library build, and the security regression tests. The demo has its own dependencies and build command:

```bash
cd examples/demo
npm install
npm run build
```

## Project structure

```text
agent-consent-ui/
├── src/
│   ├── SlideToAuthorize.tsx      # Main consent component
│   ├── SlideToPay.tsx            # Deprecated payment wrapper
│   ├── types.ts                  # Public contracts and types
│   ├── security.ts               # Defensive validation helpers
│   ├── index.ts                  # Production package exports
│   ├── demo.ts                   # Explicit demo-only exports
│   └── providers/                # WebAuthn, Stripe, delete, and mock adapters
├── tests/
│   └── security.test.ts          # Security helper regression tests
├── examples/demo/                # Vite demonstration application
├── SECURITY.md
├── CONTRIBUTING.md
├── NATIVE.md
├── CHANGELOG.md
└── LICENSE
```

## Compatibility and naming

The repository name is `agent-consent-ui`, while the published package identity currently remains `@slide-to-pay/react` for compatibility with the original v0.2.0 package. A future breaking release can migrate to a neutral npm scope after a formal deprecation period.

`SlideToPay`, `PurchaseIntent`, `TokenProvider`, and `AuthorizationToken` are deprecated compatibility APIs. New code should use `SlideToAuthorize`, `ActionIntent`, `ActionProvider`, and `ActionAuthorization`.

## What this project is not

This is not a payment rail, wallet, policy engine, identity provider, or complete authorization backend. It does not store card numbers, verify WebAuthn assertions on the server, execute actions, or guarantee that an action can be undone.

It is an open-source client-side consent interaction and provider-contract reference implementation. The host application and backend must supply the actual identity, policy, verification, grant issuance, and action execution controls.

## License

MIT. See [LICENSE](./LICENSE).


## Express backend example

The repository includes a Node.js/Express example under [`examples/server`](./examples/server). It uses [`@simplewebauthn/server`](https://simplewebauthn.dev/docs/packages/server) to generate short-lived registration and authentication ceremonies, verify assertions, bind authentication to the exact action intent, and return an opaque verified assertion to the client provider.

```bash
cd examples/server
cp .env.example .env
# Set a long random SESSION_SECRET in .env
npm install
npm run dev
```

The example exposes these routes:

| Endpoint | Purpose |
|---|---|
| `POST /api/webauthn/registration/challenge` | Generate passkey registration options |
| `POST /api/webauthn/registration/verify` | Verify and store a passkey credential |
| `POST /api/webauthn/challenge` | Generate an authentication challenge bound to an intent |
| `POST /api/webauthn/verify` | Consume and verify the assertion and intent binding |
| `GET /health` | Liveness check |

The example uses in-memory storage and a development-only user selector. It is a reference implementation, not a drop-in production backend. Replace the user lookup with your authenticated session middleware, replace the in-memory store with durable transactional storage, and connect the verified result to an action-specific grant issuer. See [`examples/server/README.md`](./examples/server/README.md) and [`SECURITY.md`](./SECURITY.md) before adapting it for production.
