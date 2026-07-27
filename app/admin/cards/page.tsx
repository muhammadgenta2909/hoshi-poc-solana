"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminCards } from "@/lib/admin-api";
import type { AdminCard, PaginatedResult } from "@/lib/admin-api";
import type { Tier } from "@/lib/packs";
import { TIER_COLOR } from "@/lib/packs";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";
import Thumb from "@/components/admin/Thumb";

const RARITIES = ["", "Common", "Rare", "Epic", "Legendary", "Legendary Rare"];

export default function AdminCardsPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PaginatedResult<AdminCard> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState("");
  const [rarityFilter, setRarityFilter] = useState("");
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminCards(token, {
        page, limit, search: search || undefined, set: setFilter || undefined, rarity: rarityFilter || undefined,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, setFilter, rarityFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Cards</h1>
          <p className="mt-1 text-sm text-zinc-500">Catalog of all cards on the marketplace.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Search cards…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-48 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40 focus:bg-white/[0.06]"
          />
          <input type="text" placeholder="Filter set…" value={setFilter}
            onChange={(e) => { setSetFilter(e.target.value); setPage(1); }}
            className="w-36 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40 focus:bg-white/[0.06]"
          />
          <Select value={rarityFilter} onChange={(v) => { setRarityFilter(v); setPage(1); }}
            options={[
              { label: "All Rarity", value: "" },
              ...RARITIES.filter(Boolean).map((r) => ({ label: r, value: r })),
            ]}
            className="w-36"
          />
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading cards…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No cards found.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3 w-14">Image</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Set</th>
                  <th className="px-4 py-3">Rarity</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((c, idx) => (
                  <tr key={c.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-[12px] tabular-nums text-zinc-500">{(result.page - 1) * limit + idx + 1}</td>
                    <td className="px-4 py-3"><Thumb src={c.imageUrl} alt="" /></td>
                    <td className="px-4 py-3 font-medium text-white">{c.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{c.set}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: `${TIER_COLOR[c.rarity as Tier] || "#888"}20`, color: TIER_COLOR[c.rarity as Tier] || "#888" }}
                      >
                        {c.rarity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="card" />
        </>
      ) : null}
    </div>
  );
}
