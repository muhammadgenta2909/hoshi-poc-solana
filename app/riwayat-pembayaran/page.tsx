"use client";

// Riwayat Pembayaran — satu-satunya tempat di produk ini di mana user yang SUDAH MEMBAYAR bisa
// melihat bukti bahwa pembayaran itu pernah terjadi. Sumbernya GET /payments/me/orders
// (lib/api.getMyOrders), endpoint yang sudah ada di backend sejak awal tapi belum pernah dipanggil
// UI mana pun.
//
// SATU RAIL, EMPAT JENIS ORDER. Backend menerbitkan SEMUA tagihan rupiah lewat PaymentsService, dan
// keempat jenisnya adalah baris di TABEL YANG SAMA (payment_orders) dengan DTO yang sama. Jenisnya
// dibedakan oleh sentinel `packType` yang di-set SERVER (lihat orderSubject() di
// hoshi-backend/src/payments/payments.service.ts:245):
//   packType 'TOPUP'       → isi saldo in-app
//   packType 'SHIPPING'    → ongkir kirim kartu fisik
//   packType 'MARKETPLACE' → beli kartu (jalur listing MAUPUN jalur bayar-offer)
//   lainnya                → kode mesin gacha (mis. 'pokemon_50') = pack
// Karena itu halaman ini TIDAK memfilter apa pun secara default: riwayat yang diam-diam
// menghilangkan satu jenis pembayaran lebih buruk daripada tidak ada riwayat sama sekali.
//
// DUA KEJUJURAN YANG WAJIB DIJAGA DI SINI:
//  1. Gagal fetch ≠ "kamu belum pernah bayar". Keduanya layar yang BERBEDA (lihat `loadError`).
//     Menyamakannya = memberi tahu user bahwa uangnya tidak pernah ada karena satu request timeout.
//  2. Tidak ada refund otomatis di sistem ini. REFUND_DUE artinya utang refund DICATAT untuk
//     dikerjakan operator — jadi copy-nya tidak boleh berbunyi seperti janji uang sudah dikirim.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getMyOrders, type PaymentOrder, type PaymentStatus } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { useTabParam } from "@/lib/useTabParam";
import {
  AccountShell,
  Panel,
  EmptyState,
  GhostButton,
  PrimaryButton,
  copyText,
  CopyIcon,
  HistoryIcon,
  WarningIcon,
} from "@/components/account/ui";
import { formatIdr } from "@/components/packs/ui";

/* ------------------------------- jenis order ------------------------------- */

type Kind = "Semua" | "Pack" | "Saldo" | "Kartu" | "Ongkir";
const KINDS: readonly Kind[] = ["Semua", "Pack", "Saldo", "Kartu", "Ongkir"];

const KIND_LABEL: Record<Kind, string> = {
  Semua: "Semua",
  Pack: "Pack",
  Saldo: "Isi saldo",
  Kartu: "Kartu",
  Ongkir: "Ongkir",
};

/** Jenis sebuah order, DITURUNKAN dari sentinel `packType` yang di-set server — sama persis dengan
 *  cabang orderSubject() di backend. Bukan tebakan dari nominal atau dari urutan. */
function kindOf(order: PaymentOrder): Exclude<Kind, "Semua"> {
  if (order.packType === "SHIPPING") return "Ongkir";
  if (order.packType === "TOPUP") return "Saldo";
  if (order.packType === "MARKETPLACE") return "Kartu";
  return "Pack";
}

/** Kode mesin → sebutan yang bisa dibaca orang ('pokemon_cnft' → 'Pokemon cNFT'). Sengaja cuma
 *  merapikan kodenya, TIDAK mengarang nama produk yang tidak ada di backend. */
function prettyMachine(code: string): string {
  return code
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) =>
      w.toLowerCase() === "cnft" ? "cNFT" : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
}

/** Judul baris: APA yang dibayar. */
function subjectOf(order: PaymentOrder): string {
  switch (kindOf(order)) {
    case "Ongkir":
      return "Ongkir kirim kartu fisik";
    case "Saldo":
      return "Isi saldo";
    case "Kartu":
      // Backend memakai sentinel 'MARKETPLACE' untuk DUA rail (beli di harga listing & bayar
      // offer) dan tidak mengirim listingId/offerId di DTO-nya, jadi kita tidak mengaku tahu
      // yang mana — dan tidak menautkan ke kartu tertentu yang belum tentu benar.
      return "Pembelian kartu di marketplace";
    default:
      return `Pack ${prettyMachine(order.packType)}`;
  }
}

