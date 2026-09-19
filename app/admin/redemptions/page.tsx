"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   Admin: proses kirim kartu fisik (redemption). DUA RAIL, dan layar ini WAJIB membedakannya.

   ┌──── HOSHI_DOMESTIC — stok fisik Hoshi, kurir lokal Indonesia ──────────────────────────────┐
   │ Kartunya ada di rak Hoshi. Pengirimannya paket biasa: NOL NFT, NOL burn, NOL USDC treasury, │
   │ NOL CollectorCrypt, NOL tanda tangan wallet. Satu-satunya uang yang bergerak adalah ONGKIR  │
   │ RUPIAH dari pembeli. Alurnya:                                                               │
   │   REQUESTED → (pembeli bayar ongkir) AWAITING_PAYMENT → [OTOMATIS] PACKING → SHIPPED →      │
   │   DELIVERED.                                                                                │
   │ AWAITING_PAYMENT → PACKING dilakukan BACKEND begitu Rupiah-nya lunas (`fulfilShipping`,     │
   │ satu transaksi bersama penandaan order FULFILLED) — BUKAN oleh tombol di sini. Resinya      │
   │ diisi ADMIN, di layar ini.                                                                  │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
   ┌──── CC_VAULT — kartu di vault CollectorCrypt (pack / katalog CC / beli antar user) ─────────┐
   │ Pengirimannya burn NFT + USDC treasury + tanda tangan wallet USER, dan status majunya       │
   │ digerakkan CcShippingService + poll shipment CC. Resinya MILIK poll CC: backend MENOLAK 400 │
   │ kalau layar ini mencoba mengisinya tangan.                                                  │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   ┌──── TOMBOLNYA DATANG DARI SERVER, BUKAN DIGAMBAR DI SINI ──────────────────────────────────┐
   │ Setiap baris membawa `allowedNextStatuses` (transisi yang benar-benar akan diterima         │
   │ penulisnya, SUDAH dikurangi pagar ongkir) dan `blockedNextStatuses` (yang tabelnya izinkan  │
   │ tapi pagar ongkir tolak). Layar ini merendernya apa adanya.                                  │
   │                                                                                             │
   │ KENAPA. Versi lama menyalin tabel transisinya sendiri, dan salinan itu menyimpang: ia       │
   │ menggambar "Kemas" & "Kirim" pada baris domestik yang ongkirnya belum pernah ditagih. Tiap  │
   │ klik = satu paket yang ongkirnya ditanggung Hoshi tanpa seorang pun memutuskannya. Sekarang │
   │ backend MENOLAK transisi itu (400) kecuali disertai `absorbShippingFee: true` + alasan yang │
   │ disimpan permanen di baris — dan layar ini menyediakan jalan itu secara eksplisit, bukan    │
   │ sebagai tombol yang tampak biasa saja.                                                       │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { useTabParam } from "@/lib/useTabParam";
import {
  ABSORB_NOTE_MIN,
  allowedNextStatuses,
  blockedNextStatuses,
  domesticOngkirState,
  getAdminRedemptions,
  redemptionRail,
  updateRedemptionStatus,
  type AdminRedemption,
  type AdminShippingRefundDebt,
  type DomesticOngkir,
  type RedemptionRail,
  type RedemptionSource,
  type RedemptionStatus,
} from "@/lib/admin-api";
import Thumb from "@/components/admin/Thumb";
import { ConfirmDialog } from "@/components/account/ui";

/**
 * Tampilan per status — LENGKAP terhadap enum backend.
 *
 * ⚠️ JANGAN mengindeks peta ini langsung. Pakai `statusUi()` di bawah: status enum BARU yang
 * ditambahkan backend HARUS merosot jadi teks apa adanya, bukan menjatuhkan seluruh halaman
 * dengan `Cannot read properties of undefined (reading 'cls')` — yang persis terjadi pada tab
 * "Semua" begitu baris AWAITING_PAYMENT / DELIVERED pertama muncul.
 */
