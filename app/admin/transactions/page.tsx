"use client";

// Admin "Transaksi" — ledger PaymentOrder (PACK / RESELLER / CONSIGNMENT / P2P) + ringkasan
// keuangan: rekonsiliasi kas (Treasury IDRX − kewajiban ke penjual = profit yang aman ditarik),
// pemasukan reseller vs P2P, dan saldo tiap penjual yang belum ditarik. Ini prasyarat withdraw
// yang aman: jangan pernah tarik treasury di bawah total kewajiban ke penjual.
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
// ║ + ANTREAN UTANG REFUND, di paling atas halaman ini. KENAPA DI SINI, BUKAN DI LAYAR BARU.    ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
// Utang refund SUDAH hidup sebagai baris PaymentOrder berstatus REFUND_DUE, dan endpoint yang
// menampilkannya SUDAH ada + SUDAH bisa disaring per status (`/admin/transactions?status=…`).
// Yang hilang cuma dua hal: kolom `refundSafe`/`error` tidak pernah dikirim, dan tidak ada satu
// pun tempat yang MENANYAKAN penyaring itu. Jadi perubahan terkecil yang menutupnya adalah satu
// query kedua dari endpoint yang sama, dirender sebagai bagian tersendiri di halaman yang memang
// sudah jadi tempat operator melihat uang — bukan rute baru, bukan tabel baru, bukan tab yang
// menyembunyikan antreannya di belakang satu klik.
//
// ⚠️ LAYAR INI TIDAK MEMINDAHKAN UANG, DAN TIDAK BOLEH. Tidak ada rail refund otomatis di repo
// ini; refund dikerjakan manusia di luar sistem (IDRX/transfer manual). Karena itu di bagian
// antrean TIDAK ADA satu tombol aksi pun — ia MENAMPILKAN dan MENJELASKAN. Satu tombol "Refund"
// yang bentuknya sama untuk baris aman dan baris tahan adalah persis cara membayar dua kali.

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminFinance, getAdminTransactions } from "@/lib/admin-api";
import type { AdminFinance, AdminTransaction } from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";

