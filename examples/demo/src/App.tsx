import React, { useState } from "react";
import {
  SlideToAuthorize,
  purchaseIntentToActionIntent,
  type PurchaseIntent,
  type ActionIntent,
  type ActionAuthorization,
} from "@slide-to-pay/react";
import {
  DemoAuthProvider,
  DemoTokenProvider,
  DemoActionProvider,
} from "../../../src/demo";

const purchaseIntent: PurchaseIntent = {
  merchantId: "target_com",
  merchantName: "Target",
  amount: 11879,
  currency: "usd",
  description: "Pasta night groceries — 21 items",
  requestedBy: { agentName: "Instinct", agentId: "agent_instinct" },
};

const deleteIntent: ActionIntent = {
  kind: "delete",
  subject: "Q3_financials_draft.xlsx",
  consequence: "File permanently deleted",
  description: "Instinct wants to clean up duplicate spreadsheets in your Downloads folder.",
  detail: [
    { label: "Location", value: "~/Downloads" },
    { label: "Last modified", value: "2 months ago" },
  ],
  reversible: false,
  requestedBy: { agentName: "Instinct", agentId: "agent_instinct" },
};

const authProvider = new DemoAuthProvider();
const tokenProvider = new DemoTokenProvider();
const actionProvider = new DemoActionProvider();

type Scenario = "payment" | "delete";

export function App() {
  const [scenario, setScenario] = useState<Scenario>("payment");
  const [phase, setPhase] = useState<"message" | "confirm" | "done">("message");
  const [grant, setGrant] = useState<ActionAuthorization | null>(null);
  const [declineReason, setDeclineReason] = useState<string | null>(null);

  const activeActionIntent =
    scenario === "payment" ? purchaseIntentToActionIntent(purchaseIntent) : deleteIntent;

  const switchScenario = (s: Scenario) => {
    setScenario(s);
    setPhase("message");
    setGrant(null);
    setDeclineReason(null);
  };

  return (
    <div style={{ width: 380 }}>
      <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13, color: "#888" }}>
        slide-to-authorize — one primitive, two action kinds
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "center" }}>
        <ScenarioTab active={scenario === "payment"} onClick={() => switchScenario("payment")}>
          Payment
        </ScenarioTab>
        <ScenarioTab active={scenario === "delete"} onClick={() => switchScenario("delete")}>
          File delete
        </ScenarioTab>
      </div>

      <div style={phoneStyles.frame}>
        {phase === "message" &&
          (scenario === "payment" ? (
            <ChatBubbleFlow
              agentLine1="Pasta night with the family is on Saturday. I pulled the bolognese recipe you've used before and the tiramisu we talked about — want me to grab the groceries?"
              userLine="yes please"
              agentLine2="I had a Target cart ready. How's this look? 21 items, $118.79."
              onProceed={() => setPhase("confirm")}
            />
          ) : (
            <ChatBubbleFlow
              agentLine1="I noticed 3 duplicate copies of your Q3 financials draft in Downloads. Want me to clean those up?"
              userLine="yes, delete the old ones"
              agentLine2="Found the one to remove: Q3_financials_draft.xlsx (2 months old, unedited since)."
              onProceed={() => setPhase("confirm")}
            />
          ))}

        {phase === "confirm" && (
          <div style={{ padding: 20 }}>
            <SlideToAuthorize
              intent={activeActionIntent}
              authProvider={authProvider}
              actionProvider={
                scenario === "payment"
                  ? {
                      requestAuthorization: async (_intent, auth) => {
                        const token = await tokenProvider.requestToken(purchaseIntent, auth);
                        return {
                          grantId: token.tokenId,
                          scope: token.scopedTo,
                          expiresAt: token.expiresAt,
                        };
                      },
                    }
                  : actionProvider
              }
              onAuthorized={(g) => {
                setGrant(g);
                setPhase("done");
              }}
              onDeclined={(reason) => setDeclineReason(reason)}
            />
            {declineReason && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#b91c1c" }}>
                Declined: {declineReason}
              </div>
            )}
            <div style={{ marginTop: 14, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              Same gesture, same biometric gate, different backend grant.
              This page never sees a card number or gets standing delete
              access — only a scoped, one-time authorization.
            </div>
          </div>
        )}

        {phase === "done" && grant && (
          <div style={{ padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Authorized</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
              {scenario === "payment"
                ? `Target can now charge up to ${activeActionIntent.consequence}`
                : `Instinct can now delete ${deleteIntent.subject}`}
            </div>
            <div style={tokenBoxStyle}>
              <div style={{ opacity: 0.6 }}>grant</div>
              <div>{grant.grantId}</div>
              <div style={{ opacity: 0.6, marginTop: 6 }}>expires</div>
              <div>{new Date(grant.expiresAt).toLocaleTimeString()}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScenarioTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 999,
        border: active ? "1px solid #111318" : "1px solid #e5e7eb",
        background: active ? "#111318" : "#fff",
        color: active ? "#fff" : "#374151",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ChatBubbleFlow({
  agentLine1,
  userLine,
  agentLine2,
  onProceed,
}: {
  agentLine1: string;
  userLine: string;
  agentLine2: string;
  onProceed: () => void;
}) {
  return (
    <div style={{ padding: 20 }}>
      <div style={bubbleStyles.agent}>{agentLine1}</div>
      <div style={bubbleStyles.user}>{userLine}</div>
      <div style={bubbleStyles.agent}>{agentLine2}</div>
      <button style={proceedButtonStyle} onClick={onProceed}>
        Review &amp; authorize
      </button>
    </div>
  );
}

const phoneStyles = {
  frame: {
    background: "#fff",
    borderRadius: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
    minHeight: 260,
  } as React.CSSProperties,
};

const bubbleStyles = {
  agent: {
    background: "#f1f0ee",
    color: "#111",
    borderRadius: 16,
    padding: "10px 14px",
    fontSize: 14,
    lineHeight: 1.4,
    marginBottom: 10,
    maxWidth: "85%",
  } as React.CSSProperties,
  user: {
    background: "#2563eb",
    color: "#fff",
    borderRadius: 16,
    padding: "10px 14px",
    fontSize: 14,
    marginBottom: 10,
    maxWidth: "60%",
    marginLeft: "auto",
    textAlign: "right",
  } as React.CSSProperties,
};

const proceedButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 0",
  borderRadius: 12,
  border: "none",
  background: "#111318",
  color: "#fff",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  marginTop: 4,
};

const tokenBoxStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  background: "#f4f4f2",
  borderRadius: 10,
  padding: 12,
  textAlign: "left",
  color: "#374151",
};
