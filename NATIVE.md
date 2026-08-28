# Native integration (iOS / Android)

The React component in this package is the web reference implementation. The
`AuthProvider` and `ActionProvider` interfaces (see `src/types.ts`) are the
part meant to be reimplemented per-platform — the trust boundary, not the
slider UI, is the thing that actually needs to be OS-native.

Any number of apps can share the same native AuthProvider implementation and
swap only the ActionProvider (or backend grant issuer) per action kind.

## iOS — LAContext

```swift
import LocalAuthentication

func authenticate(intent: ActionIntent) async -> AuthResult {
    let context = LAContext()
    var error: NSError?

    guard context.canEvaluatePolicy(
        .deviceOwnerAuthenticationWithBiometrics,
        error: &error
    ) else {
        return AuthResult(success: false, reason: .notAvailable)
    }

    do {
        let success = try await context.evaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            localizedReason: "Authorize \(intent.subject) — \(intent.consequence)"
        )
        return AuthResult(
            success: success,
            assertion: context.evaluatedPolicyDomainState
        )
    } catch {
        return AuthResult(success: false, reason: .userCancelled)
    }
}
```

`evaluatePolicy` renders the Face ID / Touch ID sheet as a system UI element —
your app's view hierarchy is suspended while it's on screen. This is the same
non-spoofable property WebAuthn gives you on the web.

## Android — BiometricPrompt

```kotlin
val promptInfo = BiometricPrompt.PromptInfo.Builder()
    .setTitle("Authorize ${intent.subject}")
    .setSubtitle(intent.consequence)
    .setAllowedAuthenticators(BIOMETRIC_STRONG)
    .build()

val biometricPrompt = BiometricPrompt(activity, executor,
    object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(
            result: BiometricPrompt.AuthenticationResult
        ) {
            // proceed to ActionProvider / token exchange
        }
        override fun onAuthenticationError(
            errorCode: Int,
            errString: CharSequence
        ) {
            // map to AuthResult(success = false, reason = ...)
        }
    })

biometricPrompt.authenticate(promptInfo)
```

`BIOMETRIC_STRONG` is required, not `BIOMETRIC_WEAK` — this ensures the
authenticator meets Android's Class 3 biometric bar.

## The slide gesture itself

Both platforms can implement the same drag-to-threshold interaction shown in
`src/SlideToAuthorize.tsx` — plain gesture recognizer (`UIPanGestureRecognizer`
on iOS, `GestureDetector` on Android) with no special platform requirement,
since the gesture carries no security weight. Match the ~92% track completion
threshold and the same visual stages (idle → dragging → authenticating) for a
consistent cross-platform feel.

Keyboard / accessibility equivalents on native: offer a focused confirm control
that triggers the same auth flow without requiring a drag.
