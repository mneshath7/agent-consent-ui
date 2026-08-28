/**
 * Core types for slide-to-authorize.
 *
 * This is NOT a payments library. Payments are one instance of a more
 * general problem: an AI agent wants to take a consequential, hard-to-undo
 * action on a person's behalf — spend money, send an email as them, delete
 * a file, sign a document, share a credential, post publicly, cancel a
 * booking — and needs a deliberate, human-confirmed authorization first.
 *
 * Trust boundary:
 *
 *   1. SlideToAuthorize carries ZERO security weight. It is an intent-capture
 *      gesture only. Any app can render it for any kind of action.
 *
 *   2. AuthProvider is the trust boundary. It MUST be backed by a surface the
 *      calling app cannot draw itself — WebAuthn on web, LAContext on iOS,
 *      BiometricPrompt on Android.
 *
 *   3. ActionProvider exchanges a successful auth for a scoped, capped,
 *      revocable authorization to perform ONE specific action.
 */

/** What kind of consequential action is being requested. Extend freely. */
export type ActionKind =
  | "payment"
  | "send_message"
  | "delete"
  | "sign_document"
  | "share_credential"
  | "publish"
  | "cancel_booking"
  | (string & {});

export interface ActionIntent {
  kind: ActionKind;
  /** Short, human-scannable summary — e.g. merchant name, recipient, filename */
  subject: string;
  /** The specific consequence, phrased plainly — e.g. "$118.79 charge" */
  consequence: string;
  /** Longer human-readable description */
  description: string;
  /** Optional structured detail for richer confirmation UI */
  detail?: Array<{ label: string; value: string }>;
  /** Whether this action can be undone after authorization */
  reversible: boolean;
  /** Who/what is requesting this action */
  requestedBy: {
    agentName: string;
    agentId: string;
  };
}

/** @deprecated Use ActionIntent with kind: "payment". Kept for compatibility. */
export interface PurchaseIntent {
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  description: string;
  items?: Array<{ name: string; quantity: number; amount: number }>;
  requestedBy: {
    agentName: string;
    agentId: string;
  };
}

/** Converts the legacy payment-only shape into a general ActionIntent. */
export function purchaseIntentToActionIntent(p: PurchaseIntent): ActionIntent {
  return {
    kind: "payment",
    subject: p.merchantName,
    consequence:
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: p.currency.toUpperCase(),
      }).format(p.amount / 100) + " charge",
    description: p.description,
    detail: p.items?.map((i) => ({
      label: `${i.quantity}× ${i.name}`,
      value: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: p.currency.toUpperCase(),
      }).format(i.amount / 100),
    })),
    reversible: false,
    requestedBy: p.requestedBy,
  };
}

export type SlideCompletionResult =
  | { status: "completed" }
  | { status: "cancelled" };

export interface AuthResult {
  success: boolean;
  /** Opaque assertion from the platform authenticator, passed to ActionProvider */
  assertion?: unknown;
  reason?: "user_cancelled" | "biometric_failed" | "not_available" | "error";
}

export interface ActionAuthorization {
  /** e.g. a Stripe Shared Payment Token id, or any other action-specific grant id */
  grantId: string;
  /** What this grant actually permits — keep as narrow as the action requires */
  scope: Record<string, unknown>;
  expiresAt: number;
}

/** @deprecated Use ActionAuthorization instead. */
export interface AuthorizationToken {
  tokenId: string;
  scopedTo: {
    merchantId: string;
    maxAmount: number;
    currency: string;
  };
  expiresAt: number;
}

/**
 * Platform-owned auth surface. Identical regardless of action kind.
 * This package ships WebAuthnProvider. Native apps implement against
 * LAContext (iOS) or BiometricPrompt (Android) — see NATIVE.md.
 */
export interface AuthProvider {
  isAvailable(): Promise<boolean>;
  authenticate(intent: ActionIntent): Promise<AuthResult>;
}

/**
 * Implemented per action kind. Exchange a successful auth for a single-use grant.
 * See DeleteActionProvider and StripeSPTProvider for worked examples.
 */
export interface ActionProvider {
  requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult
  ): Promise<ActionAuthorization>;
}

/** @deprecated Use ActionProvider instead. */
export interface TokenProvider {
  requestToken(
    intent: PurchaseIntent,
    auth: AuthResult
  ): Promise<AuthorizationToken>;
}
