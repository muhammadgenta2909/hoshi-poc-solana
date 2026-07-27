// Support inbox (user ↔ admin) — client API. Beda dari contact-form lama:
// ini thread 2 arah yang tertaut ke user, jadi balasan admin sampai ke user.

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
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
    } catch { /* body bukan JSON */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export type SupportSenderType = "USER" | "ADMIN";
export type SupportThreadStatus = "OPEN" | "CLOSED";

export type SupportMessage = {
  id: string;
  threadId: string;
  senderType: SupportSenderType;
  body: string;
  createdAt: string;
};

export type SupportThreadSummary = {
  id: string;
  subject: string | null;
  listingId: string | null;
  status: SupportThreadStatus;
  unread: number;
  lastMessage: { body: string; senderType: SupportSenderType; createdAt: string } | null;
  user?: { id: string; label: string; walletAddress: string };
  createdAt: string;
  updatedAt: string;
};

export type SupportThreadDetail = {
  id: string;
  subject: string | null;
  listingId: string | null;
  status: SupportThreadStatus;
  userId: string;
  user?: { id: string; displayName: string | null; walletAddress: string };
  messages: SupportMessage[];
  createdAt: string;
  updatedAt: string;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/* ---------------------------------- USER --------------------------------- */

export const getSupportThreads = (token: string) =>
  req<SupportThreadSummary[]>("/support/threads", token);

export const getSupportThread = (id: string, token: string) =>
  req<SupportThreadDetail>(`/support/threads/${encodeURIComponent(id)}`, token);

export const createSupportThread = (data: { subject?: string; body: string }, token: string) =>
  req<SupportThreadDetail>("/support/threads", token, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const postSupportMessage = (id: string, body: string, token: string) =>
  req<SupportMessage>(`/support/threads/${encodeURIComponent(id)}/messages`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const getSupportUnread = (token: string) =>
  req<{ unread: number }>("/support/unread-count", token);

/* --------------------------------- ADMIN --------------------------------- */

export const getAdminSupportThreads = (token: string, params?: {
  page?: number; limit?: number; status?: string; unread?: boolean; search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.unread) q.set("unread", "true");
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return req<PaginatedResult<SupportThreadSummary>>(
    `/admin/support/threads${qs ? "?" + qs : ""}`,
    token,
  );
};

export const getAdminSupportThread = (id: string, token: string) =>
  req<SupportThreadDetail>(`/admin/support/threads/${encodeURIComponent(id)}`, token);

export const adminReplySupport = (id: string, body: string, token: string) =>
  req<SupportMessage>(`/admin/support/threads/${encodeURIComponent(id)}/reply`, token, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const getAdminSupportUnread = (token: string) =>
  req<{ unread: number }>("/admin/support/unread-count", token);

export const setAdminSupportStatus = (id: string, status: SupportThreadStatus, token: string) =>
  req<SupportThreadDetail>(`/admin/support/threads/${encodeURIComponent(id)}/status`, token, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
