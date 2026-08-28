# slide-to-authorize

**A general confirmation primitive for anything an AI agent wants to do on your behalf that you can't easily take back.**

Payments are the obvious first case — an agent proposes a purchase, you approve it. The same shape appears everywhere agents operate: sending an email as you, deleting a file, signing a document, sharing a credential, publishing something, cancelling a non-refundable booking.

One gesture. One biometric gate. Pluggable per action. Drop the same component into any app that implements two small interfaces.

```bash
npm install @slide-to-pay/react
```

---

## Why this exists

Most agent products today handle high-stakes approval with a **link-out** to a hosted page in another tab or app. That is a full context switch away from the conversation.

This library collapses the round-trip into two motions **inside the same surface**:

1. **Slide** — deliberate physical motion (not an accidental tap)
2. **Face ID / Touch ID / Windows Hello** — platform-owned biometric the app cannot fake

No app switch. No separate tab. Same trust model whether you are authorizing a $118 grocery charge or the permanent deletion of a spreadsheet.

---

## The trust boundary (read this before integrating)

This matters more than the gesture:

| Layer | Responsibility | Security weight |
|-------|----------------|-----------------|
| `<SlideToAuthorize>` | UI only. Turns "approve" into a deliberate motion. | **Zero** |
| `AuthProvider` | Platform authenticator (WebAuthn / LAContext / BiometricPrompt). Must be a surface the calling app **cannot draw itself**. | **The real boundary** |
| `ActionProvider` | Exchanges successful auth for a **scoped, capped, single-use grant**. Never standing permission. | Issues the grant |

If you are tempted to render your own "confirmed ✓" UI instead of calling a real platform authenticator, stop — that defeats the entire point.

---

## Quick start — any action

```tsx
import {
  SlideToAuthorize,
  WebAuthnProvider,
  DeleteActionProvider, // or your own ActionProvider
} from "@slide-to-pay/react";

const authProvider = new WebAuthnProvider({
  challengeEndpoint: "/api/webauthn/challenge",
  verifyEndpoint: "/api/webauthn/verify",
});

const deleteProvider = new DeleteActionProvider({
  deleteEndpoint: "/api/actions/delete",
});

function ConfirmDelete() {
  return (
    <SlideToAuthorize
      intent={{
        kind: "delete",
        subject: "Q3_financials_draft.xlsx",
        consequence: "File permanently deleted",
        description: "Instinct wants to remove a duplicate spreadsheet.",
        reversible: false,
        requestedBy: { agentName: "Instinct", agentId: "agent_instinct" },
      }}
      authProvider={authProvider}
      actionProvider={deleteProvider}
      onAuthorized={(grant) => {
        // grant.grantId — single-resource, time-boxed delete permission
        console.log("authorized", grant);
      }}
      onDeclined={(reason) => console.log("declined:", reason)}
    />
  );
}
```

---

## Quick start — payments (Stripe Shared Payment Tokens)

```tsx
import {
  SlideToPay,
  WebAuthnProvider,
  StripeSPTProvider,
} from "@slide-to-pay/react";

const authProvider = new WebAuthnProvider({
  challengeEndpoint: "/api/webauthn/challenge",
  verifyEndpoint: "/api/webauthn/verify",
});

const tokenProvider = new StripeSPTProvider({
  spendRequestEndpoint: "/api/stripe/spend-request",
});

function ApproveCart() {
  return (
    <SlideToPay
      intent={{
        merchantId: "target_com",
        merchantName: "Target",
        amount: 11879, // cents
        currency: "usd",
        description: "Pasta night groceries — 21 items",
        requestedBy: { agentName: "Instinct", agentId: "agent_instinct" },
      }}
      authProvider={authProvider}
      tokenProvider={tokenProvider}
      onAuthorized={(token) => {
        // token.tokenId is a Stripe SPT — never a card number
      }}
    />
  );
}
```

`<SlideToPay>` is a thin compatibility wrapper around `<SlideToAuthorize>`. Prefer the general component for new code.

---

## Connecting multiple apps

The component is deliberately dumb. Any app that can:

1. Render React (or reimplement the slide gesture natively — see `NATIVE.md`)
2. Implement `AuthProvider` (once, shared)
3. Implement one or more `ActionProvider`s (per action kind)

…can drop this in. The **same** `WebAuthnProvider` (or native biometric adapter) can sit behind payments in App A, file deletes in App B, and document signing in App C. The trust surface stays consistent; only the grant-issuing backend changes.

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   App A     │   │   App B     │   │   App C     │
│  (payments) │   │  (deletes)  │   │  (signing)  │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────────┬────┴─────────────────┘
                    │
           ┌────────▼────────┐
           │  AuthProvider   │  ← WebAuthn / Face ID / Touch ID
           │  (shared)       │
           └────────┬────────┘
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  StripeSPT    DeleteGrant   SignCapability
  Provider     Provider      Provider
