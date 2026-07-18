"use client";

// Per-card "List for Sale" — the CollectorCrypt-vault pattern: you open ONE card
// and set a price, instead of a vague global "list" button. The card's identity
// (art, name, rarity, grade) is already known from the pull, so the seller mostly
// just types a price. Submitting links the listing to the real pulled NFT via
// `fromPackMemo` (backend verifies ownership).

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Listing } from "@/lib/market";
import { GRADERS, type Grader } from "@/lib/market";
import { ApiError, createListing } from "@/lib/api";
import { parseGrade, pullToListingInput } from "@/lib/pullListing";
import type { GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { GOLD_GRADIENT, Img } from "./ui";

const idr = new Intl.NumberFormat("id-ID");

export default function ListForSaleModal({
  pull,
  onClose,
  onListed,
}: {
  pull: GachaPull;
  onClose: () => void;
  onListed: (listing: Listing) => void;
}) {
  const { token, login } = useAuth();
  const { setVisible } = useWalletConnect();

  const guessed = useMemo(() => parseGrade(pull.nftName), [pull.nftName]);
  const [price, setPrice] = useState<string>("");
  const [grader, setGrader] = useState<Grader>(guessed?.grader ?? "PSA");
  const [score, setScore] = useState<string>(String(guessed?.score ?? 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const scoreNum = Number(score);
  const valid = Number.isFinite(priceNum) && priceNum > 0 && scoreNum > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      let t = token;
      if (!t) t = await login(); // pops connect/sign if needed
      const input = pullToListingInput(pull, {
        price: Math.round(priceNum),
        grader,
        gradeScore: scoreNum,
      });
      const listing = await createListing(input, t);
      onListed(listing);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setVisible(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`List ${pull.nftName ?? "card"} for sale`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">List for Sale</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Card preview — identity is fixed, mirrors CC's "list this exact card". */}
        <div className="mb-4 flex gap-3">
          <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
            <Img
              src={pull.nftImage ?? "/card-back.svg"}
              alt={pull.nftName ?? "Pulled card"}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">
              {pull.nftName ?? "Your card"}
            </p>
            {pull.rarity && <p className="text-[12px] text-zinc-500">{pull.rarity}</p>}
            <p className="mt-1 text-[11px] text-zinc-500">
              Tertaut ke NFT hasil pull-mu.
            </p>
          </div>
        </div>

        {/* Price — the one field the seller actually sets. */}
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
            Harga jual (IDRX)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="mis. 2.000.000"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
          />
          {priceNum > 0 && (
            <span className="mt-1 block text-[12px] text-zinc-500">
              = Rp {idr.format(Math.round(priceNum))}
            </span>
          )}
        </label>

        {/* Grade — prefilled from the card name, editable so it's never silently wrong. */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grader</span>
            <select
              value={grader}
              onChange={(e) => setGrader(e.target.value as Grader)}
              className="w-full rounded-xl border border-white/10 bg-[#141206] px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-yellow-400/40"
            >
              {GRADERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grade</span>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              max={10}
              step={0.5}
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-yellow-400/40"
            />
          </label>
        </div>

        {error && <p className="mb-3 text-[13px] text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundImage: GOLD_GRADIENT }}
        >
          {busy ? "Memajang…" : "List for Sale"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
