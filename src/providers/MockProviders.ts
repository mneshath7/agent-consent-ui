import type {
  ActionAuthorization,
  ActionIntent,
  ActionProvider,
  AuthProvider,
  AuthResult,
  AuthorizationToken,
  PurchaseIntent,
  TokenProvider,
} from "../types";

/**
 * FOR DEMO/DEV ONLY.
 *
 * This still calls the browser's real WebAuthn platform authenticator when
 * available (so the demo shows the real Face ID / Touch ID / Windows Hello
 * prompt), but skips server-side challenge/verify since the demo has no
 * backend. Do not ship this in a real integration — see WebAuthnProvider
 * and README "Server-side verification" for the production path.
 */
export class DemoAuthProvider implements AuthProvider {
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

  async authenticate(_intent: ActionIntent): Promise<AuthResult> {
    const available = await this.isAvailable();
    if (!available) {
      // No platform authenticator in this environment (e.g. headless demo).
      // Real integrations should treat this as a hard failure, not a
      // silent pass — surfaced here so the gap is visible, not hidden.
      return { success: false, reason: "not_available" };
    }

    try {
      // Unscoped, client-generated challenge — fine for a local demo,
      // NOT SAFE for production. Production challenges must be generated
      // and verified server-side (see WebAuthnProvider).
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!credential) return { success: false, reason: "user_cancelled" };
      return { success: true, assertion: credential };
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        return { success: false, reason: "user_cancelled" };
      }
      return { success: false, reason: "error" };
    }
  }
}

/** FOR DEMO/DEV ONLY. Returns a fake token — wire up StripeSPTProvider for real use. */
export class DemoTokenProvider implements TokenProvider {
  async requestToken(
    intent: PurchaseIntent,
    auth: AuthResult
  ): Promise<AuthorizationToken> {
    if (!auth.success) {
      throw new Error("requestToken called without a successful AuthResult");
    }
    await new Promise((r) => setTimeout(r, 400)); // simulate network round trip
    return {
      tokenId: `demo_spt_${Math.random().toString(36).slice(2, 10)}`,
      scopedTo: {
        merchantId: intent.merchantId,
        maxAmount: intent.amount,
        currency: intent.currency,
      },
      expiresAt: Date.now() + 4 * 60 * 1000,
    };
  }
}

/**
 * FOR DEMO/DEV ONLY. Generic mock ActionProvider that grants any action
 * kind — used to demonstrate the primitive generalizing beyond payments
 * (e.g. "delete", "send_message") without needing a real backend. Wire up
 * DeleteActionProvider or your own ActionProvider implementation for
 * anything real.
 */
export class DemoActionProvider implements ActionProvider {
  async requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult
  ): Promise<ActionAuthorization> {
    if (!auth.success) {
      throw new Error("requestAuthorization called without a successful AuthResult");
    }
    await new Promise((r) => setTimeout(r, 400));
    return {
      grantId: `demo_grant_${Math.random().toString(36).slice(2, 10)}`,
      scope: { kind: intent.kind, subject: intent.subject },
      expiresAt: Date.now() + 4 * 60 * 1000,
    };
  }
}
