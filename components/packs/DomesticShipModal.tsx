"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KIRIM DOMESTIK (stok fisik Hoshi, kurir lokal Indonesia)

   FAKTA PRODUK yang menjadikan modal ini ada: kartu STOK HOSHI disimpan FISIK oleh Hoshi di
   Indonesia — TIDAK dititipkan di vault CollectorCrypt. Jadi pengirimannya paket domestik biasa:

     NOL NFT · NOL burn · NOL USDC treasury · NOL CollectorCrypt · NOL tanda tangan wallet

   ┌──── KENAPA INI FILE TERPISAH DARI ShippingFlowModal, BUKAN CABANG DI DALAMNYA ─────────────┐
   │ ShippingFlowModal mengurus jalur CC Vault, dan seluruh kerumitannya berasal dari SATU       │
   │ kelas bahaya: "USDC treasury sudah pindah, burn-nya gagal, dan kami tidak tahu apakah       │
   │ kartunya terkirim". Dari sana lahir sesi SIWS CC, re-prepare, hash set transaksi, stage     │
   │ FUNDED/POST_FUND, dan aturan "jangan refund kalau refundSafe=false".                        │
   │                                                                                             │
   │ Di jalur domestik kelas bahaya itu TIDAK ADA — tidak ada USDC dan tidak ada burn. Satu-      │
   │ satunya uang yang bergerak adalah ongkir Rupiah, dan ongkir itu SELALU aman di-refund.      │
   │ Menempelkan jalur ini sebagai cabang di dalam modal CC akan membuat dua kosakata uang hidup │
   │ di satu state machine — dan cara paling mudah untuk akhirnya menampilkan kalimat "uangmu    │
   │ tidak bisa dikembalikan" kepada orang yang cuma membayar ongkir kurir.                      │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   ALURNYA (pendek, dan memang harus pendek):
     1. tampilkan ongkir yang dihitung server  (GET /redemptions/:id/domestic-quote — nol uang)
     2. "Bayar ongkir"                          (POST /payments/shipping/domestic → paymentUrl IDRX)
     3. user dibawa ke halaman bayar IDRX; sepulangnya modal ini dibuka ulang dalam mode `resume`
     4. poll order sampai FULFILLED → baris redemption pindah ke PACKING oleh backend
     5. selesai dari sisi user. Hoshi kemas → kirim → resi muncul di daftar pengiriman.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  createDomesticShippingOrder,
  getDomesticShippingQuote,
  getMyRedemptions,
  getPaymentOrder,
  isTerminalPaymentStatus,
  type CardRedemption,
  type DomesticShippingQuote,
  type PaymentStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { GOLD } from "@/components/account/ui";
import { formatIdr } from "@/components/packs/ui";
import { STATUS_LABEL } from "@/components/packs/ShippingFlowModal";

/* ───────────────────────── sesi tertunda (sepulang dari halaman bayar) ─────────────────────────
   KUNCI TERPISAH dari `hoshi_pending_ship` milik jalur CC — DENGAN SENGAJA. Dua rail punya alur
   lanjutan yang berbeda (yang ini berhenti setelah bayar; yang itu lanjut ke tanda tangan wallet),
   jadi satu kunci bersama akan membuat /withdraw membuka modal YANG SALAH untuk baris yang salah:
   user stok Hoshi diminta menandatangani burn yang tidak ada, atau user CC dibiarkan berpikir
   pengirimannya sudah beres padahal belum ditandatangani. */
const PENDING_KEY = "hoshi_pending_domestic_ship";

export type PendingDomesticShip = {
  merchantOrderId: string;
  redemptionId: string;
};

export function savePendingDomesticShip(
  merchantOrderId: string,
  redemptionId: string,
): void {
  try {
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ merchantOrderId, redemptionId }),
    );
  } catch {
    /* private mode / storage penuh — callback + reconciler backend tetap memajukan barisnya */
  }
}

export function clearPendingDomesticShip(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function readPendingDomesticShip(): PendingDomesticShip | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingDomesticShip>;
    return parsed?.redemptionId
      ? {
          merchantOrderId: parsed.merchantOrderId ?? "",
          redemptionId: parsed.redemptionId,
        }
      : null;
  } catch {
    return null;
  }
}

