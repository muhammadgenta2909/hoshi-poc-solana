"use client";

// CollectorCrypt shipping auth — Sign-In With Solana (SIWS).
//
// CC documents exactly TWO credentials for the Vault Shipping API: an access
// token from wallet sign-in (`Authorization: Bearer cca_…`) and a partner API
// key (`ccsk_…` + `X-CC-Customer`). The key is EVM-only — "Solana redemptions
// still need a wallet sign-in session" — so for us there is exactly ONE usable
// credential: the `cca_…` token. There is no Privy-identity path; sending one is
// what a 401 looks like.
//
// The burn is signed by the wallet that OWNS the card, so that same wallet signs
// the SIWS message that mints the token. Both kinds of Hoshi user can therefore
// do it: a raw-wallet user signs with their wallet-adapter wallet (Phantom), a
// Google/email user with their Privy EMBEDDED wallet. In both cases that is the
// address our own JWT is issued for.
//
// Why a bus (mirrors lib/txSigner.ts): each signing API only exists inside its
// provider (<WalletProvider> / <PrivyProvider>), and the caller (lib/api) must
// stay import-light and hook-free on every code path. So the bridges register a
// signer here — <CcShippingBridge> the wallet-adapter one, <PrivyBridge> the
// embedded one — and lib/api reaches the handshake through the plain
// `ensureCcSiwsToken` function.

import bs58 from "bs58";
import { siwsNonce, siwsRefresh, siwsVerify } from "./api";

/** A wallet that can sign the SIWS message. `address` MUST be the wallet the CC
 *  token is minted for (backend requires it to equal req.user.walletAddress). */
export type WalletSigner = {
  address: string;
  /** Sign the raw UTF-8 bytes of the SIWS message; returns the 64-byte ed25519 sig. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

/**
 * One slot per provider, because a user can have BOTH at once — Phantom connected
 * in a browser where they are also logged in with Google — and only the wallet
 * that owns the card may mint the token (CC burns with it; our backend 403s a
 * SIWS nonce for any other wallet). Keeping the two apart lets `ensureCcSiwsToken`
 * pick by address instead of by "whichever registered last".
 */
type SignerKind = "wallet" | "embedded";

const signers = new Map<SignerKind, WalletSigner>();

function register(kind: SignerKind, signer: WalletSigner): () => void {
  signers.set(kind, signer);
  return () => {
    if (signers.get(kind) === signer) signers.delete(kind);
  };
}

/**
 * Publish the wallet-adapter (Phantom etc.) SIWS signer. Returns an unregister
 * function so the bridge effect can clean up on disconnect/wallet-change — a
 * stale signer pointing at a wallet that is gone would mint a CC token for the
 * wrong identity.
 */
export const registerCcWalletSigner = (signer: WalletSigner): (() => void) =>
  register("wallet", signer);

/**
 * Publish the Privy EMBEDDED wallet's SIWS signer — the Google/email user's
 * wallet, the one their cards are actually minted to. Same contract as above;
 * the cleanup runs on logout.
 */
export const registerCcEmbeddedSigner = (signer: WalletSigner): (() => void) =>
  register("embedded", signer);

/**
 * The signer for the wallet that owns the card. `owner` is the wallet our JWT is
 * issued for; when it is known we require an exact match rather than prompting
 * the wrong wallet for a signature the backend would refuse anyway. With no
 * `owner` (unreadable JWT) fall back to whatever signer is registered.
 */
function resolveSigner(owner: string | null): WalletSigner | null {
  const all = [...signers.values()];
  if (owner) return all.find((s) => s.address === owner) ?? null;
  return all[0] ?? null;
}

/**
 * The wallet address our own JWT was issued for (`wallet` claim, set by the
 * backend in auth.service). Read WITHOUT verifying on purpose: it only decides
 * WHICH local wallet to prompt — the backend verifies the JWT for real and
 * rejects a SIWS nonce for any wallet but that one. Returns null on anything
 * unexpected, so the caller falls back instead of throwing.
 */
function jwtWallet(jwt: string): string | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { wallet?: unknown };
    return typeof claims.wallet === "string" && claims.wallet ? claims.wallet : null;
  } catch {
    return null;
  }
}

/* ------------------------------- token cache ------------------------------- */

/** The CC token triple. `expiresAt` is normalized to a ms epoch (see below). */
type CcTokenTriple = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const SS_KEY = "hoshi_cc_siws";
/** Treat a token as expired ~60s early so an in-flight request never uses a
 *  token that lapses mid-call (CC access tokens live 15 minutes). */
