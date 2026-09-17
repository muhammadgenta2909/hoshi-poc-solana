"use client";

// Kirim kartu fisik ke rumah — alur REAL end-to-end untuk SATU redemption (1 kartu per
// pengiriman untuk potongan pertama). Dipakai hanya saat CC_SHIPPING_ENABLED; kalau OFF, halaman
// /withdraw tetap record-only dan modal ini tak pernah dimuat.
//
// Tahap: hitung ongkir (estimate) → bayar ongkir (order IDRX hosted, redirect+resume) → tanda
// tangani pengiriman (fund-and-prepare → TTD tiap tx pakai useSignSerializedTransaction → submit
// burn) → lacak (poll status + trackingUrls). Redirect/resume-nya meniru pola PayWithRupiah &
// deposit: sebelum ke halaman bayar kita simpan {merchantOrderId, redemptionId} di localStorage
// dengan KEY SENDIRI (hoshi_pending_ship) supaya tak bentrok dengan resume pack/listing/top-up;
// sepulang dari halaman bayar, /withdraw membaca key itu lalu membuka modal ini dalam mode resume.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ApiError,
  cancelRedemption,
  createShippingOrder,
  estimateRedemption,
  fundAndPrepareRedemption,
  getMyRedemptions,
  getRedemptionStatus,
  reprepareRedemptionBurn,
  submitRedemptionBurn,
  type CardRedemption,
  type PaymentStatus,
  type RedemptionEstimate,
  type RedemptionStatus,
  type ShippingRefundDebt,
} from "@/lib/api";
import { CcSessionRequiredError } from "@/lib/ccShippingAuth";
import { useAuth } from "@/lib/useAuth";
import { useSignSerializedTransaction } from "@/lib/useSignSerializedTransaction";
import {
  SUPPORT_MENU_LABEL,
  shippingSupportDraft,
  supportComposeHref,
} from "@/lib/supportLink";
import { GOLD_GRADIENT, Img } from "./ui";

const POLL_MS = 4_000;
/** Backoff: tiap kegagalan BERUNTUN menggandakan jeda sampai batas ini. Poller yang menghantam
 *  backend/CC tiap 4 detik selamanya itu yang bikin rate-limit (429) dan wallet-prompt storm. */
const POLL_MAX_MS = 60_000;
/** Setelah sekian kegagalan beruntun: BERHENTI dan tampilkan masalahnya + tombol coba lagi
 *  (bukan `catch {}` diam-diam yang membuat modal terlihat "loading" selamanya). */
const MAX_POLL_FAILS = 5;
/** Jeda verifikasi ulang tahap `resign` (lihat effect-nya). Lebih longgar dari POLL_MS: ini
 *  sekadar menjaga agar klaim "kartumu masih aman" tidak pernah basi, bukan melacak pengiriman. */
const RESIGN_VERIFY_MS = 15_000;
/**
 * Umur maksimum klaim "barusan kami cek ke server: kartunya masih aman di vault".
 *
 * Buktinya disimpan sebagai STEMPEL WAKTU, bukan bendera sekali-nyala: klaim itu bicara soal
 * SEKARANG, jadi ia harus kedaluwarsa sendiri kalau buktinya berhenti diperbarui. Satu-dua
 * pembacaan yang gagal (jaringan kedip) sengaja TIDAK langsung menghapus kalimatnya — bacaan 15-30
 * detik lalu memang masih pantas disebut "barusan" — tapi koneksi yang benar-benar putus membuat
 * klaimnya luruh sendiri ke kalimat netral. Nilainya sengaja lebih dari 2 x RESIGN_VERIFY_MS
 * supaya toleransinya nyata, bukan sekadar satu siklus.
 */
const RESIGN_CLAIM_TTL_MS = 40_000;
const idr = new Intl.NumberFormat("id-ID");

/* -------- resume across the hosted-payment redirect (own key, no collision) -------- */

const PENDING_SHIP_KEY = "hoshi_pending_ship";

export function savePendingShip(merchantOrderId: string, redemptionId: string): void {
  try {
    localStorage.setItem(PENDING_SHIP_KEY, JSON.stringify({ merchantOrderId, redemptionId }));
  } catch {
    /* private mode / storage full — callback + reconciler still advance the redemption */
  }
}

export function clearPendingShip(): void {
  try {
    localStorage.removeItem(PENDING_SHIP_KEY);
  } catch {
    /* ignore */
  }
}

export function readPendingShip(): { merchantOrderId: string; redemptionId: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_SHIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { merchantOrderId?: string; redemptionId?: string };
    return parsed?.redemptionId
      ? { merchantOrderId: parsed.merchantOrderId ?? "", redemptionId: parsed.redemptionId }
      : null;
  } catch {
    return null;
  }
}

/* ----------------------------- status copy (Indonesian) ---------------------------- */

export const STATUS_LABEL: Record<RedemptionStatus, string> = {
  REQUESTED: "Menunggu ongkir",
  AWAITING_PAYMENT: "Menunggu pembayaran ongkir",
  READY_TO_FUND: "Siap ditandatangani",
  FUNDING: "Menyiapkan pengiriman",
  // FUNDED = ongkirnya SUDAH dibayarkan ke wallet user (uang sudah berpindah, tidak ada refund
  // otomatis) tapi transaksi burn-nya BELUM ditandatangani. Jadi ini BUKAN "sedang dikirim":
  // kartunya masih utuh dan yang kurang cuma satu tanda tangan dari user.
  FUNDED: "Menunggu tanda tanganmu",
  BURN_SUBMITTED: "Diproses CollectorCrypt",
  IN_TRANSIT: "Dalam perjalanan",
  DELIVERED: "Terkirim",
  PACKING: "Sedang dikemas",
  SHIPPED: "Dikirim",
  CANCELED: "Dibatalkan",
  REFUND_DUE: "Refund diproses",
  RECLAIM_DUE: "Perlu ditinjau",
  SHIP_FAILED_POST_BURN: "Perlu bantuan tim",
};

/** Status yang butuh AKSI user (bayar / tanda tangan) vs yang tinggal dilacak. */
export const isActionableShipStatus = (s: RedemptionStatus): boolean =>
  s === "REQUESTED" || s === "AWAITING_PAYMENT" || s === "READY_TO_FUND";

/**
 * FUNDED = "uangnya SUDAH berpindah, tanda tangannya belum". Statusnya sendiri, bukan tracking:
 * treasury sudah mengirim USDC ongkir ke wallet user (refundSafe=false, tidak ada refund otomatis)
 * tetapi burn-nya belum ditandatangani — satu prompt wallet yang ditolak/kedaluwarsa sudah cukup
 * untuk mendarat di sini. Pemulihannya WAJIB lewat POST /redemptions/:id/re-prepare (terbitkan
 * ulang transaksi, NOL dana berpindah); fund-and-prepare akan ditolak 400 di status ini.
 */
export const isResignShipStatus = (s: RedemptionStatus): boolean => s === "FUNDED";

/**
 * Status yang boleh dibatalkan SENDIRI oleh user (POST /redemptions/:id/cancel).
 *
 * DISALIN dari USER_CANCELABLE_STATUSES di backend (redemption.service.ts) — daftarnya pendek
 * DENGAN SENGAJA: batal-sendiri hanya sah selama NOL uang bergerak. READY_TO_FUND berarti ongkir
 * Rupiah SUDAH lunas, FUNDED ke atas berarti USDC treasury sudah/mungkin pindah; keduanya
 * keputusan uang dan jalan keluarnya lewat admin, bukan tombol user.
 *
 * Ini cuma untuk MENAMPILKAN tombolnya. Keputusan sebenarnya tetap di backend, yang juga memagari
 * order ongkir yang sudah mendarat, `fundingSignature`, dan `refundSafe` — hal-hal yang tidak
 * kelihatan dari status saja. Jadi jangan pernah menyimpulkan "pasti bisa dibatalkan" dari sini.
 */
export const isUserCancelableShipStatus = (s: RedemptionStatus): boolean =>
  s === "REQUESTED" || s === "AWAITING_PAYMENT";

/** Status yang sudah "jalan" (dana/burn/kirim) — modal masuk mode lacak. FUNDED SENGAJA tidak di
 *  sini: itu status yang masih butuh tanda tangan user (lihat isResignShipStatus). */
export const isTrackingShipStatus = (s: RedemptionStatus): boolean =>
  s === "FUNDING" ||
  s === "BURN_SUBMITTED" ||
  s === "IN_TRANSIT" ||
  s === "DELIVERED" ||
  s === "PACKING" ||
  s === "SHIPPED" ||
  s === "REFUND_DUE" ||
  s === "RECLAIM_DUE" ||
  s === "SHIP_FAILED_POST_BURN";

/* ------------------- PEMBATALAN: apa yang boleh dikatakan, dan apa yang WAJIB ditampilkan -------
 *
 * KENAPA BLOK INI DIEKSPOR. Tombol batal hidup di DUA layar (modal ini + daftar di /withdraw), dan
 * dua-duanya dulu menulis kalimat yang sama-sama SALAH: "belum ada ongkir yang kami terima untuk
 * permintaan ini, jadi tidak ada yang perlu direfund". Kalimat itu menyalin premis backend yang
 * SUDAH TIDAK BERLAKU. CANCEL_BLOCKING_ORDER_STATUSES sekarang cuma [PAID, FULFILLED]: tagihan
 * ongkir yang macet di FULFILLING atau sudah REFUND_DUE TIDAK memblokir pembatalan — ia BERHASIL,
 * dan Rupiah yang sudah mendarat berubah jadi utang refund yang tercatat di tagihannya sendiri.
 * Jadi tepat pada baris yang uangnya SUDAH masuk, layar lama memberi tahu user bahwa uang itu
 * tidak ada. Satu kalimat, dan utang refund itu tidak akan pernah ditagih.
 *
 * ATURANNYA, untuk siapa pun yang menyentuh copy ini lagi:
 *   - Klien TIDAK BISA tahu posisi ongkirnya. Status baris di daftar dibaca saat mount (bisa
 *     berjam-jam basi), dan status redemption memang TIDAK memuat posisi tagihan ongkirnya.
 *   - Karena itu copy pra-konfirmasi tidak boleh mengklaim ARAH MANA PUN. Bukan "tidak ada yang
 *     perlu direfund", dan bukan juga "uangmu akan direfund" — tidak ada refund otomatis di jalur
 *     ini; yang ada cuma utang yang DICATAT untuk diselesaikan tim.
 *   - Fakta barunya baru ada SESUDAH backend menjawab. Jawabannya (`warning` + `shippingDebts`)
 *     WAJIB ditampilkan, persisten dan bisa disalin — bukan toast yang lewat.
 */

/** Copy pra-konfirmasi, SATU sumber untuk kedua layar. Tidak mengklaim posisi uang mana pun. */
export const CANCEL_CONFIRM_FREED =
  "Permintaan kirim ini akan ditutup dan kartunya kembali bebas — kamu bisa memintanya dikirim " +
  "lagi kapan saja.";

/** Kalimat ongkirnya. JUJUR di bawah ketidakpastian: dari sini kami memang tidak tahu. */
export const CANCEL_CONFIRM_MONEY =
  "Soal ongkirnya: posisi pembayaran tidak bisa kami pastikan dari layar ini. Kalau ongkirnya " +
  "belum pernah dibayar, tidak ada uang yang terlibat sama sekali. Kalau ternyata sudah masuk, " +
  "pembatalannya bisa ditolak — atau tetap diproses, dan Rupiah yang sudah masuk kami catat " +
  "sebagai utang refund pada tagihannya sendiri untuk diselesaikan tim (tidak kembali otomatis). " +
  "Hasilnya kami tampilkan lengkap begitu pembatalannya selesai.";

/** Label manusiawi untuk status tagihan ongkir yang muncul di `shippingDebts`. */
const DEBT_STATUS_LABEL: Partial<Record<PaymentStatus, string>> = {
  PAID: "Pembayaran sudah masuk, masih diproses",
  FULFILLING: "Sedang diproses",
  FULFILLED: "Tercatat sudah dilayani",
  REFUND_DUE: "Tercatat sebagai utang refund",
};

/**
 * Terjemahan satu baris utang ke bahasa USER. `operatorAction` dari backend SENGAJA tidak dipakai:
 * isinya instruksi internal ("KEMBALIKAN Rupiah ongkir ini ke user") yang kalau ditampilkan mentah
 * terbaca sebagai janji refund otomatis — dan jalur ini tidak punya refund otomatis.
 */
function debtUserNote(d: ShippingRefundDebt): string {
  if (!d.refundSafe) {
    return "Tagihan ini ditandai perlu diperiksa dulu sebelum apa pun dikembalikan. Tunjukkan nomornya ke tim.";
  }
  if (d.statusAfter === "REFUND_DUE") {
    return d.recordedNow
      ? "Baru saja kami catat sebagai utang refund. Uangnya BELUM kembali — tim yang memprosesnya, dan nomor tagihan ini rujukanmu."
      : "Sudah tercatat sebagai utang refund sebelumnya. Uangnya belum kembali; tunjukkan nomor ini ke tim untuk menindaklanjuti.";
  }
  if (d.statusAfter === "PAID") {
    return "Pembayaran ini masih diproses sistem kami dan statusnya bisa berubah sendiri dalam beberapa menit. Kalau tidak berubah, hubungi tim dengan nomor ini.";
  }
  if (d.statusAfter === "FULFILLED") {
    return "Tagihan ini tercatat sudah dilayani padahal permintaannya dibatalkan. Perlu diperiksa tim — jangan diabaikan.";
  }
  return "Perlu diperiksa tim. Simpan nomor tagihannya.";
}

/** Nomor tagihan: bisa diblok, bisa disalin. Ini satu-satunya rujukan user ke uangnya. */
function CopyableRef({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <code className="select-all break-all rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">
        {value}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            ?.writeText(value)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {
              /* Clipboard ditolak browser: nomornya tetap bisa diblok manual (select-all). */
            });
        }}
        className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/10"
      >
        {copied ? "Tersalin" : "Salin"}
      </button>
    </span>
  );
}

/**
 * PENGUNGKAPAN UANG sesudah pembatalan berhasil — dipakai kedua layar, persis sama.
 *
 * `warning` ditulis backend dan ditampilkan APA ADANYA. `debts` adalah daftar tagihan ongkir yang
 * terdampak; kalau kosong, blok utangnya tidak dirender sama sekali (tidak ada gunanya menakuti
 * user dengan uang yang memang tidak ada) — tapi kalau berisi, ia harus bertahan di layar sampai
 * user menutupnya sendiri.
 */