/* ------------------------------ status → copy ------------------------------ */

const AMBER = "border-amber-400/30 bg-amber-400/10 text-amber-300";
const SKY = "border-sky-400/30 bg-sky-400/10 text-sky-300";
const EMERALD = "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
const RED = "border-red-400/30 bg-red-400/10 text-red-300";
const SLATE = "border-white/12 bg-white/[0.04] text-zinc-400";

/**
 * Tujuh status backend → tujuh kalimat yang BERBEDA. Kegagalan TIDAK diratakan jadi satu kata,
 * karena ketiga jenis kegagalan di rail ini berbeda soal DI MANA UANG USER berada:
 *
 *   EXPIRED / FAILED  → tidak ada dana user yang kami pegang (schema: FAILED = "kita YAKIN tidak
 *                       ada uang user yang tertahan").
 *   PAID / FULFILLING → dana sudah kami terima, pesanannya masih berjalan. Bukan gagal.
 *   REFUND_DUE        → dana sudah kami terima TAPI barangnya tidak bisa diserahkan. Utang refund
 *                       DICATAT; tidak ada mesin refund otomatis di backend (operator yang
 *                       mengerjakan, dan ia wajib memeriksa kolom `refundSafe` lebih dulu). Maka
 *                       copy-nya menyuruh user menghubungi tim dengan nomor pesanan — BUKAN
 *                       menjanjikan uangnya sudah di jalan.
 */
const STATUS_UI: Record<PaymentStatus, { label: string; cls: string; detail: string }> = {
  PENDING: {
    label: "Menunggu pembayaran",
    cls: AMBER,
    detail: "Tagihan sudah dibuat, pembayarannya belum kami terima.",
  },
  PAID: {
    label: "Sudah dibayar",
    cls: SKY,
    detail: "Pembayaranmu sudah kami terima. Pesananmu sedang disiapkan.",
  },
  FULFILLING: {
    label: "Sedang diproses",
    cls: SKY,
    detail: "Pembayaran diterima dan pesananmu sedang dikerjakan sekarang.",
  },
  FULFILLED: {
    label: "Selesai",
    cls: EMERALD,
    detail: "Pembayaran diterima dan pesananmu sudah diserahkan.",
  },
  EXPIRED: {
    label: "Kedaluwarsa",
    cls: SLATE,
    detail:
      "Waktu pembayaran habis dan tidak ada dana yang kami terima. Kalau kamu merasa tetap " +
      "membayar, statusnya masih kami cocokkan otomatis — hubungi kami kalau tidak berubah.",
  },
  FAILED: {
    label: "Gagal",
    cls: RED,
    detail: "Pesanan ini tidak jadi diproses, dan tidak ada dana kamu yang tertahan.",
  },
  REFUND_DUE: {
    label: "Perlu ditinjau tim",
    cls: RED,
    detail:
      "Pembayaranmu kami terima, tapi pesanannya tidak bisa kami selesaikan. Pengembalian dana " +
      "sudah dicatat dan dikerjakan manual oleh tim kami — belum tentu langsung masuk. Hubungi " +
      "kami dengan nomor pesanan di bawah supaya bisa kami telusuri.",
  },
};

/* --------------------------------- tanggal -------------------------------- */

const dt = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Metode bayar seperti dicatat backend → sebutan yang dikenal user. */
const METHOD_LABEL: Record<string, string> = {
  QRIS: "QRIS",
  VA: "Virtual account",
  HOSTED: "QRIS / e-wallet / VA",
};

/** Endpoint-nya TIDAK berhalaman (findMany tanpa take/skip): satu respons memuat SELURUH order
 *  user. Jadi paginasinya di sisi ini — daftar dipotong supaya user dengan ratusan order tidak
 *  merender ratusan baris sekaligus. */
const PAGE = 20;

