"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminVaultItems,
  STORAGE_PROVIDERS,
  VAULT_STATUSES,
  type AdminVaultItem,
  type PaginatedResult,
} from "@/lib/admin-api";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";
import Thumb from "@/components/admin/Thumb";

const PROVIDER_STYLE: Record<string, string> = {
  HOSHI: "text-yellow-300 bg-yellow-400/10",
  COLLECTORCRYPT: "text-sky-300 bg-sky-400/10",
};

const STATUS_STYLE: Record<string, string> = {
  STORED: "text-green-400 bg-green-400/10",
  MINTING: "text-yellow-400 bg-yellow-400/10",
  MINTED: "text-sky-400 bg-sky-400/10",
  REDEEMED: "text-zinc-400 bg-zinc-400/10",
};

function shortAddr(a: string | null): string {
  if (!a) return "—";
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export default function AdminVaultPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PaginatedResult<AdminVaultItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await getAdminVaultItems(token, {
        page, limit: 20,
        search: search || undefined,
        status: status || undefined,
        provider: provider || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search, status, provider]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Vault / Inventory</h1>
          <p className="mt-1 text-sm text-zinc-500">Read-only — where each physical card is held.</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="text" placeholder="Cari kartu / serial / lokasi…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
        </div>
      </header>

      {/* Custody itu domain CollectorCrypt — Hoshi front-end, bukan custodian. */}
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] px-4 py-3 text-[13px] text-sky-200/90">
        <span className="mt-0.5">🔒</span>
        <p>
          Custody &amp; lokasi kartu fisik dikelola <b>CollectorCrypt</b> (vault mereka). Hoshi adalah
          front-end di atas API CC, jadi data ini bersifat <b>informasi (read-only)</b> — bukan dikelola
          atau dipindahkan dari sini.
        </p>
      </div>

      {/* Filter status + provider */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {[{ label: "All status", value: "" }, ...VAULT_STATUSES.map((s) => ({ label: s, value: s }))].map((t) => {
            const active = status === t.value;
            return (
              <button key={t.value || "all"} onClick={() => { setStatus(t.value); setPage(1); }}
                className={`rounded-xl px-3.5 py-1.5 text-[13px] font-medium transition ${
                  active ? "bg-yellow-400/10 text-yellow-200 shadow-[0_0_0_1px_rgba(250,204,21,0.3)]" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >{t.label}</button>
            );
          })}
        </div>
        <div className="ml-auto">
          <Select value={provider} onChange={(v) => { setProvider(v); setPage(1); }}
            options={[{ label: "All providers", value: "" }, ...STORAGE_PROVIDERS.map((p) => ({ label: p, value: p }))]}
            className="w-44"
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading vault…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">Belum ada item vault.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Card</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Owner</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((v, idx) => (
                  <tr key={v.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-[12px] tabular-nums text-zinc-500">{(result.page - 1) * 20 + idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={v.cardImage} alt="" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{v.cardName || "—"}</p>
                          {v.cardSet && <p className="text-[11px] text-zinc-500">{v.cardSet}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-400">{v.serialNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[v.status] ?? "text-zinc-400 bg-zinc-400/10"}`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PROVIDER_STYLE[v.storageProvider] ?? "text-zinc-300 bg-zinc-400/10"}`}>
                        {v.storageProvider}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">
                      <span className={v.vaultLocation ? "" : "text-zinc-600"}>{v.vaultLocation || "—"}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-400">{shortAddr(v.ownerWallet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="item" />
        </>
      ) : null}
    </div>
  );
}