export function ShippingCancelDisclosure({
  redemptionId,
  warning,
  debts,
}: {
  redemptionId: string;
  warning: string | null;
  debts: ShippingRefundDebt[];
}) {
  const refs = debts.map((d) => d.merchantOrderId).join(", ");
  return (
    <div className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left">
      {warning && <p className="text-[12px] leading-relaxed text-zinc-300">{warning}</p>}

      {debts.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-2">
          <p className="text-[12px] font-semibold text-amber-200">
            Ada ongkir yang tertahan di tagihan ini
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-amber-100/80">
            Membatalkan permintaan kirim tidak menutup tagihan ongkirnya. Uangnya tidak kembali
            otomatis — simpan nomor tagihan di bawah dan tunjukkan ke tim untuk menindaklanjuti.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {debts.map((d) => (
              <li
                key={d.merchantOrderId}
                className="rounded-md border border-white/10 bg-black/20 px-2.5 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-zinc-100">
                    Rp {idr.format(d.priceIdr)}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {DEBT_STATUS_LABEL[d.statusAfter] ?? d.statusAfter}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{debtUserNote(d)}</p>
                <CopyableRef value={d.merchantOrderId} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={supportComposeHref(
          shippingSupportDraft(
            redemptionId,
            debts.length > 0
              ? `Permintaan kirim ini kubatalkan dan ada ongkir yang tertahan. Nomor tagihan: ${refs}.`
              : "Permintaan kirim ini kubatalkan, tapi ongkirnya terlanjur kubayar.",
          ),
        )}
        className="mt-2 block w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-center text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
      >
        {debts.length > 0
          ? `Tindak lanjuti lewat ${SUPPORT_MENU_LABEL} →`
          : `Sudah terlanjur bayar? Hubungi tim lewat ${SUPPORT_MENU_LABEL} →`}
      </Link>
    </div>
  );
}


/* ------------------- klasifikasi kegagalan tahap tanda tangan (MONEY) -------------------
 *
 * Layar error tahap TTD TIDAK BOLEH menyimpulkan apa pun dari boolean lokal. `moneyMoved` cuma
 * tahu "prepare pernah balik sukses"; ia tidak tahu apakah submit-burn sempat dikirim, apakah CC
 * sempat membakar, atau apakah ada tab lain yang mengambil alih baris ini. Maka keputusan layar
 * error selalu dua langkah: verdict backend (kalau ada) sebagai PETUNJUK, lalu BACA ULANG status
 * baris sebagai FAKTA yang memutuskan (lihat resolveSignFailure).
 *
 * KONTRAK BACKEND yang dipakai di sini — DISALIN dari implementasinya, bukan ditebak
 * (hoshi-backend/src/collectorcrypt/cc-shipping.errors.ts + cc-shipping.service.ts). Setiap
 * kegagalan jalur kirim fisik keluar dengan body BERBENTUK TETAP:
 *
 *     { statusCode, error, code, message, stage, retryable, redemptionId? }
 *
 * `stage` = DI MANA UANGNYA saat error terbit, dan backend menyebutnya sendiri sebagai field yang
 * WAJIB dipakai UI untuk bercabang — BUKAN teks pesan, BUKAN status HTTP saja. Karena itu SUMBER
 * CABANG UTAMA di sini adalah `stage`, bukan daftar `code`: kode BARU yang belum dikenal file ini
 * tetap membawa stage yang benar, jadi ia tidak pernah jatuh diam-diam ke cabang "aman".
 *
 *   • NO_EFFECT  — permintaan INI ditolak tanpa menyentuh state apa pun. SENGAJA tidak menyatakan
 *                  apa-apa soal posisi uang baris-nya (helper-nya dipakai jalur pra-danai DAN
 *                  pasca-danai) → di sini dipetakan ke `null`: tidak ada verdict, baca ulang saja.
 *   • PRE_FUND   — NOL USDC treasury pernah bergerak untuk baris ini. Aman diulang dari awal.
 *   • FUNDED     — USDC ongkir SUDAH di wallet user (refundSafe=false) TAPI barisnya TERBUKTI
 *                  duduk di FUNDED dan CC TIDAK PERNAH membakar. Boleh re-prepare + TTD lagi.
 *   • POST_FUND  — uang sudah/mungkin pindah DAN nasib kartu TIDAK diketahui. Butuh manusia.
 *   • UNKNOWN    — tidak bisa dipastikan. Default FAIL-CLOSED; diperlakukan seperti POST_FUND.
 *
 * `retryable` diturunkan dari `stage` DI BACKEND (retryableFor()), jadi tidak bisa dilebih-lebihkan
 * di sana. Di sini ia dipakai sebagai PAGAR SATU ARAH: `retryable:false` melarang verdict
 * "preFund"/"retryable"/"staleSession", apa pun kode & status HTTP-nya.
 *
 * Kelas error yang menghasilkannya, dengan status HTTP-nya yang sekarang:
 *
 *   • `ShippingBurnRetryableError extends ConflictException`      →  HTTP 409, stage FUNDED
 *     code `SHIPPING_BURN_RETRYABLE`. HANYA dua kondisi yang DOKUMEN CC JAMIN nol kartu terbakar:
 *     403 "Transaction was not issued by this server" (batch 15 menit kedaluwarsa) dan 409 yang
 *     membawa kunci `delistErrors` ("Nothing was burned"). Backend MELEPAS klaimnya balik ke
 *     FUNDED dan memverifikasi pelepasan itu (updateMany count === 1) sebelum memakai kelas ini.
 *     DUA 403 CC yang LAIN ("not the complete set", "not issued for this shipment") TIDAK punya
 *     jaminan itu dan backend SENGAJA melemparnya sebagai ShippingPostFundError — jangan pernah
 *     menaikkan keduanya jadi "aman" di sini.
 *
 *   • `ShippingBurnRetryableError` dgn code `SHIPPING_BURN_STALE_SESSION` → HTTP 409, stage FUNDED
 *     Set transaksi yang ditandatangani BUKAN set terakhir yang backend terbitkan (dua tab / HP +
 *     desktop sama-sama re-prepare). Ditolak LOKAL sebelum klaim dan sebelum CC dipanggil: baris
 *     TIDAK PERNAH keluar dari FUNDED, refundSafe tidak disentuh, CC tidak pernah dihubungi.
 *
 *   • `ShippingPostFundError extends HttpException`               →  HTTP 422, stage POST_FUND
 *     code `SHIPPING_POST_FUND_INDETERMINATE` (burn indeterminate / fundUsdc indeterminate) atau
 *     `SHIPPING_BURN_LEG_FAILED` (CC balas 200 tapi ada leg yang tidak mendarat), dan
 *     `SHIPPING_BURN_RELEASE_FAILED` (stage UNKNOWN: nol terbakar, tapi baris gagal dilepas balik
 *     ke FUNDED → nyangkut di BURN_SUBMITTED). 422 dipilih SADAR: bukan 500 (proxy/SDK tidak akan
 *     mengulang requestnya sendiri) dan bukan 409 (yang sudah dipakai cabang aman-diulang).
 *
 *   • Klaim atomik FUNDED→BURN_SUBMITTED yang KALAH / status sudah bukan FUNDED
 *     → `BadRequestException` code `SHIPPING_BURN_ALREADY_SUBMITTED` → HTTP 400, stage UNKNOWN
 *     Ditolak SEBELUM apa pun dikirim ke CC, jadi request INI tidak menggerakkan apa pun — tapi
 *     ada sesi TTD lain yang memegang baris ini dan hasilnya tidak kita ketahui.
 *
 *   • Jaring pengaman `ShippingExceptionFilter` (src/common/shipping-exception.filter.ts) mencap
 *     sisanya `SHIPPING_UNCLASSIFIED` / `SHIPPING_UNEXPECTED`, keduanya stage UNKNOWN &
 *     retryable:false — sehingga tidak ada kegagalan yang bisa lolos tanpa verdict.
 */
type SignFailureKind =
  /** Nol dana berpindah (atau klaim sudah dilepas) — aman diulang dari awal. */
  | "preFund"
  /** Baris TERBACA kembali di FUNDED: tidak ada yang terbakar, tinggal TTD ulang. */
  | "retryable"
  /** Baris TERBUKTI di FUNDED, tapi ada sesi TTD LEBIH BARU untuk baris yang sama (dua tab).
   *  Nol terbakar, nol biaya tambahan — layar PULIH ke tahap tanda tangan, bukan buntu. */
  | "staleSession"
  /**
   * Ongkir CC naik melewati plafon slippage dari yang SUDAH didanai (SHIPPING_COST_EXCEEDS_FUNDED).
   * Backend menolak SEBELUM menerbitkan transaksi apa pun: nol dana tambahan, tidak ada klaim.
   * TERMINAL untuk user — mengulang tanda tangan TIDAK MUNGKIN berhasil, karena harga CC tidak
   * akan turun karena dicoba lagi. Tanpa verdict sendiri, error ini membawa stage FUNDED dan
   * karena itu jatuh ke "retryable" → tombol "Coba tanda tangani lagi" yang gagal selamanya.
   */
  | "costExceeded"
  /** Uang sudah/mungkin pindah dan nasib kartu TIDAK diketahui. Terminal: butuh manusia. */
  | "indeterminate"
  /** Sesi TTD lain sudah MENGAMBIL baris ini (klaim kalah); layar ini bukan lagi pemiliknya. */
  | "superseded";

/** Nilai `stage` backend — SALIN PERSIS dari SHIPPING_STAGE di cc-shipping.errors.ts. */
const STAGE_NO_EFFECT = "NO_EFFECT";
const STAGE_PRE_FUND = "PRE_FUND";
const STAGE_FUNDED = "FUNDED";
const STAGE_POST_FUND = "POST_FUND";
const STAGE_UNKNOWN = "UNKNOWN";

/**
 * Kode mesin backend → verdict. HANYA untuk kode yang butuh pembedaan LEBIH HALUS dari yang
 * dibawa `stage`-nya; sisanya sengaja TIDAK didaftarkan supaya jatuh ke pemetaan `stage` yang
 * otomatis benar untuk kode baru. Nilai string-nya DISALIN dari SHIPPING_ERROR_CODE
 * (hoshi-backend/src/collectorcrypt/cc-shipping.errors.ts) — jangan dikarang, jangan diubah.
 */
const BACKEND_CODE_VERDICT: ReadonlyMap<string, SignFailureKind> = new Map<
  string,
  SignFailureKind
>([
  // stage FUNDED (sama dgn SHIPPING_BURN_RETRYABLE) — bedanya cuma PENYEBAB & copy-nya: user
  // punya sesi TTD lebih baru di tempat lain. Layar ini tetap boleh melanjutkan (re-prepare).
  ["SHIPPING_BURN_STALE_SESSION", "staleSession"],
  // stage FUNDED juga — dan DI SITULAH masalahnya kalau tidak didaftarkan di sini: pemetaan
  // stage otomatis menjadikannya "retryable", yaitu tombol "Coba tanda tangani lagi" untuk
  // kegagalan yang TIDAK MUNGKIN sembuh dengan diulang (ongkir CC-nya yang naik; menandatangani
  // lagi tidak menurunkan harga). Backend sendiri menuliskannya: baris dibiarkan FUNDED, nol dana
  // tambahan, "Hubungi support untuk penyelesaian manual".
  ["SHIPPING_COST_EXCEEDS_FUNDED", "costExceeded"],
  // stage UNKNOWN. Tidak boleh jadi "indeterminate" polos: kami TAHU request ini ditolak SEBELUM
  // CC dihubungi dan ada sesi lain yang memegang barisnya, jadi layar yang jujur adalah "lacak
  // dari status server", bukan layar terminal "hubungi tim".
  ["SHIPPING_BURN_ALREADY_SUBMITTED", "superseded"],
]);

/** ShippingPostFundError. Dipakai HANYA sebagai cadangan kalau `stage` tak terbaca. */
const HTTP_POST_FUND = 422;

/**
 * PETUNJUK awal dari respons backend — bukan keputusan. `null` = backend tidak memberi verdict
 * (koneksi putus, respons hilang, timeout, sesi CC habis, atau stage NO_EFFECT yang memang tidak
 * menyatakan posisi uang). `null` TIDAK BERARTI AMAN — pemanggil tetap fail-closed.
 *
 * Urutannya: `code` (paling spesifik) → `stage` (kontrak utama) → status HTTP (cadangan terakhir,
 * hanya kalau backend versi lama tidak mengirim kontraknya sama sekali).
 *
 * `submitted` = permintaan submit-burn benar-benar sudah dikirim. Hanya dipakai untuk cadangan
 * status HTTP: tanpa kontrak, 400/409/422 dari estimate/prepare artinya beda total.
 */
function hintFromError(err: unknown, submitted: boolean): SignFailureKind | null {
  if (!(err instanceof ApiError)) return null;

  // PAGAR SATU ARAH: `retryable:false` dari backend tidak boleh dinaikkan jadi verdict yang
  // menawarkan pengulangan — berapa pun kode/stage/status-nya. Hanya boleh MENURUNKAN.
  const mayRetry = err.retryable !== false;
  const guard = (v: SignFailureKind | null): SignFailureKind | null => {
    if (!mayRetry && (v === "preFund" || v === "retryable" || v === "staleSession")) {
      return "indeterminate";
    }
    return v;
  };

  const coded = err.code ? BACKEND_CODE_VERDICT.get(err.code) : undefined;
  if (coded) {
    // PAGAR KEDUA (sabuk + bretel untuk `guard`, yang bergantung pada field `retryable`): kalau
    // backend memindahkan salah satu kode di atas ke POST_FUND/UNKNOWN, verdict yang MENAWARKAN
    // PENGULANGAN tidak boleh tetap hidup — bahkan kalau `retryable` hilang dari body.
    //
    // Daftarnya SAMA PERSIS dengan `guard` DENGAN SENGAJA: yang diturunkan hanya verdict yang
    // MELEBIHKAN KEAMANAN. "costExceeded" dan "superseded" TIDAK termasuk — keduanya sudah layar
    // terminal tanpa tombol ulangi, sekelas dengan indeterminate, dan keduanya memang HIDUP di
    // stage berat: SHIPPING_BURN_ALREADY_SUBMITTED lahir di UNKNOWN, dan backend sengaja memberi
    // SHIPPING_COST_EXCEEDS_FUNDED stage POST_FUND supaya `retryable` menjadi false (lihat
    // komentar B3 di cc-shipping.service.ts) — POST_FUND di situ berarti "butuh manusia", BUKAN
    // "nasib kartu tidak diketahui": barisnya justru DIBIARKAN FUNDED apa adanya. Menurunkannya
    // jadi "indeterminate" akan menampilkan layar yang isinya salah secara faktual ("tanda
    // tanganmu sudah dikirim, hasilnya tidak diketahui") untuk error yang JUSTRU menolak sebelum
    // apa pun dikirim.
    const overstatesSafety =
      coded === "preFund" || coded === "retryable" || coded === "staleSession";
    if (overstatesSafety && (err.stage === STAGE_POST_FUND || err.stage === STAGE_UNKNOWN)) {
      return "indeterminate";
    }
    return guard(coded);
  }

  // KODE YANG ARTINYA IKUT `stage` — tidak bisa masuk peta di atas, karena satu kode yang sama
  // dipakai untuk DUA keadaan uang yang berbeda.
  //
  // SHIPPING_COST_EXCEEDS_PAID dilempar dari dua jalur: dari fund-and-prepare ia PRE_FUND (nol
  // dana berpindah, ongkir Rupiah masih bisa di-refund) dan dari re-prepare ia POST_FUND (USDC
  // ongkir sudah di wallet user, jadi BUKAN kasus refund). Backend bahkan menulis KALIMAT PESAN
  // yang berbeda untuk keduanya, dan menyebut jalur pasca-danai ini sebagai keluarga yang sama
  // dengan COST_EXCEEDS_FUNDED (lihat catatan "DUA KELUARGA" pada SHIPPING_STAGE.POST_FUND):
  // hasil burn DIKETAHUI (nol terbakar) tapi mengulang TIDAK BISA menolong. Memetakannya mati ke
  // satu verdict pasti membohongi salah satu dari dua kasus itu.
  if (err.code === "SHIPPING_COST_EXCEEDS_PAID" && err.stage === STAGE_POST_FUND) {
    return "costExceeded";
  }

  switch (err.stage) {
    case STAGE_PRE_FUND:
      return guard("preFund");
    case STAGE_FUNDED:
      return guard("retryable");
    case STAGE_POST_FUND:
    case STAGE_UNKNOWN:
      // Fail-closed. UNKNOWN diperlakukan PERSIS seperti POST_FUND — itu perintah backend-nya.
      return "indeterminate";
    case STAGE_NO_EFFECT:
      // Request ini tidak menyentuh apa pun, TAPI itu tidak berkata apa-apa soal posisi uang baris
      // ini. Tidak ada verdict: biarkan baca-ulang status yang memutuskan.
      return null;
    default:
      break;
  }

  // Tidak ada kontrak sama sekali (backend lama / respons bukan JSON kontrak). Cadangan TERAKHIR,
  // dan hanya untuk kegagalan yang submit-nya benar-benar terkirim.
  if (!submitted) return null;
  if (err.status === HTTP_POST_FUND || err.status >= 500) return "indeterminate";
  return null;
}

/** User menolak/menutup prompt wallet — tidak ada apa pun yang terkirim. */
const isWalletRejection = (msg: string): boolean =>
  /reject|declin|denied|cancel|user rejected/i.test(msg);

type Stage =
  | "estimating"
  | "estimate"
  | "paying"
  | "confirming"
  | "awaitingPayment"
  | "readyToFund"
  /** FUNDED: ongkir sudah didanai, tinggal tanda tangan ULANG (re-prepare → TTD → submit). */
  | "resign"
  | "signing"
  | "submitting"
  | "tracking"
  /** Baris CANCELED — dibatalkan user lewat tombol di bawah, atau oleh admin. Tahap TENANG
   *  tersendiri, bukan layar error merah: membatalkan permintaan yang belum menyentuh uang adalah
   *  hasil yang NORMAL, bukan kegagalan. */
  | "canceled"
  /** Gagal saat TTD/submit → sedang MEMBACA ULANG status baris sebelum memutuskan layar apa
   *  yang jujur untuk ditampilkan. Tidak pernah jadi layar akhir. */
  | "errorChecking"
  | "error";

/**
 * TAHAP AWAL saat modal dibuka dalam mode resume, PER STATUS — EXHAUSTIVE.
 *
 * KENAPA HARUS TABEL, bukan satu ternary: versi lama cuma menangani FUNDED (`initialStatus ===
 * "FUNDED" ? "resign" : "confirming"`), jadi SEMUA status lain mendarat di layar hijau
 * "Mengonfirmasi pembayaran ongkir… Jangan tutup halaman ini". Biasanya poll pertama
 * membetulkannya — TAPI TIDAK DI TAB BARU, yang justru kasus normalnya: cache token CC hidup di
 * sessionStorage, jadi di tab baru `getRedemptionStatus` melempar CcSessionRequiredError, poller
 * berhenti SEBELUM sempat memanggil applyStatus, dan layarnya diam di "confirming". Hasilnya: user
 * membuka /withdraw besoknya, menekan "Lacak" pada baris BURN_SUBMITTED, dan diberi tahu bahwa
 * ongkirnya sedang dikonfirmasi — untuk kartu yang sudah terbakar dan sedang dikirim.
 *
 * `Record<RedemptionStatus, …>` DISENGAJA (bukan Partial, bukan default di switch): status baru
 * yang ditambahkan di lib/api.ts akan menjadi ERROR tsc di sini, bukan diam-diam jatuh ke layar
 * yang keliru-tapi-menenangkan. Isinya WAJIB sejalan dengan applyStatus() — itu yang jadi sumber
 * kebenaran begitu poll/baca-ulang pertama mendarat.
 *
 * `moneyMoved` = apakah USDC ongkir treasury SUDAH (atau mungkin sudah) berpindah ke wallet user.
 * Fail-closed: FUNDING (fundUsdc bisa saja indeterminate) dihitung SUDAH berpindah.
 */
const RESUME_BY_STATUS: Record<RedemptionStatus, { stage: Stage; moneyMoved: boolean }> = {
  // Belum bayar ongkir → layar tunggu pembayaran (bukan "mengonfirmasi", yang menyiratkan
  // pembayarannya sudah masuk).
  REQUESTED: { stage: "awaitingPayment", moneyMoved: false },
  AWAITING_PAYMENT: { stage: "awaitingPayment", moneyMoved: false },
  // Ongkir Rupiah LUNAS, treasury belum mengirim apa pun → tahap tanda tangan pertama.
  READY_TO_FUND: { stage: "readyToFund", moneyMoved: false },
  // Pendanaan sedang/sudah jalan dan hasilnya belum pasti → lacak, JANGAN tawarkan TTD.
  FUNDING: { stage: "tracking", moneyMoved: true },
  // Uang sudah di wallet user, tanda tangan belum → tahap tanda tangan ULANG.
  FUNDED: { stage: "resign", moneyMoved: true },
  BURN_SUBMITTED: { stage: "tracking", moneyMoved: true },
  IN_TRANSIT: { stage: "tracking", moneyMoved: true },
  DELIVERED: { stage: "tracking", moneyMoved: true },
  PACKING: { stage: "tracking", moneyMoved: true },
  SHIPPED: { stage: "tracking", moneyMoved: true },
  // applyStatus memperlakukan CANCELED sebagai layar error (dengan kalimatnya sendiri di bawah).
  CANCELED: { stage: "canceled", moneyMoved: false },
  // Ditinjau tim. Keduanya BUKAN layar aksi: tidak ada yang bisa user tanda tangani di sini.
  REFUND_DUE: { stage: "tracking", moneyMoved: false },
  RECLAIM_DUE: { stage: "tracking", moneyMoved: true },
  SHIP_FAILED_POST_BURN: { stage: "tracking", moneyMoved: true },
};

/** Sumber transaksi burn UNSIGNED. Dua-duanya berbentuk sama, jadi tahap TTD-nya SATU:
 *  - fundAndPrepareRedemption → status READY_TO_FUND (MENDANAI USDC ongkir), dan
 *  - reprepareRedemptionBurn   → status FUNDED (terbitkan ulang saja, NOL dana berpindah). */
type PrepareCall = (
  id: string,
  token: string,
) => Promise<{ transactions: string[]; delistTransactions?: string[] }>;

export default function ShippingFlowModal({
  redemptionId,
  card,
  resume = false,
  initialStatus = null,
  onClose,
  onFinished,
}: {
  redemptionId: string;
  /** Info kartu untuk tampilan; saat resume (halaman ter-reload) bisa null → diambil dari status. */
  card?: { name: string; image: string | null } | null;
  /** true = dibuka sepulang dari halaman bayar / dari daftar pengiriman berjalan. */
  resume?: boolean;
  /** Status yang SUDAH diketahui pemanggil (dari /redemptions/me). Dipakai supaya baris FUNDED
   *  langsung mendarat di layar tanda-tangan-ulang, tanpa sekejap layar "mengonfirmasi
   *  pembayaran" yang keliru — dan tanpa bergantung pada poll (yang di sini sengaja tidak boleh
   *  mencetak sesi CC baru). Poll berikutnya tetap yang jadi sumber kebenaran. */
  initialStatus?: RedemptionStatus | null;
  onClose: () => void;
  /** Dipanggil saat redemption maju ke tahap kirim (burn tersubmit) — untuk refresh vault/daftar. */
  onFinished?: () => void;
}) {
  const { token, login } = useAuth();
  const sign = useSignSerializedTransaction();

  // Tahap awal: tabel EXHAUSTIVE di atas kalau pemanggil sudah memegang statusnya. `null` =
  // pemanggil memang tidak tahu (jalur resume sepulang dari halaman bayar) — di situ "confirming"
  // memang tahap yang benar, karena user baru saja kembali dari gateway pembayaran.
  const resumeEntry = resume && initialStatus ? RESUME_BY_STATUS[initialStatus] : null;
  const [stage, setStage] = useState<Stage>(
    resume ? (resumeEntry ? resumeEntry.stage : "confirming") : "estimating",
  );
  const [estimate, setEstimate] = useState<RedemptionEstimate | null>(null);
  const [redemption, setRedemption] = useState<CardRedemption | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /* ---- B1: batal-sendiri (POST /redemptions/:id/cancel), hanya selama NOL uang bergerak ---- */
  /** Konfirmasi dua langkah: tombol batal di layar tunggu-pembayaran tidak boleh sekali-tekan. */
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  /** `warning` dari backend setelah batal berhasil — DITULIS backend, ditampilkan apa adanya. */
  const [cancelWarning, setCancelWarning] = useState<string | null>(null);
  /**
   * `shippingDebts` dari backend: tagihan ongkir yang Rupiah-nya sudah/mungkin mendarat dan
   * karenanya jadi UTANG TERCATAT. Ini satu-satunya tempat user bisa melihat uang itu, jadi ia
   * disimpan (bukan dibuang) dan dirender di layar `canceled` bersama `warning`.
   */
  const [cancelDebts, setCancelDebts] = useState<ShippingRefundDebt[]>([]);
  const startedRef = useRef(false);
  // TRUE begitu treasury (mungkin) sudah mengirim USDC ongkir: prepare balik dengan sukses, atau
  // status baris terbaca FUNDED. Dipakai untuk MEMILIH JALUR PEMULIHAN (dari sini fund-and-prepare
  // HARAM — 400 di backend — dan yang benar cuma re-prepare).
  //
  // BUKAN penentu isi layar error. Boolean ini tidak tahu apakah submit-burn sempat dikirim, tidak
  // tahu apakah CC sempat membakar, dan tidak pernah dibaca ulang. Layar error diputuskan oleh
  // `failure`, yang lahir dari BACA ULANG status baris (resolveSignFailure).
  const [moneyMoved, setMoneyMoved] = useState(resumeEntry?.moneyMoved ?? false);
  // Ref-nya dibaca di dalam resolveSignFailure sebagai jaring pengaman TERAKHIR (kalau baca-ulang
  // statusnya sendiri gagal), jadi ia harus selalu nilai TERBARU, bukan yang terkunci di closure.
  const moneyMovedRef = useRef(moneyMoved);
  useEffect(() => {
    moneyMovedRef.current = moneyMoved;
  }, [moneyMoved]);

  /** Verdict layar error tahap TTD — hasil BACA ULANG status baris, bukan tebakan lokal. */
  const [failure, setFailure] = useState<SignFailureKind | null>(null);
  /**
   * Apakah verdict di atas lahir dari BACA ULANG baris yang BERHASIL (true), atau dari jaring
   * pengaman terakhir ketika baca-ulangnya gagal total (false).
   *
   * KENAPA PERLU. Layar error menampilkan DUA sumber kalimat: pesan mentah backend (`errorMsg`,
   * yang menggambarkan PANGGILAN yang ditolak) dan copy layar ini sendiri (yang menggambarkan
   * KEADAAN BARIS sesudah dibaca ulang). Keduanya bisa bertentangan — contoh nyatanya:
   * fund-and-prepare yang terklik dua kali pada baris yang sudah FUNDED dijawab backend dengan
   * "Redemption ini belum siap didanai (status FUNDED). Selesaikan pembayaran ongkir Rupiah
   * dulu." Kalimat itu benar untuk baris READY_TO_FUND, tapi baris INI sudah FUNDED: ongkirnya
   * sudah lunas dan USDC-nya sudah pindah, jadi menyuruh user membayar lagi adalah kebalikan dari
   * yang benar.
   *
   * ATURANNYA: kalau layar ini SUDAH membaca ulang barisnya sendiri, KEADAAN BARIS yang menang
   * dan pesan mentah backend TIDAK ditampilkan (sama seperti cabang costExceeded & indeterminate
   * yang memang sudah memakai copy sendiri). Kalau baca-ulangnya GAGAL, layar tidak punya fakta
   * apa pun — di situ pesan backend ditampilkan, dan copy-nya tidak boleh mengaku sudah membaca.
   */
  const [failureVerified, setFailureVerified] = useState(false);

  /**
   * KAPAN status FUNDED yang mendasari layar `resign` terakhir dibaca dari server (epoch ms) —
   * `null` kalau belum pernah.
   *
   * Layar `resign` mengklaim "kartunya masih aman di vault — belum ada yang dikirim". Itu tahap
   * yang USDC treasury-nya SUDAH berpindah, jadi ia tempat TERAKHIR yang boleh menyatakan fakta
   * yang belum dibaca ulang. Dua jalan masuknya memang berdasar fakta segar (applyStatus, dan
   * resolveSignFailure yang baru membaca FUNDED); yang KETIGA tidak: `initialStatus === "FUNDED"`
   * saat mount berasal dari snapshot /redemptions/me yang diambil kapan pun halaman terakhir
   * dimuat — bisa berjam-jam lalu, dan perangkat lain bisa sudah menyelesaikan burn-nya.
   *
   * KENAPA STEMPEL WAKTU, BUKAN BOOLEAN: boolean `true` tidak punya lawan. Dulu nilai ini memang
   * boolean, dan TIDAK ADA satu pun baris yang mengembalikannya ke `false` — sementara verifikator
   * 15 detik di bawah MENELAN kegagalan baca tanpa suara. Jadi satu pembacaan sukses yang disusul
   * koneksi putus membuat layar terus mengaku "BARUSAN kami cek ke server" dengan bukti yang
   * umurnya bisa berjam-jam. Stempel waktu tidak bisa begitu: kelayakannya dihitung dari SELISIH
   * waktu, jadi bukti yang berhenti diperbarui kedaluwarsa sendiri — tanpa perlu ada jalur kode
   * yang ingat mematikannya.
   *
   * Mulai `null` untuk jalur snapshot: layarnya tetap tampil seketika, yang ditahan sampai
   * verifikasi mendarat hanyalah KALIMAT KLAIM-nya — tidak ada spinner yang berkedip.
   */
  const [resignVerifiedAt, setResignVerifiedAt] = useState<number | null>(null);
  /**
   * Jam yang dimajukan verifikator `resign` tiap siklus (epoch ms) — sesudah SUKSES MAUPUN GAGAL.
   *
   * Tanpa detak ini stempel waktu di atas tidak ada gunanya: kalau pembacaan gagal, tidak ada state
   * yang berubah, React tidak merender ulang, dan kalimat klaim yang sudah kedaluwarsa tetap
   * terpampang di layar. Inilah yang membuat kedaluwarsanya benar-benar sampai ke mata user.
   */
  const [resignNow, setResignNow] = useState(() => Date.now());
  /** submit-burn SEMPAT dikirim tapi hasilnya tidak pernah kami terima (koneksi putus / respons
   *  hilang). Status yang tampil setelah itu dibaca dari server, bukan dari hasil submit — dan
   *  itu dikatakan apa adanya ke user, bukan disembunyikan di balik copy yang menenangkan. */
  const [unverifiedSubmit, setUnverifiedSubmit] = useState(false);
  /**
   * Status yang DIKEMBALIKAN submit-burn yang BERHASIL (respons backend: `{ status,
   * burnSignature }`) — fakta hasil baca server, bukan tebakan layar ini.
   *
   * KENAPA ADA: tahap `tracking` dulu dimasuki TANPA status sama sekali sesudah submit berhasil
   * (`setStage("tracking")` tanpa satu pun tulisan status). Akibatnya `shownStatus` kosong →
   * label "Sedang diproses" + kalimat default "sedang dalam proses pengiriman ke alamatmu",
   * padahal yang BARU SAJA terjadi cuma "permintaannya diteruskan ke CollectorCrypt"
   * (BURN_SUBMITTED). Kalau `redemption` masih terisi pun ia BASI (READY_TO_FUND/FUNDED dari
   * sebelum submit) dan jatuh ke kalimat default yang sama. Biasanya poll berikutnya
   * membetulkannya — TAPI poller tracking memakai jalur token SENYAP: sekali ia kena
   * CcSessionRequiredError (sessionStorage diblokir) atau 429 lima kali, `pollStopped` menyala
   * dan layarnya DIAM di klaim berlebihan itu selamanya.
   *
   * Dipakai sebagai CADANGAN saja: baris hasil baca server (`redemption`) tetap menang begitu
   * poll pertama mendarat, jadi nilai ini tidak pernah membekukan layar di BURN_SUBMITTED.
   */
  const [submittedStatus, setSubmittedStatus] = useState<RedemptionStatus | null>(null);
  /** Baris ini diambil alih sesi tanda tangan lain (dua tab). Ditempel sebagai catatan di atas
   *  tahap hasil baca-ulang, supaya layar PULIH ke sesi yang sedang berjalan, bukan buntu. */
  const [supersededNote, setSupersededNote] = useState(false);
  /** SHIPPING_BURN_STALE_SESSION: yang kita tanda tangani berasal dari sesi LAMA — ada sesi yang
   *  lebih baru untuk baris yang sama. Barisnya TERBUKTI masih FUNDED (CC tidak pernah dipanggil),
   *  jadi layarnya pulih ke tahap tanda tangan dengan catatan ini, bukan ke layar error. */
  const [staleSessionNote, setStaleSessionNote] = useState(false);
  // Kegagalan poll yang TERLIHAT (dulu `catch {}` diam-diam). `needsSignIn` = sesi CC-nya habis,
  // jadi lanjutannya butuh aksi sadar dari user (satu tanda tangan), bukan prompt dari timer.
  const [pollError, setPollError] = useState<{ message: string; needsSignIn: boolean } | null>(null);
  const [pollStopped, setPollStopped] = useState(false);
  const [pollRetrying, setPollRetrying] = useState(false);
  // Satu alur TTD pada satu waktu — klik ganda pada tombol "coba lagi" tidak boleh menghasilkan
  // dua re-prepare + dua submit berbarengan.
  const signInFlightRef = useRef(false);

  // Token TERBARU via ref: poll status (resume) sering jalan sebelum token ter-hidrasi; menutup
  // token di closure = basi. Ref membuat tiap tick membaca token yang SEKARANG (pola deposit).
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const cardName = card?.name ?? redemption?.cardName ?? "kartu";
  const cardImage = card?.image ?? redemption?.cardImage ?? null;

  /**
   * Status TERBAIK yang kita pegang saat ini, URUT DARI YANG PALING SEGAR: baris hasil baca
   * server, lalu status yang dikembalikan submit-burn yang barusan sukses, lalu `initialStatus`
   * dari pemanggil (/redemptions/me).
   *
   * KENAPA PENTING: memetakan tahap awal saja belum cukup. Di TAB BARU, `redemption` masih null
   * (poller berhenti di CcSessionRequiredError sebelum sempat mengisinya), jadi layar lacak dulu
   * jatuh ke label "Sedang diproses" + kalimat default "sedang dalam proses pengiriman ke
   * alamatmu" — persis KLAIM BERLEBIHAN yang trackingCopy() dibuat untuk dihindari, dan salah
   * untuk BURN_SUBMITTED (baru diteruskan ke CC), FUNDING, dan status yang sedang ditinjau tim.
   * Dengan ini, label dan kalimatnya benar sejak render pertama, tanpa satu pun panggilan jaringan.
   *
   * URUTANNYA DISENGAJA: `redemption` (dibaca ulang tiap poll) di depan `submittedStatus` supaya
   * layar tetap MAJU ke IN_TRANSIT/DELIVERED. Itu aman karena submit yang sukses TIDAK cuma
   * mengisi `submittedStatus`, tapi juga menulis status itu ke baris yang sedang kita pegang —
   * jadi tidak ada lagi baris pra-submit (READY_TO_FUND/FUNDED) yang bisa menang di sini.
   */
  const shownStatus: RedemptionStatus | undefined =
    redemption?.status ?? submittedStatus ?? (resume ? initialStatus ?? undefined : undefined);

  // Fresh (non-resume): minta estimasi ongkir sekali di mount.
  useEffect(() => {
    if (resume || startedRef.current) return;
    startedRef.current = true;
    let alive = true;
    (async () => {
      try {
        let t = tokenRef.current;
        if (!t) t = await login();
        const est = await estimateRedemption(redemptionId, t);
        if (!alive) return;
        setEstimate(est);
        setStage("estimate");
      } catch (e) {
        if (!alive) return;
        setErrorMsg(e instanceof Error ? e.message : "Gagal menghitung ongkir.");
        setStage("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [resume, redemptionId, login]);

  // Satu baris status → satu tahap. Dipakai poller MAUPUN tombol "muat ulang status".
  const applyStatus = useCallback((r: CardRedemption) => {
    setRedemption(r);
    // Kita baru saja MEMBACA fakta dari server → verdict error lama tidak berlaku lagi.
    setFailure(null);
    const s = r.status;
    if (s === "READY_TO_FUND") {
      clearPendingShip();
      setStage("readyToFund");
    } else if (s === "AWAITING_PAYMENT" || s === "REQUESTED") {
      setStage("awaitingPayment");
    } else if (s === "CANCELED") {
      // Tahap TENANG tersendiri, bukan layar error merah: baris CANCELED berarti nol dana bergerak
      // dan kartunya bebas diminta kirim lagi. Itu hasil yang normal, bukan kegagalan.
      clearPendingShip();
      setStage("canceled");
    } else if (s === "FUNDED") {
      // Uang SUDAH berpindah, tanda tangan belum → BUKAN lacak. Satu-satunya jalan keluar adalah
      // re-prepare + TTD lagi; submit-burn pun belum pernah lolos untuk baris ini.
      clearPendingShip();
      moneyMovedRef.current = true;
      setMoneyMoved(true);
      // FAKTA SEGAR: baris ini baru saja terbaca FUNDED dari server → layar `resign` boleh
      // menyatakan kartunya masih utuh. Yang dicatat adalah KAPAN-nya, supaya klaim itu ikut
      // kedaluwarsa kalau pembacaan berikutnya tidak pernah mendarat.
      setResignVerifiedAt(Date.now());
      setStage("resign");
    } else {
      // FUNDING/BURN_SUBMITTED/IN_TRANSIT/DELIVERED/PACKING/SHIPPED/…
      clearPendingShip();
      setStage("tracking");
    }
  }, []);

  // Poll status selama menunggu pembayaran / melacak pengiriman. Satu timer; transisi stage
  // menghentikan/menyalakan ulang lewat deps. READY_TO_FUND → tahap tanda tangan; FUNDED → tahap
  // tanda tangan ULANG; status kirim → tahap lacak; batal → error.
  //
  // setTimeout BERANTAI, bukan setInterval: jeda-nya digandakan tiap kegagalan BERUNTUN dan
  // berhenti setelah MAX_POLL_FAILS. Poll ini memakai token CC dari cache saja (lihat
  // getRedemptionStatus) — ia TIDAK PERNAH memicu tanda tangan; sesi CC yang habis muncul sebagai
  // CcSessionRequiredError → berhenti dan minta user menekan tombol.
  useEffect(() => {
    if (stage !== "confirming" && stage !== "awaitingPayment" && stage !== "tracking") return;
    if (pollStopped) return;
    let alive = true;
    let timer = 0;
    let fails = 0;
    const schedule = (ms: number) => {
      timer = window.setTimeout(() => void tick(), ms);
    };
    const tick = async () => {
      const t = tokenRef.current;
      if (!t) {
        // token belum hidrasi → coba lagi nanti (jangan pop login, jangan hitung sbg kegagalan)
        schedule(POLL_MS);
        return;
      }
      try {
        const r = await getRedemptionStatus(redemptionId, t);
        if (!alive) return;
        fails = 0;
        setPollError(null);
        applyStatus(r);
        schedule(POLL_MS);
      } catch (e) {
        if (!alive) return;
        if (e instanceof CcSessionRequiredError) {
          // Sesi CC habis. JANGAN mencetak ulang dari timer (CC membatasi sign-in per wallet dan
          // per alamat jaringan — 429). Berhenti, tampilkan, tunggu user menekan tombol.
          setPollError({
            message:
              "Sesi pengiriman perlu diperbarui. Tekan Muat ulang status lalu setujui tanda tangan di wallet-mu.",
            needsSignIn: true,
          });
          setPollStopped(true);
          return;
        }
        fails += 1;
        setPollError({
          message:
            fails >= MAX_POLL_FAILS
              ? "Status pengiriman belum bisa dimuat. Koneksi atau server sedang bermasalah — datamu aman, coba lagi sebentar lagi."
              : "Status pengiriman belum bisa dimuat, mencoba lagi…",
          needsSignIn: false,
        });
        if (fails >= MAX_POLL_FAILS) {
          setPollStopped(true);
          return;
        }
        schedule(Math.min(POLL_MS * 2 ** fails, POLL_MAX_MS));
      }
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [stage, redemptionId, pollStopped, applyStatus]);

  // Tahap `resign` sengaja TIDAK ikut poller di atas — dan itu meninggalkan satu-satunya tahap
  // BERTOMBOL yang tidak pernah memverifikasi ulang dirinya, padahal ia tahap yang uangnya sudah
  // berpindah DAN yang mengklaim "kartunya masih aman di vault". Dari snapshot `initialStatus`,
  // klaim itu bisa duduk di layar tanpa batas sementara perangkat lain menuntaskan burn-nya.
  //
  // Verifikatornya SENGAJA memakai getMyRedemptions (GET /redemptions/me), BUKAN
  // getRedemptionStatus: /redemptions/me hanya membaca baris DB kita sendiri dengan JWT Hoshi —
  // tidak merelay ke CC, jadi ia TIDAK butuh sesi CC dan TIDAK PERNAH memunculkan prompt wallet.
  // Itu yang membuatnya aman dijalankan dari timer, dan yang membuatnya tetap bekerja DI TAB BARU
  // (tempat cache token CC di sessionStorage kosong — persis kasus yang membuat poller utama
  // berhenti sebelum sempat mengoreksi layar).
  //
  // Tidak berisik: layar `resign` tetap tampil seketika; yang ditahan sampai verifikasi mendarat
  // hanyalah KALIMAT KLAIM-nya. Kegagalan baca juga tidak memunculkan layar error — ia cuma
  // membuat klaim keras itu tidak muncul, dan (kalau kegagalannya berlanjut melewati
  // RESIGN_CLAIM_TTL_MS) membuat klaim yang tadinya sudah muncul PADAM lagi. Itu sebabnya tiap
  // siklus — sukses maupun gagal — memajukan `resignNow`: umur bukti harus terus dihitung ulang,
  // bukan dibekukan oleh kegagalan yang ditelan diam-diam.
  useEffect(() => {
    if (stage !== "resign") return;
    let alive = true;
    let timer = 0;
    const run = async () => {
      const t = tokenRef.current;
      if (!t) {
        // token belum hidrasi → coba lagi sebentar lagi (jangan pop login dari timer). Jamnya
        // TETAP dimajukan: token yang tidak pernah hidrasi tidak boleh membekukan klaim
        // "barusan kami cek" di layar.
        if (alive) setResignNow(Date.now());
        timer = window.setTimeout(() => void run(), POLL_MS);
        return;
      }
      try {
        const mine = await getMyRedemptions(t);
        if (!alive) return;
        const row = mine.find((r) => r.id === redemptionId);
        // applyStatus yang memutuskan: FUNDED → tetap di sini (dan klaimnya jadi terverifikasi);
        // status lain → layar pindah sendiri ke tahap yang benar.
        if (row) applyStatus(row);
      } catch {
        /* gagal baca → TIDAK ada stempel baru; tetap tidak ada layar error untuk ini. Klaim lama
           tidak dihapus paksa (bacaan 15-30 detik lalu masih sah disebut "barusan"), tapi ia juga
           TIDAK diperpanjang — kalau kegagalannya berlanjut, RESIGN_CLAIM_TTL_MS yang memadamkan
           kalimatnya sendiri. */
      }
      // Detak jam: dijalankan sesudah SUKSES MAUPUN GAGAL, jadi umur bukti selalu dihitung ulang
      // dan kalimat klaim ikut luruh sendiri begitu lewat TTL.
      if (alive) setResignNow(Date.now());
      if (alive) timer = window.setTimeout(() => void run(), RESIGN_VERIFY_MS);
    };
    void run();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [stage, redemptionId, applyStatus]);

  /**
   * Boleh-tidaknya layar `resign` mengucapkan klaim kerasnya — TURUNAN, bukan state tersendiri.
   *
   * SENGAJA tidak ada `setResignVerified(false)` di mana pun, karena tidak ada bendera yang perlu
   * dimatikan: bendera yang harus dimatikan manual pasti suatu saat lupa dimatikan, dan itu persis
   * cacat versi sebelumnya. Di sini klaimnya padam sendiri begitu buktinya lewat umur.
   */
  const resignVerified =
    resignVerifiedAt !== null && resignNow - resignVerifiedAt < RESIGN_CLAIM_TTL_MS;

  // "Muat ulang status" — AKSI SADAR user, jadi boleh mencetak sesi CC baru (satu tanda tangan)
  // kalau memang sudah habis. Menyalakan kembali poller setelah berhasil.
  const retryPoll = useCallback(async () => {
    if (pollRetrying) return;
    setPollRetrying(true);
    try {
      let t = tokenRef.current;
      if (!t) t = await login();
      const r = await getRedemptionStatus(redemptionId, t, { allowSignIn: true });
      setPollError(null);
      setPollStopped(false);
      applyStatus(r);
    } catch (e) {
      setPollError({
        message: e instanceof Error ? e.message : "Status pengiriman belum bisa dimuat.",
        needsSignIn: e instanceof CcSessionRequiredError,
      });
    } finally {
      setPollRetrying(false);
    }
  }, [pollRetrying, redemptionId, login, applyStatus]);

  /**
   * BATALKAN permintaan kirim (B1). Rutenya SAH hanya selama nol uang bergerak — backend yang
   * memutuskan, bukan layar ini: ia memagari status (REQUESTED/AWAITING_PAYMENT), order ongkir
   * yang sudah mendarat, `fundingSignature`, dan `refundSafe`, lalu menulis dengan `updateMany`
   * berpagar supaya tidak bisa balapan dengan callback pembayaran. Jadi tombol ini tidak boleh
   * menjanjikan apa pun sendiri: ia mengirim permintaan, dan menampilkan jawaban backend apa
   * adanya — termasuk penolakannya (mis. "pembayaranmu ternyata sudah masuk").
   *
   * TIDAK butuh sesi CC (JWT Hoshi saja), jadi ia tetap bekerja di tab baru dan saat CC mati.
   */
  const cancelRequest = useCallback(async () => {
    if (canceling) return;
    setCanceling(true);
    setCancelError(null);
    try {
      let t = tokenRef.current;
      if (!t) t = await login();
      const r = await cancelRedemption(redemptionId, t);
      clearPendingShip();
      setRedemption(r);
      // Kalimatnya DARI BACKEND (menyebut kasus "terlanjur bayar invoice" → utang refund yang
      // diselesaikan manual). Jangan diganti janji refund otomatis — jalur ini tidak punya.
      setCancelWarning(r.warning ?? null);
      // Dan JANGAN buang `shippingDebts`. Pembatalan SAH sekalipun bisa meninggalkan Rupiah ongkir
      // yang sudah mendarat: backend mengubahnya jadi utang tercatat (FULFILLING → REFUND_DUE)
      // atau melaporkan yang sudah tercatat. Kalau array ini dibuang, tidak ada layar lain yang
      // pernah menyebutkan uang itu kepada user.
      setCancelDebts(Array.isArray(r.shippingDebts) ? r.shippingDebts : []);

      setCancelConfirm(false);
      setFailure(null);
      setStage("canceled");
      // Daftar /withdraw + vault ikut menyegarkan diri: barisnya hilang dari "Pengiriman berjalan"
      // dan kartunya bebas diminta kirim lagi.
      onFinished?.();
    } catch (e) {
      // Penolakan backend (status berubah, pembayaran mendarat, balapan) semuanya stage NO_EFFECT:
      // nol dana, nol efek. Kalimatnya sudah ditulis untuk user, jadi ditampilkan apa adanya.
      setCancelError(e instanceof Error ? e.message : "Permintaan batal tidak bisa diproses.");
    } finally {
      setCanceling(false);
    }
  }, [canceling, redemptionId, login, onFinished]);

  // Escape + scroll lock (samakan dengan modal Hoshi lain). Tidak boleh tutup saat TTD/submit —
  // dan tidak saat permintaan batal sedang terbang (jawabannya menentukan layar berikutnya).
  const busy =
    stage === "signing" || stage === "submitting" || stage === "paying" || canceling;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  // Bayar ongkir → buat order IDRX hosted → simpan pending → redirect ke halaman bayar.
  const payShipping = useCallback(async () => {
    setErrorMsg(null);
    setStage("paying");
    try {
      let t = tokenRef.current;
      if (!t) t = await login();
      const order = await createShippingOrder(redemptionId, t);
      savePendingShip(order.merchantOrderId, redemptionId);
      if (order.paymentUrl) {
        // Same tab. returnUrl-nya dibangun BACKEND (hoshi-backend/src/payments/payments.service.ts,
        // createShippingOrder) dan sekarang menunjuk ke /vault — BUKAN /withdraw. Karena itu KEDUA
        // halaman harus bisa me-resume: /withdraw dan /vault sama-sama membaca readPendingShip()
        // lalu membuka modal ini dalam mode resume. Jangan menuliskan asumsi "pasti balik ke X" di
        // sini lagi: yang menentukan tujuan adalah backend, yang kita jamin adalah kedua halaman
        // sama-sama bisa melanjutkan.
        window.location.href = order.paymentUrl;
        return;
      }
      // Tanpa paymentUrl (mis. QRIS inline) → poll di tempat sampai READY_TO_FUND.
      setStage("confirming");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Gagal membuat tagihan ongkir.");
      setStage("error");
    }
  }, [redemptionId, login]);

  /**
   * SATU-SATUNYA jalan masuk ke layar error tahap TTD.
   *
   * Aturannya: JANGAN PERNAH menyimpulkan nasib kartu dari keadaan lokal.
   *   1. ambil PETUNJUK dari verdict backend (hintFromError) — boleh null;
   *   2. BACA ULANG status baris dari server — ini FAKTA, dan ini yang memutuskan;
   *   3. kalau baca-ulangnya gagal → FAIL-CLOSED: submit yang terlanjur terkirim = indeterminate.
   *
   * Tombol "coba tanda tangani lagi" HANYA untuk verdict "retryable", yaitu saat baris benar-benar
   * TERBACA di FUNDED — satu-satunya status yang diterima POST /re-prepare. Versi lama menawarkan
   * tombol itu juga untuk baris BURN_SUBMITTED, jadi tombolnya 400 selamanya tanpa pernah
   * menyarankan menghubungi tim.
   */
  const resolveSignFailure = useCallback(
    async (err: unknown, submitted: boolean) => {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const hint = hintFromError(err, submitted);
      // Pesan mentah cuma berguna untuk kegagalan PRA-danai. Pesan ShippingPostFundError memang
      // sudah berkalimat manusia sejak backend memakai kontrak error, TAPI isinya ditujukan untuk
      // OPS ("CEK ON-CHAIN & reclaim; JANGAN refund Rupiah") — bukan untuk user. Layar
      // indeterminate di bawah SENGAJA tidak menampilkannya dan memakai copy-nya sendiri.
      setErrorMsg(isWalletRejection(rawMsg) ? "Kamu membatalkan tanda tangan di wallet." : rawMsg);
      // Verdict lama (dan status "sudah terverifikasi"-nya) dibuang dulu: apa pun yang kita
      // klaim sesudah ini harus lahir dari baca-ulang DI BAWAH, bukan dari layar sebelumnya.
      setFailureVerified(false);
      setStage("errorChecking");

      let row: CardRedemption | null = null;
      try {
        let t = tokenRef.current;
        if (!t) t = await login();
        // SENYAP: baca-ulang ini tidak boleh memunculkan prompt wallet sendiri (user baru saja
        // batal/gagal TTD). Sesi CC yang habis melempar CcSessionRequiredError.
        row = await getRedemptionStatus(redemptionId, t);
      } catch {
        row = null;
      }

      if (!row) {
        // CADANGAN yang TIDAK butuh sesi CC. GET /redemptions/:id/status merelay ke CC (butuh
        // token cca_ + CC harus hidup), jadi ia ikut mati justru pada pemicu yang paling BIASA di
        // sini: koneksi jelek / CC bermasalah / sesi CC kedaluwarsa. GET /redemptions/me cuma
        // membaca baris DB kita sendiri dengan JWT Hoshi — dan justru KOLOM STATUS-nya yang kita
        // butuhkan (FUNDED vs BURN_SUBMITTED). Tanpa cadangan ini, layar jatuh ke fail-closed
        // "hubungi tim" untuk baris yang sebenarnya masih FUNDED dan cuma perlu TTD ulang.
        try {
          let t = tokenRef.current;
          if (!t) t = await login();
          const mine = await getMyRedemptions(t);
          row = mine.find((r) => r.id === redemptionId) ?? null;
        } catch {
          row = null;
        }
      }

      if (row) {
        setRedemption(row);
        // Baris ini BARU SAJA terbaca dari server → semua verdict di bawah berdasar fakta, dan
        // karena itu berhak mengalahkan pesan mentah backend di layar error.
        setFailureVerified(true);
        const s = row.status;

        if (s === "CANCELED") {
          clearPendingShip();
          setFailure(null);
          setStage("canceled");
          return;
        }

        // Barisnya ternyata MAJU beneran → bukan layar error sama sekali.
        if (s === "IN_TRANSIT" || s === "DELIVERED" || s === "PACKING" || s === "SHIPPED") {
          clearPendingShip();
          if (hint === "superseded" || hint === "staleSession") setSupersededNote(true);
          onFinished?.();
          setStage("tracking");
          return;
        }

        if (s === "BURN_SUBMITTED") {
          // Backend TAHU ada yang gagal PASCA-danai (ShippingPostFundError) → terminal & jujur.
          if (hint === "indeterminate") {
            setFailure("indeterminate");
            setStage("error");
            return;
          }
          // Ditolak backend SEBELUM menyentuh CC (400 SHIPPING_BURN_ALREADY_SUBMITTED, atau 409
          // SHIPPING_BURN_STALE_SESSION yang barisnya keburu diambil sesi lebih baru itu) → baris
          // ini dipegang sesi TTD lain. Pulihkan layar ke sesi yang sedang berjalan; jangan buntu
          // di layar error. Yang kita tampilkan tetap status yang BARU SAJA dibaca dari server.
          if (hint === "superseded" || hint === "staleSession") {
            clearPendingShip();
            setSupersededNote(true);
            setStage("tracking");
            return;
          }
          // Tidak ada verdict sama sekali — dan ini pemicu yang paling BIASA: respons submit-burn
          // hilang di koneksi jelek SETELAH backend mengklaim FUNDED→BURN_SUBMITTED. Yang kita
          // TAHU cuma status barisnya, jadi itu yang ditampilkan (bukan copy "kartumu aman"), dan
          // poller dinyalakan lagi supaya layar ikut maju sendiri kalau CC memang memprosesnya.
          clearPendingShip();
          if (submitted) {
            setUnverifiedSubmit(true);
            onFinished?.();
          }
          setStage("tracking");
          return;
        }

        if (s === "FUNDED") {
          // FAKTA: tidak ada yang terbakar dan klaimnya sudah dilepas backend. Ini satu-satunya
          // keadaan yang boleh menawarkan tanda tangan ulang — re-prepare memang cuma terima ini.
          moneyMovedRef.current = true;
          setMoneyMoved(true);
          // SESI BASI (SHIPPING_BURN_STALE_SESSION): ini BUKAN kegagalan yang perlu layar error.
          // Backend menolaknya SEBELUM klaim dan SEBELUM CC dipanggil, dan baris-nya barusan
          // terbaca FUNDED — jadi layar PULIH ke tahap tanda tangan (yang tombolnya memang
          // re-prepare), dengan catatan jujur soal adanya sesi yang lebih baru.
          if (hint === "staleSession") {
            setStaleSessionNote(true);
            setFailure(null);
            // Barisnya BARU SAJA terbaca FUNDED beberapa baris di atas → klaim layar resign
            // memang berdasar fakta segar. Yang dicatat KAPAN-nya: yang membuat klaim itu boleh
            // tampil adalah UMUR buktinya, bukan fakta bahwa buktinya pernah ada.
            setResignVerifiedAt(Date.now());
            setStage("resign");
            return;
          }
          // Ongkir CC naik melewati plafon: barisnya memang masih FUNDED (baru saja kami baca),
          // tapi menawarkan "coba tanda tangani lagi" di sini adalah menyuruh user menabrak
          // tembok yang sama berulang-ulang — re-prepare akan menolak dengan error yang sama
          // sampai tim menyelesaikannya. Layar terminal, bukan layar retry.
          if (hint === "costExceeded") {
            setFailure("costExceeded");
            setStage("error");
            return;
          }
          setFailure("retryable");
          setStage("error");
          return;
        }

        if (s === "REQUESTED" || s === "AWAITING_PAYMENT" || s === "READY_TO_FUND") {
          // Klaim dilepas balik / dana belum pernah keluar → nol uang berpindah.
          moneyMovedRef.current = false;
          setMoneyMoved(false);
          setFailure("preFund");
          setStage("error");
          return;
        }

        // FUNDING (fundUsdc INDETERMINATE), REFUND_DUE, RECLAIM_DUE, SHIP_FAILED_POST_BURN →
        // semuanya butuh manusia, tidak satu pun boleh diulang dari layar ini.
        setFailure("indeterminate");
        setStage("error");
        return;
      }

      // Baca-ulang GAGAL (dua-duanya) → kita tidak memegang fakta apa pun. FAIL-CLOSED.
      if (submitted) {
        setUnverifiedSubmit(true);
        setFailure("indeterminate");
        setStage("error");
        return;
      }

      // submit-burn tak pernah terkirim, jadi TIDAK ADA yang bisa membakar kartu dari layar ini.
      // Tapi itu BUKAN izin untuk memakai boolean lokal: kalau backend sendiri sudah bilang uangnya
      // sudah/mungkin pindah (fundUsdc INDETERMINATE → 422 POST_FUND), verdict itu MENANG. Tanpa
      // pagar ini, `moneyMoved` yang masih false (prepare tak pernah balik) akan berubah jadi
      // layar "nol dana berpindah" untuk baris yang justru sedang nyangkut di FUNDING.
      if (hint === "indeterminate" || hint === "superseded") {
        setFailure("indeterminate");
        setStage("error");
        return;
      }
      // Ongkir CC melewati plafon: apa pun status barisnya, yang backend JAMIN adalah "tidak ada
      // transaksi baru diterbitkan, nol dana tambahan" — dan itu saja yang layar ini klaim. Yang
      // penting di sini: JANGAN jatuh ke fallback di bawah, yang akan memasang tombol coba-lagi
      // (moneyMoved sudah true di jalur ini) untuk kegagalan yang tidak bisa sembuh dengan diulang.
      if (hint === "costExceeded") {
        setFailure("costExceeded");
        setStage("error");
        return;
      }
      // Sesi basi: backend menjamin barisnya TERBUKTI FUNDED & CC tak pernah dipanggil, jadi
      // tahap tanda tangan adalah layar yang benar walaupun baca-ulangnya gagal.
      if (hint === "staleSession") {
        moneyMovedRef.current = true;
        setMoneyMoved(true);
        setStaleSessionNote(true);
        setFailure(null);
        // Baca-ulang kita gagal, TAPI 409 SHIPPING_BURN_STALE_SESSION itu SENDIRI adalah hasil
        // pembacaan baris oleh backend barusan (ditolak lokal, sebelum klaim & sebelum CC
        // dihubungi, dengan baris terbukti FUNDED). Jadi klaimnya tetap berdasar fakta segar —
        // dan stempel waktunya membuat klaim itu luruh sendiri kalau verifikator `resign` di atas
        // tidak pernah berhasil memperbaruinya.
        setResignVerifiedAt(Date.now());
        setStage("resign");
        return;
      }
      setFailure(moneyMovedRef.current ? "retryable" : "preFund");
      setStage("error");
    },
    [redemptionId, login, onFinished],
  );

  /**
   * Layar indeterminate: BACA ULANG saja. Tidak menandatangani, tidak mengirim, tidak mendanai
   * apa pun — jadi aman ditekan berapa kali pun. SENGAJA tidak memakai applyStatus: BURN_SUBMITTED
   * sendirian BUKAN bukti kartunya selamat, jadi layar ini hanya bergeser kalau statusnya
   * benar-benar MAJU (CC memproses) atau benar-benar kembali ke FUNDED.
   */
  const recheckAfterFailure = useCallback(async () => {
    if (pollRetrying) return;
    setPollRetrying(true);
    try {
      let t = tokenRef.current;
      if (!t) t = await login();
      const r = await getRedemptionStatus(redemptionId, t, { allowSignIn: true });
      setRedemption(r);
      setPollError(null);
      if (r.status === "IN_TRANSIT" || r.status === "DELIVERED" || r.status === "SHIPPED") {
        clearPendingShip();
        setFailure(null);
        onFinished?.();
        setStage("tracking");
      } else if (r.status === "FUNDED") {
        moneyMovedRef.current = true;
        setMoneyMoved(true);
        // Baru saja dibaca dari server → verdict terverifikasi.
        setFailureVerified(true);
        setFailure("retryable");
      }
      // Sisanya (termasuk BURN_SUBMITTED) → layar TETAP: tidak ada fakta baru untuk dilaporkan.
    } catch (e) {
      setPollError({
        message: e instanceof Error ? e.message : "Status pengiriman belum bisa dimuat.",
        needsSignIn: e instanceof CcSessionRequiredError,
      });
    } finally {
      setPollRetrying(false);
    }
  }, [pollRetrying, redemptionId, login, onFinished]);

  // SATU tahap tanda tangan untuk kedua sumber transaksi (fund-and-prepare / re-prepare):
  // siapkan tx → TTD tiap tx → submit burn → lacak. `prepare` yang memilih jalur; sisanya identik,
  // supaya tidak pernah ada dua implementasi TTD yang bisa berbeda perilaku.
  const signAndSubmitWith = useCallback(
    async (prepare: PrepareCall) => {
      if (signInFlightRef.current) return; // klik ganda → satu alur saja
      signInFlightRef.current = true;
      setErrorMsg(null);
      setPollError(null);
      setFailure(null);
      setFailureVerified(false);
      setSupersededNote(false);
      setStaleSessionNote(false);
      setUnverifiedSubmit(false);
      setStage("signing");
      // Dilacak TERPISAH dari `moneyMoved`: hanya `submitted` yang menentukan apakah nasib kartu
      // bisa berubah tanpa sepengetahuan kita. Ini fakta yang hilang di versi lama, yang cuma
      // punya satu boolean dan karena itu memakai copy "kartumu aman" untuk kegagalan submit-burn.
      let submitted = false;
      try {
        let t = tokenRef.current;
        if (!t) t = await login();
        const prep = await prepare(redemptionId, t);
        // Prepare balik = ongkirnya sudah/baru saja didanai ke wallet user. Dari titik ini
        // pemulihan APA PUN harus lewat re-prepare, tidak boleh fund-and-prepare lagi.
        moneyMovedRef.current = true;
        setMoneyMoved(true);
        // TTD SEMUA entri dari KEDUA array, dan kembalikan TETAP sebagai dua array terpisah:
        // CC menuntut set lengkap persis seperti yang ia terbitkan (digabung → 403 "not the
        // complete set"). Delist ditandatangani duluan karena itu urutan on-chain-nya — kartu
        // tak bisa di-burn selagi masih terpajang/escrow.
        const delistTransactions: string[] = [];
        // `?? []` karena delist biasanya kosong dan backend boleh saja tidak mengirim key-nya.
        for (const tx of prep.delistTransactions ?? []) delistTransactions.push(await sign(tx));
        const transactions: string[] = [];
        for (const tx of prep.transactions) transactions.push(await sign(tx));
        setStage("submitting");
        // Titik tanpa jalan kembali: begitu permintaan ini terkirim, backend sudah/akan mengklaim
        // FUNDED→BURN_SUBMITTED dan meneruskannya ke CC. Apa pun yang gagal SETELAH baris ini
        // tidak boleh lagi dijawab dengan "kartumu aman".
        submitted = true;
        const res = await submitRedemptionBurn(
          redemptionId,
          { transactions, delistTransactions },
          t,
        );
        clearPendingShip();
        // MASUK TAHAP LACAK DENGAN STATUSNYA, bukan tanpa apa-apa. Respons submit-burn membawa
        // status baris SESUDAH klaim (BURN_SUBMITTED) — itu fakta hasil baca server, dan itulah
        // yang menggerakkan copy di layar lacak. Tanpa dua tulisan di bawah ini `shownStatus`
        // kosong (atau, di alur non-resume, masih memegang baris READY_TO_FUND/FUNDED dari
        // sebelum submit) dan layarnya jatuh ke kalimat default "sedang dalam proses pengiriman
        // ke alamatmu" — klaim yang BELUM benar: kartunya baru diteruskan ke CollectorCrypt,
        // belum tentu ada paket yang jalan. Dan kalau poller senyap berhenti (sesi CC habis /
        // 429 beruntun → pollStopped), klaim itu tidak pernah terkoreksi.
        // `res.status` DITULIS JUGA ke baris yang sedang dipegang supaya baris pra-submit yang
        // basi tidak menang atas fakta yang baru saja kita terima.
        setSubmittedStatus(res.status ?? null);
        setRedemption((prev) => (prev && res.status ? { ...prev, status: res.status } : prev));
        onFinished?.();
        setStage("tracking");
      } catch (e) {
        await resolveSignFailure(e, submitted);
      } finally {
        signInFlightRef.current = false;
      }
    },
    [redemptionId, login, sign, onFinished, resolveSignFailure],
  );

  /** READY_TO_FUND → danai USDC ongkir + terbitkan transaksi, lalu TTD. */
  const fundAndSign = useCallback(
    () => signAndSubmitWith(fundAndPrepareRedemption),
    [signAndSubmitWith],
  );

  /** FUNDED → terbitkan ULANG transaksi (NOL dana berpindah, backend menolak status selain
   *  FUNDED), lalu TTD. Aman ditekan berulang: re-prepare tidak mendanai dan tidak mengklaim
   *  status, dan signInFlightRef menahan klik ganda. */
  const reprepareAndSign = useCallback(
    () => signAndSubmitWith(reprepareRedemptionBurn),
    [signAndSubmitWith],
  );

  // CATATAN: dulu di sini ada `isFunded = moneyMoved || redemption?.status === "FUNDED"` yang
  // dipakai langsung oleh layar error. Itu sumber bug-nya: `moneyMoved` menyala begitu prepare
  // balik, jadi kegagalan submit-burn pun ikut mendapat copy "kartumu masih aman" + tombol coba
  // lagi — padahal kartunya bisa saja sudah terbakar dan dikirim, dan /re-prepare sudah pasti
  // menolak baris BURN_SUBMITTED. Penggantinya adalah `failure`, yang lahir dari BACA ULANG
  // status baris. JANGAN kembalikan boolean lokal ke layar error.

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kirim kartu fisik ke rumah"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-14 w-[42px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
              <Img src={cardImage ?? "/card-back.svg"} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold text-white">Kirim ke rumah</h2>
              <p className="truncate text-[12px] text-zinc-500">{cardName}</p>
            </div>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* --- Hitung ongkir --- */}
        {stage === "estimating" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Menghitung ongkir…</p>
          </Center>
        )}

        {stage === "estimate" && estimate && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-[#181507] px-4 py-4 text-center">
              <p className="text-[12px] uppercase tracking-wider text-zinc-500">Ongkir kirim fisik</p>
              <p className="mt-1 text-3xl font-bold text-white">Rp {idr.format(estimate.rupiah)}</p>
              <p className="mt-1 text-[12px] text-zinc-500">
                Sudah termasuk penanganan CollectorCrypt.
              </p>
            </div>
            <p className="text-center text-[13px] leading-relaxed text-zinc-400">
              Bayar ongkir dulu (QRIS / e-wallet / VA). Setelah lunas, kamu tinggal tanda tangani
              pengirimannya — kartu digital-nya ditarik dan kartu fisiknya dikirim ke alamatmu.
            </p>
            <button
              type="button"
              onClick={payShipping}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Bayar ongkir →
            </button>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 w-full py-1 text-[13px] font-medium text-zinc-400 transition hover:text-white"
            >
              Nanti saja
            </button>
          </div>
        )}

        {/* --- Bayar / konfirmasi --- */}
        {stage === "paying" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Membuka halaman pembayaran…</p>
          </Center>
        )}

        {/* Tahap ini SATU-SATUNYA yang sengaja dimasuki TANPA status sama sekali: resume tanpa
            `initialStatus` (baru balik dari halaman bayar) dan jalur invoice tanpa paymentUrl.
            Karena itu copy-nya tidak boleh mengklaim uangnya sudah masuk. Dulu: hijau +
            "Mengonfirmasi pembayaran ongkir…", yang menyatakan ADA pembayaran yang sedang
            dikonfirmasi — padahal di jalur invoice-inline user belum membayar apa pun, dan di
            jalur resume kita belum membaca satu baris pun. Kalau poller-nya berhenti (sesi CC
            habis / 429 beruntun → pollStopped), klaim itu menetap. Yang kita TAHU cuma: kami
            sedang mengecek. Itu saja yang ditulis; begitu status pertama mendarat, applyStatus
            memindahkannya ke layar yang benar (menunggu pembayaran / siap tanda tangan). */}
        {stage === "confirming" && (
          <Center>
            <Spinner />
            <p className="text-sm font-medium text-zinc-300">Mengecek status ongkir…</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Kalau ongkirnya sudah kamu bayar, biasanya 1–3 menit sampai masuk. Halaman ini update
              otomatis begitu statusnya berubah.
            </p>
            <p className="text-[11px] text-zinc-500">Jangan tutup halaman ini.</p>
          </Center>
        )}

        {stage === "awaitingPayment" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <Spinner />
            <p className="text-sm text-zinc-300">Menunggu pembayaran ongkir</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Belum lihat pembayaranmu. Kalau tadi belum sempat bayar, buka lagi halaman
              pembayarannya.
            </p>
            <button
              type="button"
              onClick={payShipping}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Buka halaman pembayaran ↗
            </button>

            {/* JALAN KELUAR (B1). Tanpa ini, permintaan yang invoice-nya tidak jadi dibayar
                mengunci kartunya PERMANEN: barisnya tetap aktif dan permintaan kirim berikutnya
                ditolak 400 REDEMPTION_ALREADY_ACTIVE. Layar inilah tempat user mencarinya.
                Dua langkah — tombol batal sekali-tekan di layar pembayaran terlalu mudah kepencet. */}
            {!cancelConfirm ? (
              <button
                type="button"
                onClick={() => {
                  setCancelError(null);
                  setCancelConfirm(true);
                }}
                className="-mt-1 w-full py-1 text-[13px] font-medium text-zinc-400 transition hover:text-white"
              >
                Batalkan permintaan ini
              </button>
            ) : (
              <div className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left">
                {/* Copy-nya dari SATU sumber bersama dengan daftar di /withdraw (lihat
                    CANCEL_CONFIRM_* di atas). Versi lama menulis "belum ada ongkir yang kami
                    terima … tidak ada yang perlu direfund" dan "pembayaran yang sudah masuk
                    membuat pembatalan ini otomatis ditolak" — dua klaim yang sejak pagar backend
                    dipersempit ke [PAID, FULFILLED] tidak lagi benar: tagihan yang macet di
                    FULFILLING / sudah REFUND_DUE LOLOS, uangnya sudah mendarat, dan pembatalannya
                    BERHASIL. Layar ini tidak bisa membaca posisi tagihan ongkir, jadi ia tidak
                    boleh mengklaim arah mana pun. */}
                <p className="text-[12px] leading-relaxed text-zinc-300">{CANCEL_CONFIRM_FREED}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                  {CANCEL_CONFIRM_MONEY}
                </p>
                {cancelError && (
                  <p className="mt-2 text-[12px] leading-relaxed text-amber-200/90">{cancelError}</p>
                )}
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelRequest}
                    disabled={canceling}
                    className="flex-1 rounded-lg border border-red-400/30 bg-red-500/[0.10] px-3 py-2 text-[12px] font-semibold text-red-200 transition hover:bg-red-500/[0.18] disabled:opacity-60"
                  >
                    {canceling ? "Membatalkan…" : "Ya, batalkan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelConfirm(false)}
                    disabled={canceling}
                    className="flex-1 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.10] disabled:opacity-60"
                  >
                    Jangan batalkan
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Dibatalkan (user lewat tombol di atas, atau admin) --- */}
        {stage === "canceled" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-white/[0.06] text-2xl text-zinc-300">
              ✕
            </div>
            <p className="text-base font-semibold text-white">Permintaan kirim dibatalkan</p>
            <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-400">
              {cardName} tetap ada di vault-mu dan bisa diminta kirim lagi kapan saja.
              {cancelWarning !== null || cancelDebts.length > 0
                ? " Keterangan soal ongkirnya ada di bawah."
                : ""}
            </p>
            {/* PENGUNGKAPAN UANG, apa adanya dari backend (`warning` + `shippingDebts`).
                Kalimat lama di sini berbunyi "Tidak ada dana yang berpindah" — klaim yang layar
                ini tidak bisa verifikasi dan yang justru TERBALIK untuk baris yang tagihan
                ongkirnya macet di FULFILLING: di situ Rupiah-nya sudah mendarat, pembatalannya
                tetap berhasil, dan backend baru saja mencatatnya sebagai utang refund. Layar ini
                sekarang tidak mengarang apa pun soal uang; ia hanya menampilkan jawaban server.
                Blok ini juga tidak muncul saat baris dibatalkan admin (tidak ada respons cancel
                yang kita pegang) — dan diam memang lebih jujur daripada menebak. */}
            {(cancelWarning !== null || cancelDebts.length > 0) && (
              <ShippingCancelDisclosure
                redemptionId={redemptionId}
                warning={cancelWarning}
                debts={cancelDebts}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Selesai
            </button>
          </Center>
        )}

        {/* --- Tanda tangani --- */}
        {stage === "readyToFund" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-center">
              <p className="text-sm font-semibold text-emerald-300">Ongkir lunas ✓</p>
            </div>
            <p className="text-center text-[13px] leading-relaxed text-zinc-400">
              Tinggal satu langkah: tanda tangani pengiriman di wallet-mu. Kartu digitalnya ditarik
              (di-burn) dan CollectorCrypt mengirim kartu fisiknya ke alamatmu.
            </p>
            <button
              type="button"
              onClick={fundAndSign}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Tanda tangani pengiriman
            </button>
          </div>
        )}

        {/* --- Tanda tangani ULANG (status FUNDED: ongkir sudah didanai, TTD belum) ---
            Ini tahap tersendiri, bukan "lacak": tanpa layar ini satu prompt wallet yang ditolak
            membuat baris FUNDED tersangkut selamanya (fund-and-prepare 400 di status ini). */}
        {stage === "resign" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-center">
              <p className="text-sm font-semibold text-amber-200">Tinggal tanda tangan</p>
            </div>
            {/* KLAIM "kartunya masih aman di vault" hanya boleh tampil kalau status FUNDED-nya
                BARU SAJA dibaca dari server DAN bacaan itu masih MUDA (resignVerified = stempel
                waktu + RESIGN_CLAIM_TTL_MS). Dari snapshot /redemptions/me yang diambil saat
                halaman terakhir dimuat, fakta itu bisa sudah basi — perangkat lain bisa saja sudah
                menuntaskan burn-nya; begitu juga bacaan yang tadinya segar lalu ditinggal koneksi
                putus. Selama klaimnya tidak terverifikasi kita menulis apa yang memang kita tahu
                (ongkir lunas, biaya kirim sudah dikirim ke wallet) dan TIDAK menyatakan apa pun
                tentang kartunya — netral, tidak menenangkan, dan juga tidak menakut-nakuti, karena
                memang tidak ada yang sedang bermasalah. */}
            {resignVerified ? (
              <p className="text-center text-[13px] leading-relaxed text-zinc-400">
                Ongkirnya sudah lunas dan biaya kirimnya sudah kami siapkan di wallet-mu. Barusan
                kami cek ke server: kartunya masih aman di vault — belum ada yang dikirim dan tidak
                ada yang hilang. Tanda tangani sekali lagi di wallet-mu untuk melanjutkan
                pengiriman.
              </p>
            ) : (
              <p className="text-center text-[13px] leading-relaxed text-zinc-400">
                Ongkirnya sudah lunas dan biaya kirimnya sudah kami siapkan di wallet-mu. Tanda
                tangani sekali lagi di wallet-mu untuk melanjutkan pengiriman.
                <span className="mt-1 block text-[12px] text-zinc-500">
                  Kami sedang mengecek status terbarunya ke server…
                </span>
              </p>
            )}

            {/* SESI BASI (SHIPPING_BURN_STALE_SESSION, HTTP 409 stage FUNDED): tanda tangan tadi
                berasal dari sesi yang lebih lama. Backend menolaknya SEBELUM mengambil klaim dan
                SEBELUM CC dipanggil, jadi klaim "nol terbakar, nol biaya tambahan" di bawah ini
                memang yang backend jamin — bukan tebakan. Layarnya PULIH ke tahap tanda tangan
                (tombol di bawah = re-prepare, yang menerbitkan set transaksi BARU dan membuat sesi
                ini jadi yang terkini), jadi user tidak buntu di layar error. */}
            {staleSessionNote && (
              <div className="w-full rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-3 py-2.5 text-left">
                <p className="text-[12px] leading-relaxed text-sky-100/90">
                  Tanda tangan tadi berasal dari sesi yang lebih lama — sepertinya pengiriman ini
                  juga terbuka di tab atau perangkat lain. Tidak ada kartu yang terbakar dan tidak
                  ada biaya tambahan. Lanjutkan dari sesi yang paling baru, atau tekan tombol di
                  bawah untuk membuat transaksi baru di halaman ini lalu tanda tangani lagi.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={reprepareAndSign}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Lanjutkan pengiriman
            </button>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 w-full py-1 text-[13px] font-medium text-zinc-400 transition hover:text-white"
            >
              Nanti saja
            </button>
          </div>
        )}

        {stage === "signing" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-300">Menunggu tanda tangan…</p>
            <p className="max-w-[18rem] text-[13px] text-zinc-500">
              Setujui transaksinya di wallet-mu. Kalau tidak muncul, cek jendela browser lain.
            </p>
          </Center>
        )}

        {stage === "submitting" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-300">Mengirim ke CollectorCrypt…</p>
            <p className="max-w-[18rem] text-[13px] text-zinc-500">Jangan tutup jendela ini.</p>
          </Center>
        )}

        {/* --- Lacak --- */}
        {stage === "tracking" && (
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              📦
            </div>
            {/* Label NETRAL saat status tidak diketahui. "Sedang diproses" (yang dulu di sini)
                adalah klaim: ia menyatakan ada yang sedang berjalan — persis yang TIDAK kita
                ketahui kalau belum ada satu pun status yang terbaca. */}
            <p className="text-base font-semibold text-white">
              {shownStatus ? STATUS_LABEL[shownStatus] : "Status belum terbaca"}
            </p>
            <p className="max-w-[20rem] text-[13px] leading-relaxed text-zinc-400">
              {trackingCopy(shownStatus, cardName)}
            </p>

            {/* Status yang labelnya sendiri berbunyi "Perlu bantuan tim" / "Perlu ditinjau" tapi
                dulu tidak memberi SATU pun cara menghubungi tim. Kanalnya tidak wajib dipakai
                (tim yang menghubungi duluan), jadi tampilannya sekunder — tapi harus ADA. */}
            {(shownStatus === "SHIP_FAILED_POST_BURN" || shownStatus === "RECLAIM_DUE") && (
              <Link
                href={supportComposeHref(
                  shippingSupportDraft(
                    redemptionId,
                    `Status pengiriman: ${STATUS_LABEL[shownStatus]}.`,
                  ),
                )}
                className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-center text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
              >
                Tanya tim lewat {SUPPORT_MENU_LABEL} →
              </Link>
            )}

            {/* Dua tab / dua perangkat: submit-burn kita ditolak backend SEBELUM menyentuh CC
                (klaim FUNDED→BURN_SUBMITTED kalah, code SHIPPING_BURN_ALREADY_SUBMITTED). Katakan
                apa adanya, lalu biarkan layar ini jalan terus dari status yang barusan dibaca —
                jangan buntu di layar error.
                Perhatikan batas klaimnya: yang kita TAHU cuma "sesi lain memegang baris ini" dan
                "tanda tangan dari layar ini tidak dipakai". Kita TIDAK tahu hasil sesi itu (stage
                error-nya UNKNOWN, bukan FUNDED), jadi jangan menulis bahwa pengirimannya pasti
                berlanjut — status di atas dan poller yang bicara. */}
            {supersededNote && (
              <div className="w-full rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-3 py-2.5 text-left">
                <p className="text-[12px] leading-relaxed text-sky-100/90">
                  Pengiriman ini sudah dilanjutkan lewat sesi tanda tangan yang lebih baru —
                  kemungkinan dari tab atau perangkat lain. Tanda tangan dari layar ini tidak
                  dipakai, jadi tidak perlu diulang dari sini. Status di atas baru saja kami baca
                  dari server dan akan update sendiri di sini.
                </p>
              </div>
            )}

            {/* Respons submit-burn hilang di tengah jalan (koneksi putus). Kita TIDAK menerima
                konfirmasi akhirnya, jadi itu dikatakan — bukan disembunyikan di balik copy yang
                menenangkan. Statusnya sendiri dibaca dari server, dan poller terus memantaunya. */}
            {unverifiedSubmit && (
              <div className="w-full rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2.5 text-left">
                <p className="text-[12px] leading-relaxed text-amber-100/90">
                  Koneksi sempat terputus saat tanda tanganmu dikirim, jadi kami tidak menerima
                  konfirmasi akhirnya. Status di atas dibaca langsung dari server dan akan update
                  sendiri di sini. Jangan tanda tangani ulang dan jangan bayar lagi. Kalau dalam
                  1×24 jam statusnya belum berubah, hubungi tim lewat {SUPPORT_MENU_LABEL} dengan
                  ID <span className="break-all font-mono">{redemptionId}</span>.
                </p>
                {/* Link-nya membuka composer support yang SUDAH terisi — jangan menyuruh user
                    mencari menunya sendiri (dan jangan menyebut menu yang tidak ada). */}
                <Link
                  href={supportComposeHref(
                    shippingSupportDraft(
                      redemptionId,
                      "Koneksi terputus saat tanda tangan dikirim; statusnya belum berubah setelah 1×24 jam.",
                    ),
                  )}
                  className="mt-2 block w-full rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-center text-[12px] font-semibold text-amber-100 transition hover:bg-amber-300/[0.16]"
                >
                  Hubungi tim lewat {SUPPORT_MENU_LABEL} →
                </Link>
              </div>
            )}

            {redemption?.trackingUrls && redemption.trackingUrls.length > 0 && (
              <div className="mt-1 flex w-full flex-col gap-2">
                {redemption.trackingUrls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-center text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
                  >
                    Lacak resi{" "}
                    {redemption.trackingIds?.[i] ? `· ${redemption.trackingIds[i]}` : `#${i + 1}`} ↗
                  </a>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Selesai
            </button>
          </div>
        )}

        {/* --- Gagal TTD/submit → BACA ULANG status dulu, jangan langsung menyimpulkan --- */}
        {stage === "errorChecking" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-300">Memeriksa status pengirimanmu…</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-500">
              Sebentar — kami cek dulu ke server supaya yang kami sampaikan benar.
            </p>
          </Center>
        )}

        {/* --- Error: isinya DIPUTUSKAN oleh `failure` (hasil baca ulang status baris), bukan oleh
            boolean lokal. Tiap cabang hanya boleh mengklaim yang memang kita ketahui. --- */}
        {stage === "error" && (
          <Center>
            <div
              className={`grid h-14 w-14 place-items-center rounded-full text-2xl ${
                failure === "retryable" ||
                failure === "indeterminate" ||
                failure === "costExceeded"
                  ? "bg-amber-400/15 text-amber-300"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              !
            </div>

            {failure === "costExceeded" ? (
              // Pesan mentah backend ("Hubungi support untuk penyelesaian manual") menyebut kanal
              // tanpa menamainya; layar ini memakai copy-nya sendiri + tombol yang benar-benar
              // membuka kanalnya.
              <CostExceededNotice redemptionId={redemptionId} />
            ) : failure === "indeterminate" ? (
              // Pesan mentah backend SENGAJA tidak ditampilkan. Sejak kontrak error dipakai,
              // ShippingPostFundError (HTTP 422) memang membawa kalimat yang bisa dibaca — tapi
              // kalimat itu ditulis untuk OPS ("CEK ON-CHAIN & reclaim; JANGAN refund Rupiah"),
              // bukan untuk user. Layar ini memakai copy-nya sendiri.
              <IndeterminateNotice redemptionId={redemptionId} />
            ) : failure === "retryable" && failureVerified ? (
              /* ATURAN SIAPA YANG MENANG saat pesan backend dan keadaan baris bertentangan:
                 KEADAAN BARIS YANG SUDAH KAMI VERIFIKASI, dan pesan mentahnya tidak ditampilkan
                 sama sekali (sama seperti dua cabang di atas).
                 Alasannya konkret: `errorMsg` menggambarkan PANGGILAN yang ditolak, bukan baris.
                 fund-and-prepare yang terklik dua kali pada baris FUNDED dijawab backend dengan
                 "Redemption ini belum siap didanai (status FUNDED). Selesaikan pembayaran ongkir
                 Rupiah dulu." — kalimat yang benar untuk READY_TO_FUND, tapi pada baris FUNDED
                 ongkirnya SUDAH lunas dan USDC-nya SUDAH pindah. Menampilkannya di atas copy
                 "tinggal tanda tangan" bukan cuma membingungkan: separuh yang salah menyuruh user
                 membayar ongkir untuk kedua kalinya. Verdict "retryable" di sini hanya diberikan
                 setelah baris DIBACA ULANG dan terbaca FUNDED, jadi fakta itu yang ditampilkan. */
              <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
                Status pengirimanmu barusan kami baca ulang: masih menunggu tanda tanganmu. Tidak
                ada kartu yang terbakar dan tidak ada biaya tambahan — biaya kirimnya sudah kami
                siapkan di wallet-mu. Tanda tangani sekali lagi untuk melanjutkan.
              </p>
            ) : (
              // Tidak ada verdict terverifikasi → layar ini tidak punya fakta sendiri, jadi pesan
              // backend adalah satu-satunya keterangan yang ada dan ditampilkan apa adanya.
              <p className="max-w-[18rem] text-[13px] text-zinc-400">
                {errorMsg ?? "Terjadi kesalahan."}
              </p>
            )}

            {failure === "retryable" && (
              <>
                {!failureVerified && (
                  // Baca-ulang baris GAGAL (dua-duanya: status CC maupun /redemptions/me), jadi
                  // layar ini TIDAK BOLEH menulis "barusan kami baca ulang". Yang tersisa cuma
                  // pesan backend di atas + satu hal yang memang kami ketahui: transaksi
                  // pengirimannya pernah terbit, dan tombol di bawah menerbitkannya ulang tanpa
                  // memindahkan dana baru.
                  <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
                    Status pengirimanmu belum berhasil kami baca ulang, jadi keterangan di atas
                    adalah jawaban terakhir dari server. Tombol di bawah hanya menerbitkan ulang
                    transaksi tanda tangannya — tidak ada dana baru yang dipindahkan.
                  </p>
                )}
                {/* Pemulihan baris FUNDED: SELALU re-prepare (menerbitkan ulang transaksi, nol dana
                    berpindah) — TIDAK PERNAH fund-and-prepare, yang di status ini ditolak backend
                    dan konsepnya memang "danai", bukan "ulangi". Aman ditekan berkali-kali. */}
                <button
                  type="button"
                  onClick={reprepareAndSign}
                  className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
                  style={{ backgroundImage: GOLD_GRADIENT }}
                >
                  Coba tanda tangani lagi
                </button>
              </>
            )}


            {failure === "indeterminate" && (
              // HANYA membaca status (tidak menandatangani, tidak mengirim, tidak mendanai) —
              // jadi ini bukan "coba lagi" dan tidak melanggar larangan mengulang di atas.
              <button
                type="button"
                onClick={recheckAfterFailure}
                disabled={pollRetrying}
                className="mt-1 w-full rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-4 py-3 text-[14px] font-semibold text-amber-100 transition hover:bg-amber-300/[0.16] disabled:opacity-60"
              >
                {pollRetrying ? "Memeriksa…" : "Periksa status lagi"}
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-[15px] font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </Center>
        )}

        {/* --- Poll gagal (dulu ditelan `catch {}`): tampil DI BAWAH tahap yang sedang jalan --- */}
        {pollError &&
          (stage === "confirming" ||
            stage === "awaitingPayment" ||
            stage === "tracking" ||
            // Layar error juga: tombol "Periksa status lagi" di cabang indeterminate melapor
            // lewat pollError, dan kegagalannya harus kelihatan (tombol retry-nya sendiri sudah
            // dirender di atas, jadi yang di dalam blok ini tetap digerbang `pollStopped`).
            stage === "error") && (
          <div className="mt-4 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-center">
            <p className="text-[12px] leading-relaxed text-amber-200/90">{pollError.message}</p>
            {pollStopped && (
              <button
                type="button"
                onClick={retryPoll}
                disabled={pollRetrying}
                className="mt-2 w-full rounded-lg border border-amber-300/30 bg-amber-300/[0.08] px-3 py-2 text-[12px] font-semibold text-amber-100 transition hover:bg-amber-300/[0.16] disabled:opacity-60"
              >
                {pollRetrying
                  ? "Memuat…"
                  : pollError.needsSignIn
                    ? "Muat ulang status"
                    : "Coba lagi"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Copy tahap lacak PER STATUS. Dulu satu kalimat untuk semua ("sedang dalam proses pengiriman ke
 * alamatmu") — itu klaim yang belum tentu benar untuk BURN_SUBMITTED (baru diteruskan ke CC, belum
 * tentu sudah jalan) dan jelas salah untuk baris yang sedang ditinjau tim.
 *
 * DUA ATURAN YANG TIDAK BOLEH DILONGGARKAN:
 *  1. Status TIDAK DIKETAHUI → kalimat NETRAL, tidak pernah yang menenangkan. Dulu `undefined`
 *     ikut jatuh ke `default:` yang berbunyi "sedang dalam proses pengiriman ke alamatmu" — layar
 *     itu MENGKLAIM paketnya jalan justru saat kita tidak memegang fakta apa pun. Sekali poller
 *     senyap berhenti (sesi CC habis / 429 beruntun), klaim itu menetap.
 *  2. TIDAK ADA `default:` lagi. Switch-nya EXHAUSTIVE atas RedemptionStatus (lihat `_exhaustive`
 *     di bawah): status baru di lib/api.ts jadi ERROR tsc di sini, bukan diam-diam mewarisi
 *     kalimat "sedang dikirim" yang mungkin bohong untuknya.
 */
function trackingCopy(status: RedemptionStatus | undefined, cardName: string): string {
  // Belum ada satu pun status yang terbaca (baris belum pernah dibaca, submit tidak mengembalikan
  // status, poller berhenti). Yang boleh dikatakan cuma itu — bukan tebakan soal paketnya.
  if (!status) {
    return `Status pengiriman ${cardName} belum bisa kami baca. Begitu terbaca, statusnya muncul di sini.`;
  }
  switch (status) {
    case "DELIVERED":
      return `${cardName} sudah sampai. Terima kasih!`;
    case "BURN_SUBMITTED":
      // Yang kita ketahui: permintaannya sudah diteruskan ke CC. Bukan "sedang dikirim" — resi
      // baru ada setelah CC memprosesnya, dan sebelum itu kita tidak punya dasar untuk bilang apa
      // pun tentang paketnya.
      return `Permintaan kirim ${cardName} sudah diteruskan ke CollectorCrypt. Nomor resinya muncul di sini begitu CollectorCrypt memprosesnya.`;
    case "FUNDING":
      return `Pengiriman ${cardName} sedang disiapkan. Statusnya update otomatis di sini.`;
    case "PACKING":
      // CC sudah memproses, tapi paketnya belum jalan → jangan bilang "menuju alamatmu".
      return `${cardName} sedang dikemas CollectorCrypt sebelum dikirim. Statusnya update otomatis di sini.`;
    case "IN_TRANSIT":
    case "SHIPPED":
      // Baru DI SINI kalimat "menuju alamatmu" punya dasar: CC sudah menyerahkannya ke kurir.
      return `${cardName} sedang dalam perjalanan ke alamatmu. Statusnya update otomatis di sini.`;
    case "REFUND_DUE":
    case "RECLAIM_DUE":
    case "SHIP_FAILED_POST_BURN":
      return `Pengiriman ${cardName} sedang ditinjau tim kami. Kamu tidak perlu melakukan apa-apa — kami kabari begitu ada hasilnya.`;
    // Status PRA-KIRIM (dan CANCELED) tidak seharusnya mendarat di tahap lacak — applyStatus /
    // RESUME_BY_STATUS mengarahkannya ke layar lain. Kalau toh tampil (baris basi), yang keluar
    // cuma keterangan status apa adanya: nol klaim soal paket, nol klaim soal kartunya.
    case "REQUESTED":
    case "AWAITING_PAYMENT":
    case "READY_TO_FUND":
    case "FUNDED":
    case "CANCELED":
      return `Status pengiriman ${cardName} sekarang: ${STATUS_LABEL[status]}. Halaman ini update otomatis begitu ada perubahan.`;
    default: {
      // Status yang belum punya kalimat = status yang belum kita pahami → perlakukan seperti
      // "tidak diketahui" (netral), dan biarkan tsc yang menagih kalimatnya saat ditambahkan.
      const _exhaustive: never = status;
      void _exhaustive;
      return `Status pengiriman ${cardName} belum bisa kami baca. Begitu terbaca, statusnya muncul di sini.`;
    }
  }
}

/**
 * Layar TERMINAL untuk kegagalan PASCA-danai yang nasib kartunya TIDAK diketahui
 * (ShippingPostFundError, atau baris FUNDING/RECLAIM_DUE/SHIP_FAILED_POST_BURN, atau submit yang
 * terlanjur terkirim sementara status barisnya tidak bisa dibaca sama sekali).
 *
 * Aturan copy-nya, dan alasan tiap kalimat ada:
 *  - TIDAK bilang kartunya aman, TIDAK bilang kartunya sudah dikirim. Kita tidak tahu mana yang
 *    benar, dan salah satu dari dua kalimat itu pasti bohong.
 *  - Melarang mengulang / membayar lagi secara eksplisit: mengulang tidak memperbaiki apa pun.
 *  - Bilang ongkirnya sudah dibayar dan tidak hilang, TANPA menjanjikan refund — refundSafe=false,
 *    tidak ada refund otomatis di jalur ini.
 *  - Memberi ID redemption supaya percakapan dengan tim dimulai dari fakta, bukan dari ingatan.
 *  - Tenang dan tidak alarmis, tapi JANGAN dilunakkan sampai terbaca seolah semuanya baik saja.
 */
function IndeterminateNotice({ redemptionId }: { redemptionId: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <p className="text-base font-semibold text-amber-200">Perlu dicek tim kami</p>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">
        Tanda tanganmu sudah dikirim, tapi konfirmasi akhirnya dari CollectorCrypt tidak sampai ke
        kami. Jadi kami belum bisa memastikan apakah kartunya sudah diproses untuk dikirim atau
        belum — dan soal ini kami tidak mau menebak.
      </p>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">
        Jangan tanda tangani ulang dan jangan bayar lagi. Ongkir yang kamu bayar sudah tercatat dan
        tidak hilang; satu permintaan ini sudah cukup.
      </p>
      <SupportHandoff
        redemptionId={redemptionId}
        note="Tanda tangan sudah dikirim, tapi konfirmasi akhir dari CollectorCrypt tidak sampai. Status kartunya belum bisa dipastikan."
        lead="Tekan tombol di bawah untuk membuka percakapan dengan tim kami — pesannya sudah kami siapkan lengkap dengan ID ini. Kami cek langsung ke CollectorCrypt, lalu mengabarimu."
      />
    </div>
  );
}

/**
 * SHIPPING_COST_EXCEEDS_FUNDED. Yang boleh diklaim di sini PERSIS sebatas yang backend jamin di
 * throw-site-nya (cc-shipping.service.ts, guard re-prepare): ongkir CC melewati plafon slippage
 * dari yang sudah didanai, jadi TIDAK ADA transaksi baru yang diterbitkan dan NOL dana tambahan
 * dikirim — barisnya dibiarkan apa adanya untuk penyelesaian manual.
 *
 * Yang SENGAJA TIDAK diklaim: keadaan kartunya. Layar ini bisa juga tampil saat baca-ulang status
 * gagal, jadi ia tidak menyatakan "kartumu aman". Dan SENGAJA tidak ada tombol coba-lagi: harga CC
 * tidak akan turun karena ditandatangani ulang — itu justru bug yang layar ini perbaiki.
 */
function CostExceededNotice({ redemptionId }: { redemptionId: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2.5">
      <p className="text-base font-semibold text-amber-200">Ongkirnya naik di CollectorCrypt</p>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">
        Ongkir yang diminta CollectorCrypt sekarang lebih tinggi daripada biaya kirim yang sudah
        kami danai untuk pengiriman ini. Karena itu kami tidak menerbitkan transaksi baru, dan
        tidak ada biaya tambahan yang diambil darimu.
      </p>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">
        Menandatangani ulang tidak akan menyelesaikan ini — harganya tidak berubah karena dicoba
        lagi. Selisihnya perlu ditangani tim kami dulu.
      </p>
      {/* Backend menyebutnya eksplisit di pesan error-nya: biaya kirim yang sudah didanai ada di
          wallet user, jadi ini BUKAN kasus refund. Dikatakan supaya user tidak menunggu refund
          yang memang tidak akan datang — tanpa menjanjikan apa pun yang sistem tak bisa lakukan. */}
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">
        Biaya kirim yang sudah kami danai tidak hilang, jadi ini bukan kasus refund. Jangan bayar
        lagi — cukup kabari kami lewat tombol di bawah.
      </p>
      <SupportHandoff
        redemptionId={redemptionId}
        note="Ongkir CollectorCrypt naik melebihi biaya kirim yang sudah didanai, jadi pengirimannya berhenti di tahap tanda tangan."
        lead="Tekan tombol di bawah untuk membuka percakapan dengan tim kami — pesannya sudah kami siapkan lengkap dengan ID ini."
      />
    </div>
  );
}

/**
 * SERAH-TERIMA KE MANUSIA — dipakai setiap layar terminal jalur uang.
 *
 * Versi lama menulis "Kirim ID di bawah ini ke tim kami lewat menu Bantuan". TIDAK ADA menu
 * bernama "Bantuan" di app ini, jadi instruksi itu tidak bisa dijalankan — persis di layar yang
 * cuma muncul setelah USDC treasury bergerak dan nasib kartu tidak diketahui. Yang ADA: Account
 * menu → "Messages" → tab Support (app/messages/page.tsx), thread dua arah ke inbox admin.
 *
 * Jadi layar ini TIDAK menyuruh user mencari menu: ia memberi tombol yang membuka composer-nya
 * dengan subject + isi yang SUDAH terisi (lib/supportLink.ts), dan tetap menampilkan ID-nya
 * besar-besar + tombol salin sebagai jalan keluar kalau user lebih suka menyalinnya sendiri.
 */
function SupportHandoff({
  redemptionId,
  note,
  lead,
}: {
  redemptionId: string;
  note: string;
  lead: string;
}) {
  const draft = shippingSupportDraft(redemptionId, note);
  return (
    <>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-300">{lead}</p>
      <CopyableRedemptionId redemptionId={redemptionId} />
      <Link
        href={supportComposeHref(draft)}
        className="mt-1 block w-full rounded-xl border border-amber-300/30 bg-amber-300/[0.08] px-4 py-3 text-center text-[14px] font-semibold text-amber-100 transition hover:bg-amber-300/[0.16]"
      >
        Hubungi tim lewat {SUPPORT_MENU_LABEL} →
      </Link>
    </>
  );
}

/** ID pengiriman + tombol salin. Tanpa ini, satu-satunya cara memindahkan ID adalah menyeleksi
 *  teks mono di dalam modal — di HP itu menyiksa, dan ini layar yang ID-nya justru paling penting. */
function CopyableRedemptionId({ redemptionId }: { redemptionId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(redemptionId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard diblokir (izin/HTTP/iOS lama) — ID-nya tetap terpampang untuk diseleksi manual,
      // jadi tidak ada yang hilang dan tidak perlu layar error untuk ini.
    }
  };
  return (
    <div className="mt-1 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">ID pengiriman</p>
        <p className="mt-0.5 break-all font-mono text-[12px] text-zinc-200">{redemptionId}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
      >
        {copied ? "Tersalin ✓" : "Salin"}
      </button>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-3 py-4 text-center">{children}</div>;
}

function Spinner() {
  return (
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
  );
}
