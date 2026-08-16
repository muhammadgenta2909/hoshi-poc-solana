export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/* ---------- shared pagination types ---------- */

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/* ---------- domain types matching backend response ---------- */

export type AdminStats = {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  cancelledListings: number;
  pendingEscrowListings: number;
  totalUsers: number;
  totalCards: number;
  totalRevenue: number;
};

export type AdminListingNft = {
  id: string;
  assetAddress: string;
  mintTx: string | null;
};

export type AdminListing = {
  id: string;
  name: string;
  set: string;
  rarity: string;
  image: string;
  imageBack: string | null;
  priceIdrx: number;
  expectedValueIdrx: number;
  buybackIdrx: number;
  sellerAddress: string;
  sellerId: string | null;
  grade: string;
  grader: string;
  gradeScore: number;
  language: string;
  era: string;
  element: string;
  category: string;
  views: number;
  status: string;
  listedAt: string;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  nft: AdminListingNft | null;
  cardId: string | null;
  certificate: string | null;
  vaultLocation: string | null;
  cardNumber: string | null;
  variant: string | null;
  /** Vault provenance. Rows synced before this field default to HOSHI server-side. */
  source: "HOSHI" | "COLLECTORCRYPT";
  ccNftAddress: string | null;
  ccPriceUsd: number | null;
  ccHasBuyback: boolean;
  ccSyncedAt: string | null;
};

export type AdminCard = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  set: string;
  rarity: string;
  metadataUri: string | null;
  attributes: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AdminActivityItem = {
  id: string;
  /** ActivityType enum: OFFER_MADE | OFFER_CANCELED | OFFER_REJECTED | SALE_CARD
   *  | LISTED_CARD | LISTING_CANCELED | SEND_TO_VAULT | SEND_TO_HOME */
  type: string;
  itemName: string;
  itemImage: string | null;
  category: string | null;
  set: string | null;
  /** IDRX. null = event tanpa nominal (mis. offer dibatalkan). */
  amount: number | null;
  fromLabel: string | null;
  toLabel: string | null;
  listingId: string | null;
  createdAt: string;
};

/* ---------- API functions ---------- */

export const getAdminStats = (token: string) =>
  api<AdminStats>("/admin/stats", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Live on-chain treasury balances + a rough status light for the refill indicator.
 *  `configured: false` / `status: "unknown"` = balances couldn't be read (RPC/treasury
 *  not set). Amounts are human units: usd (USDC $), sol (SOL), idrx (Rupiah). */
export type AdminTreasury = {
  configured: boolean;
  usdc: number | null;
  sol: number | null;
  idrx: number | null;
  status: "healthy" | "low" | "critical" | "unknown";
  /** true = USDC/SOL adalah MOCK (staging) — UI menandainya, tak menampilkan angka $ sbg saldo asli. */
  simulated: boolean;
};

