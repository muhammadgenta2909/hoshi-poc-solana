// Client for hoshi-backend (NestJS, /api prefix). The marketplace & detail
// response shapes are DELIBERATELY 1:1 with the local types (Listing / CardDetail),
// so pages just swap their data source from mock → fetch, with no mapping.

import type { Listing, NewListingInput, RelistInput, UpdateListingInput } from "./market";
import type { CardDetail } from "./cardDetail";
import type { ActivityQuery, ActivityRecord, OfferRecord } from "./offers";
import type { GachaMachine, GachaPull, GachaWinner } from "./gacha";
import { getPrivyIdentityToken } from "./privyIdentity";

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

/* --- Beli kartu KATALOG CollectorCrypt (diselesaikan DI CC, bukan di Hoshi) ---
   Alurnya: prepare -> user tanda tangan di wallet -> submit.
   Pembeli membayar USDC LIVE milik CC langsung ke penjual CC; Hoshi tidak mint
   apa pun dan tidak mengambil margin on-chain. Ditampilkan hanya bila backend
   mengaktifkan HOSHI_CC_BUY_ENABLED (jalur ini menandatangani transaksi asli). */

/** True saat UI beli kartu CC boleh muncul (backend sudah mengaktifkan flag-nya). */
export const CC_BUY_ENABLED = process.env.NEXT_PUBLIC_CC_BUY_ENABLED === "1";

export type CcBuyQuote = {
  listingId: string;
  nftAddress: string;
  /** Harga LIVE CollectorCrypt dalam USDC — INI yang akan didebit dari wallet. */
  priceUsdc: number;
  sellerWallet: string;
  serializedTransaction: string;
};

/** Kutip harga live + bangun transaksi (backend sudah memverifikasi nominalnya). */
export const ccBuyPrepare = (id: string, token: string) =>
  api<CcBuyQuote>(`/marketplace/${encodeURIComponent(id)}/cc-buy/prepare`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

/** Siarkan transaksi yang sudah ditandatangani. TIDAK idempoten — jangan retry buta. */
export const ccBuySubmit = (id: string, signedTransaction: string, token: string) =>
  api<{ signature: string; listingId: string }>(
    `/marketplace/${encodeURIComponent(id)}/cc-buy/submit`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ signedTransaction }),
    },
  );

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

/** Escrow langkah 1 (real P2P armed): bangun tx transfer kartu penjual → wallet escrow.
 *  Hanya untuk listing PENDING_ESCROW; penjual menandatangani hasilnya. Idempoten (build ulang). */
export const escrowPrepare = (id: string, token: string) =>
  api<{ serializedTransaction: string }>(
    `/marketplace/${encodeURIComponent(id)}/escrow/prepare`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );

/** Escrow langkah 2: siarkan transfer bertanda tangan penjual → listing jadi ACTIVE.
 *  Aman di-retry: kalau kartu sudah di escrow, backend melewati broadcast & tetap mengaktifkan. */
export const escrowSubmit = (id: string, signedTransaction: string, token: string) =>
  api<Listing>(`/marketplace/${encodeURIComponent(id)}/escrow/submit`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ signedTransaction }),
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
  notifyOffers: boolean;
  notifyOfferThreshold: number;
  notifyMessages: boolean;
  createdAt: string;
};

