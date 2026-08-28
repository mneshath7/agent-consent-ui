# Security policy

## Scope

`agent-consent-ui` is a React interaction and provider-contract library. The slider is **not** an authorization boundary. Security depends on a platform-owned authenticator and a server that independently verifies the exact action intent before issuing a narrow grant.

## Required production controls

A production integration must generate a fresh, unpredictable WebAuthn challenge on the server, bind it to the authenticated user and the canonical action intent, verify the returned assertion using a standards-compliant relying-party implementation, enforce the expected origin and relying-party ID, and reject expired, replayed, or already-consumed challenges.

The action backend must independently derive or verify the merchant, amount, recipients, resource, agent identity, and requested action. It must not trust values solely because they were rendered by the client. Grants should be single-use, least-privilege, time-limited, auditable, and scoped to one action or resource.

Use HTTPS in production, protect challenge and grant endpoints against CSRF where cookie credentials are used, apply authorization and rate limits server-side, and avoid logging raw WebAuthn assertions or sensitive payment information.

## What this package does not guarantee

This package does not verify WebAuthn assertions, authenticate users by itself, protect backend endpoints, prevent a compromised host application from changing displayed intent, or guarantee that a payment or other action is reversible. The host backend remains responsible for the security decision.

The demo providers are intentionally unsafe for production. They use simulated grants and a client-generated challenge without server-side verification.

## Reporting a vulnerability

Please do not disclose security vulnerabilities in public issues. Open a private GitHub security advisory for this repository or contact the maintainers privately with reproduction steps, affected versions, impact, and a proposed mitigation. Do not include real credentials, payment data, or production WebAuthn assertions.
