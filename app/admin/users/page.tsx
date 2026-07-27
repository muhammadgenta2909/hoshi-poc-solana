"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminUsers, type AdminUser, type PaginatedResult } from "@/lib/admin-api";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";

function shortAddr(a: string): string {
  if (a.length <= 14) return a;
  return `${a.slice(0, 5)}…${a.slice(-4)}`;
}

export default function AdminUsersPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PaginatedResult<AdminUser> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await getAdminUsers(token, {
        page, limit,
        search: search || undefined,
        role: role || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search, role]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">Everyone who has signed in with a wallet — same count as the dashboard.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={role} onChange={(v) => { setRole(v); setPage(1); }}
            options={[
              { label: "All roles", value: "" },
              { label: "User", value: "USER" },
              { label: "Admin", value: "ADMIN" },
            ]}
            className="w-32"
          />
          <input type="text" placeholder="Cari wallet / nama / email…" value={search}
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
        <p className="py-12 text-center text-sm text-zinc-500">Loading users…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No users found.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Wallet</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-center">Listings</th>
                  <th className="px-4 py-3 text-center">Bought</th>
                  <th className="px-4 py-3 text-center">Offers</th>
                  <th className="px-4 py-3 text-center">Packs</th>
                  <th className="px-4 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((u, idx) => (
                  <tr key={u.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-[12px] tabular-nums text-zinc-500">{(result.page - 1) * limit + idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{u.displayName || <span className="text-zinc-500">—</span>}</p>
                      {u.email && <p className="text-[12px] text-zinc-500">{u.email}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-400">{shortAddr(u.walletAddress)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        u.role === "ADMIN" ? "bg-yellow-400/15 text-yellow-300" : "bg-zinc-400/10 text-zinc-400"
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-zinc-300">{u.listings}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-zinc-300">{u.bought}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-zinc-300">{u.offers}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-zinc-300">{u.packs}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="user" />
        </>
      ) : null}
    </div>
  );
}
