"use client";

// Admin "Transaksi" — ledger PaymentOrder (PACK / RESELLER / P2P) + ringkasan keuangan:
// rekonsiliasi kas (Treasury IDRX − kewajiban ke penjual = profit yang aman ditarik), pemasukan
// reseller vs P2P, dan saldo tiap penjual yang belum ditarik. Ini prasyarat withdraw yang aman:
// jangan pernah tarik treasury di bawah total kewajiban ke penjual.

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminFinance, getAdminTransactions } from "@/lib/admin-api";
import type { AdminFinance, AdminTransaction } from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";

const TYPE_UI: Record<AdminTransaction["type"], { label: string; cls: string }> = {
  PACK: { label: "Pack", cls: "border-purple-400/30 bg-purple-400/10 text-purple-300" },
  RESELLER: { label: "Reseller", cls: "border-[#F2C101]/30 bg-[#F2C101]/10 text-[#F2C101]" },
  P2P: { label: "P2P", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
};

// Vault ala model PM: CC vault (harga default, Hoshi 0%) vs Hoshi vault (5% / stok Hoshi).
const VAULT_UI: Record<"CC" | "HOSHI", { label: string; cls: string }> = {
  CC: { label: "CC vault", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  HOSHI: { label: "Hoshi vault", cls: "border-[#F2C101]/40 bg-[#F2C101]/[0.14] text-[#F2C101]" },
};

const STATUS_CLS: Record<string, string> = {
  FULFILLED: "text-emerald-400",
  PAID: "text-blue-400",
  FULFILLING: "text-amber-300",
  PENDING: "text-zinc-400",
  EXPIRED: "text-zinc-600",
  FAILED: "text-red-400",
  REFUND_DUE: "text-red-400",
};

const rp = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `Rp ${formatIdr(n)}`;

const dt = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminTransactionsPage() {
  const { token } = useAdminAuth();
  const [finance, setFinance] = useState<AdminFinance | null>(null);
  const [tx, setTx] = useState<{
    data: AdminTransaction[];
    total: number;
    page: number;
    limit: number;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  // Pencarian di sisi KLIEN (menyaring baris yang termuat). listTransactions belum mendukung search
  // server-side; saat backend bisa deploy lagi, tinggal pindahkan ke query server.
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTransaction | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLoading(true);
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    Promise.all([
      getAdminFinance(token).catch(() => null),
      getAdminTransactions(token, { page, limit }),
    ])
      .then(([f, t]) => {
        if (!alive) return;
        setFinance(f);
        setTx(t);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, page, limit]);

  if (loading && !tx)
    return <p className="py-12 text-center text-sm text-zinc-500">Loading transaksi…</p>;
  if (error)
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );

  const totalPages = tx ? Math.max(1, Math.ceil(tx.total / tx.limit)) : 1;
  // Filter KLIEN atas baris halaman ini (item/pembeli/penjual). Server tetap paginasi semua data.
  const q = searchInput.trim().toLowerCase();
  const filteredRows = tx
    ? tx.data.filter(
        (t) => !q || [t.item, t.buyer, t.seller].some((x) => (x ?? "").toLowerCase().includes(q)),
      )
    : [];

  return (
    <div className="space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Transaksi &amp; Kas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ledger pembayaran + rekonsiliasi kas. Reseller = jualan Hoshi (kartu CC); P2P = jual-beli
          antar user.
        </p>
      </header>

      {/* Uang Hoshi — persamaan kas: masuk − titipan = boleh dicairkan. (Sama seperti di Dashboard.) */}
      {finance && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="text-sm font-semibold text-zinc-200">Uang Hoshi — berapa yang boleh dicairkan?</h3>
          <p className="mb-4 mt-0.5 text-[12px] text-zinc-500">Kas Rupiah (IDRX).</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <p className="text-[12px] text-zinc-500">Uang masuk</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-white">
                {rp(finance.treasuryIdr)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600">semua bayaran user (pack, jual-beli, top-up)</p>
            </div>
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3">
              <p className="text-[12px] font-semibold text-amber-300/90">− Titipan penjual &amp; user</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-amber-300">
                {rp(finance.liabilitiesIdr + finance.pendingWithdrawalsIdr)}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-600">
                punya orang lain: saldo penjual {rp(finance.liabilitiesIdr)} ({finance.sellerCount})
                {finance.pendingWithdrawalsIdr > 0 &&
                  ` + penarikan pending ${rp(finance.pendingWithdrawalsIdr)} (${finance.pendingWithdrawalsCount})`}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3">
              <p className="text-[12px] font-semibold text-emerald-300/90">= Boleh dicairkan Hoshi</p>
              <p className="mt-1 text-xl font-bold tabular-nums text-emerald-300">
                {rp(finance.distributableProfitIdr)}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-600">kas bebas — aman ke bank</p>
            </div>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-zinc-500">
            ⚠️ Jangan cairkan lebih dari yang boleh dicairkan — sisanya jatah penjual. Ini{" "}
            <span className="font-semibold text-zinc-400">kas bebas, bukan laba</span> (modal beli kartu lewat kripto belum dipotong).
            {finance.treasuryIdr === null &&
              " (Uang masuk belum terbaca — angka boleh-dicairkan tak bisa dihitung.)"}
          </p>
        </div>
      )}

      {/* Dari mana Hoshi dapat uang: reseller CC · stok Hoshi sendiri · komisi P2P. */}
      {finance && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5">
            <span
              className="absolute inset-y-0 left-0 w-1 rounded-r"
              style={{ background: "#F2C101", opacity: 0.7 }}
            />
            <div className="flex items-start justify-between">
              <p className="text-[13px] font-medium text-zinc-400">Jual kartu CollectorCrypt (reseller)</p>
              <span className="text-[15px]">💛</span>
            </div>
            <p className="mt-2 text-[26px] font-bold tabular-nums text-white">
              {rp(finance.reseller.grossIdr)}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              Omzet {finance.reseller.count} penjualan · Hoshi beli di CC lalu jual di HARGA DEFAULT (Hoshi ambil 0% margin). Modal USDC belum dipotong → omzet kotor, bukan laba.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5">
            <span
              className="absolute inset-y-0 left-0 w-1 rounded-r"
              style={{ background: "#a78bfa", opacity: 0.7 }}
            />
            <div className="flex items-start justify-between">
              <p className="text-[13px] font-medium text-zinc-400">Jual stok Hoshi (vault Hoshi)</p>
              <span className="text-[15px]">🏷️</span>
            </div>
            <p className="mt-2 text-[26px] font-bold tabular-nums text-white">
              {rp(finance.hoshiInventory.grossIdr)}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              Omzet {finance.hoshiInventory.count} penjualan · kartu stok milik Hoshi sendiri → 100% masuk kas Hoshi (bukan reseller CC).
            </p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5">
            <span
              className="absolute inset-y-0 left-0 w-1 rounded-r"
              style={{ background: "#34d399", opacity: 0.7 }}
            />
            <div className="flex items-start justify-between">
              <p className="text-[13px] font-medium text-zinc-400">Jual-beli antar user</p>
              <span className="text-[15px]">💚</span>
            </div>
            <p className="mt-2 text-[26px] font-bold tabular-nums text-white">
              {rp(finance.p2p.grossIdr)}
            </p>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              omzet {finance.p2p.count} penjualan · dibagi jadi:
            </p>
            {/* Breakdown fee: Hoshi ambil komisi (feeBps) per transaksi, sisanya jadi saldo penjual. */}
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">
                  Komisi Hoshi ({(finance.marketplaceFeeBps / 100).toFixed(finance.marketplaceFeeBps % 100 ? 1 : 0)}%)
                </span>
                <span className="font-semibold tabular-nums text-emerald-300">
                  {rp(finance.p2pCommissionIdr)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Jadi titipan penjual</span>
                <span className="font-semibold tabular-nums text-zinc-300">
                  {rp(finance.p2pNetToSellersIdr)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saldo tiap penjual yang belum ditarik. */}
      {finance && finance.sellerBalances.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h3 className="mb-1 text-sm font-semibold text-zinc-300">
            Titipan penjual (belum ditarik)
          </h3>
          <p className="mb-4 text-[12px] text-zinc-500">
            Total ini = &quot;Titipan&quot; di atas. Cair saat penjual withdraw — selalu sisakan sebanyak ini.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[12px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-white/[0.06]">
                  <th className="py-2 pr-4 font-medium">Penjual</th>
                  <th className="py-2 pr-4 font-medium">Wallet</th>
                  <th className="py-2 pl-4 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {finance.sellerBalances.map((s) => (
                  <tr key={s.id} className="border-b border-white/[0.04]">
                    <td className="py-2.5 pr-4 text-zinc-200">{s.label}</td>
                    <td className="py-2.5 pr-4 font-mono text-[12px] text-zinc-500">
                      {s.wallet.slice(0, 6)}…{s.wallet.slice(-4)}
                    </td>
                    <td className="py-2.5 pl-4 text-right font-semibold tabular-nums text-[#F7D046]">
                      {rp(s.balanceIdr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ledger transaksi mentah. */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-zinc-300">Ledger transaksi</h3>
            {tx && <span className="text-[12px] text-zinc-500">{tx.total} total</span>}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari item / pembeli / penjual…"
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40 sm:w-64"
            />
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              aria-label="Baris per halaman"
              className="shrink-0 rounded-lg border border-white/10 bg-[#1b1810] px-2.5 py-1.5 text-[13px] text-zinc-200 outline-none focus:border-yellow-400/40"
            >
              {[10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n}/hal
                </option>
              ))}
            </select>
          </div>
        </div>
        {tx && filteredRows.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[12px] uppercase tracking-wide text-zinc-500">
                  <tr className="border-b border-white/[0.06]">
                    <th className="py-2 pr-3 font-medium">Jenis</th>
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 pr-3 font-medium">Pembeli</th>
                    <th className="py-2 pr-3 font-medium">Penjual</th>
                    <th className="py-2 pr-3 text-right font-medium">Nominal</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pl-3 font-medium">Waktu</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((t) => {
                    const ui = TYPE_UI[t.type];
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setDetail(t)}
                        className="cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.03]"
                      >
                        <td className="py-2.5 pr-3">
                          <div className="flex flex-col items-start gap-1">
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ui.cls}`}
                            >
                              {ui.label}
                            </span>
                            {t.vault && (
                              <span
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${VAULT_UI[t.vault].cls}`}
                              >
                                {VAULT_UI[t.vault].label}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[220px] truncate py-2.5 pr-3 text-zinc-200">
                          {t.item ?? "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-400">{t.buyer}</td>
                        <td className="py-2.5 pr-3 text-zinc-400">{t.seller ?? "—"}</td>
                        <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-zinc-100">
                          {rp(t.priceIdr)}
                        </td>
                        <td
                          className={`py-2.5 pr-3 text-[12px] font-semibold ${
                            STATUS_CLS[t.status] ?? "text-zinc-400"
                          }`}
                        >
                          {t.status}
                        </td>
                        <td className="py-2.5 pl-3 text-[12px] text-zinc-500">{dt(t.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <span className="text-[12px] text-zinc-500">
                  Halaman {tx.page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">
            {q ? "Tak ada yang cocok di halaman ini (coba halaman lain / kosongkan pencarian)." : "Belum ada transaksi."}
          </p>
        )}
      </div>

      {/* Detail transaksi — klik baris ledger untuk buka. Data lengkap satu transaksi. */}
      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-[#171717] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Detail Transaksi</h3>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500">{detail.merchantOrderId}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-zinc-500 hover:text-zinc-300">&times;</button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TYPE_UI[detail.type].cls}`}>
                {TYPE_UI[detail.type].label}
              </span>
              {detail.vault && (
                <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${VAULT_UI[detail.vault].cls}`}>
                  {VAULT_UI[detail.vault].label}
                </span>
              )}
              <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                {detail.status}
              </span>
            </div>

            <dl className="space-y-2.5 text-[13px]">
              {[
                ["Item", detail.item ?? "—"],
                ["Nominal", rp(detail.priceIdr)],
                ["Pembeli", detail.buyer],
                ["Penjual", detail.seller ?? "—"],
                ["Kirim oleh", detail.vault === "CC" ? "CollectorCrypt (gudang US)" : detail.vault === "HOSHI" ? "Hoshi" : "—"],
                ["Dibuat", dt(detail.createdAt)],
                ["Dibayar", dt(detail.paidAt)],
                ["Selesai", dt(detail.fulfilledAt)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 border-b border-white/[0.05] pb-2.5">
                  <dt className="shrink-0 text-zinc-500">{k}</dt>
                  <dd className="text-right font-medium text-zinc-100">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
