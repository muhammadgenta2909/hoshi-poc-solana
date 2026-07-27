import type { Listing } from "@/lib/market";
import { rarityColor } from "@/lib/market";
import CollapsePanel from "./CollapsePanel";
import { GOLD_GRADIENT, GradientText, Idrx, Img } from "./ui";

export default function CardDetailsPanel({
  listing,
  onBuy,
}: {
  listing: Listing | null;
  onBuy: (listing: Listing) => void;
}) {
  return (
    <CollapsePanel icon="/icon-info.png" title="Card Details" toggleIcon="/icon-right.png" side="right">
      {!listing ? (
        <div className="py-12 text-center">
          <Img src="/card1.png" alt="" className="mx-auto w-28 opacity-30" />
          <p className="mt-3 text-sm text-zinc-500">Select a card to inspect</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Hero art */}
          <div>
            <div className="relative rounded-xl bg-black/20 p-3">
              <Img
                src={listing.image}
                alt={listing.name}
                className="mx-auto aspect-[3/4] w-40 rounded-lg object-cover"
              />
              <span
                className="absolute left-4 top-4 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background: rarityColor(listing.rarity) + "2E",
                  color: rarityColor(listing.rarity),
                }}
              >
                {listing.rarity}
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold text-zinc-50">{listing.name}</p>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">{listing.set}</p>
          </div>

          {/* Guarantee. Two independent sources:
              - Hoshi-backed: a fixed IDRX buyback amount we promise (buyback > 0).
              - CollectorCrypt: CC has an active buyback offer (ccHasBuyback). The
                price and execution are CC's — we never show an IDRX number for it,
                because "the only legitimate buyback price is theirs". */}
          {(listing.source ?? "HOSHI") === "COLLECTORCRYPT" ? (
            listing.ccHasBuyback && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">— Guarantee</p>
                <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
                  <Img src="/icon-buyback.png" alt="" className="h-4 w-4 shrink-0" />
                  <span className="flex items-baseline gap-1">
                    <span className="font-semibold text-[#38E5D0]">Buyback Offer</span>
                    <span className="text-xs font-normal text-zinc-400">by</span>
                    <span className="text-base text-[#38E5D0]" style={{ fontFamily: "var(--font-jersey)" }}>
                      COLLECTOR CRYPT
                    </span>
                  </span>
                  <span className="ml-auto text-xs text-zinc-400">at CC price</span>
                </div>
              </div>
            )
          ) : (
            listing.buyback > 0 && (
              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">— Guarantee</p>
                <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
                  <Img src="/icon-buyback.png" alt="" className="h-4 w-4 shrink-0" />
                  <span className="flex items-baseline gap-1">
                    <GradientText className="font-semibold">Buyback Guarantee</GradientText>
                    <span className="text-xs font-normal text-zinc-400">by</span>
                    <GradientText className="text-base" style={{ fontFamily: "var(--font-jersey)" }}>
                      HOSHI
                    </GradientText>
                  </span>
                  <Idrx amount={listing.buyback} size={14} className="ml-auto text-sm text-zinc-200" />
                </div>
              </div>
            )
          )}

          {/* Expected value */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
              <span>— Expected Value</span>
              <span>On IDRX</span>
            </div>
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <Idrx
                amount={listing.expectedValue}
                size={20}
                className="text-2xl font-semibold text-zinc-50"
              />
            </div>
          </div>

          {/* Price */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">— Price</p>
            <div className="rounded-xl bg-black/20 px-3 py-2.5">
              <Idrx amount={listing.price} size={20} className="text-2xl font-semibold text-zinc-50" />
            </div>
          </div>

          {/* Seller */}
          <div>
            <p className="mb-1.5 text-[11px] uppercase tracking-wider text-zinc-500">— Seller</p>
            <div className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-zinc-300">
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                {listing.seller}
              </span>
              <span className="text-[11px] text-zinc-500">Verified seller</span>
            </div>
          </div>

          {/* Buy CTA — mirrors the Rip Pack button */}
          <button
            onClick={() => onBuy(listing)}
            className="relative w-full rounded-2xl px-6 py-4 text-center transition hover:brightness-105 active:scale-[0.99]"
            style={{
              backgroundImage: GOLD_GRADIENT,
              border: "1px solid #F2C101",
              boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)",
            }}
          >
            <span
              className="text-3xl leading-none"
              style={{ fontFamily: "var(--font-jersey)", color: "#171717" }}
            >
              Buy Now
            </span>
            <span className="absolute -top-3 right-4 inline-flex items-center rounded-lg bg-[#171717] px-2.5 py-1 text-xs font-semibold text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)]">
              <Idrx amount={listing.price} size={12} />
            </span>
          </button>
        </div>
      )}
    </CollapsePanel>
  );
}
