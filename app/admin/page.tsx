"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminStats, getAdminDailyStats } from "@/lib/admin-api";
import type { AdminStats, AdminDailyStats } from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend,
} from "recharts";

type StatCard = {
  label: string;
  value: string;
  sub?: string;
};

const PIE_COLORS = ["#22c55e", "#3b82f6", "#ef4444"];

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setLoading(true); setError(null);
    const load = async () => {
      try {
          const [s, d] = await Promise.all([
            getAdminStats(token),
            getAdminDailyStats(token, 365),
          ]);
        if (alive) { setStats(s); setDaily(d); }
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
    { label: "Total Listings", value: String(s.totalListings), sub: `${s.activeListings} active` },
    { label: "Active Listings", value: String(s.activeListings), sub: `${s.totalListings > 0 ? ((s.activeListings / s.totalListings) * 100).toFixed(0) : 0}% of total` },
    { label: "Sold", value: String(s.soldListings), sub: `${s.totalListings > 0 ? ((s.soldListings / s.totalListings) * 100).toFixed(1) : 0}% conversion` },
    { label: "Users", value: String(s.totalUsers) },
    { label: "Cards", value: String(s.totalCards) },
    { label: "Revenue", value: `IDRX ${formatIdr(s.totalRevenue)}` },
  ];

  return (
    <div className="space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Marketplace overview &amp; key metrics.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
            <p className="text-[13px] font-medium text-zinc-500">{c.label}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">{c.value}</p>
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