/** Status kirim DOMESTIK yang berarti "urusan user sudah selesai, tinggal Hoshi mengirim". */
export const isDomesticDoneStatus = (s: CardRedemption["status"]): boolean =>
  s === "PACKING" || s === "SHIPPED" || s === "DELIVERED";

/**
 * Status DOMESTIK yang masih MENUNGGU USER: ongkirnya belum lunas.
 *
 * Cuma dua, dan itu seluruh jalur uang rail ini — sesudah ongkir lunas backend memindahkan
 * barisnya ke PACKING sendiri dan tidak ada langkah user yang tersisa. Bandingkan dengan rail CC,
 * yang masih punya READY_TO_FUND/FUNDED (tanda tangan wallet) SESUDAH ongkirnya lunas: dua daftar
 * ini SENGAJA tidak dibagi, karena menyamakannya akan menyuruh pembeli stok Hoshi menandatangani
 * burn yang tidak ada.
 */
export const isDomesticActionableStatus = (s: CardRedemption["status"]): boolean =>
  s === "REQUESTED" || s === "AWAITING_PAYMENT";

/**
 * Status DOMESTIK yang masih hidup (belum terminal) — dipakai daftar "Pengiriman berjalan".
 *
 * CANCELED dan status jalur CC sengaja TIDAK di sini. DELIVERED ikut supaya resi/riwayat terakhir
 * masih bisa dilihat sebentar setelah paketnya sampai.
 */
export const isDomesticOngoingStatus = (s: CardRedemption["status"]): boolean =>
  isDomesticActionableStatus(s) || isDomesticDoneStatus(s);

/* ───────────────────────────────────── modal ───────────────────────────────────── */

const POLL_MS = 4_000;
/** Berhenti poll setelah ~4 menit. Backend tetap menuntaskannya lewat callback + reconciler. */
const POLL_MAX = 60;

type Phase =
  | "quote" // menampilkan ongkir, menunggu user menekan bayar
  | "creating" // menerbitkan invoice
  | "awaiting" // invoice terbit / kembali dari halaman bayar → poll
  | "done" // ongkir lunas, baris sudah di PACKING (atau lebih maju)
  | "stalled" // poll berhenti tanpa hasil terminal — bukan kegagalan, cuma belum kelihatan
  | "failed"; // invoice kedaluwarsa / gagal

