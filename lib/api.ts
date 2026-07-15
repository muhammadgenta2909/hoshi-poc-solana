// Client for hoshi-backend (NestJS, /api prefix). The marketplace & detail
// response shapes are DELIBERATELY 1:1 with the local types (Listing / CardDetail),
// so pages just swap their data source from mock → fetch, with no mapping.

import type { Listing, NewListingInput, RelistInput, UpdateListingInput } from "./market";
import type { CardDetail } from "./cardDetail";
import type { ActivityQuery, ActivityRecord, OfferRecord } from "./offers";
import type { GachaMachine, GachaPull } from "./gacha";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Fetch JSON with a clean backend error message (Nest returns {message}). */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg: string = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* non-JSON response — fall back to the status */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---------------- marketplace ---------------- */

export const getListings = () => api<Listing[]>("/marketplace");

export const getListingDetail = (id: string) =>
  api<CardDetail>(`/marketplace/${encodeURIComponent(id)}`);

/** Register a view (POST /marketplace/:id/view). Public; client dedupes per session. */
export const registerListingView = (id: string) =>
  api<{ views: number }>(`/marketplace/${encodeURIComponent(id)}/view`, {
    method: "POST",
  });

/** Make an offer. Requires a JWT — the buyer identity comes from the token, so
 *  the offer can be surfaced to the seller (Offers Received) and to the buyer
 *  (Offers Made). Previously the client sent the literal string "You". */
export const submitOffer = (id: string, amount: number, token: string) =>
  api<OfferRecord>(`/marketplace/${encodeURIComponent(id)}/offer`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount }),
  });

export const buyListing = (id: string, token: string) =>
  api<Listing>(`/marketplace/${encodeURIComponent(id)}/buy`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

/** Cards the user has purchased (their Vault/collection). Requires a JWT. */
export const getMyPurchases = (token: string) =>
  api<Listing[]>("/marketplace/me/purchases", {
    headers: { authorization: `Bearer ${token}` },
  });

/** List a card for sale (POST /marketplace). Seller is set server-side from the JWT. */
export const createListing = (input: NewListingInput, token: string) =>
  api<Listing>("/marketplace", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** The caller's own listings, all statuses (GET /marketplace/me/listings). Requires a JWT. */
export const getMyListings = (token: string) =>
  api<Listing[]>("/marketplace/me/listings", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Withdraw one of the caller's ACTIVE listings (POST /marketplace/:id/cancel). Requires a JWT. */
export const cancelListing = (id: string, token: string) =>
  api<Listing>(`/marketplace/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

/** Re-list a card you own (POST /marketplace/:id/relist). Owner-only; requires a JWT. */
export const relistListing = (id: string, input: RelistInput, token: string) =>
  api<Listing>(`/marketplace/${encodeURIComponent(id)}/relist`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Change the price of your own ACTIVE listing (PATCH /marketplace/:id).
 *  A dedicated update, not a cancel + re-list: views, listedAt and any live
 *  offers survive it (mirrors Collector Crypt's "update listing"). */
export const updateListing = (id: string, input: UpdateListingInput, token: string) =>
  api<Listing>(`/marketplace/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/* ---------------- offers (seller ⇄ buyer, no admin in the loop) ------------ */

/** Offers the signed-in user has made (GET /marketplace/me/offers-made). */
export const getOffersMade = (token: string) =>
  api<OfferRecord[]>("/marketplace/me/offers-made", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Offers others made on the signed-in user's listings. */
export const getOffersReceived = (token: string) =>
  api<OfferRecord[]>("/marketplace/me/offers-received", {
    headers: { authorization: `Bearer ${token}` },
  });

const offerAction = (offerId: string, action: string, token: string) =>
  api<OfferRecord>(`/marketplace/offers/${encodeURIComponent(offerId)}/${action}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

/** Seller accepts → the card sells immediately at the offer price. */
export const acceptOffer = (offerId: string, token: string) =>
  offerAction(offerId, "accept", token);

/** Seller declines an offer. */
export const rejectOffer = (offerId: string, token: string) =>
  offerAction(offerId, "reject", token);

/** Buyer withdraws their own offer. */
export const cancelOffer = (offerId: string, token: string) =>
  offerAction(offerId, "cancel", token);

/* ---------------- activity feed ---------------- */

/** Profile activity: every event where the user is the actor or counterparty. */
export const getMyActivity = (token: string, params?: ActivityQuery) => {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.set) q.set("set", params.set);
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<ActivityRecord[]>(`/marketplace/me/activity${qs ? `?${qs}` : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

/* ---------------- profile ---------------- */

export type Profile = {
  id: string;
  walletAddress: string;
  displayName: string | null;
  createdAt: string;
};

export const getProfile = (token: string) =>
  api<Profile & { counts: { nfts: number; vaultItems: number } }>("/users/me", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Rename yourself (the pencil next to the profile name). */
export const updateProfile = (displayName: string, token: string) =>
  api<Profile>("/users/me", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName }),
  });

/* ---------------- gacha (Collector Crypt machines) ---------------- */

/** All gacha machines, normalized. Public — no auth. */
export const getGachaMachines = () => api<GachaMachine[]>("/gacha/machines");

/** Pull a pack: a real treasury purchase. ADMIN JWT only — the recipient wallet
 *  is derived from the token server-side, so the client never sends an address
 *  (body is just { packType }). One call runs generate → treasury sign → submit
 *  → open, so it can take ~15-30s; non-admin callers get HTTP 403. */
export const purchaseGachaPack = (packType: string, token: string) =>
  api<GachaPull>("/gacha/purchase", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ packType }),
  });

/* ---------------- auth (wallet login) ---------------- */

export type NonceResponse = { message: string; nonce: string };
export type LoginResponse = {
  accessToken: string;
  user: { id: string; walletAddress: string; displayName: string | null; role?: "USER" | "ADMIN" };
};

export const requestNonce = (walletAddress: string) =>
  api<NonceResponse>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
  });

export const login = (walletAddress: string, signature: string) =>
  api<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature }),
  });

/* ---------------- admin (moved to lib/admin-api.ts) ---------------- */
