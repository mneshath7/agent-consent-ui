import { describe, expect, it } from "vitest";
import {
  assertSameIntent,
  assertSuccessfulAuth,
  assertValidActionIntent,
  assertValidAuthorization,
  canonicalizeIntent,
} from "../src/security";
import type { ActionIntent } from "../src/types";

const intent: ActionIntent = {
  kind: "delete",
  subject: "report.pdf",
  consequence: "Permanently delete report.pdf",
  description: "Remove the duplicate report.",
  reversible: false,
  requestedBy: { agentName: "Agent", agentId: "agent_1" },
};

describe("security helpers", () => {
  it("accepts a complete action intent", () => {
    expect(() => assertValidActionIntent(intent)).not.toThrow();
  });

  it("rejects incomplete intent data", () => {
    expect(() => assertValidActionIntent({ ...intent, subject: "" })).toThrow();
  });

  it("detects changes to the canonical intent", () => {
    expect(() => assertSameIntent(intent, { ...intent, consequence: "Send report.pdf" })).toThrow();
    expect(() => assertSameIntent(intent, intent)).not.toThrow();
  });

  it("requires a successful auth result", () => {
    expect(() => assertSuccessfulAuth({ success: false })).toThrow();
    expect(() => assertSuccessfulAuth({ success: true })).not.toThrow();
  });

  it("rejects expired grants", () => {
    expect(() => assertValidAuthorization({
      grantId: "grant_1",
      scope: { action: "delete" },
      expiresAt: Date.now() - 1,
    })).toThrow();
    expect(() => assertValidAuthorization({
      grantId: "grant_1",
      scope: { action: "delete" },
      expiresAt: Date.now() + 60_000,
    })).not.toThrow();
  });

  it("produces stable canonical intent data", () => {
    expect(canonicalizeIntent(intent)).toContain('"kind":"delete"');
  });
});
