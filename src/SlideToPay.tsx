import React from "react";
import { SlideToAuthorize } from "./SlideToAuthorize";
import { purchaseIntentToActionIntent } from "./types";
import type {
  ActionProvider,
  AuthorizationToken,
  AuthProvider,
  PurchaseIntent,
  TokenProvider,
} from "./types";

export type SlideToPayStage =
  | "idle"
  | "dragging"
  | "authenticating"
  | "requesting_token"
  | "success"
  | "declined"
  | "error";

export interface SlideToPayProps {
  intent: PurchaseIntent;
  authProvider: AuthProvider;
  tokenProvider: TokenProvider;
  onAuthorized: (token: AuthorizationToken) => void;
  onDeclined?: (reason: string) => void;
  onError?: (error: Error) => void;
  labelIdle?: string;
  labelAuthenticating?: string;
}

/**
 * @deprecated Payments-only entry point, kept for backward compatibility.
 * Prefer `SlideToAuthorize` with `kind: "payment"` — same component now
 * powers payments, message sends, deletes, signatures, and any other
 * consequential agent action behind one shared trust boundary. See README.
 */
export function SlideToPay({
  intent,
  authProvider,
  tokenProvider,
  onAuthorized,
  onDeclined,
  onError,
  labelIdle,
  labelAuthenticating,
}: SlideToPayProps) {
  const actionIntent = purchaseIntentToActionIntent(intent);

  const actionProvider: ActionProvider = {
    async requestAuthorization(_actionIntent, auth) {
      const token = await tokenProvider.requestToken(intent, auth);
      return {
        grantId: token.tokenId,
        scope: {
          merchantId: token.scopedTo.merchantId,
          maxAmount: token.scopedTo.maxAmount,
          currency: token.scopedTo.currency,
        },
        expiresAt: token.expiresAt,
      };
    },
  };

  return (
    <SlideToAuthorize
      intent={actionIntent}
      authProvider={authProvider}
      actionProvider={actionProvider}
      onAuthorized={(grant) =>
        onAuthorized({
          tokenId: grant.grantId,
          scopedTo: {
            merchantId: grant.scope.merchantId as string,
            maxAmount: grant.scope.maxAmount as number,
            currency: grant.scope.currency as string,
          },
          expiresAt: grant.expiresAt,
        })
      }
      onDeclined={onDeclined}
      onError={onError}
      labelIdle={labelIdle}
      labelAuthenticating={labelAuthenticating}
    />
  );
}
