"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminStats, getAdminDailyStats, getAdminTreasury } from "@/lib/admin-api";
import type { AdminStats, AdminDailyStats, AdminTreasury } from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend,
} from "recharts";

type StatCard = {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  accent: string;
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#ef4444"];

const TREASURY_STATUS_UI: Record<
  AdminTreasury["status"],
  { dot: string; label: string }
> = {
  healthy: { dot: "#22c55e", label: "Sehat" },
  low: { dot: "#f59e0b", label: "Menipis — siapkan isi ulang" },
  critical: { dot: "#ef4444", label: "Kritis — jualan bisa ke-pause" },
  unknown: { dot: "#71717a", label: "Tidak terbaca" },
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#222] px-3 py-2 shadow-xl">
      <p className="text-[12px] text-zinc-400">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-sm font-medium text-white">
          {p.name ?? "Value"}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { token } = useAdminAuth();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [daily, setDaily] = useState<AdminDailyStats | null>(null);
  const [treasury, setTreasury] = useState<AdminTreasury | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true); setError(null);
    const load = async () => {
      try {
          const [s, d, t] = await Promise.all([
            getAdminStats(token),
            getAdminDailyStats(token, 365),
            // Treasury read hits an RPC and may be slow/absent — never let it blank the dashboard.
            getAdminTreasury(token).catch(() => null),
          ]);
        if (alive) { setStats(s); setDaily(d); setTreasury(t); }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally { if (alive) setLoading(false); }
    };
    load();
    return () => { alive = false; };
  }, [token]);

  if (loading) return <p className="py-12 text-center text-sm text-zinc-500">Loading stats…</p>;
  if (error) return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
      <p className="text-sm text-red-400">{error}</p>
    </div>
  );

  const s = stats!;

  const cards: StatCard[] = [
    { label: "Total Listings", value: s.totalListings.toLocaleString("id-ID"), sub: `${s.activeListings} active`, icon: "📋", accent: "#facc15" },
    { label: "Active Listings", value: s.activeListings.toLocaleString("id-ID"), sub: `${s.totalListings > 0 ? ((s.activeListings / s.totalListings) * 100).toFixed(0) : 0}% of total`, icon: "🟢", accent: "#22c55e" },
    { label: "Sold", value: s.soldListings.toLocaleString("id-ID"), sub: `${s.totalListings > 0 ? ((s.soldListings / s.totalListings) * 100).toFixed(1) : 0}% conversion`, icon: "✅", accent: "#3b82f6" },
    { label: "Users", value: s.totalUsers.toLocaleString("id-ID"), icon: "👤", accent: "#a78bfa" },
    { label: "Cards", value: s.totalCards.toLocaleString("id-ID"), icon: "🃏", accent: "#38E5D0" },
    { label: "Revenue", value: `IDRX ${formatIdr(s.totalRevenue)}`, icon: "💰", accent: "#f59e0b" },
  ];

  return (
    <div className="space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Marketplace overview &amp; key metrics.</p>
      </header>

      {treasury && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300">Treasury (on-chain)</h3>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-[12px] font-medium text-zinc-300">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: TREASURY_STATUS_UI[treasury.status].dot }}
              />
              {TREASURY_STATUS_UI[treasury.status].label}
            </span>
          </div>

          {treasury.configured ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-[12px] text-zinc-500">USDC (modal beli pack)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">
                    ${(treasury.usdc ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-[12px] text-zinc-500">SOL (gas)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">
                    {(treasury.sol ?? 0).toFixed(3)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <p className="text-[12px] text-zinc-500">IDRX (bayaran user masuk)</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">
                    {treasury.idrx === null ? "—" : `Rp ${formatIdr(treasury.idrx)}`}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-1 text-[13px]">
                {treasury.status === "critical" && (
                  <p className="text-red-400">
                    ⚠️ USDC di bawah 1 pack ($25) atau SOL &lt; 0.01 — isi ulang sebelum jualan ke-pause. (Order otomatis ditolak; dana user tetap aman.)
                  </p>
                )}
                {treasury.status === "low" && (
                  <p className="text-amber-300">
                    USDC menipis (&lt; $75 ≈ 3 pack) — siapkan isi ulang USDC.
                  </p>
                )}
                {treasury.idrx !== null && treasury.idrx > 0 && (
                  <p className="text-zinc-400">
                    💵 Rp {formatIdr(treasury.idrx)} IDRX terkumpul dari bayaran user — cairkan ke bank saat sempat.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-500">
              Saldo treasury tidak terbaca. Cek <code className="text-zinc-400">SOLANA_RPC_URL</code> dan <code className="text-zinc-400">HOSHI_TREASURY_ADDRESS</code> di environment backend.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5"
          >
            <span
              className="absolute inset-y-0 left-0 w-1 rounded-r"
              style={{ background: c.accent, opacity: 0.7 }}
            />
            <div className="flex items-start justify-between">
              <p className="text-[13px] font-medium text-zinc-400">{c.label}</p>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[15px]"
                style={{ background: `${c.accent}1a` }}
              >
                {c.icon}
              </span>
            </div>
            <p className="mt-2 text-[26px] font-bold leading-tight tracking-tight text-white tabular-nums">{c.value}</p>
            {c.sub && <p className="mt-0.5 text-[12px] text-zinc-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      {daily && <>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Listings Created Over Time</h3>
            {daily.dailyListings.some(d => d.count > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily.dailyListings}>
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="count" stroke="#facc15" strokeWidth={2} dot={false} name="Listings" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500">No listing data yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Revenue Over Time</h3>
            {daily.dailyRevenue.some(d => d.amount > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily.dailyRevenue}>
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="amount" stroke="#22c55e" strokeWidth={2} dot={false} name="Revenue (IDRX)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500">No revenue yet.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Status Distribution</h3>
            {daily.statusDistribution.some(d => d.count > 0) ? (
              <div className="flex items-center gap-6">
                <div className="w-48">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={daily.statusDistribution} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                        {daily.statusDistribution.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i] ?? "#888"} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {daily.statusDistribution.map((d, i) => (
                    <div key={d.status} className="flex items-center gap-2 text-sm">
                      <span className="h-3 w-3 rounded-full" style={{ background: PIE_COLORS[i] ?? "#888" }} />
                      <span className="text-zinc-400">{d.status}</span>
                      <span className="font-medium text-white">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500">No listings yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <h3 className="mb-4 text-sm font-semibold text-zinc-300">Top Viewed Listings</h3>
            {daily.topListings.length > 0 ? (
              <div className="space-y-3">
                {daily.topListings.map((l, i) => (
                  <div key={l.id} className="flex items-center justify-between border-b border-white/5 pb-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">#{i + 1}</span>
                      <span className="text-zinc-200">{l.name}</span>
                    </div>
                    <div className="tabular-nums text-zinc-400">
                      {l.views} <span className="text-zinc-600">views</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-zinc-500">No data yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-300">Conversion Rate</h3>
          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-yellow-400">{daily.conversionRate}%</span>
            <span className="text-sm text-zinc-500">listings sold</span>
          </div>
        </div>
      </>}
    </div>
  );
}
