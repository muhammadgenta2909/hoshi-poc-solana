"use client";

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminStats, getAdminDailyStats, getAdminTreasury, getAdminFinance } from "@/lib/admin-api";
import type { AdminStats, AdminDailyStats, AdminTreasury, AdminFinance } from "@/lib/admin-api";
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

function CryptoChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-zinc-500">
      {label}
      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
        Simulasi
      </span>
    </span>
  );
}

const STATUS_SHORT: Record<AdminTreasury["status"], string> = {
  healthy: "Sehat",
  low: "Menipis",
  critical: "Kritis",
  unknown: "—",
};

/** Lampu status SOL (gas): ambang kecil karena transfer mpl-core murah. */
function solStatus(sol: number | null): AdminTreasury["status"] {
  if (sol === null) return "unknown";
  if (sol < 0.005) return "critical";
  if (sol < 0.02) return "low";
  return "healthy";
}

function StatusPill({ status }: { status: AdminTreasury["status"] }) {
  const ui = TREASURY_STATUS_UI[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-300">
      <span className="h-2 w-2 rounded-full" style={{ background: ui.dot }} />
      {STATUS_SHORT[status]}
    </span>
  );
}

/** Kartu wallet operasional (Treasury / Escrow) — stat tile per aset, pill status. */
function WalletCard({
  title,
  subtitle,
  status,
  rows,
  note,
}: {
  title: string;
  subtitle: string;
  status: AdminTreasury["status"];
  rows: { icon: string; label: string; value: string; hint: string }[];
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-zinc-100">{title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{subtitle}</p>
        </div>
        <StatusPill status={status} />
      </div>
      <div className={`grid gap-2 ${rows.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg bg-white/[0.025] px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span aria-hidden>{r.icon}</span> {r.label}
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">{r.value}</p>
            <p className="mt-0.5 text-[10px] leading-tight text-zinc-600">{r.hint}</p>
          </div>
        ))}
      </div>
      {note && <p className="mt-2.5 text-[11px] text-amber-400/80">{note}</p>}
    </div>
  );
}

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
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setLoading(true); setError(null);
    const load = async () => {
      try {
          const [s, d, t, f] = await Promise.all([
            getAdminStats(token),
            getAdminDailyStats(token, 365),
            // Treasury read hits an RPC and may be slow/absent — never let it blank the dashboard.
            getAdminTreasury(token).catch(() => null),
            // Finance (kewajiban + boleh dicairkan) untuk persamaan "Uang Hoshi".
            getAdminFinance(token).catch(() => null),
          ]);
        if (alive) { setStats(s); setDaily(d); setTreasury(t); setFinance(f); }
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
    { label: "Omzet jual kartu", value: `Rp ${formatIdr(s.totalRevenue)}`, sub: "kartu terjual (reseller + P2P) — dirinci di Transaksi & Kas", icon: "💰", accent: "#f59e0b" },
    { label: "Kartu terjual", value: s.soldListings.toLocaleString("id-ID"), sub: `${s.totalListings > 0 ? ((s.soldListings / s.totalListings) * 100).toFixed(1) : 0}% dari yang dipajang laku`, icon: "✅", accent: "#3b82f6" },
    { label: "Total listing", value: s.totalListings.toLocaleString("id-ID"), sub: `${s.activeListings.toLocaleString("id-ID")} aktif · ${s.soldListings.toLocaleString("id-ID")} terjual · ${s.cancelledListings.toLocaleString("id-ID")} ditarik${s.pendingEscrowListings > 0 ? ` · ${s.pendingEscrowListings.toLocaleString("id-ID")} nunggu escrow` : ""}`, icon: "📋", accent: "#facc15" },
    { label: "Pengguna", value: s.totalUsers.toLocaleString("id-ID"), sub: "total akun terdaftar", icon: "👤", accent: "#a78bfa" },
    { label: "Aktif dijual", value: s.activeListings.toLocaleString("id-ID"), sub: `${s.totalListings > 0 ? ((s.activeListings / s.totalListings) * 100).toFixed(0) : 0}% dari total listing`, icon: "🟢", accent: "#22c55e" },
    { label: "Jenis kartu", value: s.totalCards.toLocaleString("id-ID"), sub: "jumlah desain — 1 desain bisa banyak listing", icon: "🃏", accent: "#38E5D0" },
  ];

  return (
    <div className="space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Marketplace overview &amp; key metrics.</p>
      </header>

      {/* BLOK 1 — UANG HOSHI: satu persamaan uang (masuk − titipan = boleh dicairkan). Bintang utama. */}
      {finance && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold text-zinc-200">Uang Hoshi — berapa yang boleh dicairkan?</h3>
          <p className="mb-4 mt-0.5 text-[12px] text-zinc-500">
            Kas Rupiah (IDRX). Angka kripto operasional ada di strip bawah.
          </p>
          {finance.treasuryIdr === null ? (
            <p className="text-sm text-zinc-500">
              Uang masuk (IDRX treasury) belum terbaca. Di produksi: cek RPC / alamat treasury.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                  <p className="text-[12px] text-zinc-500">Uang masuk</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                    Rp {formatIdr(finance.treasuryIdr)}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    Semua rupiah dari user: buka pack, jual-beli, top-up.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3.5">
                  <p className="text-[12px] font-semibold text-amber-300">− Titipan penjual &amp; user</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-amber-200">
                    Rp {formatIdr(finance.liabilitiesIdr + finance.pendingWithdrawalsIdr)}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-amber-200/70">
                    Punya orang lain — wajib disisakan. Bukan uang Hoshi.
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3.5">
                  <p className="text-[12px] font-semibold text-emerald-300">= Boleh dicairkan Hoshi</p>
                  <p className="mt-1 text-2xl font-extrabold tabular-nums text-emerald-300">
                    {finance.distributableProfitIdr === null ? "—" : `Rp ${formatIdr(finance.distributableProfitIdr)}`}
                  </p>
                  <p className="mt-1 text-[11px] leading-snug text-emerald-200/70">
                    Kas bebas Hoshi — aman ditarik ke bank.
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
                ⚠️ Jangan cairkan lebih dari{" "}
                <span className="font-semibold text-emerald-300">
                  {finance.distributableProfitIdr === null ? "—" : `Rp ${formatIdr(finance.distributableProfitIdr)}`}
                </span>{" "}
                — sisanya jatah penjual. Ini <span className="font-semibold">kas bebas, bukan laba bersih</span>{" "}
                (modal beli kartu lewat kripto belum dipotong).
              </p>
            </>
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
            {c.sub && <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* BLOK 3 — Kripto Operasional: monitoring Treasury (USDC modal + SOL gas) & Escrow (SOL gas). */}
      {treasury && (
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Kripto Operasional</h3>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              Buat beli kartu CC &amp; bayar gas jaringan —{" "}
              <span className="text-zinc-400">pengeluaran, bukan pemasukan</span>. Pantau &amp; isi ulang sebelum habis.
            </p>
          </div>

          {treasury.simulated ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <CryptoChip label="Modal beli kartu — USDC" />
              <CryptoChip label="Gas jaringan — SOL" />
              <span className="text-zinc-600">Angka kripto disimulasi di staging — bukan saldo asli, abaikan.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <WalletCard
                title="Treasury"
                subtitle="Mesin belanja — beli kartu/pack di CollectorCrypt"
                status={treasury.configured ? treasury.status : "unknown"}
                rows={[
                  {
                    icon: "💵",
                    label: "Modal (USDC)",
                    value: treasury.configured ? `$${(treasury.usdc ?? 0).toFixed(2)}` : "—",
                    hint: "nalangin beli kartu/pack",
                  },
                  {
                    icon: "⛽",
                    label: "Gas (SOL)",
                    value: treasury.configured ? (treasury.sol ?? 0).toFixed(3) : "—",
                    hint: "tiap transaksi + mint",
                  },
                ]}
                note={
                  treasury.configured
                    ? undefined
                    : "Saldo belum terbaca (cek SOLANA_RPC_URL / HOSHI_TREASURY_ADDRESS)."
                }
              />
              <WalletCard
                title="Escrow (P2P)"
                subtitle="Nyimpen kartu penjual selama dijual antar user"
                status={treasury.escrowConfigured ? solStatus(treasury.escrowSol) : "unknown"}
                rows={[
                  {
                    icon: "⛽",
                    label: "Gas (SOL)",
                    value:
                      treasury.escrowConfigured && treasury.escrowSol !== null
                        ? treasury.escrowSol.toFixed(3)
                        : "—",
                    hint: "transfer kartu ke pembeli (murah)",
                  },
                ]}
                note={
                  treasury.escrowConfigured
                    ? "Cuma butuh SOL (gas) — nggak nyimpen USDC."
                    : "Alamat escrow belum di-set (ESCROW_ADDRESS)."
                }
              />
            </div>
          )}
        </div>
      )}

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
