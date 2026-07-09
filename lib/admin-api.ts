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
  name: string;
  priceIdrx: number;
  status: string;
  sellerAddress: string;
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
};

/* ---------- API functions ---------- */

export const getAdminStats = (token: string) =>
  api<AdminStats>("/admin/stats", {
    headers: { authorization: `Bearer ${token}` },
  });

export const getAdminListings = (token: string, params?: {
  page?: number; limit?: number; search?: string; status?: string; sort?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<PaginatedResult<AdminListing>>(`/admin/listings${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

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
