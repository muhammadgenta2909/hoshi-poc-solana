"use client";

// Logika aksi kartu (Make Offer · Message Seller · Add to Cart) diekstrak jadi HOOK supaya bisa
// dipakai ulang di beberapa tempat pada halaman detail: tombol "Message Seller" berdiri sendiri
// (di atas, dekat "Dijual oleh"), tombol "Make Offer" di bilah beli fixed (mobile), dan tombol
// inline (desktop). Semua berbagi SATU sumber modal → tak ada duplikasi state/UX.

import { useState, type ReactNode } from "react";
import type { Listing } from "@/lib/market";
import type { Offer } from "@/lib/cardDetail";

import { useCart } from "@/lib/useCart";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { formatIdr, GOLD_GRADIENT } from "@/components/packs/ui";
import { postListingMessage } from "@/lib/marketMessaging";
import { submitOffer } from "@/lib/api";

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;

/** Dark pill button (Make Offer / Message Seller / Add to Cart) — dipakai di layout desktop. */
export function DarkPill({
  children,
  onClick,
  active = false,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-2xl px-6 py-3.5 text-center text-[15px] font-semibold transition ${
        active
          ? "bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-400/40"
          : "bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Centered modal over a dimmed backdrop. */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1b1810] p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[20px] leading-none text-white" style={JERSEY}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type CardActionsApi = {
  /** Buka modal "Make an Offer". */
  openOffer: () => void;
  /** Buka modal "Message Seller". */
  openMessage: () => void;
  /** Tambah / hapus dari keranjang. */
  toggleCart: () => void;
  /** Sudah di keranjang? */
  inCart: boolean;
  /** JSX modal — render SEKALI di mana pun (mis. akhir kolom). */
  modals: ReactNode;
};

/** Hook: state + modal untuk aksi kartu. `onOffer` meng-echo tawaran yang tersimpan ke UI. */
export function useCardActions(
  listing: Listing,
  onOffer: (offer: Offer) => void,
): CardActionsApi {
  const { has, add, remove } = useCart();
  const { token } = useAuth();
  const { open: openWallet } = useWalletConnect();
  const inCart = has(listing.id);

  const [modal, setModal] = useState<null | "offer" | "message">(null);

  // Make Offer state
  const [amount, setAmount] = useState<number>(listing.price);
  const [offerDone, setOfferDone] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  // Message Seller state — pengirim = user yang login (bukan form anonim).
  const [message, setMessage] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  const submitOfferAction = async () => {
    if (amount <= 0 || !token) return;
    setSubmittingOffer(true);
    setOfferError(null);
    try {
      const saved = await submitOffer(listing.id, amount, token);
      onOffer({
        id: saved.id,
        user: saved.buyer.label,
        ago: "just now",
        amount: saved.amount,
        status: saved.status,
      } satisfies Offer);
      setOfferDone(true);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "Failed to send offer.");
    } finally {
      setSubmittingOffer(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !token) return;
    setSending(true);
    setMsgError(null);
    try {
      await postListingMessage(listing.id, message.trim(), token);
      setMessageSent(true);
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  };

  const closeOffer = () => {
    setModal(null);
    setOfferDone(false);
    setOfferError(null);
  };
  const closeMessage = () => {
    setModal(null);
    setMessageSent(false);
    setMessage("");
    setMsgError(null);
  };

  const modals = (
    <>
      {modal === "offer" && (
        <Modal title="Make an Offer" onClose={closeOffer}>
          {offerDone ? (
            <div className="text-center">
              <p className="text-sm text-emerald-400">
                Offer IDRX {formatIdr(Math.round(amount))} sent.
              </p>
              <p className="mt-1.5 text-xs text-zinc-500">
                The seller can accept or decline it from their profile.
              </p>
              <button
                type="button"
                onClick={closeOffer}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717]"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Done
              </button>
            </div>
          ) : !token ? (
            <div className="text-center">
              <p className="text-sm text-zinc-300">Verify your wallet to make an offer.</p>
              <p className="mt-1.5 text-xs text-zinc-500">
                Offers are linked to your wallet so the seller can respond to you.
              </p>
              <button
                type="button"
                onClick={() => {
                  closeOffer();
                  openWallet();
                }}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717]"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Connect wallet
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Price: <span className="text-zinc-200">IDRX {formatIdr(listing.price)}</span>
              </p>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-[12px] uppercase tracking-wide text-zinc-400">
                  Your Offer (IDRX)
                </span>
                <input
                  type="number"
                  min={0}
                  step={100_000}
                  value={Number.isNaN(amount) ? "" : amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm tabular-nums text-zinc-100 outline-none focus:border-yellow-400/60"
                />
              </label>
              {offerError && <p className="mt-2 text-xs text-red-400">{offerError}</p>}
              <button
                type="button"
                onClick={submitOfferAction}
                disabled={submittingOffer || amount <= 0}
                className="mt-4 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                {submittingOffer ? "Sending…" : "Send Offer"}
              </button>
            </>
          )}
        </Modal>
      )}

      {modal === "message" && (
        <Modal title="Message Seller" onClose={closeMessage}>
          {messageSent ? (
            <div className="text-center">
              <p className="text-sm text-emerald-400">Pesan terkirim ke penjual.</p>
              <p className="mt-1.5 text-xs text-zinc-500">
                Balasan penjual akan muncul di <span className="text-zinc-300">Messages</span> kamu (tab Marketplace).
              </p>
              <button
                type="button"
                onClick={closeMessage}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717]"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Done
              </button>
            </div>
          ) : !token ? (
            <div className="text-center">
              <p className="text-sm text-zinc-300">Masuk dulu untuk menghubungi penjual.</p>
              <p className="mt-1.5 text-xs text-zinc-500">
                Pesan ditautkan ke akunmu supaya penjual bisa membalas.
              </p>
              <button
                type="button"
                onClick={() => {
                  closeMessage();
                  openWallet();
                }}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717]"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Connect wallet
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                Ke penjual <span className="text-zinc-200">{listing.seller}</span>
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Halo, kartunya masih tersedia?"
                className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-yellow-400/60"
              />
              {msgError && <p className="mt-2 text-xs text-red-400">{msgError}</p>}
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !message.trim()}
                className="mt-3 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                {sending ? "Mengirim…" : "Send Message"}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );

  return {
    openOffer: () => setModal("offer"),
    openMessage: () => setModal("message"),
    toggleCart: () => (inCart ? remove(listing.id) : add(listing)),
    inCart,
    modals,
  };
}
