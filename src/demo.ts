/**
 * Demo-only providers. Import from `@slide-to-pay/react/demo` in local examples.
 * These implementations intentionally do not perform server-side verification
 * or issue real grants and must never be used in production.
 */
export {
  DemoAuthProvider,
  DemoTokenProvider,
  DemoActionProvider,
} from "./providers/MockProviders";