```

---

## Writing your own ActionProvider

```ts
import type { ActionProvider, ActionIntent, AuthResult, ActionAuthorization } from "@slide-to-pay/react";

class EmailSendProvider implements ActionProvider {
  constructor(private opts: { endpoint: string }) {}

  async requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult
  ): Promise<ActionAuthorization> {
    if (!auth.success) throw new Error("Auth required");

    const res = await fetch(this.opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: intent.subject,
        auth_assertion: auth.assertion,
        requested_by: intent.requestedBy,
      }),
    });

    if (!res.ok) throw new Error(`Authorization failed: ${res.status}`);
    const data = await res.json();

    return {
      grantId: data.grant_id,
      scope: { action: "send_message", recipients: data.recipients },
      expiresAt: data.expires_at,
    };
  }
}
```

Good candidates: send message/email, sign document, share credential/API key, publish post, cancel booking, temporary calendar/inbox access.

---

## Server-side verification (required)

`WebAuthnProvider` calls two endpoints **you** own:

| Endpoint | Job |
|----------|-----|
| `challengeEndpoint` | Generate a fresh WebAuthn challenge server-side. Return `publicKeyOptions`. |
| `verifyEndpoint` | Verify the assertion signature server-side. Only then treat auth as successful. |

Do **not** trust a client-only WebAuthn check. Use a standard relying-party library such as [`@simplewebauthn/server`](https://simplewebauthn.dev/).

For Stripe, `StripeSPTProvider` posts to your backend, which calls Stripe's spend-request API **with your secret key**. Never call Stripe SPT endpoints from client code. See [Stripe agentic commerce docs](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens).

---

## Native (iOS / Android)

The React component is the web reference. The **interfaces** (`AuthProvider`, `ActionProvider`) are what you reimplement per platform.

See **[NATIVE.md](./NATIVE.md)** for LAContext (iOS) and BiometricPrompt (Android) sketches. The slide gesture itself is a plain drag-to-threshold interaction with no special platform requirement.

---

## Theming

The component uses CSS custom properties so host apps can match their design system:

```css
:root {
  --s2a-bg: #111318;
  --s2a-fg: #ffffff;
  --s2a-track: #1d2029;
  --s2a-border: #262a33;
}
```

Pass `className` for additional host styling. The control is responsive and supports reduced-motion preferences.

---

## Accessibility

- Role `slider` with live `aria-valuenow` / `aria-valuetext`
- Keyboard: focus the track and press **Space** or **Enter** to authorize
- `aria-live` status region for success / decline / error
- Pointer capture + touch-action for reliable mobile dragging

---

## Demo

```bash
cd examples/demo
npm install
npm run dev
```

Two scenarios (payment + file delete) share the same component and biometric gate. The demo imports mock providers from the dedicated demo entry point; these providers are for local development only and must not be used in production.

---

## What this is not

- Not a new payment rail. It sits on top of whatever backend a given action needs.
- Not a way to skip user confirmation. Every completed slide still requires a real platform-verified biometric.
- Not production-hardened end-to-end. Treat the `Demo*Provider` classes as illustrations. Wire real server verification and grant issuance before shipping.

---

## API surface

| Export | Purpose |
|--------|---------|
| `SlideToAuthorize` | Main component |
| `SlideToPay` | Deprecated payments-only wrapper |
| `WebAuthnProvider` | Production WebAuthn adapter |
| `StripeSPTProvider` | Stripe Shared Payment Token example |
| `DeleteActionProvider` | Non-payment ActionProvider example |
| `assertValidActionIntent` / `assertValidAuthorization` | Defensive client-side validation helpers |
| `@slide-to-pay/react/demo` — `DemoAuthProvider` / `DemoActionProvider` / `DemoTokenProvider` | Local demos only; not part of the default entry point |
| Types: `ActionIntent`, `AuthProvider`, `ActionProvider`, `ActionAuthorization`, … | |

---

## License

MIT. Use it, fork it, put it in front of whoever you think should see it.


## Security boundary

This package provides a consent interaction and provider interfaces; it does not make a client application secure by itself. The slider carries no authorization weight. Production systems must use a platform-owned authenticator and a server-side authorization service that independently verifies the exact action intent.

Before issuing a grant, the backend must bind the authenticated user, agent identity, action kind, subject, consequence, amount or resource scope, challenge, origin, expiration, and one-time-use policy. It must reject replayed or expired challenges and must not trust amount, merchant, recipients, file names, or permissions solely because they were rendered by the client.

The default package entry point excludes demo providers. For local examples only, import them from `@slide-to-pay/react/demo`. Demo providers use simulated grants and do not perform production-grade server verification.

See [SECURITY.md](./SECURITY.md) for the threat model and vulnerability-reporting process.

## Open-source development

Run `npm install` followed by `npm run check` to typecheck and build the library. Run `npm run dev` to start the Vite demo. Contributions that change authentication, grant scope, provider contracts, or retry behavior should include tests and documentation updates; see [CONTRIBUTING.md](./CONTRIBUTING.md).
