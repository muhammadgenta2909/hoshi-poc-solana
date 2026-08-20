"use client";

// Identity-token bus — the Privy *identity token* (a short-lived JWT that proves
// WHICH Google/email user is calling) that the CollectorCrypt shipping endpoints
// require in an `X-Privy-Identity-Token` header, ON TOP of our own wallet JWT.
//
// Same reason for a bus as lib/txSigner.ts: Privy's hooks only work inside
// <PrivyProvider>, which is mounted conditionally (NEXT_PUBLIC_PRIVY_APP_ID). So
// <PrivyBridge> — the one component that is ONLY ever mounted when Privy IS on —
// registers the token getter here, and lib/api reads it through a plain function
// with NO Privy import, staying safe on every code path where Privy is disabled.
//
// Mirrors registerPrivySigner/getPrivySigner and registerPrivyLogout in shape.

/** Resolves the current Privy identity token, or null when there isn't one. */
export type IdentityTokenGetter = () => Promise<string | null>;

let identityGetter: IdentityTokenGetter | null = null;

/**
 * Publish Privy's identity-token getter. Returns an unregister function so the
 * effect that installed it can clean up on logout — a getter left pointing at a
 * signed-out session would attach a stale token to the shipping calls.
 */
export function registerPrivyIdentityToken(fn: IdentityTokenGetter): () => void {
  identityGetter = fn;
  return () => {
    if (identityGetter === fn) identityGetter = null;
  };
}

/**
 * The current Privy identity token, or null when Privy is off / no one is logged
 * in with Google/Privy yet. Never throws: a getter failure resolves to null so the
 * caller (lib/api) can surface a single friendly message instead of a raw error.
 */
export async function getPrivyIdentityToken(): Promise<string | null> {
  if (!identityGetter) return null;
  try {
    return await identityGetter();
  } catch {
    return null;
  }
}
