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
import {
  createShippingOrder,
  estimateRedemption,
  fundAndPrepareRedemption,
  getRedemptionStatus,
  submitRedemptionBurn,
  type CardRedemption,
  type RedemptionEstimate,
  type RedemptionStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useSignSerializedTransaction } from "@/lib/useSignSerializedTransaction";
import { GOLD_GRADIENT, Img } from "./ui";

const POLL_MS = 4_000;
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
  FUNDED: "Menyiapkan pengiriman",
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

/** Status yang sudah "jalan" (dana/burn/kirim) — modal masuk mode lacak. */
export const isTrackingShipStatus = (s: RedemptionStatus): boolean =>
  s === "FUNDING" ||
  s === "FUNDED" ||
  s === "BURN_SUBMITTED" ||
  s === "IN_TRANSIT" ||
  s === "DELIVERED" ||
  s === "PACKING" ||
  s === "SHIPPED" ||
  s === "REFUND_DUE" ||
  s === "RECLAIM_DUE" ||
  s === "SHIP_FAILED_POST_BURN";

type Stage =
  | "estimating"
  | "estimate"
  | "paying"
  | "confirming"
  | "awaitingPayment"
  | "readyToFund"
  | "signing"
  | "submitting"
  | "tracking"
  | "error";

export default function ShippingFlowModal({
  redemptionId,
  card,
  resume = false,
  onClose,
  onFinished,
}: {
  redemptionId: string;
  /** Info kartu untuk tampilan; saat resume (halaman ter-reload) bisa null → diambil dari status. */
  card?: { name: string; image: string | null } | null;
  /** true = dibuka sepulang dari halaman bayar / dari daftar pengiriman berjalan. */
  resume?: boolean;
  onClose: () => void;
  /** Dipanggil saat redemption maju ke tahap kirim (burn tersubmit) — untuk refresh vault/daftar. */
  onFinished?: () => void;
}) {
  const { token, login } = useAuth();
  const sign = useSignSerializedTransaction();

  const [stage, setStage] = useState<Stage>(resume ? "confirming" : "estimating");
  const [estimate, setEstimate] = useState<RedemptionEstimate | null>(null);
  const [redemption, setRedemption] = useState<CardRedemption | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Token TERBARU via ref: poll status (resume) sering jalan sebelum token ter-hidrasi; menutup
  // token di closure = basi. Ref membuat tiap tick membaca token yang SEKARANG (pola deposit).
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const cardName = card?.name ?? redemption?.cardName ?? "kartu";
  const cardImage = card?.image ?? redemption?.cardImage ?? null;

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

  // Poll status selama menunggu pembayaran / melacak pengiriman. SATU interval; transisi stage
  // menghentikan/menyalakan ulang lewat deps. READY_TO_FUND → tahap tanda tangan; status kirim →
  // tahap lacak; batal → error.
  useEffect(() => {
    if (stage !== "confirming" && stage !== "awaitingPayment" && stage !== "tracking") return;
    let alive = true;
    const tick = async () => {
      const t = tokenRef.current;
      if (!t) return; // token belum hidrasi → lewati; tick berikutnya coba lagi (jangan pop login)
      try {
        const r = await getRedemptionStatus(redemptionId, t);
        if (!alive) return;
        setRedemption(r);
        const s = r.status;
        if (s === "READY_TO_FUND") {
          clearPendingShip();
          setStage("readyToFund");
        } else if (s === "AWAITING_PAYMENT" || s === "REQUESTED") {
          setStage("awaitingPayment");
        } else if (s === "CANCELED") {
          clearPendingShip();
          setErrorMsg("Permintaan pengiriman dibatalkan.");
          setStage("error");
        } else {
          // FUNDING/FUNDED/BURN_SUBMITTED/IN_TRANSIT/DELIVERED/PACKING/SHIPPED/…
          clearPendingShip();
          setStage("tracking");
        }
      } catch {
        /* transien — teruskan poll; status terminal yang menghentikan */
      }
    };
    const id = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [stage, redemptionId]);

  // Escape + scroll lock (samakan dengan modal Hoshi lain). Tidak boleh tutup saat TTD/submit.
  const busy = stage === "signing" || stage === "submitting" || stage === "paying";
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
        window.location.href = order.paymentUrl; // same tab → backend returnUrl balik ke /withdraw
        return;
      }
      // Tanpa paymentUrl (mis. QRIS inline) → poll di tempat sampai READY_TO_FUND.
      setStage("confirming");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Gagal membuat tagihan ongkir.");
      setStage("error");
    }
  }, [redemptionId, login]);

  // Tanda tangani pengiriman → danai+siapkan tx → TTD tiap tx → submit burn → lacak.
  const signAndSubmit = useCallback(async () => {
    setErrorMsg(null);
    setStage("signing");
    try {
      let t = tokenRef.current;
      if (!t) t = await login();
      const prep = await fundAndPrepareRedemption(redemptionId, t);
      // Lepas-listing DULU (kartu tak bisa di-burn kalau masih terpajang/escrow), baru danai+burn.
      const toSign = [...prep.delistTransactions, ...prep.transactions];
      const signed: string[] = [];
      for (const tx of toSign) signed.push(await sign(tx));
      setStage("submitting");
      await submitRedemptionBurn(redemptionId, signed, t);
      clearPendingShip();
      onFinished?.();
      setStage("tracking");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(
        /reject|declin|denied|cancel|user rejected/i.test(msg)
          ? "Kamu membatalkan tanda tangan. Kartu belum dikirim."
          : msg,
      );
      setStage("error");
    }
  }, [redemptionId, login, sign, onFinished]);

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

        {stage === "confirming" && (
          <Center>
            <Spinner />
            <p className="text-sm font-medium text-emerald-400">Mengonfirmasi pembayaran ongkir…</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Biasanya 1–3 menit. Halaman ini otomatis update begitu ongkirnya masuk.
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
          </div>
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
              onClick={signAndSubmit}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Tanda tangani pengiriman
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
            <p className="text-base font-semibold text-white">
              {redemption ? STATUS_LABEL[redemption.status] : "Sedang diproses"}
            </p>
            <p className="max-w-[20rem] text-[13px] leading-relaxed text-zinc-400">
              {redemption?.status === "DELIVERED"
                ? `${cardName} sudah sampai. Terima kasih!`
                : `${cardName} sedang dalam proses pengiriman ke alamatmu. Statusnya update otomatis di sini.`}
            </p>

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

        {/* --- Error --- */}
        {stage === "error" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-2xl text-red-400">
              !
            </div>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">{errorMsg ?? "Terjadi kesalahan."}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-[15px] font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </Center>
        )}
      </div>
    </div>,
    document.body,
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