const STATUS_UI: Record<RedemptionStatus, { label: string; cls: string }> = {
  REQUESTED: { label: "Diminta", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  AWAITING_PAYMENT: {
    label: "Menunggu ongkir",
    cls: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  },
  PACKING: { label: "Dikemas", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  SHIPPED: { label: "Dikirim", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  DELIVERED: { label: "Sampai", cls: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" },
  CANCELED: { label: "Dibatalkan", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
  // ---- jalur REAL CC Vault. Tidak pernah sah muncul di baris domestik. ----
  READY_TO_FUND: {
    label: "Siap didanai",
    cls: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300",
  },
  FUNDING: { label: "Mendanai USDC", cls: "border-indigo-400/30 bg-indigo-400/10 text-indigo-300" },
  FUNDED: {
    label: "Menunggu TTD user",
    cls: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
  BURN_SUBMITTED: {
    label: "Burn dikirim ke CC",
    cls: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  },
  IN_TRANSIT: { label: "Dalam perjalanan", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  REFUND_DUE: { label: "Wajib refund", cls: "border-rose-400/40 bg-rose-400/15 text-rose-200" },
  RECLAIM_DUE: {
    label: "USDC perlu direklaim",
    cls: "border-rose-400/40 bg-rose-400/15 text-rose-200",
  },
  SHIP_FAILED_POST_BURN: {
    label: "Gagal pasca-burn",
    cls: "border-rose-400/40 bg-rose-400/15 text-rose-200",
  },
};

/** Jaringnya. Status yang belum dikenal TAMPIL APA ADANYA — tidak pernah melempar. */
const statusUi = (s: RedemptionStatus | string): { label: string; cls: string } =>
  STATUS_UI[s as RedemptionStatus] ?? {
    label: String(s),
    cls: "border-white/15 bg-white/[0.06] text-zinc-300",
  };

/** Teks & gaya TOMBOL per status tujuan. Dipakai untuk apa pun yang server izinkan. */
const ACTION_UI: Record<
  RedemptionStatus,
  { label: string; cls: string; danger?: boolean }
> = {
  PACKING: {
    label: "Kemas",
    cls: "bg-sky-500/20 text-sky-300 hover:bg-sky-500/30",
  },
  SHIPPED: {
    label: "Kirim",
    cls: "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30",
  },
  DELIVERED: {
    label: "Sampai",
    cls: "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
  },
  CANCELED: {
    label: "Batal",
    cls: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
    danger: true,
  },
  RECLAIM_DUE: {
    label: "USDC perlu direklaim",
    cls: "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30",
    danger: true,
  },
  // Status di bawah tidak pernah jadi TUJUAN transisi admin hari ini; entri ada supaya peta ini
  // tetap lengkap terhadap enum dan tidak perlu di-index dengan jaring.
  REQUESTED: { label: "Diminta", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  AWAITING_PAYMENT: {
    label: "Menunggu ongkir",
    cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]",
  },
  READY_TO_FUND: { label: "Siap didanai", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  FUNDING: { label: "Mendanai", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  FUNDED: { label: "Didanai", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  BURN_SUBMITTED: { label: "Burn dikirim", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  IN_TRANSIT: { label: "Dalam perjalanan", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  REFUND_DUE: { label: "Wajib refund", cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" },
  SHIP_FAILED_POST_BURN: {
    label: "Gagal pasca-burn",
    cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]",
  },
};

const actionUi = (s: RedemptionStatus) =>
  ACTION_UI[s] ?? { label: String(s), cls: "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12]" };

/** Rail → bagaimana paket ini benar-benar keluar. Ini yang tidak boleh tertukar di mata operator. */
const RAIL_UI: Record<
  RedemptionRail,
  { label: string; hint: string; cls: string; dotCls: string }
> = {
  HOSHI_DOMESTIC: {
    label: "Kurir domestik",
    hint: "Stok fisik Hoshi · kamu yang kemas & kirim · ongkir Rupiah dari pembeli · isi resi di sini",
    cls: "border-[#F2C101]/45 bg-[#F2C101]/[0.12] text-[#F2C101]",
    dotCls: "bg-[#F2C101]",
  },
  CC_VAULT: {
    label: "Vault CollectorCrypt",
    hint: "CC yang kirim · burn NFT + USDC treasury + TTD wallet user · resi datang dari poll CC",
    cls: "border-sky-400/40 bg-sky-400/[0.12] text-sky-300",
    dotCls: "bg-sky-400",
  },
};

/** ASAL kartu — LABEL saja. Rail-nya dibaca dari `redemptionRail()`, bukan dari sini. */
const SOURCE_LABEL: Record<RedemptionSource, string> = {
  PACK: "Hasil pack",
  CC_CATALOG: "Katalog CC",
  P2P: "Beli antar user",
  HOSHI: "Stok Hoshi",
};

/** Posisi ongkir rail domestik → kalimat + warna. */
const ONGKIR_UI: Record<DomesticOngkir, { label: string; cls: string; detail: string }> = {
  NOT_BILLED: {
    label: "Belum ditagih",
    cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
    detail: "Pembeli belum menerbitkan tagihan ongkir. Belum ada sepeser pun yang masuk.",
  },
  UNPAID: {
    label: "BELUM LUNAS",
    cls: "border-orange-400/40 bg-orange-400/15 text-orange-200",
    detail:
      "Tagihan ongkir sudah pernah terbit tapi uangnya belum mendarat. Begitu Rupiah-nya masuk, " +
      "baris ini pindah ke Dikemas SENDIRI — jangan dimajukan tangan.",
  },
  IN_FLIGHT: {
    label: "Sedang diproses",
    cls: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    detail:
      "Pembayaran ongkirnya SEDANG diproses (order PAID/FULFILLING). Tunggu satu putaran " +
      "reconciler — barisnya akan maju sendiri begitu lunas.",
  },
  PAID: {
    label: "Ongkir LUNAS",
    cls: "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
    detail: "Ongkir Rupiah sudah masuk ke treasury. Paket ini siap dikemas & dikirim.",
  },
  CLOSED: {
    label: "Ditutup",
    cls: "border-red-400/30 bg-red-400/10 text-red-300",
    detail:
      "Permintaan dibatalkan. Kalau ongkirnya sudah sempat masuk, utangnya tercatat di baris " +
      "tagihannya sendiri (lihat /admin/transactions).",
  },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "REQUESTED", label: "Diminta" },
  { key: "AWAITING_PAYMENT", label: "Menunggu ongkir" },
  { key: "PACKING", label: "Dikemas" },
  { key: "SHIPPED", label: "Dikirim" },
  { key: "DELIVERED", label: "Sampai" },
  { key: "CANCELED", label: "Dibatalkan" },
  { key: "", label: "Semua" },
];
// Nilai tab yang sah untuk persist di URL (?status=…) — refresh/back tetap di tab yang dipilih.
const FILTER_KEYS = FILTERS.map((f) => f.key);

const RAIL_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Semua rail" },
  { key: "HOSHI_DOMESTIC", label: "Kurir domestik" },
  { key: "CC_VAULT", label: "Vault CC" },
];
const RAIL_FILTER_KEYS = RAIL_FILTERS.map((f) => f.key);

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const dt = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Aksi yang sedang dikonfirmasi. */
type PendingAction = {
  row: AdminRedemption;
  status: RedemptionStatus;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  /** true = tampilkan input resi (rail domestik → SHIPPED). */
  askTracking?: boolean;
  /**
   * true = transisi ini DITAHAN pagar ongkir. Konfirmasinya menuntut alasan tertulis dan
   * mengirim `absorbShippingFee: true` — pernyataan bahwa Hoshi menanggung ongkir paket itu.
   */
  absorb?: boolean;
};

export default function AdminRedemptionsPage() {
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<AdminRedemption[]>([]);
  // Tab status persisten di URL (?status=…) → refresh/back/forward memulihkan tab yang aktif.
  const [filter, setFilter] = useTabParam<string>("REQUESTED", FILTER_KEYS, "status");
  const [railFilter, setRailFilter] = useTabParam<string>("", RAIL_FILTER_KEYS, "rail");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [trackingId, setTrackingId] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [absorbNote, setAbsorbNote] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  /**
   * Utang ongkir yang dilaporkan backend sesudah sebuah baris DOMESTIK dibatalkan.
   *
   * WAJIB DITAMPILKAN, dan wajib MENETAP. Membatalkan baris yang ongkirnya sudah lunas TIDAK ikut
   * membatalkan tagihannya: uangnya berubah jadi utang refund yang tercatat di baris PaymentOrder
   * sendiri. Kalau layar ini membuangnya, utang itu lahir di antrean tanpa satu pun manusia tahu.
   */
  const [debts, setDebts] = useState<
    { cardName: string; rows: AdminShippingRefundDebt[] } | null
  >(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getAdminRedemptions(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (
    row: AdminRedemption,
    status: RedemptionStatus,
    opts?: {
      trackingIds?: string[];
      trackingUrls?: string[];
      absorbShippingFee?: boolean;
      note?: string;
    },
  ) => {
    if (!token || busyId) return;
    setBusyId(row.id);
    setError(null);
    try {
      // RESI hanya ikut untuk rail DOMESTIK. Sabuk kedua di sisi klien: backend juga menolak 400
      // untuk baris CC_VAULT, dan dua pagar di sini lebih murah daripada satu error yang
      // membingungkan operator di tengah pekerjaan.
      const domestic = redemptionRail(row) === "HOSHI_DOMESTIC";
      const res = await updateRedemptionStatus(row.id, status, token, {
        ...(domestic ? { trackingIds: opts?.trackingIds, trackingUrls: opts?.trackingUrls } : {}),
        ...(opts?.absorbShippingFee ? { absorbShippingFee: true } : {}),
        ...(opts?.note ? { note: opts.note } : {}),
      });
      const reported = res.shippingDebts ?? [];
      if (reported.length > 0) setDebts({ cardName: row.cardName, rows: reported });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!filter || r.status === filter) &&
          (!railFilter || redemptionRail(r) === railFilter),
      ),
    [rows, filter, railFilter],
  );

  /** Paket domestik yang SIAP dikemas (ongkir lunas) — angka yang operator cari duluan. */
  const readyCount = useMemo(
    () =>
      rows.filter((r) => redemptionRail(r) === "HOSHI_DOMESTIC" && r.status === "PACKING")
        .length,
    [rows],
  );
  /** Baris (rail mana pun) yang masih menyisakan keputusan manusia, menurut server. */
  const needsAttention = useMemo(
    () => rows.filter((r) => (r.actionRequired?.length ?? 0) > 0),
    [rows],
  );

  const openAction = (a: PendingAction) => {
    setTrackingId("");
    setTrackingUrl("");
    setAbsorbNote("");
    setDialogError(null);
    setPending(a);
  };

  const closeDialog = () => {
    setPending(null);
    setTrackingId("");
    setTrackingUrl("");
    setAbsorbNote("");
    setDialogError(null);
  };

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Kirim Kartu Fisik</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Dua rail yang <b>tidak boleh tertukar</b>.{" "}
          <span className="text-[#F2C101]">Kurir domestik</span> = stok fisik Hoshi: kamu yang kemas
          &amp; kirim, pembeli membayar ongkir Rupiah, resinya kamu isi di sini.{" "}
          <span className="text-sky-300">Vault CollectorCrypt</span> = CC yang kirim (burn NFT +
          USDC treasury + tanda tangan wallet pemilik); resinya datang dari poll CC dan tidak boleh
          diisi tangan.
        </p>
      </header>

      {readyCount > 0 && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[12px] font-semibold text-emerald-200">
          {readyCount} paket domestik ongkirnya LUNAS — siap dikemas.
        </div>
      )}

      {/* ╔═══ YANG MASIH HARUS DIPUTUSKAN MANUSIA ═══╗
          Kalimatnya DARI SERVER (`actionRequired` per baris), bukan disimpulkan di sini. Ini
          pengganti `logger.warn` yang tidak pernah sampai ke siapa pun — dan isinya bisa berupa
          uang: tagihan REFUND_DUE yang menunggu dikembalikan, atau pembayaran yang sedang jalan
          dan tidak boleh didahului. */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-amber-400/35 bg-amber-400/[0.08] p-4">
          <h2 className="text-[13px] font-bold text-amber-200">
            {needsAttention.length} permintaan kirim masih menunggu keputusanmu
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {needsAttention.slice(0, 8).map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-amber-400/20 bg-black/25 px-3.5 py-2.5"
              >
                <p className="text-[12px] font-semibold text-zinc-100">
                  {r.cardName}{" "}
                  <span className="font-normal text-zinc-500">
                    · {statusUi(r.status).label} · {r.city}
                  </span>
                </p>
                {(r.actionRequired ?? []).map((a) => (
                  <p key={a} className="mt-1 text-[12px] leading-relaxed text-amber-100/85">
                    {a}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {needsAttention.length > 8 && (
            <p className="mt-2 text-[11px] text-amber-100/60">
              …dan {needsAttention.length - 8} lagi. Buka tab “Semua” untuk melihat semuanya.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
                on
                  ? "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
          Rail
        </span>
        {RAIL_FILTERS.map((f) => {
          const on = railFilter === f.key;
          return (
            <button
              key={f.key || "all"}
              type="button"
              onClick={() => setRailFilter(f.key)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                on
                  ? "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  : "bg-white/[0.02] text-zinc-500 hover:bg-white/[0.06]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {debts && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-400/[0.08] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold text-rose-200">
              Ongkir yang sudah masuk untuk “{debts.cardName}” TIDAK ikut terhapus — ia sekarang
              utang refund yang harus diselesaikan tim, di luar sistem.
            </p>
            <button
              type="button"
              onClick={() => setDebts(null)}
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </div>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {debts.rows.map((d) => (
              <li
                key={d.merchantOrderId}
                className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-zinc-300"
              >
                <span className="font-mono text-zinc-100">{d.merchantOrderId}</span> · {rp(d.priceIdr)}{" "}
                · {d.statusBefore} → {d.statusAfter}
                <span className="block text-[11px] text-zinc-500">{d.action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-500">Memuat…</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">Belum ada permintaan kirim.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
          <table className="w-full min-w-[1160px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-semibold">Kartu</th>
                <th className="px-4 py-3 font-semibold">Rail / Asal</th>
                <th className="px-4 py-3 font-semibold">Ongkir</th>
                <th className="px-4 py-3 font-semibold">Tujuan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const rail = redemptionRail(r);
                const railUi = RAIL_UI[rail];
                const domestic = rail === "HOSHI_DOMESTIC";
                const ongkir = domesticOngkirState(r);
                const st = statusUi(r.status);
                const busy = busyId === r.id;
                const allowed = allowedNextStatuses(r);
                const blocked = blockedNextStatuses(r);
                const rowActions = r.actionRequired ?? [];
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-white/[0.05] ${
                      domestic ? "bg-[#14110a]/70" : "bg-[#0d1016]/70"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={r.cardImage} alt={r.cardName} />
                        <div className="min-w-0">
                          <p
                            className="max-w-[220px] truncate font-semibold text-zinc-100"
                            title={r.cardName}
                          >
                            {r.cardName}
                          </p>
                          {r.cardSet && (
                            <p className="truncate text-[11px] text-zinc-500">{r.cardSet}</p>
                          )}
                          {(r.trackingIds?.length ?? 0) > 0 && (
                            <p className="mt-0.5 truncate font-mono text-[11px] text-emerald-300/80">
                              Resi: {r.trackingIds?.join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* RAIL dulu, asal belakangan. Rail = fakta persisten (listingId) yang
                        menentukan apa yang benar-benar terjadi; `source` cuma label yang pada
                        baris warisan bisa berbunyi 'HOSHI' untuk kartu jalur CC. */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span
                          className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${railUi.cls}`}
                          title={railUi.hint}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${railUi.dotCls}`} aria-hidden />
                          {railUi.label}
                        </span>
                        <span className="text-[11px] text-zinc-500">
                          {r.source ? SOURCE_LABEL[r.source] : "asal tak tercatat"}
                        </span>
                      </div>
                    </td>

                    {/* ONGKIR — kolom yang dulu tidak ada sama sekali, dan tanpanya dua tombol
                        di kanan sama-sama tampak seperti "lanjutkan saja". */}
                    <td className="px-4 py-3">
                      {ongkir ? (
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-block w-fit rounded-md border px-2 py-0.5 text-[11px] font-bold ${ONGKIR_UI[ongkir].cls}`}
                            title={ONGKIR_UI[ongkir].detail}
                          >
                            {ONGKIR_UI[ongkir].label}
                          </span>
                          {(r.ongkir?.paidIdr ?? 0) > 0 && (
                            <span className="text-[11px] tabular-nums text-zinc-500">
                              {rp(r.ongkir?.paidIdr ?? 0)} masuk
                            </span>
                          )}
                          {r.ongkir?.refundDue && (
                            <span
                              className={`inline-block w-fit rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                                r.ongkir.refundSafe === false
                                  ? "border-rose-400/50 bg-rose-500/20 text-rose-200"
                                  : "border-amber-400/40 bg-amber-400/15 text-amber-200"
                              }`}
                            >
                              {r.ongkir.refundSafe === false
                                ? "REFUND DITAHAN"
                                : "Utang refund"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          className="text-[11px] text-zinc-600"
                          title={
                            domestic
                              ? "Status ini bukan milik rail domestik — periksa barisnya."
                              : "Rail CC: ongkirnya punya kosakata sendiri (Rupiah lunas → USDC didanai → TTD user)."
                          }
                        >
                          —
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-[13px] text-zinc-300">
                      <p className="font-semibold text-zinc-100">{r.recipientName}</p>
                      <p className="text-zinc-400">
                        {r.street}, {[r.city, r.state, r.country].filter(Boolean).join(", ")} {r.zip}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">
                      {dt(r.createdAt)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          {/* TOMBOL SIAP-PAKAI — daftarnya DARI SERVER. */}
                          {allowed.map((next) => {
                            const ui = actionUi(next);
                            return (
                              <button
                                key={next}
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  openAction(buildAction(r, next, rail, ongkir, false))
                                }
                                className={`rounded-lg px-3 py-1 text-[12px] font-semibold transition disabled:opacity-40 ${ui.cls}`}
                              >
                                {ui.label}
                              </button>
                            );
                          })}

                          {/* TOMBOL YANG DITAHAN PAGAR ONGKIR — dirender, bukan disembunyikan,
                              tapi TIDAK PERNAH terlihat sebagai aksi normal: garis putus-putus,
                              gembok, dan konfirmasinya menuntut pernyataan tertulis. Menyembunyikan
                              keduanya akan membuat jalan keluar yang sah jadi tak terlihat; membuat
                              keduanya tampak biasa adalah persis bug yang sedang diperbaiki. */}
                          {blocked.map((next) => {
                            const ui = actionUi(next);
                            return (
                              <button
                                key={`blocked-${next}`}
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  openAction(buildAction(r, next, rail, ongkir, true))
                                }
                                title="Ditahan karena ongkirnya belum lunas. Bisa dilanjutkan hanya dengan menyatakan bahwa Hoshi menanggung ongkirnya."
                                className="rounded-lg border border-dashed border-amber-400/40 bg-transparent px-3 py-1 text-[12px] font-semibold text-amber-300/70 transition hover:bg-amber-400/10 disabled:opacity-40"
                              >
                                🔒 {ui.label}
                              </button>
                            );
                          })}

                          {allowed.length === 0 && blocked.length === 0 && (
                            <span className="text-[12px] text-zinc-600">—</span>
                          )}
                        </div>

                        {/* Kalimat dari server, di baris yang bersangkutan. Ia yang membuat
                            tombol bergembok di atas bisa dimengerti tanpa membuka dialognya. */}
                        {rowActions.map((a) => (
                          <span
                            key={a}
                            className="max-w-[260px] text-right text-[11px] leading-relaxed text-amber-200/70"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title={pending?.title ?? ""}
        danger={pending?.danger ?? false}
        message={
          pending ? (
            <span className="block">
              <span className="block">{pending.message}</span>

              {/* PERNYATAAN "HOSHI MENANGGUNG ONGKIRNYA". Wajib, minimal 10 karakter, dan backend
                  MENYIMPANNYA permanen di kolom `note` baris redemption — bukan cuma di log. */}
              {pending.absorb && (
                <span className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-amber-200">
                    Alasan menanggung ongkirnya (wajib, min. {ABSORB_NOTE_MIN} karakter — disimpan
                    permanen di baris ini)
                  </span>
                  <textarea
                    value={absorbNote}
                    onChange={(e) => setAbsorbNote(e.target.value)}
                    rows={3}
                    placeholder="mis. kompensasi keterlambatan, ongkir ditanggung Hoshi (disetujui PM)"
                    className="w-full rounded-lg border border-amber-400/30 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
                  />
                </span>
              )}

              {/* RESI — HANYA rail domestik. Backend menolak 400 untuk baris CC_VAULT karena di
                  sana kolom ini milik poll shipment CC. */}
              {pending.askTracking && (
                <span className="mt-4 block">
                  <span className="mb-1.5 block text-[12px] font-semibold text-zinc-300">
                    Nomor resi kurir (opsional, bisa diisi belakangan)
                  </span>
                  <input
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    placeholder="mis. JP1234567890"
                    className="w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                  />
                  <input
                    value={trackingUrl}
                    onChange={(e) => setTrackingUrl(e.target.value)}
                    placeholder="Link lacak (opsional) — https://…"
                    className="mt-2 w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                  />
                </span>
              )}

              {dialogError && (
                <span className="mt-3 block text-[12px] font-semibold text-red-400">
                  {dialogError}
                </span>
              )}
            </span>
          ) : (
            ""
          )
        }
        confirmLabel={pending?.confirmLabel ?? "OK"}
        onConfirm={() => {
          const a = pending;
          if (!a) return;
          // VALIDASI DI SINI, BUKAN DENGAN MENUTUP DIALOG. Alasan yang terlalu pendek ditolak
          // backend (400); menutup dialognya lebih dulu akan membuang apa yang sudah diketik.
          if (a.absorb && absorbNote.trim().length < ABSORB_NOTE_MIN) {
            setDialogError(
              `Alasannya wajib dan minimal ${ABSORB_NOTE_MIN} karakter — ia disimpan permanen di baris ini.`,
            );
            return;
          }
          const ids = trackingId.trim() ? [trackingId.trim()] : undefined;
          const urls = trackingUrl.trim() ? [trackingUrl.trim()] : undefined;
          const note = absorbNote.trim();
          closeDialog();
          void setStatus(a.row, a.status, {
            ...(a.askTracking ? { trackingIds: ids, trackingUrls: urls } : {}),
            ...(a.absorb ? { absorbShippingFee: true, note } : {}),
          });
        }}
        onCancel={closeDialog}
      />
    </div>
  );
}

/**
 * Kalimat konfirmasi untuk satu transisi. Dipisah dari JSX supaya setiap cabangnya bisa dibaca
 * berdampingan — dan supaya jelas bahwa yang menentukan bentuknya adalah RAIL + POSISI ONGKIR,
 * bukan tebakan dari status saja.
 */
function buildAction(
  row: AdminRedemption,
  status: RedemptionStatus,
  rail: RedemptionRail,
  ongkir: DomesticOngkir | null,
  absorb: boolean,
): PendingAction {
  const domestic = rail === "HOSHI_DOMESTIC";
  const name = `“${row.cardName}”`;

  if (absorb) {
    return {
      row,
      status,
      absorb: true,
      danger: true,
      title: "Hoshi menanggung ongkirnya?",
      confirmLabel: "Ya, Hoshi tanggung ongkirnya",
      askTracking: domestic && status === "SHIPPED",
      message:
        `${name} belum punya ongkir yang lunas. Alur normalnya pembeli membayar invoice ongkir, ` +
        "lalu baris ini pindah ke Dikemas SENDIRI — tidak perlu tombol apa pun. " +
        (ongkir === "IN_FLIGHT"
          ? "Pembayarannya bahkan SEDANG DIPROSES saat ini: tunggu satu putaran reconciler sebelum memutuskan. "
          : "") +
        "Kalau kamu lanjut, Hoshi yang membayar ongkos kirimnya dan pembeli tidak akan pernah " +
        "ditagih untuk kiriman ini. Pernyataan dan alasanmu disimpan permanen di baris ini.",
    };
  }

  if (status === "CANCELED") {
    return {
      row,
      status,
      danger: true,
      title: "Batalkan permintaan kirim?",
      confirmLabel: "Batalkan",
      message:
        domestic && ongkir === "PAID"
          ? `Ongkir ${name} SUDAH LUNAS. Membatalkan TIDAK ikut membatalkan tagihannya: Rupiah yang ` +
            "sudah masuk akan dicatat sebagai UTANG REFUND pada tagihannya sendiri, dan tim harus " +
            "mengembalikannya di luar sistem. Nomor tagihannya muncul di layar ini sesudah pembatalan."
          : `Permintaan kirim ${name} akan dibatalkan. Kartunya kembali bebas diminta kirim lagi.`,
    };
  }

  if (status === "RECLAIM_DUE") {
    return {
      row,
      status,
      danger: true,
      title: "Tandai USDC perlu direklaim?",
      confirmLabel: "Tandai RECLAIM_DUE",
      message:
        `USDC ongkir untuk ${name} sudah/mungkin berpindah ke wallet user tapi burn-nya tidak ` +
        "dituntaskan. Menandai ini menyetel refundSafe=false secara permanen: JANGAN refund " +
        "Rupiah-nya, dan reklaim USDC-nya on-chain di luar sistem.",
    };
  }

  if (status === "DELIVERED") {
    return {
      row,
      status,
      danger: false,
      title: "Tandai Sampai?",
      confirmLabel: "Tandai Sampai",
      message:
        `${name} akan ditutup sebagai SAMPAI di alamat ${row.city}. ` +
        (domestic
          ? "Sesudah ini kartunya bebas diminta kirim lagi kalau memang masih ada."
          : "Untuk baris jalur CollectorCrypt ini adalah penutupan MANUAL — kamu menyatakan kiriman " +
            "benar-benar sampai meski poll CC tidak pernah menjawab Delivered."),
    };
  }

  if (status === "PACKING") {
    return {
      row,
      status,
      danger: false,
      title: "Tandai Dikemas?",
      confirmLabel: "Tandai Dikemas",
      message: `${name} akan ditandai sedang dikemas.`,
    };
  }

  if (status === "SHIPPED") {
    return {
      row,
      status,
      danger: false,
      askTracking: domestic,
      title: "Tandai Dikirim?",
      confirmLabel: "Tandai Dikirim",
      message: domestic
        ? `${name} akan ditandai DIKIRIM ke ${row.city}. Ongkirnya sudah lunas. Isi nomor resi ` +
          "kurirnya di bawah supaya pembeli bisa melacak paketnya."
        : `${name} akan ditandai DIKIRIM ke ${row.city}. Ini baris jalur CollectorCrypt: ` +
          "pengiriman sungguhannya (burn NFT + shipment CC) digerakkan sesi tanda tangan user, " +
          "bukan tombol ini.",
    };
  }

  // Transisi yang belum punya kalimat khusus: tetap bisa dijalankan, tapi katakan apa adanya.
  return {
    row,
    status,
    danger: false,
    title: `Ubah status ke ${statusUi(status).label}?`,
    confirmLabel: "Lanjutkan",
    message: `Status ${name} akan diubah dari ${statusUi(row.status).label} ke ${statusUi(status).label}.`,
  };
}
