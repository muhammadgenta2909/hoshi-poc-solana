"use client";

// Rupiah on-ramp button + modal for buying a pack via IDRX (QRIS / e-wallet / VA).
// Self-contained and INERT unless NEXT_PUBLIC_PAYMENTS_ENABLED=1 (i.e. the backend
// has real IDRX credentials): with payments off it renders nothing, so it's safe
// to mount anywhere today. Drop it beside the "Rip Pack" button:
//
//   <PayWithRupiah packType={selectedMachine.code} onFulfilled={() => ...} />
//
// Flow (HOSTED = widest channel coverage in one page):
//   create order -> open the IDRX hosted payment page -> poll until FULFILLED
//   (the treasury settles on-chain + the card is minted server-side) -> success.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PAYMENTS_ENABLED,
  ApiError,
  createPackOrder,
  getPaymentOrder,
  isTerminalPaymentStatus,
  type PaymentOrder,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { GOLD_GRADIENT } from "./ui";

const POLL_MS = 4_000;
const idr = new Intl.NumberFormat("id-ID");

export default function PayWithRupiah({
  packType,
  onFulfilled,
  className = "",
}: {
  packType: string;
  /** Called once the order reaches FULFILLED (card minted). e.g. refresh the Vault. */
  onFulfilled?: (order: PaymentOrder) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Feature flag: the whole entry point disappears until IDRX is wired.
  if (!PAYMENTS_ENABLED) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 ${className}`}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f6bff] text-xs font-bold text-white">
          Rp
        </span>
        Bayar via QRIS / e-wallet
      </button>
      {open && (
        <PayModal packType={packType} onFulfilled={onFulfilled} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

type Stage = "creating" | "awaiting" | "fulfilling" | "done" | "error";

// Exported so the Rip Pack payment-method chooser can open the rupiah flow
// directly (mounting this creates the IDRX order). The default-export button
// wrapper above stays for standalone use.
export function PayModal({
  packType,
  onFulfilled,
  onClose,
}: {
  packType: string;
  onFulfilled?: (order: PaymentOrder) => void;
  onClose: () => void;
}) {
  const { token, login } = useAuth();
  const { setVisible } = useWalletConnect();
  const [stage, setStage] = useState<Stage>("creating");
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Create the order once on mount (needs a JWT — sign in first if needed).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let alive = true;
    (async () => {
      try {
        let t = token;
        if (!t) t = await login(); // pops the connect/sign flow if not signed in
        const created = await createPackOrder({ packType, method: "HOSTED" }, t);
        if (!alive) return;
        setOrder(created);
        setStage("awaiting");
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setVisible(true);
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStage("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [packType, token, login, setVisible]);

  // Poll the order until it settles.
  useEffect(() => {
    if (stage !== "awaiting" && stage !== "fulfilling") return;
    if (!order || !token) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const next = await getPaymentOrder(order.merchantOrderId, token);
        if (!alive) return;
        setOrder(next);
        if (next.status === "PAID" || next.status === "FULFILLING") setStage("fulfilling");
        if (isTerminalPaymentStatus(next.status)) {
          clearInterval(id);
          if (next.status === "FULFILLED") {
            setStage("done");
            onFulfilled?.(next);
          } else {
            setErrorMsg(
              next.status === "EXPIRED"
                ? "Pembayaran kedaluwarsa. Silakan ulangi."
                : "Pembayaran gagal. Silakan ulangi.",
            );
            setStage("error");
          }
        }
      } catch {
        /* transient — keep polling; a real failure surfaces via terminal status */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [stage, order, token, onFulfilled]);

  const openHostedPage = useCallback(() => {
    if (order?.paymentUrl) window.open(order.paymentUrl, "_blank", "noopener,noreferrer");
  }, [order]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bayar pack via rupiah"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Bayar dengan Rupiah</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {stage === "creating" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Membuat tagihan…</p>
          </Center>
        )}

        {stage === "awaiting" && order && (
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-zinc-300">
              Total{" "}
              <span className="font-semibold text-white">Rp {idr.format(order.priceIdr)}</span>
            </p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Klik tombol di bawah untuk membuka halaman pembayaran IDRX (QRIS, e-wallet, atau
              virtual account). Setelah bayar, jendela ini otomatis update.
            </p>
            <button
              type="button"
              onClick={openHostedPage}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Buka Halaman Pembayaran ↗
            </button>
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <Spinner small /> Menunggu pembayaran…
            </p>
          </div>
        )}

        {stage === "fulfilling" && (
          <Center>
            <Spinner />
            <p className="text-sm font-medium text-emerald-400">Pembayaran diterima!</p>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              Menyiapkan pack &amp; mengirim kartu ke wallet-mu…
            </p>
          </Center>
        )}

        {stage === "done" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <p className="text-base font-semibold text-white">Pack berhasil dibeli!</p>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              Kartu sudah dikirim ke wallet-mu. Cek di Vault.
            </p>
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

        {stage === "error" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-2xl text-red-400">
              !
            </div>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              {errorMsg ?? "Terjadi kesalahan."}
            </p>
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

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`animate-spin rounded-full border-2 border-white/25 border-t-yellow-400 ${
        small ? "h-3.5 w-3.5" : "h-8 w-8"
      }`}
    />
  );
}
