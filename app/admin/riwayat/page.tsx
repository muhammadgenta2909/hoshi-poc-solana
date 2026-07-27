"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminActivity } from "@/lib/admin-api";
import type { AdminActivityItem, PaginatedResult } from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";
import Thumb from "@/components/admin/Thumb";

// Peta ActivityType → label + warna badge.
const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  SALE_CARD: { label: "Sold", color: "text-blue-400 bg-blue-400/10" },
  LISTED_CARD: { label: "Listed", color: "text-green-400 bg-green-400/10" },
  LISTING_CANCELED: { label: "Listing canceled", color: "text-red-400 bg-red-400/10" },
  OFFER_MADE: { label: "Offer made", color: "text-amber-400 bg-amber-400/10" },
  OFFER_REJECTED: { label: "Offer rejected", color: "text-red-400 bg-red-400/10" },
  OFFER_CANCELED: { label: "Offer canceled", color: "text-zinc-400 bg-zinc-400/10" },
  SEND_TO_VAULT: { label: "To vault", color: "text-violet-400 bg-violet-400/10" },
  SEND_TO_HOME: { label: "To home", color: "text-sky-400 bg-sky-400/10" },
};

const typeLabel = (t: string) => TYPE_CONFIG[t]?.label ?? t;
const typeColor = (t: string) => TYPE_CONFIG[t]?.color ?? "text-zinc-400 bg-zinc-400/10";

const FILTER_OPTIONS = [
  { label: "All Activity", value: "" },
  { label: "Sold", value: "SALE_CARD" },
  { label: "Listed", value: "LISTED_CARD" },
  { label: "Listing canceled", value: "LISTING_CANCELED" },
  { label: "Offer made", value: "OFFER_MADE" },
  { label: "Offer rejected", value: "OFFER_REJECTED" },
  { label: "Offer canceled", value: "OFFER_CANCELED" },
];

export default function AdminRiwayatPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PaginatedResult<AdminActivityItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminActivity(token, {
        page, limit, action: actionFilter || undefined, search: search || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity");
    } finally {
      setLoading(false);
    }
  }, [token, page, actionFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">History</h1>
          <p className="mt-1 text-sm text-zinc-500">Real event log (sales, listings, offers) — newest first.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search by item name…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-56 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
          <Select value={actionFilter} onChange={(v) => { setActionFilter(v); setPage(1); }}
            options={FILTER_OPTIONS}
            className="w-44"
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading activity…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No activity recorded yet.</p>
      ) : result ? (
        <>
          <div className="space-y-2">
            {result.data.map((a, idx) => (
              <div key={a.id} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 transition hover:bg-white/[0.04]">
                <span className="mt-1 w-6 shrink-0 text-[11px] tabular-nums text-zinc-600">{(result.page - 1) * limit + idx + 1}</span>
                <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${typeColor(a.type)}`}>
                  {typeLabel(a.type)}
                </span>
                {a.itemImage ? <Thumb src={a.itemImage} alt="" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-zinc-200">
                    {a.listingId ? (
                      <Link href={`/marketplace/${a.listingId}`} className="font-medium text-white hover:text-yellow-200">{a.itemName}</Link>
                    ) : (
                      <span className="font-medium text-white">{a.itemName}</span>
                    )}
                    {a.amount != null && <>{" — "}{formatIdr(a.amount)} IDRX</>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    {a.fromLabel ?? "—"}
                    {a.toLabel ? <span className="text-zinc-600"> → </span> : null}
                    {a.toLabel ?? ""}
                    {a.set ? <span className="ml-2 text-zinc-600">· {a.set}</span> : null}
                  </p>
                </div>
                <time className="shrink-0 text-[12px] tabular-nums text-zinc-500">
                  {new Date(a.createdAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>

          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="event" />
        </>
      ) : null}
    </div>
  );
}