export const getProfile = (token: string) =>
  api<Profile & { counts: { nfts: number; vaultItems: number } }>("/users/me", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Any subset of the editable profile fields. For bio/twitter/website/phone/email
 *  an empty string CLEARS the field (stored as null); displayName is MANDATORY
 *  server-side (1–32 chars) and must never be sent empty. Omitted keys are left
 *  untouched. */
export type UpdateProfileInput = Partial<{
  displayName: string;
  email: string;
  bio: string;
  twitter: string;
  website: string;
  phoneCountryCode: string;
  phoneNumber: string;
  notifyOffers: boolean;
  notifyOfferThreshold: number;
  notifyMessages: boolean;
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

/* ---------------- redeem: kirim kartu fisik ke rumah ---------------- */

/** True saat alur kirim-fisik REAL (bayar ongkir + burn NFT + serah ke CollectorCrypt shipping)
 *  boleh jalan. OFF → UI tetap RECORD-ONLY byte-for-byte (POST /redemptions saja, NFT tak bergerak).
 *  Konvensi sama dgn PAYMENTS_ENABLED dst — nilainya "1", BUKAN "true". Prod: biarkan unset sampai
 *  backend meng-arm CC shipping (treasury didanai + kredensial CC shipping siap). */
export const CC_SHIPPING_ENABLED = process.env.NEXT_PUBLIC_CC_SHIPPING_ENABLED === "1";

/** Semua status daur-hidup satu permintaan kirim fisik. Record-only memakai REQUESTED/PACKING/
 *  SHIPPED/CANCELED; alur real menambah tahap bayar-ongkir → danai+burn → dikirim CC + refund. */
export type RedemptionStatus =
  | "REQUESTED"
  | "AWAITING_PAYMENT"
  | "READY_TO_FUND"
  | "FUNDING"
  | "FUNDED"
  | "BURN_SUBMITTED"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "PACKING"
  | "SHIPPED"
  | "CANCELED"
  | "REFUND_DUE"
  | "RECLAIM_DUE"
  | "SHIP_FAILED_POST_BURN";

export type CardRedemption = {
  id: string;
  nftAddress: string;
  cardName: string;
  cardImage: string | null;
  cardSet: string | null;
  recipientName: string;
  city: string;
  country: string;
  status: RedemptionStatus;
  /** Nomor resi CC (baru terisi setelah dikirim). Opsional: /redemptions/me record-only bisa
   *  mengabaikannya; /redemptions/:id/status yang mengembalikannya saat IN_TRANSIT/DELIVERED. */
  trackingIds?: string[];
  /** Link lacak resi (sejajar dengan trackingIds). */
  trackingUrls?: string[];
  createdAt: string;
};

/** Header untuk endpoint kirim-fisik CC: JWT wallet kita PLUS identity token Privy
 *  (membuktikan user Google/Privy MANA yang memanggil — API shipping CC ter-scope ke identitas
 *  itu). Kalau identity token null (mis. user login wallet mentah, bukan Google/Privy), lempar
 *  pesan ramah supaya UI menyuruh login Google/Privy dulu — bukan error mentah dari server. */
async function shippingHeaders(token: string): Promise<Record<string, string>> {
  const identityToken = await getPrivyIdentityToken();
  if (!identityToken)
    throw new Error("Login pakai Google/Privy dulu untuk kirim fisik.");
  return {
    authorization: `Bearer ${token}`,
    "X-Privy-Identity-Token": identityToken,
  };
}

/** Minta kirim kartu fisik ke rumah (POST /redemptions). RECORD-ONLY di server: mencatat
 *  permintaan + tujuan, TIDAK burn/transfer NFT — kartu tetap di wallet sampai admin proses. */
export const requestRedemption = (
  input: { nftAddress: string; shippingAddressId: string },
  token: string,
) =>
  api<CardRedemption>("/redemptions", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Riwayat permintaan kirim kartu fisik milik user (GET /redemptions/me). */
export const getMyRedemptions = (token: string) =>
  api<CardRedemption[]>("/redemptions/me", {
    headers: { authorization: `Bearer ${token}` },
  });

/* --- kirim-fisik REAL (butuh JWT + header X-Privy-Identity-Token; hanya saat backend di-arm) ---
   Alur: estimate ongkir Rupiah → bayar (order IDRX hosted) → danai+siapkan tx → user TTD →
   submit burn → lacak resi. Kelima call di bawah melampirkan identity token Privy lewat
   shippingHeaders() (lempar pesan ramah kalau user belum login Google/Privy). ---------------- */

/** Estimasi ongkir kirim fisik yang dihitung server (POST /redemptions/:id/estimate). */
export type RedemptionEstimate = {
  /** Perkiraan biaya kirim CC dalam USD. */
  usd: number;
  /** Nilai yang sama dalam base unit USDC (6 desimal). */
  usdcBaseUnits: number;
  /** Nominal yang ditagih ke user, dalam Rupiah. */
  rupiah: number;
};

export const estimateRedemption = async (id: string, token: string) =>
  api<RedemptionEstimate>(`/redemptions/${encodeURIComponent(id)}/estimate`, {
    method: "POST",
    headers: await shippingHeaders(token),
  });

/** Terbitkan tagihan Rupiah untuk ONGKIR kirim fisik (POST /payments/shipping). Mengembalikan
 *  PaymentOrder ber-`paymentUrl` (IDRX/Duitku hosted, bentuk sama dgn order pack). Setelah lunas,
 *  backend menandai redemption READY_TO_FUND. */
export const createShippingOrder = async (redemptionId: string, token: string) =>
  api<PaymentOrder>("/payments/shipping", {
    method: "POST",
    headers: await shippingHeaders(token),
    body: JSON.stringify({ redemptionId }),
  });

/** Hasil danai+siapkan: transaksi unsigned (base64) yang harus ditandatangani user sebelum burn. */
export type FundAndPrepareResult = {
  /** Transaksi utama (danai treasury + burn NFT), base64 unsigned — TTD berurutan. */
  transactions: string[];
  /** Transaksi lepas-listing/escrow bila kartu sedang dipajang (bisa []), base64 unsigned. */
  delistTransactions: string[];
  outboundShipmentId: string;
  /** Total biaya dalam base unit USDC (6 desimal). */
  totalCostUsdc: number;
};

/** Danai + siapkan transaksi kirim (POST /redemptions/:id/fund-and-prepare). */
export const fundAndPrepareRedemption = async (id: string, token: string) =>
  api<FundAndPrepareResult>(`/redemptions/${encodeURIComponent(id)}/fund-and-prepare`, {
    method: "POST",
    headers: await shippingHeaders(token),
  });

/** Kirim transaksi yang sudah ditandatangani user (POST /redemptions/:id/submit-burn).
 *  NB: gabungan delistTransactions (dulu) + transactions, semuanya sudah ditandatangani. */
export const submitRedemptionBurn = async (
  id: string,
  signedTransactions: string[],
  token: string,
) =>
  api<{ status: RedemptionStatus; burnSignature: string }>(
    `/redemptions/${encodeURIComponent(id)}/submit-burn`,
    {
      method: "POST",
      headers: await shippingHeaders(token),
      body: JSON.stringify({ signedTransactions }),
    },
  );

/** Status + resi satu permintaan kirim fisik (GET /redemptions/:id/status). Dipakai untuk polling
 *  tahap "Dalam perjalanan" — menampilkan status & trackingUrls saat IN_TRANSIT/DELIVERED. */
export const getRedemptionStatus = async (id: string, token: string) =>
  api<CardRedemption>(`/redemptions/${encodeURIComponent(id)}/status`, {
    headers: await shippingHeaders(token),
  });

/* ---------------- swap: tukar kartu antar kolektor ---------------- */

export type SwapStatus = "REQUESTED" | "CANCELED";
export type SwapRequest = {
  id: string;
  offeredNftAddress: string;
  offeredCardName: string;
  offeredCardImage: string | null;
  recipientMethod: string;
  recipientValue: string;
  status: SwapStatus;
  createdAt: string;
};

/** Ajukan tukar kartu ke kolektor lain (POST /swaps). RECORD-ONLY: mencatat ajakan + kartu yang
 *  ditawarkan, TIDAK transfer/burn kartu (akseptasi & perpindahan belum ada di fase ini). */
export const createSwap = (
  input: {
    offeredNftAddress: string;
    recipientMethod: "wallet" | "email" | "sns";
    recipientValue: string;
  },
  token: string,
) =>
  api<SwapRequest>("/swaps", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Riwayat ajakan tukar kartu milik user (GET /swaps/me). */
export const getMySwaps = (token: string) =>
  api<SwapRequest[]>("/swaps/me", {
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

/** Status of ONE pack by its memo (GET /gacha/packs/:memo). Used by the rupiah
 *  flow: once an order is FULFILLED the card is already minted server-side, so we
 *  fetch the pulled card here (by the order's packMemo) to play the SAME reveal
 *  animation as the direct pull, instead of silently dropping it into the Vault. */
export const getPackStatus = (memo: string, token: string) =>
  api<GachaPull>(`/gacha/packs/${encodeURIComponent(memo)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

/** Open a SEALED pack the user already owns (POST /gacha/packs/:memo/open). The
 *  rupiah flow leaves a paid pack at SUBMITTED; this runs the CC VRF reveal + mints
 *  the card. The outcome is decided HERE, not at purchase — so the reveal is a real
 *  draw, not theatre. Idempotent server-side; returns the OPENED pull with the card. */
export const openPackByMemo = (memo: string, token: string) =>
  api<GachaPull>(`/gacha/packs/${encodeURIComponent(memo)}/open`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- buyback (CollectorCrypt's 72-hour window) ------------------
   Two steps, because this is the ONE flow the treasury cannot sign for us:
     1. requestBuyback  -> CC's refund offer + an UNSIGNED transaction
     2. the USER signs it in their wallet (Phantom or the Privy embedded wallet)
     3. submitBuyback   -> we forward the signed bytes to CC; card moves, refund pays
   The amount is always CollectorCrypt's number — we never compute a quote. ---- */

/** CC's buyback offer for one pulled card, plus the transaction to sign. */
export type BuybackQuote = {
  packMemo: string;
  buybackMemo: string;
  nftAddress: string;
  /** USDC base unit (6 decimals) — $12.34 arrives as 12_340_000. */
  refundAmountUsdc: number;
  /** Base64, UNSIGNED. */
  serializedTransaction: string;
};

export type BuybackResult = {
  packMemo: string;
  signature: string;
  confirmationStatus: string;
  refundAmountUsdc: number;
};

/** CC's read-only valuation of a card. No transaction is issued. */
export type BuybackValue = {
  nftAddress: string;
  available: boolean;
  /** USDC base unit, or null when CC won't quote it (e.g. past the 72h window). */
  refundAmountUsdc: number | null;
};

/** What CC reckons this card is worth (GET /gacha/buyback/value/:nftAddress).
 *  Safe to call just to render a number — unlike requestBuyback, it issues nothing. */
export const getBuybackValue = (nftAddress: string, token: string) =>
  api<BuybackValue>(`/gacha/buyback/value/${encodeURIComponent(nftAddress)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

/** Ask CollectorCrypt what they'll pay for this card (POST /gacha/buyback). */
export const requestBuyback = (nftAddress: string, token: string) =>
  api<BuybackQuote>("/gacha/buyback", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ nftAddress }),
  });

/** Forward the user-signed transaction (POST /gacha/buyback/:memo/submit).
 *  NOT idempotent on CC's side — never retry this blindly. */
export const submitBuyback = (memo: string, signedTransaction: string, token: string) =>
  api<BuybackResult>(`/gacha/buyback/${encodeURIComponent(memo)}/submit`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ signedTransaction }),
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

/** True saat tombol "Beli via Rupiah" (jalur RESELLER kartu katalog CC) boleh muncul.
 *  Terpisah dari PAYMENTS_ENABLED supaya prod bisa tetap menyembunyikan tombol reseller
 *  (settlement real belum di-arm) tanpa mematikan pembayaran pack gacha. Staging = "1";
 *  prod = biarkan unset sampai go-live (treasury didanai + HOSHI_CC_RESELL_ENABLED=true). */
export const CC_RESELL_ENABLED = process.env.NEXT_PUBLIC_CC_RESELL_ENABLED === "1";

/** True saat tombol "Beli via Rupiah" pada listing USER (jual-beli antar user / Flow B P2P)
 *  boleh muncul. Terpisah dari reseller: staging = "1"; prod = unset sampai escrow di-arm
 *  (HOSHI_P2P_ENABLED=true + wallet escrow didanai). */
export const P2P_ENABLED = process.env.NEXT_PUBLIC_P2P_ENABLED === "1";

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

/** Terbitkan tagihan rupiah untuk membeli satu kartu KATALOG CollectorCrypt lewat jalur
 *  reseller (pembeli bayar harga kita via IDRX; treasury yang beli di CC + kirim ke pembeli).
 *  POST /payments/listing. Nominal & penerima ditentukan server dari baris Listing. */
export const createListingOrder = (listingId: string, token: string) =>
  api<PaymentOrder>("/payments/listing", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ listingId }),
  });

/** Bayar OFFER yang sudah diterima penjual (POST /payments/offer) — di HARGA OFFER. Saat lunas,
 *  kartu dikirim ke pembeli & penjual dikredit. Alur bayar & polling IDENTIK order lain. */
export const createOfferOrder = (offerId: string, token: string) =>
  api<PaymentOrder>("/payments/offer", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ offerId }),
  });

