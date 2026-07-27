// Pesan pembeli ↔ penjual marketplace (client API). Beda dari support (user↔admin):
// ini antara dua user untuk satu listing.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(", ") : String(b.message);
    } catch { /* body bukan JSON */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export type MarketSenderType = "BUYER" | "SELLER";
export type MarketRole = "BUYER" | "SELLER";

export type MarketMessage = {
  id: string;
  senderType: MarketSenderType;
  body: string;
  createdAt: string;
};

export type MarketThreadSummary = {
  id: string;
  listingId: string;
  listingName: string;
  listingImage: string | null;
  listingStatus: string | null;
  role: MarketRole;
  counterparty: string;
  status: "OPEN" | "CLOSED";
  unread: number;
  lastMessage: { body: string; senderType: MarketSenderType; createdAt: string } | null;
  updatedAt: string;
};

export type MarketThreadDetail = {
  id: string;
  listingId: string;
  listingName: string;
  listingImage: string | null;
  listingPriceIdrx: number | null;
  listingStatus: string | null;
  role: MarketRole;
  counterparty: string;
  status: "OPEN" | "CLOSED";
  messages: MarketMessage[];
};

/** Pembeli membuka/melanjutkan percakapan pada sebuah listing. */
export const postListingMessage = (listingId: string, body: string, token: string) =>
  req<{ threadId: string }>(`/marketplace/${encodeURIComponent(listingId)}/message`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const getMyMarketThreads = (token: string) =>
  req<MarketThreadSummary[]>("/marketplace/me/threads", token);

export const getMarketUnread = (token: string) =>
  req<{ unread: number }>("/marketplace/me/unread-count", token);

export const getMarketThread = (threadId: string, token: string) =>
  req<MarketThreadDetail>(`/marketplace/threads/${encodeURIComponent(threadId)}`, token);

export const replyMarketThread = (threadId: string, body: string, token: string) =>
  req<{ ok: boolean }>(`/marketplace/threads/${encodeURIComponent(threadId)}/message`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
