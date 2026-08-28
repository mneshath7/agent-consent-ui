import type {
  AuthenticatorTransportFuture,
  Base64URLString,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";

export type User = {
  id: string;
  username: string;
  displayName: string;
  webAuthnUserID: Base64URLString;
};

export type Passkey = {
  id: Base64URLString;
  publicKey: Uint8Array;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  userId: string;
};

type PendingOptions = {
  userId: string;
  options: PublicKeyCredentialCreationOptionsJSON | PublicKeyCredentialRequestOptionsJSON;
  intentHash?: string;
  expiresAt: number;
};

export const users = new Map<string, User>([
  ["demo-user", {
    id: "demo-user",
    username: "demo@example.com",
    displayName: "Demo User",
    webAuthnUserID: "ZGVtby11c2Vy",
  }],
]);

export const passkeys = new Map<string, Passkey[]>();
const pending = new Map<string, PendingOptions>();

export function savePending(id: string, value: PendingOptions): void {
  pending.set(id, value);
}

export function consumePending(id: string): PendingOptions | undefined {
  const value = pending.get(id);
  if (!value) return undefined;
  pending.delete(id);
  if (value.expiresAt <= Date.now()) return undefined;
  return value;
}

export function getUserPasskeys(userId: string): Passkey[] {
  return passkeys.get(userId) ?? [];
}

export function savePasskey(passkey: Passkey): void {
  const existing = getUserPasskeys(passkey.userId).filter((item) => item.id !== passkey.id);
  passkeys.set(passkey.userId, [...existing, passkey]);
}

export function findPasskeyById(userId: string, id: string): Passkey | undefined {
  return getUserPasskeys(userId).find((passkey) => passkey.id === id);
}
