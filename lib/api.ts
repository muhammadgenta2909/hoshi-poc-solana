// Client for hoshi-backend (NestJS, /api prefix). The marketplace & detail
// response shapes are DELIBERATELY 1:1 with the local types (Listing / CardDetail),
// so pages just swap their data source from mock → fetch, with no mapping.

import type { Listing, NewListingInput } from "./market";
import type { CardDetail } from "./cardDetail";

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

export const submitOffer = (id: string, user: string, amount: number) =>
  api<{ submitted: boolean; listingId: string }>(`/marketplace/${encodeURIComponent(id)}/offer`, {
    method: "POST",
    body: JSON.stringify({ user, amount }),
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
