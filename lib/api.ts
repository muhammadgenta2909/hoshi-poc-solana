// Client for hoshi-backend (NestJS, /api prefix). The marketplace & detail
// response shapes are DELIBERATELY 1:1 with the local types (Listing / CardDetail),
// so pages just swap their data source from mock → fetch, with no mapping.

import type { Listing, NewListingInput, RelistInput, UpdateListingInput } from "./market";
import type { CardDetail } from "./cardDetail";
import type { ActivityQuery, ActivityRecord, OfferRecord } from "./offers";
import type { GachaMachine, GachaPull, GachaWinner } from "./gacha";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Fetch JSON with a clean backend error message (Nest returns {message}).
 *  `timeoutMs` aborts the request — use it on latency-critical calls (login)
 *  so a cold backend surfaces a retryable error instead of an endless spinner.
 *  Do NOT put it on known-slow calls (gacha purchase runs ~15-30s). */
async function api<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
      signal: timeoutMs != null ? AbortSignal.timeout(timeoutMs) : rest.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError")
      throw new ApiError("The server is waking up — please try again in a few seconds.", 408);
    throw e;
  }
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

/** Fire-and-forget ping so the free-tier backend is awake BEFORE the login
 *  nonce/verify calls need it (a cold start takes ~30s+). Called on app load
 *  and when the connect modal opens; throttled so repeat opens don't spam. */
let lastWarmAt = 0;
export function warmBackend() {
  const now = Date.now();
  if (now - lastWarmAt < 120_000) return;
  lastWarmAt = now;
  void fetch(`${API_BASE}/health`, { cache: "no-store" }).catch(() => {});
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
  email: string | null;
  bio: string | null;
  twitter: string | null;
  website: string | null;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  createdAt: string;
};

export const getProfile = (token: string) =>
  api<Profile & { counts: { nfts: number; vaultItems: number } }>("/users/me", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Any subset of the editable profile fields. For bio/twitter/website/phone an
 *  empty string CLEARS the field (stored as null); displayName is MANDATORY
 *  server-side (1–32 chars) and must never be sent empty. Omitted keys are left
 *  untouched. */
export type UpdateProfileInput = Partial<{
  displayName: string;
  bio: string;
  twitter: string;
  website: string;
  phoneCountryCode: string;
  phoneNumber: string;
}>;

/** Update your own profile (rename pencil sends { displayName } alone; the
 *  Settings form sends the whole editable set). */
export const updateProfile = (input: UpdateProfileInput, token: string) =>
  api<Profile>("/users/me", {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/* ---------------- shipping addresses ---------------- */

export type ShippingAddress = {
  id: string;
  fullName: string;
  country: string;
  street: string;
  apt: string | null;
  state: string | null;
  city: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  zip: string;
  isDefault: boolean;
  createdAt: string;
};

export type NewAddressInput = {
  fullName: string;
  country: string;
  street: string;
  apt?: string;
  state?: string;
  city: string;
  phoneCountryCode?: string;
  phoneNumber?: string;
  zip: string;
  isDefault?: boolean;
};

/** The caller's saved shipping addresses (GET /users/me/addresses). */
export const getMyAddresses = (token: string) =>
  api<ShippingAddress[]>("/users/me/addresses", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Save a new shipping address. The server enforces the max (5) and keeps a
 *  single default — marking this one default clears the flag on the others. */
export const addAddress = (input: NewAddressInput, token: string) =>
  api<ShippingAddress>("/users/me/addresses", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Remove one of the caller's addresses. Returns the deleted row. */
export const deleteAddress = (id: string, token: string) =>
  api<ShippingAddress>(`/users/me/addresses/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
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

/** Recent winners across machines for the live "card won" ticker. Public — no auth.
 *  Real card identity only (name + image + winner + tier); no synthetic price. */
export const getGachaWinners = () => api<GachaWinner[]>("/gacha/winners");

/** The caller's own gacha pull history (GET /gacha/me/packs), newest first.
 *  Requires a JWT. These are the cards pulled from packs — the Vault merges them
 *  with marketplace purchases so a pull shows up in the collection immediately. */
export const getMyPacks = (token: string) =>
  api<GachaPull[]>("/gacha/me/packs", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- payments (rupiah on-ramp via IDRX: QRIS / e-wallet / VA) ----

   The user pays RUPIAH off-chain; no USDC/SOL leaves their wallet. Flow:
     1. POST /payments/pack  -> creates an IDRX order, returns a QR / VA / hosted
        payment URL (nothing on-chain moves yet).
     2. User pays in their banking / e-wallet app.
     3. IDRX confirms PAID -> the backend buys + opens the pack (treasury settles
        on-chain) -> the card is minted to the user -> status FULFILLED.
     4. Client polls GET /payments/orders/:merchantOrderId until FULFILLED.
   Gated by NEXT_PUBLIC_PAYMENTS_ENABLED so the UI only appears once the backend
   has real IDRX credentials configured. -------------------------------------- */

/** True when the rupiah payment UI should be shown (backend IDRX creds ready). */
export const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "1";

export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "FULFILLING"
  | "FULFILLED"
  | "EXPIRED"
  | "FAILED"
  | "REFUND_DUE";

/** One rupiah order (mirrors backend PaymentOrderDto). Dates arrive as ISO strings. */
export type PaymentOrder = {
  merchantOrderId: string;
  packType: string;
  priceIdr: number;
  priceUsdc: number;
  paymentMethod: string;
  status: PaymentStatus;
  qrContent: string | null;
  virtualAccountNo: string | null;
  paymentUrl: string | null;
  packMemo: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

/** Terminal states — polling stops here. */
export const isTerminalPaymentStatus = (s: PaymentStatus): boolean =>
  s === "FULFILLED" || s === "EXPIRED" || s === "FAILED" || s === "REFUND_DUE";

/** Create a rupiah order for a pack (POST /payments/pack). `method` "QRIS" gives a
 *  QR string; "HOSTED" gives a paymentUrl covering the widest set of channels.
 *  Price + recipient are snapshotted server-side — never sent from the client. */
export const createPackOrder = (
  input: { packType?: string; method?: "QRIS" | "HOSTED" },
  token: string,
) =>
  api<PaymentOrder>("/payments/pack", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Poll one order's status (GET /payments/orders/:merchantOrderId). Ownership is
 *  checked server-side even though the id is public. */
export const getPaymentOrder = (merchantOrderId: string, token: string) =>
  api<PaymentOrder>(`/payments/orders/${encodeURIComponent(merchantOrderId)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

/** The caller's rupiah order history (GET /payments/me/orders), newest first. */
export const getMyOrders = (token: string) =>
  api<PaymentOrder[]>("/payments/me/orders", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- auth (wallet login) ---------------- */

export type NonceResponse = { message: string; nonce: string };
export type LoginResponse = {
  accessToken: string;
  user: { id: string; walletAddress: string; displayName: string | null; role?: "USER" | "ADMIN" };
};

// Both carry a timeout: they sit inside the connect modal's spinner, so a cold
// backend must surface a retryable "waking up" error, not an endless wait.
export const requestNonce = (walletAddress: string) =>
  api<NonceResponse>("/auth/nonce", {
    method: "POST",
    body: JSON.stringify({ walletAddress }),
    timeoutMs: 15_000,
  });

export const login = (walletAddress: string, signature: string) =>
  api<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ walletAddress, signature }),
    timeoutMs: 15_000,
  });

/* ---------------- admin (moved to lib/admin-api.ts) ---------------- */
