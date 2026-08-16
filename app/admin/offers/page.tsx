"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/adminAuth";
import { formatIdr } from "@/components/packs/ui";
import { ConfirmDialog } from "@/components/account/ui";
import Pagination from "@/components/admin/Pagination";
import Thumb from "@/components/admin/Thumb";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

type OfferItem = {
  id: string;
  listingId: string;
  listingName: string;
  listingImage: string | null;
  listingStatus: string | null;
  askPrice: number | null;
  user: string;
  buyerWallet: string | null;
  amount: number;
  status: string;
  createdAt: string;
  updatedAt: string;
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
  CANCELED: "text-zinc-400 bg-zinc-400/10",
};

// Tab filter status. "" = semua. Nilai selain "" dikirim apa adanya ke backend
// (backend hanya menerima nilai enum yang valid).
const STATUS_TABS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Pending", value: "PENDING" },
  { label: "Accepted", value: "ACCEPTED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "Cancelled", value: "CANCELED" },
];

function shortAddr(a: string | null): string {
  if (!a) return "—";
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

// Selisih nominal offer vs harga ask, buat bantu admin memutuskan cepat.
function offerVsAsk(offer: number, ask: number | null): { text: string; cls: string } | null {
  if (!ask || ask <= 0) return null;
  const pct = Math.round(((offer - ask) / ask) * 100);
  if (pct === 0) return { text: "at ask", cls: "text-zinc-400" };
  return { text: `${pct > 0 ? "+" : ""}${pct}%`, cls: pct > 0 ? "text-green-400" : "text-red-400" };
}

export default function AdminOffersPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const q = new URLSearchParams();
      q.set("page", String(page)); q.set("limit", String(limit));
      if (search) q.set("search", search);
      if (status) q.set("status", status);
      const res = await fetch(`${API_BASE}/admin/offers?${q}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Offer yang menunggu konfirmasi "Accept" (dialog bertema, bukan window.confirm bawaan browser).
  const [confirmAcceptId, setConfirmAcceptId] = useState<string | null>(null);

  // Accept = irreversible (jual kartu + mint NFT ke pembeli + auto-reject offer lain) → lewat
  // ConfirmDialog dulu. Reject langsung. `act` cuma router; `doAct` yang benar-benar memanggil API.
  const act = (id: string, action: "accept" | "reject") => {
    if (action === "accept") {
      setConfirmAcceptId(id);
      return;
    }
    void doAct(id, action);
  };

  const doAct = async (id: string, action: "accept" | "reject") => {
    if (!token) return;
    setProcessing(id);
    try {
      const res = await fetch(`${API_BASE}/admin/offers/${id}/${action}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      if (!res.ok) {
        // Tampilkan pesan backend yang sebenarnya (mis. "Listing already sold"),
        // bukan cuma kode HTTP.
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.message) msg = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
        } catch { /* body bukan JSON — pakai kode HTTP */ }
        throw new Error(msg);
      }
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

      {/* Filter status */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => {
          const active = status === t.value;
          return (
            <button key={t.value || "all"} onClick={() => { setStatus(t.value); setPage(1); }}
              className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition ${
                active
                  ? "bg-yellow-400/10 text-yellow-200 shadow-[0_0_0_1px_rgba(250,204,21,0.3)]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >{t.label}</button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading offers…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No offers found.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Listing</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Offer / Ask</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((o, idx) => {
                  const delta = offerVsAsk(o.amount, o.askPrice);
                  const resolved = o.status !== "PENDING" && o.updatedAt !== o.createdAt;
                  return (
                    <tr key={o.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-[12px] tabular-nums text-zinc-500">{(result.page - 1) * limit + idx + 1}</td>
                      {/* Listing: thumbnail + nama (link ke detail) */}
                      <td className="px-4 py-3">
                        <Link href={`/marketplace/${o.listingId}`} className="group flex items-center gap-3">
                          <Thumb src={o.listingImage} alt="" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-white group-hover:text-yellow-200">{o.listingName || "—"}</p>
                            {o.listingStatus && o.listingStatus !== "ACTIVE" && (
                              <p className="text-[11px] text-zinc-500">listing: {o.listingStatus}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      {/* Buyer: wallet pendek, fallback ke label snapshot */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-[12px] text-zinc-300">{shortAddr(o.buyerWallet)}</span>
                        {!o.buyerWallet && o.user && (
                          <span className="ml-1 text-[11px] text-zinc-500">({o.user})</span>
                        )}
                      </td>
                      {/* Offer vs Ask */}
                      <td className="px-4 py-3 tabular-nums">
                        <span className="text-zinc-100">{formatIdr(o.amount)}</span>
                        {o.askPrice != null && (
                          <span className="ml-2 text-[11px] text-zinc-500">
                            / {formatIdr(o.askPrice)}
                            {delta && <span className={`ml-1 font-semibold ${delta.cls}`}>{delta.text}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[o.status] ?? "text-zinc-400 bg-zinc-400/10"}`}>
                          {o.status}
                        </span>
                      </td>
                      {/* Date: dibuat (dengan jam) + kapan di-resolve */}
                      <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">
                        <span>{new Date(o.createdAt).toLocaleString()}</span>
                        {resolved && (
                          <span className="block text-[11px] text-zinc-600">
                            resolved {new Date(o.updatedAt).toLocaleString()}
                          </span>
                        )}
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
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="offer" />
        </>
      ) : null}

      <ConfirmDialog
        open={!!confirmAcceptId}
        title="Terima offer ini?"
        message="Ini akan MENJUAL kartu ke pembeli, mint NFT ke wallet mereka, dan otomatis MENOLAK semua offer lain di listing yang sama. Aksi ini TIDAK bisa dibatalkan."
        confirmLabel="Terima"
        onConfirm={() => {
          const id = confirmAcceptId;
          setConfirmAcceptId(null);
          if (id) void doAct(id, "accept");
        }}
        onCancel={() => setConfirmAcceptId(null)}
      />
    </div>
  );
}
