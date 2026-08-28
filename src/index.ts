// General-purpose API — start here for anything beyond payments
export { SlideToAuthorize } from "./SlideToAuthorize";
export type { SlideToAuthorizeProps, SlideStage } from "./SlideToAuthorize";
export type {
  ActionKind,
  ActionIntent,
  ActionAuthorization,
  ActionProvider,
  AuthProvider,
  AuthResult,
} from "./types";
export { purchaseIntentToActionIntent } from "./types";

// Auth surface — identical regardless of action kind
export { WebAuthnProvider } from "./providers/WebAuthnProvider";
export {
  assertValidActionIntent,
  assertValidAuthorization,
  assertSuccessfulAuth,
  canonicalizeIntent,
  assertSameIntent,
} from "./security";


// Action-specific providers — worked examples; add your own per action kind
export { StripeSPTProvider } from "./providers/StripeSPTProvider";
export { DeleteActionProvider } from "./providers/DeleteActionProvider";

// Deprecated payments-only API — kept for backward compatibility
export { SlideToPay } from "./SlideToPay";
export type { SlideToPayProps, SlideToPayStage } from "./SlideToPay";
export type {
  PurchaseIntent,
  AuthorizationToken,
  TokenProvider,
  SlideCompletionResult,
} from "./types";
