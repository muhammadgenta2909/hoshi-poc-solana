"use client";

import { useState, type ReactNode } from "react";
import type { Listing } from "@/lib/market";
import type { Offer } from "@/lib/cardDetail";

import { useCart } from "@/lib/useCart";
import { formatIdr, GOLD_GRADIENT } from "./ui";
import { submitContactMessage } from "@/lib/admin-api";
import { submitOffer } from "@/lib/api";

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;

/** Dark pill button (Make Offer / Message Seller / Add to Cart). */
function PillButton({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
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
      }`}
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
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
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

export default function CardActions({
  listing,
  onOffer,
}: {
  listing: Listing;
  onOffer: (offer: Offer) => void;
}) {
  const { has, add, remove } = useCart();
  const inCart = has(listing.id);

  const [modal, setModal] = useState<null | "offer" | "message">(null);

  // Make Offer state
  const [amount, setAmount] = useState<number>(listing.price);
  const [offerDone, setOfferDone] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerError, setOfferError] = useState<string | null>(null);

  // Message Seller state
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [message, setMessage] = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  const submitOfferAction = async () => {
    if (amount <= 0) return;
    setSubmittingOffer(true);
    setOfferError(null);
    try {
      await submitOffer(listing.id, "You", amount);
      const offer: Offer = { user: "You", ago: "just now", amount: Math.round(amount), status: "PENDING" };
      onOffer(offer);
      setOfferDone(true);
    } catch (err) {
      setOfferError(err instanceof Error ? err.message : "Failed to send offer.");
    } finally {
      setSubmittingOffer(false);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !senderName.trim() || !senderEmail.trim()) return;
    setSending(true);
    setMsgError(null);
    try {
      await submitContactMessage({
        listingId: listing.id,
        listingName: listing.name,
        senderName: senderName.trim(),
        senderEmail: senderEmail.trim(),
        phone: senderPhone.trim() || undefined,
        text: message.trim(),
      });
      setMessageSent(true);
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : "Failed to send message.");
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
    setSenderName("");
    setSenderEmail("");
    setSenderPhone("");
    setMsgError(null);
  };

  return (
    <>
      <div className="mt-3">
        <PillButton onClick={() => setModal("offer")}>Make Offer</PillButton>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <PillButton onClick={() => setModal("message")}>Message Seller</PillButton>
        <PillButton onClick={() => (inCart ? remove(listing.id) : add(listing))} active={inCart}>
          {inCart ? "✓ In Cart" : "Add to Cart"}
        </PillButton>
      </div>

      {modal === "offer" && (
        <Modal title="Make an Offer" onClose={closeOffer}>
          {offerDone ? (
            <div className="text-center">
              <p className="text-sm text-emerald-400">
                Offer IDRX {formatIdr(Math.round(amount))} sent.
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
              <p className="text-sm text-emerald-400">Message sent to {listing.seller}.</p>
              <button
                type="button"
                onClick={closeMessage}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717]"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-zinc-400">
                To seller <span className="text-zinc-200">{listing.seller}</span>
              </p>
              <div className="mt-3 space-y-3">
                <input value={senderName} onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-yellow-400/60"
                />
                <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)}
                  type="email" placeholder="Your Email"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-yellow-400/60"
                />
                <input value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)}
                  placeholder="Phone (optional)"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-yellow-400/60"
                />
                <textarea value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="Hello, is this card still available?"
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-yellow-400/60"
                />
              </div>
              {msgError && <p className="mt-2 text-xs text-red-400">{msgError}</p>}
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !message.trim() || !senderName.trim() || !senderEmail.trim()}
                className="mt-3 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                {sending ? "Sending…" : "Send Message"}
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