const SAFETY_MARGIN_MS = 60_000;

// In-memory cache, scoped to the wallet address it was minted for. sessionStorage
// mirrors it so a page reload during the shipping flow doesn't force a re-sign.
let cache: { address: string; triple: CcTokenTriple } | null = null;

/**
 * The SIWS contract types `expiresAt` as a bare `number` with no unit. Values
 * below 1e12 are implausible as a ms epoch (that's Jan 1970) but sensible as a
 * SECONDS epoch, so treat those as seconds; anything larger is already ms.
 * Normalizing here makes the freshness check unit-safe whichever the backend sends.
 */
function normalizeExpiry(expiresAt: number): number {
  return expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
}

function toTriple(res: { accessToken: string; refreshToken: string; expiresAt: number }): CcTokenTriple {
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    expiresAt: normalizeExpiry(res.expiresAt),
  };
}

function isAccessValid(triple: CcTokenTriple): boolean {
  return triple.expiresAt - SAFETY_MARGIN_MS > Date.now();
}

/** Which wallet the persisted token belongs to, without adopting it as the cache. */
function storedAddress(): string | null {
  if (cache) return cache.address;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: string };
    return typeof parsed?.address === "string" ? parsed.address : null;
  } catch {
    return null;
  }
}

function loadCache(address: string): CcTokenTriple | null {
  if (cache && cache.address === address) return cache.triple;
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: string; triple?: CcTokenTriple };
    // Only reuse a token minted for THIS wallet — never leak one across wallets.
    if (parsed?.address === address && parsed.triple?.accessToken) {
      cache = { address, triple: parsed.triple };
      return parsed.triple;
    }
  } catch {
    /* private mode / bad JSON — fall back to a fresh handshake */
  }
  return null;
}

function saveCache(address: string, triple: CcTokenTriple): void {
  cache = { address, triple };
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify({ address, triple }));
  } catch {
    /* private mode / storage full — the in-memory cache still serves this session */
  }
}

/**
 * Drop the cached CC token (logout / wallet disconnect / wallet change).
 *
 * Pass the address whose signer is going away and the token is dropped ONLY when
 * it belongs to that wallet: with two providers registered, a Phantom disconnect
 * must not wipe a Google user's token and re-prompt them for nothing. Called with
 * no argument it clears unconditionally.
 */
