"use client";

// CollectorCrypt shipping auth — TRACK B (Sign-In With Solana / SIWS).
//
// The CC shipping endpoints need proof of WHICH identity is calling, carried in
// an `X-Privy-Identity-Token` header on top of our own wallet JWT. Google/Privy
// users supply a Privy identity token there (Track A, see lib/privyIdentity.ts).
// A raw-wallet user (Phantom etc.) has NO Privy identity, so they mint a CC token
// instead by signing a SIWS message with their wallet — this module runs that
// handshake and caches the resulting CC token triple.
//
// Why a bus (mirrors lib/privyIdentity.ts + lib/txSigner.ts): wallet-adapter's
// signMessage only exists inside <WalletProvider>, and the caller (lib/api) must
// stay import-light and hook-free on every code path. So <CcShippingBridge> — the
// one component with wallet-adapter access — registers a wallet signer here, and
// lib/api reaches the handshake through the plain `ensureCcSiwsToken` function.

import bs58 from "bs58";
import { siwsNonce, siwsRefresh, siwsVerify } from "./api";

/** A wallet that can sign the SIWS message. `address` MUST be the wallet the CC
 *  token is minted for (backend requires it to equal req.user.walletAddress). */
export type WalletSigner = {
  address: string;
  /** Sign the raw UTF-8 bytes of the SIWS message; returns the 64-byte ed25519 sig. */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

let walletSigner: WalletSigner | null = null;

/**
 * Publish the current wallet's SIWS signer. Returns an unregister function so the
 * bridge effect can clean up on disconnect/wallet-change — a stale signer pointing
 * at a wallet that's gone would mint a CC token for the wrong identity.
 */
export function registerCcWalletSigner(signer: WalletSigner): () => void {
  walletSigner = signer;
  return () => {
    if (walletSigner === signer) walletSigner = null;
  };
}

/** The current wallet signer, or null when no wallet-adapter wallet is connected
 *  (e.g. a Google/Privy user, who takes Track A instead). */
export const getCcWalletSigner = (): WalletSigner | null => walletSigner;

/* ------------------------------- token cache ------------------------------- */

/** The CC token triple. `expiresAt` is normalized to a ms epoch (see below). */
type CcTokenTriple = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const SS_KEY = "hoshi_cc_siws";
/** Treat a token as expired ~60s early so an in-flight request never uses a
 *  token that lapses mid-call. */
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

/** Drop the cached CC token (logout / wallet disconnect / wallet change). */
export function clearCcSiwsToken(): void {
  cache = null;
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    /* ignore */
  }
}

/* --------------------------------- handshake ------------------------------- */

/**
 * Resolve a valid CC access token for the connected wallet (Track B).
 *
 * `jwt` is OUR Hoshi JWT: the /redemption/siws/* endpoints are behind our
 * JwtAuthGuard, so every handshake call is Bearer-authed with it.
 *
 * Fast path: a cached access token still inside its safety window is returned as
 * is. Otherwise, if a refresh token survives, try siwsRefresh first (cheap, no
 * wallet prompt); on any failure fall back to a full handshake:
 *   siwsNonce({ wallet }) → sign message VERBATIM → base58 sig → siwsVerify().
 * The minted triple is cached (memory + sessionStorage) and the access token returned.
 */
export async function ensureCcSiwsToken(jwt: string): Promise<string> {
  const signer = walletSigner;
  if (!signer)
    throw new Error(
      "Hubungkan wallet atau login Google dulu untuk kirim kartu fisik. / Connect a wallet or sign in with Google to ship your card.",
    );

  let triple = loadCache(signer.address);
  if (triple && isAccessValid(triple)) return triple.accessToken;

  // Access expired but a refresh token survives → try the cheap refresh first.
  if (triple?.refreshToken) {
    try {
      const res = await siwsRefresh({ refreshToken: triple.refreshToken }, jwt);
      triple = toTriple(res);
      saveCache(signer.address, triple);
      return triple.accessToken;
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
  triple = toTriple(res);
  saveCache(signer.address, triple);
  return triple.accessToken;
}
