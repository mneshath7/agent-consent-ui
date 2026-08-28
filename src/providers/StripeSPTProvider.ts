import type {
  AuthResult,
  AuthorizationToken,
  PurchaseIntent,
  TokenProvider,
} from "../types";
import { assertSuccessfulAuth } from "../security";

/**
 * Requests a Stripe Shared Payment Token (SPT) after a successful auth.
 *
 * SPTs are Stripe's actual primitive for this exact purpose: scoped, capped,
 * time-limited, revocable tokens that let an agent complete a payment
 * without ever touching the underlying card. Docs:
 * https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens
 *
 * This provider calls YOUR backend, not Stripe directly — the SPT request
 * must be made server-side with your secret key. Never call Stripe's SPT
 * endpoints from client code.
 *
 * This implements the payment-typed TokenProvider interface, used
 * automatically when you use the `<SlideToPay>` wrapper (see SlideToPay.tsx)
 * around the general `<SlideToAuthorize>` component. Payments keep their
 * own typed amount/currency fields rather than being squeezed into the
 * generic `ActionProvider` shape, since amount handling is worth keeping
 * strongly typed. Other action kinds (delete, send_message, sign_document)
 * implement `ActionProvider` directly — see DeleteActionProvider.ts for a
 * worked example.
 */
export class StripeSPTProvider implements TokenProvider {

  constructor(
    private opts: {
      /** Your backend route that calls stripe.spendRequests.create(...) server-side */
      spendRequestEndpoint: string;
    }
  ) {}

  async requestToken(
    intent: PurchaseIntent,
    auth: AuthResult
  ): Promise<AuthorizationToken> {
    assertSuccessfulAuth(auth);
    if (typeof auth.assertion === "undefined") {
      throw new Error("requestToken called without an authentication assertion");
    }

    const res = await fetch(this.opts.spendRequestEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Mirrors: link-cli spend-request create
        //   --payment-method-id <csmrpd_...>
        //   --merchant-name <intent.merchantName>
        //   --amount <intent.amount>
        //   --context <intent.description>
        merchant_name: intent.merchantName,
        merchant_id: intent.merchantId,
        amount: intent.amount,
        currency: intent.currency,
        context: intent.description,
        auth_assertion: auth.assertion,
        requested_by: intent.requestedBy,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Stripe SPT request failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    // Expected shape from your backend, mirroring Stripe's SPT object:
    // { id, usage_limits: { max_amount, currency }, expires_at }
    const maxAmount = data?.usage_limits?.max_amount;
    const tokenCurrency = data?.usage_limits?.currency;
    if (
      typeof data?.id !== "string" ||
      !Number.isFinite(maxAmount) ||
      maxAmount < 0 ||
      typeof tokenCurrency !== "string" ||
      tokenCurrency.toLowerCase() !== intent.currency.toLowerCase() ||
      !Number.isFinite(data?.expires_at) ||
      data.expires_at <= Date.now()
    ) {
      throw new Error("Stripe SPT request returned an invalid or expired token");
    }
    return {
      tokenId: data.id,
      scopedTo: {
        merchantId: intent.merchantId,
        maxAmount,
        currency: tokenCurrency,
      },
      expiresAt: data.expires_at,
    };
  }
}