export function clearCcSiwsToken(address?: string): void {
  if (address) {
    const owner = storedAddress();
    if (owner && owner !== address) return;
  }
  cache = null;
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------- single-flight (no prompt storms) ------------------------- */

/**
 * ONE handshake (and one silent refresh) per wallet AT A TIME.
 *
 * Without this, every concurrent caller starts its own nonce → signMessage →
 * verify round trip: the shipping modal's 4s status poll plus any deliberate
 * action would each pop a wallet prompt. CC documents sign-in as rate limited
 * "per wallet and per network address" (429 + `retryAfter`), so a storm does not
 * just annoy — it locks the user out of shipping entirely.
 *
 * The map entry is removed as soon as the round trip SETTLES, success or not, so
 * a rejected signature leaves nothing poisoned behind: the next genuine attempt
 * starts a real handshake again.
 */
const handshakeInflight = new Map<string, Promise<string>>();
const refreshInflight = new Map<string, Promise<string>>();

function singleFlight(
  map: Map<string, Promise<string>>,
  key: string,
  run: () => Promise<string>,
): Promise<string> {
  const existing = map.get(key);
  if (existing) return existing;
  const started = run().finally(() => {
    // Only clear OUR entry — a later attempt may already have installed its own.
    if (map.get(key) === started) map.delete(key);
  });
  map.set(key, started);
  return started;
}

/** Trade the refresh token for a fresh triple. No wallet prompt, so it is the only
 *  half of the handshake the silent path is allowed to run. Deduped per wallet:
 *  two callers must never spend the same (single-use, rotating) refresh token. */
function runRefresh(address: string, refreshToken: string, jwt: string): Promise<string> {
  return singleFlight(refreshInflight, address, async () => {
    const triple = toTriple(await siwsRefresh({ refreshToken }, jwt));
    saveCache(address, triple);
    return triple.accessToken;
  });
}

/* --------------------------------- handshake ------------------------------- */

/** Raised by the SILENT path when there is no usable session left and minting one
 *  would need a wallet signature. Callers that run on a TIMER (the status poll)
 *  must surface this and wait for a deliberate user action — never prompt. */
export class CcSessionRequiredError extends Error {
  constructor(
    message = "Sesi pengiriman CollectorCrypt sudah kedaluwarsa. Tanda tangani sekali lagi di wallet-mu untuk melanjutkan. / Your CollectorCrypt shipping session expired; sign once more to continue.",
  ) {
    super(message);
    this.name = "CcSessionRequiredError";
  }
}

/**
 * Resolve a valid CC access token (`cca_…`) for the wallet that owns the card.
 *
 * INTERACTIVE: this may pop a wallet signature prompt, so call it only from a
 * deliberate user action. Anything on a timer wants `getCcSiwsTokenSilently`.
 *
 * `jwt` is OUR Hoshi JWT: the /redemptions/siws/* endpoints are behind our
 * JwtAuthGuard, so every handshake call is Bearer-authed with it — and its
 * `wallet` claim also tells us which registered signer to prompt.
 *
 * Fast path: a cached access token still inside its safety window is returned as
 * is. Otherwise, if a refresh token survives, try siwsRefresh first (cheap, no
 * wallet prompt); on any failure fall back to a full handshake:
 *   siwsNonce({ wallet }) → sign message VERBATIM → base58 sig → siwsVerify().
 * The minted triple is cached (memory + sessionStorage) and the access token returned.
 */
export async function ensureCcSiwsToken(jwt: string): Promise<string> {
  const owner = jwtWallet(jwt);
  const signer = resolveSigner(owner);
  if (!signer) {
    throw new Error(
      signers.size > 0
        ? "Wallet pemilik kartu ini tidak tersedia untuk menandatangani. Hubungkan kembali wallet-nya lalu coba lagi. / Reconnect the wallet that owns this card."
        : "Hubungkan wallet atau login Google dulu untuk kirim kartu fisik. / Connect a wallet or sign in with Google to ship your card.",
    );
  }

  const cached = loadCache(signer.address);
  if (cached && isAccessValid(cached)) return cached.accessToken;

  return singleFlight(handshakeInflight, signer.address, () => mintToken(jwt, signer));
}

/** The body of the interactive handshake — runs inside singleFlight, so exactly one
 *  of these is alive per wallet no matter how many callers are waiting. */
async function mintToken(jwt: string, signer: WalletSigner): Promise<string> {
  // A silent refresh may already be in the air for this wallet; let it finish
  // rather than racing it for the same single-use refresh token.
  const pendingRefresh = refreshInflight.get(signer.address);
  if (pendingRefresh) {
    try {
      await pendingRefresh;
    } catch {
      /* its failure is not ours — we still have the full handshake below */
    }
  }

  const triple = loadCache(signer.address);
  if (triple && isAccessValid(triple)) return triple.accessToken;

  // Access expired but a refresh token survives → try the cheap refresh first.
  if (triple?.refreshToken) {
    try {
      return await runRefresh(signer.address, triple.refreshToken, jwt);
    } catch {
      // Refresh rejected (expired / rotated) → fall through to a full re-handshake.
    }
  }

  // Full SIWS handshake. The message from the backend must be signed VERBATIM —
  // it is the canonical SIWS text CC will re-derive and verify the signature over.
  const { message } = await siwsNonce({ wallet: signer.address }, jwt);
  const signatureBytes = await signer.signMessage(new TextEncoder().encode(message));
  const signature = bs58.encode(signatureBytes); // base58 ed25519 sig, same lib useAuth uses
  const res = await siwsVerify({ message, signature }, jwt);
  const minted = toTriple(res);
  saveCache(signer.address, minted);
  return minted.accessToken;
}

/**
 * A CC access token WITHOUT ever asking the wallet to sign — for callers that run
 * on a timer (the redemption status poll). Returns:
 *   • the cached access token while it is still fresh;
 *   • whatever an already in-flight handshake/refresh produces (piggyback, no new prompt);
 *   • a token refreshed from the surviving `ccr_…` refresh token (no prompt);
 *   • otherwise `null` — meaning "a human has to sign", which the caller turns into
 *     a visible, actionable state instead of a silent wallet pop-up.
 */
export async function getCcSiwsTokenSilently(jwt: string): Promise<string | null> {
  const address = jwtWallet(jwt) ?? storedAddress();
  if (!address) return null;

  const triple = loadCache(address);
  if (triple && isAccessValid(triple)) return triple.accessToken;

  const pending = handshakeInflight.get(address) ?? refreshInflight.get(address);
  if (pending) return pending.then((t) => t, () => null);

  if (!triple?.refreshToken) return null;
  return runRefresh(address, triple.refreshToken, jwt).then((t) => t, () => null);
}