/** Isi saldo in-app (top-up). POST /payments/topup. Bayar rupiah lewat IDRX; saat PAID+MINTED,
 *  saldo dikreditkan sebesar nominal — TIDAK ada USDC treasury yang dibelanjakan (fulfilment
 *  hanya menulis baris saldo). Alur bayar & polling IDENTIK dengan order lain. */
export const topUpBalance = (amountIdr: number, token: string) =>
  api<PaymentOrder>("/payments/topup", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ amountIdr }),
  });

/** Saldo in-app (Rupiah) hasil penjualan P2P + mutasi terakhir. */
export type BalanceEntry = {
  id: string;
  deltaIdrx: number;
  reason: string;
  refId: string | null;
  createdAt: string;
};
export type Balance = { balanceIdrx: number; entries: BalanceEntry[] };

export const getBalance = (token: string) =>
  api<Balance>("/balance/me", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- tarik saldo (payout ke bank/e-wallet) ---------------- */

export type WithdrawalStatus = "REQUESTED" | "PAID" | "REJECTED";
export type Withdrawal = {
  id: string;
  amountIdr: number;
  method: "BANK" | "EWALLET" | string;
  destBank: string;
  destAccount: string;
  destName: string;
  status: WithdrawalStatus;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
};
export type WithdrawInput = {
  amount: number;
  method: "BANK" | "EWALLET";
  destBank: string;
  destAccount: string;
  destName: string;
};

/** Minta tarik saldo. Saldo langsung di-hold; admin transfer manual lalu tandai PAID. */
export const requestWithdrawal = (input: WithdrawInput, token: string) =>
  api<Withdrawal>("/balance/withdraw", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/** Riwayat penarikan saldo user login. */
export const getMyWithdrawals = (token: string) =>
  api<Withdrawal[]>("/balance/withdrawals", {
    headers: { authorization: `Bearer ${token}` },
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