export default function DomesticShipModal({
  redemptionId,
  cardName,
  resume = false,
  onFinished,
  onClose,
}: {
  redemptionId: string;
  cardName?: string | null;
  /** true = dibuka sepulang dari halaman bayar: langsung poll, jangan tampilkan tombol bayar. */
  resume?: boolean;
  /** Dipanggil saat ongkirnya lunas — parent memuat ulang daftar/koleksinya. */
  onFinished?: () => void;
  onClose: () => void;
}) {
  const { token, login } = useAuth();
  const [phase, setPhase] = useState<Phase>(resume ? "awaiting" : "quote");
  const [quote, setQuote] = useState<DomesticShippingQuote | null>(null);
  const [paidIdr, setPaidIdr] = useState<number | null>(null);
  const [redStatus, setRedStatus] = useState<CardRedemption["status"] | null>(
    null,
  );
  const [orderStatus, setOrderStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const auth = useCallback(async () => token ?? (await login()), [token, login]);

  /* 1. Ongkir dari server. READ-ONLY: nol uang, nol order. */
  useEffect(() => {
    if (resume) return;
    let alive = true;
    (async () => {
      try {
        const t = await auth();
        const q = await getDomesticShippingQuote(redemptionId, t);
        if (alive) setQuote(q);
      } catch (e) {
        if (alive) {
          setError(
            e instanceof Error ? e.message : "Ongkir belum bisa dihitung.",
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [resume, redemptionId, auth]);

  /* 2. Terbitkan invoice → bawa user ke halaman bayar IDRX. */
  const pay = useCallback(async () => {
    if (phase === "creating") return;
    setPhase("creating");
    setError(null);
    try {
      const t = await auth();
      const order = await createDomesticShippingOrder(redemptionId, t);
      setPaidIdr(order.priceIdr);
      savePendingDomesticShip(order.merchantOrderId, redemptionId);
      if (order.paymentUrl) {
        // Halaman bayar IDRX hosted. returnUrl-nya dibangun BACKEND dan menunjuk ke /withdraw,
        // jadi halaman itulah yang me-resume modal ini (readPendingDomesticShip).
        window.location.href = order.paymentUrl;
        return;
      }
      // Tanpa paymentUrl (mis. mock IDRX): tidak ada yang bisa dibuka — poll saja di tempat.
      setPhase("awaiting");
    } catch (e) {
      setPhase("quote");
      setError(e instanceof Error ? e.message : "Gagal menerbitkan tagihan ongkir.");
    }
  }, [phase, auth, redemptionId]);

  /* 3. Poll sampai ongkirnya lunas.

        Yang diperiksa adalah BARIS REDEMPTION (bukan cuma status order): pelunasan ongkir
        memindahkannya ke PACKING di backend, dan PACKING itulah fakta yang berarti "Hoshi sudah
        menerima perintah kirim". Status order dipakai sebagai keterangan tambahan supaya invoice
        yang kedaluwarsa bisa dibedakan dari "masih diproses". */
  useEffect(() => {
    if (phase !== "awaiting") return;
    let alive = true;
    let tries = 0;
    const pending = readPendingDomesticShip();
    const tick = async () => {
      if (!alive) return;
      tries += 1;
      try {
        const t = await auth();
        const rows = await getMyRedemptions(t);
        const row = rows.find((r) => r.id === redemptionId);
        if (row && alive) {
          setRedStatus(row.status);
          if (isDomesticDoneStatus(row.status)) {
            setPhase("done");
            clearPendingDomesticShip();
            onFinished?.();
            return;
          }
          if (row.status === "CANCELED") {
            setPhase("failed");
            setError(
              "Permintaan kirim ini sudah dibatalkan. Kalau ongkirnya sudah kamu bayar, " +
                "pembayaran itu tetap TERCATAT sebagai utang refund — hubungi support dengan " +
                "menyebut id permintaan ini.",
            );
            clearPendingDomesticShip();
            return;
          }
        }
        if (pending?.merchantOrderId) {
          const order = await getPaymentOrder(pending.merchantOrderId, t);
          if (!alive) return;
          setOrderStatus(order.status);
          setPaidIdr(order.priceIdr);
          if (
            isTerminalPaymentStatus(order.status) &&
            order.status !== "FULFILLED"
          ) {
            // EXPIRED / FAILED / REFUND_DUE. Barisnya sendiri NOL uang di titik ini; backend
            // melepas klaimnya balik ke REQUESTED (sapuan kedaluwarsa), jadi user boleh minta
            // tagihan baru — dan kalau Rupiah-nya benar-benar mendarat, ia tercatat sebagai utang.
            setPhase("failed");
            setError(
              order.status === "EXPIRED"
                ? "Tagihan ongkirnya kedaluwarsa sebelum dibayar. Tidak ada uang yang terpotong — " +
                  "kamu bisa meminta pengiriman lagi."
                : "Pembayaran ongkir tidak selesai. Kalau uangnya sudah terpotong, pembayaran itu " +
                  "TERCATAT sebagai utang refund pada tagihannya sendiri — hubungi support.",
            );
            clearPendingDomesticShip();
            return;
          }
        }
      } catch {
        /* blip jaringan — biarkan poll berikutnya mencoba lagi */
      }
      if (!alive) return;
      if (tries >= POLL_MAX) {
        setPhase("stalled");
        return;
      }
      window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [phase, redemptionId, auth, onFinished]);

  const ongkir = paidIdr ?? quote?.priceIdr ?? null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kirim kartu stok Hoshi ke rumah"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white">
              Kirim ke rumah
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              {cardName ?? "Kartu stok Hoshi"} · kurir domestik
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Kalimat ini bukan hiasan: ia yang membedakan alur ini dari alur CollectorCrypt di mata
            user. Tidak ada tanda tangan wallet, tidak ada NFT yang dibakar, dan satu-satunya uang
            yang bergerak adalah ongkirnya. */}
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-[12px] leading-relaxed text-emerald-200">
          Kartu ini <span className="font-semibold">ada di gudang Hoshi di Indonesia</span>, jadi
          pengirimannya paket biasa lewat kurir lokal. Kamu hanya membayar ongkir — tidak ada NFT
          yang dibakar, tidak ada tanda tangan wallet, dan tidak ada langkah on-chain sama sekali.
        </div>

        {phase === "quote" && (
          <>
            {/* Ongkirnya BERTINGKAT PER WILAYAH, jadi satu angka telanjang tidak cukup: user
                yang membandingkan dengan temannya di pulau lain akan melihat dua angka berbeda
                untuk kartu yang sama. Menyebut TIER-nya membuat perbedaan itu masuk akal alih-alih
                terlihat seperti harga yang dikarang. Labelnya dari SERVER (baris tarif), bukan
                disimpulkan di sini — kalau tidak, menambah tier di dashboard akan butuh deploy
                frontend. */}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-zinc-400">Ongkir</span>
                <span className="text-[19px] font-bold tabular-nums text-white">
                  {ongkir == null ? "…" : `Rp ${formatIdr(ongkir)}`}
                </span>
              </div>
              {quote?.label && (
                <p className="mt-1 text-right text-[11px] text-zinc-500">
                  Tarif wilayah: {quote.label}
                </p>
              )}
              {/* Provinsi tak terpetakan → tarif PENAMPUNG (yang lebih mahal). Dikatakan apa
                  adanya: menyembunyikannya berarti menagih lebih tanpa alasan yang bisa dilihat,
                  dan user yang merasa kemahalan tidak punya kata kunci untuk bertanya. */}
              {quote?.regionUnresolved === true && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-300/80">
                  Kami belum mengenali provinsi pada alamat tujuanmu, jadi ongkirnya memakai tarif
                  umum yang lebih tinggi. Kalau menurutmu ini kemahalan, hubungi kami dengan
                  menyebut kota tujuanmu — jangan bayar dulu.
                </p>
              )}
            </div>
            {error && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={pay}
              disabled={ongkir == null}
              className="mt-5 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: GOLD }}
            >
              Bayar ongkir →
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
              Kalau pembayarannya tidak selesai, tidak ada yang berubah — kartunya tetap milikmu dan
              kamu bisa meminta pengiriman lagi.
            </p>
          </>
        )}

        {(phase === "creating" || phase === "awaiting") && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
            <p className="text-[14px] font-semibold text-white">
              {phase === "creating"
                ? "Menerbitkan tagihan ongkir…"
                : "Mengonfirmasi pembayaran ongkir…"}
            </p>
            <p className="max-w-[22rem] text-[12px] leading-relaxed text-zinc-400">
              {phase === "creating"
                ? "Sebentar — kamu akan diarahkan ke halaman pembayaran."
                : "Kamu boleh menutup halaman ini. Begitu pembayarannya masuk, permintaan kirimmu " +
                  "lanjut sendiri — pengemasan tidak menunggu halaman ini tetap terbuka."}
            </p>
            {(redStatus || orderStatus) && (
              <p className="text-[11px] text-zinc-500">
                Status: {redStatus ? STATUS_LABEL[redStatus] : orderStatus}
              </p>
            )}
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col items-center gap-3 py-5 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              📦
            </div>
            <p className="text-base font-semibold text-white">Ongkir diterima!</p>
            <p className="max-w-[22rem] text-[13px] leading-relaxed text-zinc-400">
              Kartunya sedang dikemas dan akan dikirim ke alamatmu. Nomor resinya muncul di daftar
              pengiriman begitu paketnya diserahkan ke kurir.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD }}
            >
              Selesai
            </button>
          </div>
        )}

        {phase === "stalled" && (
          <div className="py-4">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
              Pembayarannya belum terlihat masuk sampai sekarang. Ini <b>bukan</b> berarti gagal:
              konfirmasi dari gateway bisa datang terlambat, dan permintaan kirimmu akan lanjut
              sendiri begitu itu terjadi. Cek lagi daftar pengirimanmu beberapa menit lagi.
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
            >
              Tutup
            </button>
          </div>
        )}

        {phase === "failed" && (
          <div className="py-4">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
              {error ?? "Pembayaran ongkir tidak selesai."}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