const TYPE_UI: Record<AdminTransaction["type"], { label: string; cls: string }> = {
  PACK: { label: "Pack", cls: "border-purple-400/30 bg-purple-400/10 text-purple-300" },
  RESELLER: { label: "Reseller", cls: "border-[#F2C101]/30 bg-[#F2C101]/10 text-[#F2C101]" },
  // Labelnya sengaja menyebut KEPEMILIKANNYA, bukan cuma nama fiturnya: begitu sebuah baris
  // titipan gagal, pertanyaan pertama operator adalah "uang siapa ini?" — dan jawabannya bukan
  // Hoshi, juga bukan pembeli saja.
  CONSIGNMENT: {
    label: "Titipan — milik orang lain",
    cls: "border-sky-400/40 bg-sky-400/[0.12] text-sky-300",
  },
  P2P: { label: "P2P", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
};

/** Berapa baris antrean yang ditarik sekali jalan. 100 = plafon `limit` backend. */
const REFUND_QUEUE_LIMIT = 100;

/**
 * GERBANG UANG sebuah baris utang, diturunkan HANYA dari kolom `refundSafe`.
 *
 * `undefined` (backend lama belum mengirim kolomnya) sengaja TIDAK dianggap "aman". Kolom yang
 * hilang berarti gerbangnya tidak terbaca, dan satu-satunya jawaban yang benar untuk "tidak
 * terbaca" di layar uang adalah TAHAN.
 */
type RefundGate = "SAFE" | "HOLD" | "UNKNOWN";

const refundGateOf = (t: AdminTransaction): RefundGate =>
  t.refundSafe === true ? "SAFE" : t.refundSafe === false ? "HOLD" : "UNKNOWN";

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
  // ANTREAN UTANG REFUND — query TERPISAH dari ledger, dan itu disengaja: antreannya harus memuat
  // SEMUA baris REFUND_DUE, bukan cuma yang kebetulan jatuh di halaman ledger yang sedang dibuka.
  // Efeknya bergantung pada `token` saja supaya ia tidak ikut ter-fetch ulang tiap ganti halaman.
  const [debts, setDebts] = useState<{ rows: AdminTransaction[]; total: number } | null>(null);
  const [debtsError, setDebtsError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    getAdminTransactions(token, { status: "REFUND_DUE", limit: REFUND_QUEUE_LIMIT })
      .then((r) => {
        if (!alive) return;
        setDebts({ rows: r.data, total: r.total });
        setDebtsError(null);
      })
      .catch((err) => {
        // Antrean yang gagal dimuat TIDAK BOLEH terlihat seperti antrean kosong — "tidak ada
        // utang" dan "tidak berhasil bertanya" adalah dua kalimat yang sangat berbeda di layar uang.
        if (alive) setDebtsError(err instanceof Error ? err.message : "Gagal memuat antrean");
      });
    return () => {
      alive = false;
    };
  }, [token]);

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

  // Antrean dipecah DUA, dan pemisahnya HANYA `refundSafe` — bukan status, bukan jenis, bukan
  // nominal. Satu daftar campur (apalagi dengan satu tombol "Refund" yang sama untuk semuanya)
  // adalah persis bentuk yang membuat orang membayar utang yang belum boleh dibayar.
  const debtHold = debts ? debts.rows.filter((t) => refundGateOf(t) !== "SAFE") : [];
  const debtSafe = debts ? debts.rows.filter((t) => refundGateOf(t) === "SAFE") : [];
  const sumIdr = (rows: AdminTransaction[]) => rows.reduce((a, t) => a + t.priceIdr, 0);

  return (
    <div className="space-y-8">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Transaksi &amp; Kas</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ledger pembayaran + rekonsiliasi kas. Reseller = jualan Hoshi (kartu CC); P2P = jual-beli
          antar user; Titipan = kartu milik orang lain yang fisiknya di rak Hoshi.
        </p>
      </header>

      {/* ══ ANTREAN UTANG REFUND ══════════════════════════════════════════════════════════════
          Menjawab SATU pertanyaan operator: siapa yang uangnya kami pegang tanpa mereka menerima
          apa pun, berapa, kenapa, dan mana yang boleh ditransfer SEKARANG.

          Diletakkan di paling atas, di atas rekonsiliasi kas: angka "boleh dicairkan" di bawah
          BELUM memotong utang-utang ini, jadi membacanya lebih dulu tanpa melihat daftar ini
          membuat kas Hoshi tampak lebih besar daripada yang sebenarnya. */}
      <RefundQueue
        error={debtsError}
        loaded={debts !== null}
        total={debts?.total ?? 0}
        hold={debtHold}
        safe={debtSafe}
        sumIdr={sumIdr}
        onOpen={setDetail}
      />

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

      {/* Dari mana Hoshi dapat uang. EMPAT ember, dan keempatnya harus ada di layar:
          reseller CC · stok Hoshi sendiri · komisi P2P · komisi TITIPAN.

          Kalau ember titipan dihapus dari sini, angkanya tidak pindah ke mana-mana — backend
          sudah mengeluarkan penjualan titipan dari ember P2P supaya tidak terhitung dua kali.
          Yang terjadi: komisi 5% dari kartu titipan terbaca NOL di satu-satunya layar yang
          menampilkan uang masuk. */}
      {finance && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                {/* Disebut "saldo penjual", BUKAN "titipan": di layar ini "titipan" sekarang berarti
                    kartu titipan (konsinyasi) di tile sebelah, dan dua arti untuk satu kata di satu
                    layar uang adalah cara paling murah untuk salah mencairkan. */}
                <span className="text-zinc-500">Jadi saldo penjual</span>
                <span className="font-semibold tabular-nums text-zinc-300">
                  {rp(finance.p2pNetToSellersIdr)}
                </span>
              </div>
            </div>
          </div>
          {/* ── TITIPAN (konsinyasi) ──────────────────────────────────────────────────────────
              Bentuknya sengaja mirip tile P2P — omzet di atas, pecahan komisi/pemilik di bawah —
              karena dari sisi uang keduanya memang sama: Hoshi hanya mengambil komisi, sisanya
              milik orang lain. Bedanya cuma kartunya ada di rak Hoshi.

              Angka besar yang ditampilkan adalah KOMISI, bukan omzet. Di tiga tile lain angka
              besarnya omzet, jadi ini memang tidak konsisten — dan disengaja: omzet titipan
              sebagian besar bukan uang Hoshi, dan tile yang memamerkannya sebagai angka utama
              akan dibaca sebagai pemasukan. Omzetnya tetap ada, di baris bawah. */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-5">
            <span
              className="absolute inset-y-0 left-0 w-1 rounded-r"
              style={{ background: "#38bdf8", opacity: 0.7 }}
            />
            <div className="flex items-start justify-between">
              <p className="text-[13px] font-medium text-zinc-400">Jual kartu titipan (konsinyasi)</p>
              <span className="text-[15px]">📦</span>
            </div>
            <p className="mt-2 text-[26px] font-bold tabular-nums text-white">
              {rp(finance.consignment.commissionIdr)}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">
              komisi Hoshi dari {finance.consignment.count} penjualan · kartu milik orang lain yang
              dititipkan ke rak Hoshi
            </p>
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3 text-[12px]">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Omzet (dibayar pembeli)</span>
                <span className="font-semibold tabular-nums text-zinc-300">
                  {rp(finance.consignment.grossIdr)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Jadi saldo pemilik kartu</span>
                <span className="font-semibold tabular-nums text-zinc-300">
                  {rp(finance.consignment.payoutIdr)}
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
            Saldo penjual (belum ditarik)
          </h3>
          {/* Dulu tertulis 'Total ini = "Titipan" di atas'. Sejak kartu titipan punya embernya
              sendiri, kalimat itu salah: saldo di bawah ini adalah GABUNGAN jatah penjual P2P dan
              jatah pemilik kartu titipan. Menyamakannya dengan satu tile saja membuat sisa yang
              wajib disimpan terbaca lebih kecil daripada yang sebenarnya. */}
          <p className="mb-4 text-[12px] text-zinc-500">
            Gabungan jatah penjual P2P + jatah pemilik kartu titipan. Cair saat mereka withdraw —
            selalu sisakan sebanyak ini.
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
                          {/* Baris REFUND_DUE dulu cuma DIWARNAI merah di sini — dan merah sama
                              untuk "boleh dikembalikan" dan "jangan disentuh". Gerbangnya ikut
                              dicetak sebagai KATA, di ledger maupun di antrean. */}
                          {t.status === "REFUND_DUE" && (
                            <span
                              className={`ml-1.5 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                refundGateOf(t) === "SAFE"
                                  ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                                  : "border-red-400/50 bg-red-500/20 text-red-200"
                              }`}
                            >
                              {refundGateOf(t) === "SAFE" ? "aman" : "tahan"}
                            </span>
                          )}
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
              {/* Badge status ini DULU selalu hijau, termasuk untuk REFUND_DUE — status "kami
                  berutang" dicetak dengan warna yang sama dengan "beres". */}
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                  detail.status === "REFUND_DUE"
                    ? "border-red-400/40 bg-red-500/15 text-red-300"
                    : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                }`}
              >
                {detail.status}
              </span>
            </div>

            {/* GERBANG UANG + ALASANNYA, di ATAS daftar field — bukan sebagai satu baris kecil di
                tengah tabel. Ditampilkan untuk SETIAP baris yang gerbangnya tidak hijau, bukan
                hanya yang berstatus REFUND_DUE: `refundSafe=false` pada status apa pun berarti
                hal yang sama, yaitu jangan kirim uang sebelum diverifikasi. */}
            {(detail.status === "REFUND_DUE" || refundGateOf(detail) !== "SAFE") && (
              <div
                className={`mb-4 rounded-xl border px-4 py-3 ${
                  refundGateOf(detail) === "SAFE"
                    ? "border-emerald-400/35 bg-emerald-400/[0.08]"
                    : "border-red-500/40 bg-red-500/[0.12]"
                }`}
              >
                <p
                  className={`text-[12px] font-bold uppercase tracking-wide ${
                    refundGateOf(detail) === "SAFE" ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {refundGateOf(detail) === "SAFE"
                    ? "Aman dikembalikan (refundSafe = true)"
                    : refundGateOf(detail) === "HOLD"
                      ? "⚠️ Tahan — JANGAN transfer (refundSafe = false)"
                      : "⚠️ Tahan — gerbang refundSafe tidak terbaca"}
                </p>
                {detail.error?.trim() && (
                  <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
                    {detail.error}
                  </p>
                )}
                <p
                  className={`mt-2 text-[12px] font-medium leading-relaxed ${
                    refundGateOf(detail) === "SAFE" ? "text-emerald-300/90" : "text-red-300"
                  }`}
                >
                  {refundGateOf(detail) === "SAFE"
                    ? "Kembalikan ke pembeli secara MANUAL di luar sistem — tidak ada kode di repo " +
                      "ini yang mengirimkannya."
                    : holdAdvice(detail)}
                </p>
              </div>
            )}

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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ANTREAN UTANG REFUND — dua daftar, bukan satu.

   ATURAN YANG MEMBENTUK SELURUH BAGIAN INI: baris `refundSafe=false` TIDAK BOLEH bisa dibaca
   seperti baris `refundSafe=true`. Maka pemisahnya bukan sekadar warna badge di kolom sempit,
   melainkan DUA BLOK TERPISAH dengan judul, jumlah, dan kalimat aksi masing-masing. Baris tahan
   selalu lebih dulu — kalau operator hanya sempat membaca satu hal di layar ini, yang dibacanya
   harus yang bisa membuatnya membayar dua kali.

   TIDAK ADA TOMBOL AKSI DI SINI, DAN ITU DISENGAJA. Repo ini tidak punya rail refund otomatis;
   refund dikerjakan manusia lewat IDRX/transfer manual. Satu tombol "Refund" di layar ini — yang
   bentuknya mau tak mau sama untuk kedua blok — adalah persis mekanisme yang aturan di atas coba
   cegah.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Kalimat "apa yang harus diverifikasi dulu" untuk baris yang gerbangnya TIDAK hijau. */
function holdAdvice(t: AdminTransaction): string {
  if (t.refundSafe === undefined) {
    return (
      "Kolom refundSafe TIDAK ADA di respons backend (versi lama). Gerbangnya tidak terbaca — " +
      "perlakukan sebagai TAHAN dan periksa barisnya langsung sebelum mengirim apa pun."
    );
  }
  if (t.type === "CONSIGNMENT") {
    return (
      "Kartu TITIPAN: jatah pemilik kartu sudah cair ke saldonya di detik settlement, jadi Rupiah " +
      "ini TIDAK lagi ada di treasury kami. Memulihkan pembeli berarti KERUGIAN Hoshi — bukan " +
      "mengembalikan uang yang kami pegang. Putuskan dulu dari kantong siapa dan apa yang terjadi " +
      "pada jatah pemiliknya; alasan di atas menyebut apa yang terjadi pada kartunya."
    );
  }
  return (
    "Verifikasi DI LUAR SISTEM sebelum mengirim apa pun. Alasan di atas menyebut yang mana: posisi " +
    "USDC on-chain (kegagalan PASCA-belanja — barangnya mungkin sudah terkirim), atau dashboard " +
    "IDRX (pin menyimpang — Rupiah-nya tidak terbukti pernah mendarat di treasury kami)."
  );
}

function RefundQueue({
  error,
  loaded,
  total,
  hold,
  safe,
  sumIdr,
  onOpen,
}: {
  error: string | null;
  loaded: boolean;
  total: number;
  hold: AdminTransaction[];
  safe: AdminTransaction[];
  sumIdr: (rows: AdminTransaction[]) => number;
  onOpen: (t: AdminTransaction) => void;
}) {
  const shown = hold.length + safe.length;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-semibold text-zinc-200">
        Utang refund — uang yang kami pegang tanpa mereka menerima apa pun
      </h3>
      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">
        Order berstatus <span className="font-mono text-zinc-400">REFUND_DUE</span>: pembayarannya
        mendarat, barangnya gagal diserahkan.{" "}
        <span className="font-semibold text-zinc-400">
          Tidak ada tombol transfer di halaman ini
        </span>{" "}
        — refund dikerjakan manusia di luar sistem (IDRX / transfer manual). Angka &quot;boleh
        dicairkan&quot; di bawah BELUM memotong daftar ini.
      </p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-[13px] font-semibold text-red-300">Antrean GAGAL dimuat — {error}</p>
          <p className="mt-1 text-[12px] text-red-200/70">
            Ini BUKAN berarti tidak ada utang. Muat ulang halaman sebelum mengambil kesimpulan
            apa pun soal uang.
          </p>
        </div>
      )}

      {!error && !loaded && (
        <p className="py-8 text-center text-sm text-zinc-500">Memuat antrean utang…</p>
      )}

      {!error && loaded && shown === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          Tidak ada order REFUND_DUE. Tidak ada utang refund yang tercatat saat ini.
        </p>
      )}

      {!error && loaded && shown > 0 && (
        <div className="mt-4 space-y-5">
          {/* ── BLOK 1: TAHAN. Selalu lebih dulu, apa pun jumlahnya. ─────────────────────────── */}
          {hold.length > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-red-500/40 bg-red-500/[0.14] px-4 py-2.5">
                <p className="text-[13px] font-bold uppercase tracking-wide text-red-300">
                  ⚠️ Tahan — JANGAN transfer ({hold.length})
                </p>
                <p className="text-[13px] font-bold tabular-nums text-red-300">
                  {rp(sumIdr(hold))}
                </p>
              </div>
              <div className="space-y-px rounded-b-xl border border-t-0 border-red-500/25 bg-red-500/[0.04] p-3">
                {hold.map((t) => (
                  <DebtRow key={t.id} t={t} gate="HOLD" onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}

          {/* ── BLOK 2: AMAN. Bentuknya SENGAJA berbeda, bukan cuma warnanya. ────────────────── */}
          {safe.length > 0 && (
            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-t-xl border border-emerald-400/35 bg-emerald-400/[0.10] px-4 py-2.5">
                <p className="text-[13px] font-bold uppercase tracking-wide text-emerald-300">
                  Aman dikembalikan ({safe.length})
                </p>
                <p className="text-[13px] font-bold tabular-nums text-emerald-300">
                  {rp(sumIdr(safe))}
                </p>
              </div>
              <div className="space-y-px rounded-b-xl border border-t-0 border-emerald-400/20 bg-emerald-400/[0.03] p-3">
                {safe.map((t) => (
                  <DebtRow key={t.id} t={t} gate="SAFE" onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}

          {total > shown && (
            <p className="text-[12px] text-amber-300/80">
              Menampilkan {shown} utang terbaru dari {total}. Sisanya belum muncul di daftar ini —
              tuntaskan yang di atas lalu muat ulang.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Satu baris utang. WAJIB memuat: nominal, siapa, kapan, teks `error` APA ADANYA, dan gerbangnya.
 *
 * Teks alasannya dirender UTUH (`whitespace-pre-wrap`, tanpa truncate) — ia satu-satunya yang
 * menjelaskan apa yang sebenarnya terjadi, dan kalimat yang dipotong di tengah adalah kalimat
 * yang menyesatkan.
 */
function DebtRow({
  t,
  gate,
  onOpen,
}: {
  t: AdminTransaction;
  gate: "HOLD" | "SAFE";
  onOpen: (t: AdminTransaction) => void;
}) {
  const hold = gate === "HOLD";
  const ui = TYPE_UI[t.type];
  return (
    <div
      onClick={() => onOpen(t)}
      className="cursor-pointer rounded-lg px-3 py-3 transition hover:bg-white/[0.04]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Penanda gerbang, dalam KATA — bukan ikon, bukan warna saja. */}
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
              hold
                ? "border-red-400/50 bg-red-500/20 text-red-200"
                : "border-emerald-400/50 bg-emerald-400/20 text-emerald-200"
            }`}
          >
            {hold ? "Tahan" : "Aman"}
          </span>
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ui.cls}`}
          >
            {ui.label}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">{t.merchantOrderId}</span>
        </div>
        <p
          className={`text-[15px] font-bold tabular-nums ${
            hold ? "text-red-200" : "text-emerald-200"
          }`}
        >
          {rp(t.priceIdr)}
        </p>
      </div>

      {/* SIAPA + KAPAN. Yang berutang adalah PEMBELI; penjual/pemilik ikut disebut karena pada
          utang titipan dialah yang jatahnya sudah terlanjur cair. */}
      <p className="mt-2 text-[12px] text-zinc-400">
        Pembeli <span className="font-semibold text-zinc-200">{t.buyer}</span>
        {t.seller && (
          <>
            {" · "}
            {t.type === "CONSIGNMENT" ? "pemilik kartu" : "penjual"}{" "}
            <span className="text-zinc-300">{t.seller}</span>
          </>
        )}
        {t.item && <> · {t.item}</>}
      </p>
      <p className="mt-0.5 text-[11px] text-zinc-500">
        Dibayar {dt(t.paidAt)} · dicatat {dt(t.createdAt)}
      </p>

      {/* TEKS ALASAN APA ADANYA — inilah yang menjelaskan apa yang sebenarnya terjadi. */}
      <div
        className={`mt-2 rounded-md border px-3 py-2 ${
          hold ? "border-red-400/20 bg-black/30" : "border-emerald-400/15 bg-black/25"
        }`}
      >
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">Alasan (apa adanya)</p>
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-300">
          {t.error?.trim() ? t.error : "(kosong — penulis utangnya tidak meninggalkan teks alasan)"}
        </p>
      </div>

      {/* KALIMAT AKSI. Berbeda isi, bukan cuma berbeda warna. */}
      <p
        className={`mt-2 text-[12px] font-medium leading-relaxed ${
          hold ? "text-red-300" : "text-emerald-300/90"
        }`}
      >
        {hold
          ? holdAdvice(t)
          : "Uangnya ada pada kami dan barangnya belum diserahkan — KEMBALIKAN ke pembeli secara " +
            "MANUAL di luar sistem. Tidak ada kode di repo ini yang mengirimkannya."}
      </p>
    </div>
  );
}
