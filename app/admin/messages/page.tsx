"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import Select from "@/components/admin/Select";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type ContactMessage = {
  id: string;
  listingId: string | null;
  listingName: string;
  senderName: string;
  senderEmail: string;
  phone: string | null;
  text: string;
  isRead: boolean;
  createdAt: string;
};

type PageData = {
  data: ContactMessage[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export default function AdminMessagesPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [marking, setMarking] = useState(false);

  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams();
      q.set("page", String(page)); q.set("limit", String(limit));
      if (search) q.set("search", search);
      if (statusFilter) q.set("status", statusFilter);
      const res = await fetch(`${API_BASE}/admin/contact-messages?${q}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const markAsRead = async (id: string, isRead: boolean) => {
    if (!token) return;
    setMarking(true);
    try {
      await fetch(`${API_BASE}/admin/contact-messages/${id}/read`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ isRead }),
      });
      if (selected?.id === id) setSelected((p) => p ? { ...p, isRead } : null);
      await fetchData();
    } catch { /* ignore */ } finally { setMarking(false); }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Messages</h1>
          <p className="mt-1 text-sm text-zinc-500">Contact messages from marketplace visitors.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { label: "All Status", value: "" },
              { label: "Unread", value: "unread" },
              { label: "Read", value: "read" },
            ]}
            className="w-36"
          />
          <input type="text" placeholder="Search messages…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-56 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading messages…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No messages yet.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-20">Status</th>
                  <th className="px-4 py-3">Sender</th>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((m) => (
                  <tr key={m.id} onClick={() => setSelected(m)}
                    className="cursor-pointer border-b border-white/5 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3">
                      <span className={`inline-block h-2 w-2 rounded-full ${m.isRead ? "bg-zinc-600" : "bg-yellow-400"}`} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{m.senderName}</p>
                      <p className="text-[12px] text-zinc-500">{m.senderEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{m.listingName}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-zinc-400">{m.text}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
            <span>Page {result.page} of {result.totalPages} ({result.total} total)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] disabled:opacity-30"
              >← Prev</button>
              <button disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.04] disabled:opacity-30"
              >Next →</button>
            </div>
          </div>
        </>
      ) : null}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#171717] p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.senderName}</h2>
                <p className="text-sm text-zinc-400">{selected.senderEmail}{selected.phone ? ` · ${selected.phone}` : ""}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-zinc-300">&times;</button>
            </div>
            <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="mb-1 text-[13px] font-medium text-zinc-500">Regarding</p>
              <p className="text-sm text-zinc-200">{selected.listingName}</p>
            </div>
            <div className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="mb-1 text-[13px] font-medium text-zinc-500">Message</p>
              <p className="whitespace-pre-wrap text-sm text-zinc-200">{selected.text}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-zinc-500">{new Date(selected.createdAt).toLocaleString()}</p>
              <button
                onClick={() => markAsRead(selected.id, !selected.isRead)}
                disabled={marking}
                className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-50 ${
                  selected.isRead
                    ? "border border-white/10 text-zinc-300 hover:bg-white/[0.04]"
                    : "bg-yellow-400 text-[#171717] hover:bg-yellow-300"
                }`}
              >
                {marking ? "Saving…" : selected.isRead ? "Mark Unread" : "Mark as Read"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
