# Contributing

Thank you for contributing to `agent-consent-ui`.

## Development

Use Node.js 18 or newer. Install dependencies with `npm install`, then run `npm run check` before opening a pull request. The demo can be started with `npm run dev`.

Keep security-sensitive behavior explicit. Do not add client-only approval shortcuts, fake biometric UI, standing permissions, or provider behavior that treats the client-rendered intent as authoritative.

## Pull requests

Explain the user-facing behavior, the security implications, and the test coverage. Changes to WebAuthn payloads, provider contracts, grant scope, or retry behavior require documentation updates and regression tests.

## Commit expectations

Use focused commits with clear messages. Do not commit secrets, production assertions, payment data, generated credentials, or dependency directories.
