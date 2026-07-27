"use client";

// "Sell back to CollectorCrypt" — their 72-hour instant buyback, end to end.
//
// Flow: ask CC for an offer -> show it and let the user decide -> user signs in
// their own wallet -> we forward the signed bytes to CC -> card moves, refund pays.
//
// The offer is ALWAYS CollectorCrypt's number. We never compute or estimate a
// buyback price locally: a quote we invented would be a promise we cannot keep.
//
// The submit step is NOT idempotent on CC's side, so it is fired exactly once and
// never auto-retried — a retry could be counted twice. If it fails, the user is
// told plainly that the card did not move.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { requestBuyback, submitBuyback, type BuybackQuote } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useSignSerializedTransaction } from "@/lib/useSignSerializedTransaction";
import { GOLD_GRADIENT } from "./ui";

type Stage = "quoting" | "offer" | "signing" | "submitting" | "done" | "error";

const usd = (baseUnits: number) =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(baseUnits / 1_000_000)}`;

export default function BuybackModal({
  nftAddress,
  nftName,
  onClose,
  onSold,
}: {
  nftAddress: string;
  nftName: string | null;
  onClose: () => void;
  /** Fired once the card has really moved — refresh the vault. */
  onSold: () => void;
}) {
  const { token } = useAuth();
  const sign = useSignSerializedTransaction();

  const [stage, setStage] = useState<Stage>("quoting");
  const [quote, setQuote] = useState<BuybackQuote | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Ask for the offer on mount. This only REQUESTS a transaction — nothing moves
  // until the user signs, so it is safe to do before they have committed.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    requestBuyback(nftAddress, token)
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setStage("offer");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStage("error");
      });
    return () => {
      alive = false;
    };
  }, [nftAddress, token]);

  const accept = useCallback(async () => {
    if (!quote || !token) return;
    setErrorMsg(null);
    setStage("signing");
    try {
      const signed = await sign(quote.serializedTransaction);
      setStage("submitting");
      await submitBuyback(quote.packMemo, signed, token);
      setStage("done");
      onSold();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(
        /reject|declin|denied|cancel|user rejected/i.test(msg)
          ? "Kamu membatalkan tanda tangan. Kartu tidak berpindah."
          : msg,
      );
      setStage("error");
    }
  }, [quote, token, sign, onSold]);

  // Escape + body scroll lock, matching the other Hoshi modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stage !== "signing" && stage !== "submitting") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, stage]);

  // Mid-flight the transaction is already in the user's wallet — closing here
  // would hide the outcome of something that is still happening.
  const busy = stage === "signing" || stage === "submitting";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jual balik kartu"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-white">Jual balik ke CollectorCrypt</h2>
            {nftName && <p className="mt-0.5 text-[12px] text-zinc-500">{nftName}</p>}
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

        {stage === "quoting" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Meminta penawaran…</p>
          </Center>
        )}

        {stage === "offer" && quote && (
          <div className="flex flex-col gap-4">
            <div className="rounded-xl bg-[#181507] px-4 py-4 text-center">
              <p className="text-[12px] uppercase tracking-wider text-zinc-500">
                Penawaran CollectorCrypt
              </p>
              <p className="mt-1 text-3xl font-bold text-white">
                {usd(quote.refundAmountUsdc)}
              </p>
              <p className="mt-1 text-[12px] text-zinc-500">USDC</p>
            </div>
            <p className="text-center text-[13px] leading-relaxed text-zinc-400">
              Kartunya akan berpindah ke CollectorCrypt dan dana masuk ke wallet-mu. Kamu
              perlu menandatangani transaksinya di wallet.
            </p>
            <button
              type="button"
              onClick={accept}
              className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Terima &amp; tanda tangani
            </button>
            <button
              type="button"
              onClick={onClose}
              className="-mt-1 w-full py-1 text-[13px] font-medium text-zinc-400 transition hover:text-white"
            >
              Batal
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
            <p className="max-w-[18rem] text-[13px] text-zinc-500">
              Jangan tutup jendela ini.
            </p>
          </Center>
        )}

        {stage === "done" && quote && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <p className="text-base font-semibold text-white">Kartu terjual</p>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              {usd(quote.refundAmountUsdc)} USDC dikirim ke wallet-mu.
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

function Spinner() {
  return (
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
  );
}