export default function RiwayatPembayaranPage() {
  const { token, hydrated } = useAuth();
  const { open: openConnect } = useWalletConnect();
  const [kind, setKind] = useTabParam<Kind>("Semua", KINDS, "jenis");

  // Hasil fetch DIIKAT ke token pemiliknya — idiom yang sama dengan `balances.owner !== address`
  // di /settings. Kalau sesi berganti (logout → login akun lain), snapshot lama otomatis dianggap
  // "belum termuat" alih-alih sekejap terlihat sebagai riwayat milik akun yang baru.
  const [snap, setSnap] = useState<{ token: string; rows: PaymentOrder[] } | null>(null);
  const [failure, setFailure] = useState<{ token: string; message: string } | null>(null);
  // Hanya untuk tombol "Muat ulang" (ditekan user). Pemuatan PERTAMA tidak butuh flag: ia
  // tersirat dari "belum ada snapshot dan belum ada kegagalan".
  const [refreshing, setRefreshing] = useState(false);
  const [shown, setShown] = useState(PAGE);
  // `Date.now()` TIDAK BOLEH dipanggil saat render (react-hooks/purity — hasilnya berubah tiap
  // render). Jam dinding disimpan sebagai state, dan cuma dipakai untuk SATU keputusan: apakah
  // tombol "Lanjutkan pembayaran" masih layak ditawarkan. `null` = belum tahu → tidak menawarkan.
  const [now, setNow] = useState<number | null>(null);

  const rows = snap && snap.token === token ? snap.rows : null;
  const loadError = failure && failure.token === token ? failure.message : null;
  const firstLoad = !!token && rows === null && loadError === null;

  const load = useCallback(async () => {
    // Guard DULU, lalu langsung await: tidak ada setState sinkron di fungsi ini, supaya efek di
    // bawah boleh memanggilnya tanpa memicu cascading render.
    const t = token;
    if (!t) return;
    try {
      const data = await getMyOrders(t);
      setSnap({ token: t, rows: data });
      setNow(Date.now());
      // Sukses menghapus kegagalan lama — kalau tidak, satu error lama menempel di layar
      // selamanya meski datanya sudah masuk.
      setFailure(null);
    } catch (e) {
      // Snapshot lama TIDAK dihapus: kalau sebelumnya sudah termuat, data itu masih benar dan
      // lebih berguna daripada layar kosong. Yang berubah cuma pengakuan bahwa pemuatan
      // TERBARU gagal (banner di atas daftar).
      setFailure({
        token: t,
        message: e instanceof Error ? e.message : "Gagal memuat riwayat pembayaran.",
      });
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    // `load` sudah ditulis supaya TIDAK ada setState sinkron di dalamnya (guard token dulu, lalu
    // langsung await) — semua setState-nya terjadi setelah respons jaringan. Aturan lint ini
    // tidak memodelkan batas await, jadi ia tetap menandai pemanggilan fungsi yang di dalamnya
    // ADA setState; pola fetch-saat-mount yang sama dipakai di seluruh repo ini
    // (app/withdraw/history, components/packs/BalancePill, dst).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [hydrated, load]);

  // Segarkan jam dinding sesekali supaya tawaran "Lanjutkan pembayaran" ikut kedaluwarsa pada
  // tab yang dibiarkan terbuka lama. setState-nya di callback timer, bukan di badan efek.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Dipicu user (bukan efek), jadi setState sinkron di sini memang tempatnya. Guard token-nya
  // bukan hiasan: tanpa itu `load` bisa keluar SEBELUM try/finally-nya dan `refreshing` tersangkut
  // di "Memuat…" selamanya.
  const refresh = () => {
    if (!token) return;
    setRefreshing(true);
    void load();
  };

  const filtered = useMemo(
    () => (kind === "Semua" ? rows ?? [] : (rows ?? []).filter((r) => kindOf(r) === kind)),
    [rows, kind],
  );

  // Ganti filter → kembali ke halaman pertama, biar tidak mendarat di potongan kosong.
  const selectKind = (k: Kind) => {
    setKind(k);
    setShown(PAGE);
  };

  const page = filtered.slice(0, shown);
  const more = filtered.length - page.length;

  // Jumlah per-jenis untuk chip filter — dihitung dari SELURUH snapshot, bukan dari yang tampil.
  const counts = useMemo(() => {
    const all = rows ?? [];
    const c: Record<Kind, number> = { Semua: all.length, Pack: 0, Saldo: 0, Kartu: 0, Ongkir: 0 };
    for (const r of all) c[kindOf(r)] += 1;
    return c;
  }, [rows]);

  return (
    <AccountShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Riwayat Pembayaran</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-zinc-500">
            Semua tagihan rupiah yang pernah kamu buat — pack, isi saldo, kartu marketplace, dan
            ongkir kirim kartu fisik. Terbaru di atas.
          </p>
        </div>
        {token && (
          <GhostButton
            type="button"
            onClick={refresh}
            disabled={refreshing || firstLoad}
            className="shrink-0 px-3.5 py-1.5 text-[13px]"
          >
            {refreshing || firstLoad ? "Memuat…" : "Muat ulang"}
          </GhostButton>
        )}
      </div>

      {/* Filter jenis. Default "Semua" — tidak ada jenis pembayaran yang tersembunyi kecuali user
          sendiri yang memilih menyaringnya. */}
      {token && (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">
          {KINDS.map((k) => {
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => selectKind(k)}
                aria-pressed={on}
                className={`shrink-0 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  on
                    ? "bg-yellow-400/[0.08] text-yellow-300 shadow-[inset_0_0_0_1.5px_rgba(250,204,21,0.7)]"
                    : "bg-white/[0.03] text-zinc-400 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.06] hover:text-zinc-200"
                }`}
              >
                {KIND_LABEL[k]}
                {counts[k] > 0 && (
                  <span className="ml-1.5 tabular-nums text-[12px] font-medium opacity-60">
                    {counts[k]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Panel className="mt-5 p-3 sm:p-4">
        {!hydrated ? (
          <p className="py-14 text-center text-sm text-zinc-500">Memuat…</p>
        ) : !token ? (
          <EmptyState
            icon={<HistoryIcon className="h-9 w-9" />}
            title="Masuk dulu untuk melihat riwayat pembayaranmu"
            sub="Riwayat ini terikat ke akunmu, jadi kami perlu tahu dulu siapa kamu."
            action={
              <PrimaryButton type="button" onClick={openConnect}>
                Masuk
              </PrimaryButton>
            }
          />
        ) : firstLoad ? (
          <p className="py-14 text-center text-sm text-zinc-500">Memuat riwayat pembayaran…</p>
        ) : loadError && rows === null ? (
          /* GAGAL MEMUAT — layar yang SENGAJA tidak mirip "belum ada pembayaran". User yang sudah
             pernah bayar harus tahu bahwa yang gagal adalah pemuatannya, bukan pembayarannya. */
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="text-amber-400">
              <WarningIcon className="h-9 w-9" />
            </span>
            <p className="text-[15px] font-semibold text-zinc-200">
              Riwayat pembayaran belum berhasil dimuat
            </p>
            <p className="max-w-md text-[13px] leading-relaxed text-zinc-500">
              Ini <span className="text-zinc-300">bukan</span> berarti kamu belum pernah membayar.
              Kami hanya belum bisa membaca daftarnya sekarang — pembayaran yang sudah masuk tetap
              tercatat di sisi kami.
            </p>
            <p className="max-w-md break-words text-[12px] text-zinc-600">{loadError}</p>
            <div className="mt-1">
              <GhostButton type="button" onClick={refresh} disabled={refreshing}>
                {refreshing ? "Memuat…" : "Coba lagi"}
              </GhostButton>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          kind === "Semua" ? (
            <EmptyState
              icon={<HistoryIcon className="h-9 w-9" />}
              title="Belum ada pembayaran"
              sub="Setiap kali kamu membayar — pack, isi saldo, kartu, atau ongkir — tagihannya muncul di sini beserta statusnya."
              action={
                <Link href="/games">
                  <GhostButton>Lihat pack →</GhostButton>
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<HistoryIcon className="h-9 w-9" />}
              title={`Belum ada pembayaran jenis “${KIND_LABEL[kind]}”`}
              sub="Coba pilih “Semua” untuk melihat seluruh riwayatmu."
              action={
                <GhostButton type="button" onClick={() => selectKind("Semua")}>
                  Tampilkan semua
                </GhostButton>
              }
            />
          )
        ) : (
          <>
            {/* Data lama masih terpampang, tapi pemuatan TERBARU gagal → katakan begitu, jangan
                diam-diam menyajikan daftar basi sebagai daftar terkini. */}
            {loadError && (
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-[12px] text-amber-200/90">
                <span>
                  Daftar ini mungkin belum yang terbaru — pemuatan terakhir gagal.
                </span>
                <button
                  type="button"
                  onClick={refresh}
                  disabled={refreshing}
                  className="font-semibold underline underline-offset-2 hover:text-amber-100 disabled:opacity-60"
                >
                  {refreshing ? "Memuat…" : "Coba lagi"}
                </button>
              </div>
            )}

            <ul className="flex flex-col gap-2.5">
              {page.map((o) => (
                <OrderRow key={o.merchantOrderId} order={o} now={now} />
              ))}
            </ul>

            {more > 0 && (
              <div className="mt-4 flex flex-col items-center gap-1.5">
                <GhostButton type="button" onClick={() => setShown((n) => n + PAGE)}>
                  Tampilkan {Math.min(more, PAGE)} lagi
                </GhostButton>
                <p className="text-[12px] text-zinc-600">
                  Menampilkan {page.length} dari {filtered.length}
                </p>
              </div>
            )}
          </>
        )}
      </Panel>
    </AccountShell>
  );
}

/* --------------------------------- one row -------------------------------- */

function OrderRow({ order, now }: { order: PaymentOrder; now: number | null }) {
  const ui = STATUS_UI[order.status];
  // Status yang TIDAK dikenal (backend menambah status baru) tetap harus merender sesuatu yang
  // jujur, bukan crash — dan bukan pula ditebak jadi "selesai".
  const label = ui?.label ?? "Status belum dikenali";
  const cls = ui?.cls ?? SLATE;
  const detail =
    ui?.detail ??
    "Status pesanan ini belum bisa kami jelaskan di sini. Hubungi kami dengan nomor pesanan di bawah.";

  // Jendela bayar sudah lewat tapi barisnya masih PENDING: backend baru memfinalkannya saat
  // sapuan rekonsiliasi berjalan, jadi kita TIDAK mengaku ia sudah kedaluwarsa — statusnya tetap
  // "Menunggu pembayaran", kita cuma menambahkan faktanya dan berhenti menawarkan tombol bayar
  // yang sudah pasti gagal. `now === null` (jam belum dibaca) = tidak tahu → tidak mengklaim apa pun.
  const expiredWindow =
    order.status === "PENDING" &&
    !!order.expiresAt &&
    now !== null &&
    new Date(order.expiresAt).getTime() <= now;

  // Ditawarkan HANYA kalau kita benar-benar tahu jendelanya masih terbuka. Tautan ini membuka
  // halaman bayar milik gateway; yang memutuskan membayar tetap user, di halaman mereka.
  const resumable =
    order.status === "PENDING" && !!order.paymentUrl && now !== null && !expiredWindow;

  // Tanggal yang paling menjawab "kapan": tanggal DIBAYAR kalau memang sudah dibayar, kalau
  // belum ya tanggal tagihannya dibuat. Keduanya dilabeli supaya tidak tertukar.
  const when = order.paidAt
    ? { label: "Dibayar", value: dt(order.paidAt) }
    : { label: "Dibuat", value: dt(order.createdAt) };

  return (
    <li className="rounded-xl border border-white/5 bg-[#100e08]/60 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white" title={subjectOf(order)}>
            {subjectOf(order)}
          </p>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            {when.label} {when.value}
            <span className="mx-1.5 text-zinc-700">·</span>
            {METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* Nominal RUPIAH PENUH — backend menyimpan priceIdr sebagai integer rupiah, bukan
              satuan terkecil, jadi tidak ada pembagian di sini. (priceUsdc di DTO yang sama
              bersatuan LAIN — USDC 6 desimal — dan sengaja tidak ditampilkan di sebelahnya.) */}
          <p className="text-[15px] font-bold tabular-nums text-white">
            Rp {formatIdr(order.priceIdr)}
          </p>
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
            {label}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
        {detail}
        {expiredWindow && " Batas waktu bayarnya sudah lewat."}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/[0.06] pt-2.5">
        <OrderRef value={order.merchantOrderId} />
        {resumable && (
          <a
            href={order.paymentUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold text-yellow-300 underline underline-offset-2 transition hover:text-yellow-200"
          >
            Lanjutkan pembayaran →
          </a>
        )}
      </div>
    </li>
  );
}

/** Nomor pesanan + tombol salin. Ini referensi PERTAMA yang diminta support, jadi ia harus bisa
 *  disalin dalam satu ketukan — dan tetap bisa diblok manual (`select-all`) kalau clipboard
 *  ditolak browser. */
function OrderRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wide text-zinc-600">No. pesanan</span>
      <code className="select-all break-all rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          void copyText(value).then((ok) => {
            if (!ok) return;
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          });
        }}
        aria-label="Salin nomor pesanan"
        className="inline-flex items-center gap-1 rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/10"
      >
        <CopyIcon className="h-3 w-3" />
        {copied ? "Tersalin" : "Salin"}
      </button>
    </span>
  );
}
