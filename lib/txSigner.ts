"use client";

// Signing bus for the one flow where the USER — not the treasury — has to sign a
// Solana transaction: the CollectorCrypt buyback (selling a pulled card back).
//
// Why a bus instead of a hook: Privy's signing hooks only work inside
// <PrivyProvider>, which is mounted conditionally (PRIVY_ENABLED). Calling them
// from a page that also has to serve Phantom users would crash whenever Privy is
// off. So <PrivyBridge> — which is only ever mounted when Privy IS on — registers
// its signer here, and everything else reads it through a plain function. Same
// shape as registerPrivyLogout in useAuth.
//
// Works on RAW BYTES on purpose: Privy's embedded wallet signs Uint8Array in and
// out, so a buyback transaction never has to be deserialised for that path. Only
// the wallet-adapter (Phantom) path needs a Transaction object.

/** Signs a serialized transaction. Bytes in, signed bytes out. */
export type SignTransactionBytes = (tx: Uint8Array) => Promise<Uint8Array>;

let privySigner: SignTransactionBytes | null = null;

/**
 * Publish the Privy embedded-wallet signer. Returns an unregister function so the
 * effect that installed it can clean up — a stale signer pointing at a logged-out
 * wallet would fail at exactly the worst moment (mid-buyback).
 */
export function registerPrivySigner(fn: SignTransactionBytes): () => void {
  privySigner = fn;
  return () => {
    if (privySigner === fn) privySigner = null;
  };
}

/** The Privy signer, or null when Privy is off / no embedded wallet yet. */
export const getPrivySigner = (): SignTransactionBytes | null => privySigner;

/* ------------------------------ base64 helpers ----------------------------- */

export const base64ToBytes = (b64: string): Uint8Array =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/**
 * Chunked on purpose: `String.fromCharCode(...bytes)` spreads every byte as an
 * argument, and a transaction is big enough to blow the call-stack limit on some
 * browsers. Failing there would look like a wallet bug, not a string bug.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
