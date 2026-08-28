import type { ActionAuthorization, ActionIntent } from "./types";

/**
 * Validate user-visible intent data before it crosses an authorization boundary.
 * This is defensive validation only; the server must independently derive and
 * verify the authoritative intent and grant scope.
 */
export function assertValidActionIntent(intent: ActionIntent): void {
  if (!intent || typeof intent !== "object") {
    throw new Error("Invalid action intent");
  }
  const requiredStrings: Array<[string, unknown]> = [
    ["kind", intent.kind],
    ["subject", intent.subject],
    ["consequence", intent.consequence],
    ["description", intent.description],
    ["requestedBy.agentName", intent.requestedBy?.agentName],
    ["requestedBy.agentId", intent.requestedBy?.agentId],
  ];
  for (const [name, value] of requiredStrings) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Invalid action intent: ${name} is required`);
    }
  }
  if (typeof intent.reversible !== "boolean") {
    throw new Error("Invalid action intent: reversible must be boolean");
  }
  if (intent.detail && (!Array.isArray(intent.detail) || intent.detail.some(
    (item) => !item || typeof item.label !== "string" || typeof item.value !== "string"
  ))) {
    throw new Error("Invalid action intent: detail must contain label/value strings");
  }
}

/** Validate the minimum shape of a grant returned by a trusted backend. */
export function assertValidAuthorization(grant: ActionAuthorization): void {
  if (!grant || typeof grant !== "object") throw new Error("Invalid authorization grant");
  if (typeof grant.grantId !== "string" || grant.grantId.trim().length === 0) {
    throw new Error("Invalid authorization grant: grantId is required");
  }
  if (!grant.scope || typeof grant.scope !== "object") {
    throw new Error("Invalid authorization grant: scope is required");
  }
  if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= Date.now()) {
    throw new Error("Invalid authorization grant: expired or invalid expiresAt");
  }
}

/**
 * Require a successful authentication result before exchanging it for a grant.
 * The assertion remains opaque and must be verified by the backend.
 */
export function assertSuccessfulAuth(auth: { success: boolean }): void {
  if (!auth?.success) throw new Error("A successful authentication is required");
}

/**
 * Create a stable JSON representation for logging or server-side intent binding.
 * Do not use this as a cryptographic signature; bind the canonical intent on the
 * server and include a fresh server-generated challenge in the flow.
 */
export function canonicalizeIntent(intent: ActionIntent): string {
  assertValidActionIntent(intent);
  return JSON.stringify({
    kind: intent.kind,
    subject: intent.subject,
    consequence: intent.consequence,
    description: intent.description,
    detail: intent.detail ?? [],
    reversible: intent.reversible,
    requestedBy: intent.requestedBy,
  });
}

export function assertSameIntent(expected: ActionIntent, received: ActionIntent): void {
  if (canonicalizeIntent(expected) !== canonicalizeIntent(received)) {
    throw new Error("Authorization intent changed during the authorization flow");
  }
}
