"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { formatIdr } from "@/components/packs/ui";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type OfferItem = {
  id: string;
  listingId: string;
  listingName: string;
  user: string;
  amount: number;
  status: string;
  createdAt: string;
};

type PageData = {
  data: OfferItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const STATUS_STYLE: Record<string, string> = {
  PENDING: "text-yellow-400 bg-yellow-400/10",
  ACCEPTED: "text-green-400 bg-green-400/10",
  REJECTED: "text-red-400 bg-red-400/10",
};

export default function AdminOffersPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams();
      q.set("page", String(page)); q.set("limit", String(limit));
      if (search) q.set("search", search);
      const res = await fetch(`${API_BASE}/admin/offers?${q}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (id: string, action: "accept" | "reject") => {
    if (!token) return;
    setProcessing(id);
    try {
      const res = await fetch(`${API_BASE}/admin/offers/${id}/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} offer`);
    } finally { setProcessing(null); }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Offers</h1>
          <p className="mt-1 text-sm text-zinc-500">All buy offers submitted on marketplace listings.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search by listing name…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading offers…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No offers yet.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((o) => (
                  <tr key={o.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{o.listingName}</td>
                    <td className="px-4 py-3 text-zinc-300">{o.user}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-200">{formatIdr(o.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "text-zinc-400 bg-zinc-400/10"}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {o.status === "PENDING" ? (
                        <div className="flex gap-2">
                          <button onClick={() => act(o.id, "accept")} disabled={processing === o.id}
                            className="rounded-lg bg-green-500/20 px-3 py-1 text-[12px] font-semibold text-green-400 transition hover:bg-green-500/30 disabled:opacity-40"
                          >Accept</button>
                          <button onClick={() => act(o.id, "reject")} disabled={processing === o.id}
                            className="rounded-lg bg-red-500/20 px-3 py-1 text-[12px] font-semibold text-red-400 transition hover:bg-red-500/30 disabled:opacity-40"
                          >Reject</button>
                        </div>
                      ) : (
                        <span className="text-[12px] text-zinc-600">—</span>
                      )}
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
    </div>
  );
}