export const getAdminTreasury = (token: string) =>
  api<AdminTreasury>("/admin/treasury", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------- transactions ledger + finance summary ---------- */

export type AdminTransaction = {
  id: string;
  merchantOrderId: string;
  type: "PACK" | "RESELLER" | "P2P";
  /** Model PM: CC vault (harga default, Hoshi 0%) vs Hoshi vault (5% / stok Hoshi). null = pack/topup. */
  vault: "CC" | "HOSHI" | null;
  status: string;
  priceIdr: number;
  item: string | null;
  buyer: string;
  seller: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

export type AdminSellerBalance = {
  id: string;
  wallet: string;
  label: string;
  balanceIdr: number;
};

export type AdminFinance = {
  reseller: { count: number; grossIdr: number };
  /** Hoshi jual kartu inventarisnya SENDIRI (source HOSHI). Seluruh omzet = pendapatan Hoshi. */
  hoshiInventory: { count: number; grossIdr: number };
  p2p: { count: number; grossIdr: number };
  liabilitiesIdr: number;
  pendingWithdrawalsIdr: number;
  pendingWithdrawalsCount: number;
  sellerCount: number;
  sellerBalances: AdminSellerBalance[];
  treasuryIdr: number | null;
  distributableProfitIdr: number | null;
  /** Fee marketplace Hoshi dalam basis points (500 = 5%). */
  marketplaceFeeBps: number;
  /** Komisi Hoshi dari total P2P bruto (= gross × fee). */
  p2pCommissionIdr: number;
  /** Sisa P2P bruto yang jadi saldo penjual (= gross − komisi). */
  p2pNetToSellersIdr: number;
};

export const getAdminTransactions = (
  token: string,
  params?: { page?: number; limit?: number; status?: string },
) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return api<{
    data: AdminTransaction[];
    total: number;
    page: number;
    limit: number;
  }>(`/admin/transactions${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const getAdminFinance = (token: string) =>
  api<AdminFinance>("/admin/finance", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- withdrawals (payout manual) ---------------- */

export type AdminWithdrawal = {
  id: string;
  amountIdr: number;
  method: string;
  destBank: string;
  destAccount: string;
  destName: string;
  status: "REQUESTED" | "PAID" | "REJECTED";
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  userWallet: string;
  userLabel: string;
};

export const getAdminWithdrawals = (token: string, status?: string) => {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<AdminWithdrawal[]>(`/admin/withdrawals${q}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const approveWithdrawal = (id: string, note: string, token: string) =>
  api<AdminWithdrawal>(`/admin/withdrawals/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

export const rejectWithdrawal = (id: string, note: string, token: string) =>
  api<AdminWithdrawal>(`/admin/withdrawals/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

/* ---------------- kirim kartu fisik (redemption) — admin ---------------- */

export type RedemptionStatus = "REQUESTED" | "PACKING" | "SHIPPED" | "CANCELED";

export type RedemptionSource = "PACK" | "CC_CATALOG" | "P2P" | "HOSHI";

export type AdminRedemption = {
  id: string;
  nftAddress: string;
  cardName: string;
  cardImage: string | null;
  cardSet: string | null;
  /** Asal kartu → siapa yang kirim fisik. null = data lama. */
  source: RedemptionSource | null;
  recipientName: string;
  street: string;
  city: string;
  state: string | null;
  zip: string;
  country: string;
  status: RedemptionStatus;
  createdAt: string;
};

export const getAdminRedemptions = (token: string) =>
  api<AdminRedemption[]>("/admin/redemptions", {
    headers: { authorization: `Bearer ${token}` },
  });

export const updateRedemptionStatus = (
  id: string,
  status: RedemptionStatus,
  token: string,
) =>
  api<AdminRedemption>(`/admin/redemptions/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });

export const getAdminListings = (token: string, params?: {
  page?: number; limit?: number; search?: string; status?: string; vault?: string; sort?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.vault) q.set("vault", params.vault);
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<PaginatedResult<AdminListing>>(`/admin/listings${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

/** Distinct vault locations across all listings — populates the "filter by vault"
 *  dropdown on the admin listings page. */
export const getAdminListingVaults = (token: string) =>
  api<string[]>("/admin/listings/vaults", {
    headers: { authorization: `Bearer ${token}` },
  });

export const getAdminListing = (id: string, token: string) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

export const createAdminListing = (data: Record<string, unknown>, token: string) =>
  api<AdminListing>("/admin/listings", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

export const updateAdminListing = (id: string, data: Record<string, unknown>, token: string) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

export const deleteAdminListing = (id: string, token: string) =>
  api<{ deleted: boolean; id: string }>(`/admin/listings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

/** Activate / deactivate a listing (ACTIVE ⇄ CANCELLED). Deactivating hides it
 *  from the marketplace but keeps the row, so it can be re-activated later. A SOLD
 *  listing is rejected by the backend. */
export const setAdminListingStatus = (
  id: string,
  status: "ACTIVE" | "CANCELLED",
  token: string,
) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });

export const getAdminCards = (token: string, params?: {
  page?: number; limit?: number; search?: string; set?: string; rarity?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.set) q.set("set", params.set);
  if (params?.rarity) q.set("rarity", params.rarity);
  const qs = q.toString();
  return api<PaginatedResult<AdminCard>>(`/admin/cards${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const submitContactMessage = (data: {
  listingId?: string; listingName: string; senderName: string; senderEmail: string; phone?: string; text: string;
}) => api("/admin/contact-messages", { method: "POST", body: JSON.stringify(data) });

export type AdminDailyStats = {
  dailyListings: { date: string; count: number }[];
  dailyRevenue: { date: string; amount: number }[];
  statusDistribution: { status: string; count: number }[];
  topListings: { id: string; name: string; views: number; priceIdrx: number }[];
  conversionRate: number;
};

export type ImportResult = {
  imported: number;
  items: AdminListing[];
};

export const getAdminDailyStats = (token: string, days = 365) =>
  api<AdminDailyStats>(`/admin/stats/daily?days=${days}`, {
    headers: { authorization: `Bearer ${token}` },
  });

export const importAdminListings = (items: Record<string, unknown>[], token: string, sellerOverride?: string) =>
  api<ImportResult>("/admin/listings/import", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ items, sellerOverride }),
  });

/* ---------- CollectorCrypt catalog sync ---------- */

export type CcSyncParams = {
  categories?: string;
  maxPages?: number;
  step?: number;
  listPriceMin?: number;
  listPriceMax?: number;
  markBuyback?: boolean;
};

export type CcSyncResult = {
  pagesFetched: number;
  found: number;
  created: number;
  updated: number;
  skipped: { grader: number; price: number; invalid: number };
  buybackMarked: number;
  usdIdrRate: number;
};

/** Pull CollectorCrypt's public catalog into our marketplace (source=COLLECTORCRYPT).
 *  Re-running refreshes metadata but never touches admin-edited prices. */
export const ccSyncListings = (params: CcSyncParams, token: string) =>
  api<CcSyncResult>("/admin/cc-sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });

/* ---------- Vault / Inventory (custody location) ---------- */

export type AdminVaultItem = {
  id: string;
  serialNumber: string | null;
  status: string;
  storageProvider: string;
  vaultLocation: string | null;
  cardId: string;
  cardName: string;
  cardImage: string | null;
  cardSet: string | null;
  ownerWallet: string | null;
  ownerLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

// Cukup HOSHI & COLLECTORCRYPT untuk sekarang. PWCC/OTHER dihapus dari UI:
// Hoshi adalah front-end di atas CollectorCrypt — custody kartu 100% milik CC,
// jadi lokasi/provider bersifat informational (read-only), bukan dikelola Hoshi.
export const STORAGE_PROVIDERS = ["HOSHI", "COLLECTORCRYPT"] as const;
export const VAULT_STATUSES = ["STORED", "MINTING", "MINTED", "REDEEMED"] as const;

export const getAdminVaultItems = (token: string, params?: {
  page?: number; limit?: number; status?: string; provider?: string; search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.provider) q.set("provider", params.provider);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return api<PaginatedResult<AdminVaultItem>>(`/admin/vault-items${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const updateAdminVaultItem = (
  id: string,
  data: { storageProvider?: string; vaultLocation?: string },
  token: string,
) =>
  api<AdminVaultItem>(`/admin/vault-items/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

/* ---------- Users ---------- */

export type AdminUser = {
  id: string;
  walletAddress: string;
  displayName: string | null;
  role: string;
  email: string | null;
  createdAt: string;
  listings: number;
  bought: number;
  offers: number;
  packs: number;
};

export const getAdminUsers = (token: string, params?: {
  page?: number; limit?: number; search?: string; role?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  const qs = q.toString();
  return api<PaginatedResult<AdminUser>>(`/admin/users${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const getAdminActivity = (token: string, params?: {
  page?: number; limit?: number; action?: string; search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.action) q.set("action", params.action);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return api<PaginatedResult<AdminActivityItem>>(`/admin/activity${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};
