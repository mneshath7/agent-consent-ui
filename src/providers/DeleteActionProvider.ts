import type {
  ActionAuthorization,
  ActionIntent,
  ActionProvider,
  AuthResult,
} from "../types";
import { assertValidActionIntent, assertSuccessfulAuth } from "../security";

/**
 * Example ActionProvider for a non-payment action: an agent deleting a file
 * or resource on the user's behalf. Included specifically to demonstrate
 * that the slide + biometric trust boundary is not payment-specific — the
 * only thing that changes between this and StripeSPTProvider is what the
 * backend endpoint does with a successful auth.
 *
 * Wire `deleteEndpoint` to a route that verifies `auth.assertion` server-side
 * (same requirement as any ActionProvider) and then issues a short-lived,
 * single-resource delete grant — never a standing "this agent can delete
 * anything" permission.
 */
export class DeleteActionProvider implements ActionProvider {
  constructor(private opts: { deleteEndpoint: string }) {}

  async requestAuthorization(
    intent: ActionIntent,
    auth: AuthResult
  ): Promise<ActionAuthorization> {
    assertValidActionIntent(intent);
    assertSuccessfulAuth(auth);
    if (typeof auth.assertion === "undefined") {
      throw new Error("requestAuthorization called without an authentication assertion");
    }
    if (intent.kind !== "delete") {
      throw new Error(`DeleteActionProvider received unexpected kind: ${intent.kind}`);
    }

    const res = await fetch(this.opts.deleteEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: intent.subject,
        auth_assertion: auth.assertion,
        requested_by: intent.requestedBy,
      }),
    });

    if (!res.ok) {
      throw new Error(`Delete authorization failed: ${res.status}`);
    }

    const data = await res.json();
    // Expected shape from your backend: { grant_id, resource_id, expires_at }
    if (
      typeof data?.grant_id !== "string" ||
      typeof data?.resource_id !== "string" ||
      !Number.isFinite(data?.expires_at) ||
      data.expires_at <= Date.now()
    ) {
      throw new Error("Delete authorization returned an invalid grant");
    }
    return {
      grantId: data.grant_id,
      scope: { resourceId: data.resource_id, action: "delete" },
      expiresAt: data.expires_at,
    };
  }
}
