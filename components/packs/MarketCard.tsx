import type { ReactNode } from "react";
import Link from "next/link";
import type { Currency, Listing } from "@/lib/market";
import { secondaryPrice } from "@/lib/market";
import { formatIdr, GOLD_GRADIENT, GradientText, Img } from "./ui";

/** Frosted badge (Figma: white 21% + blur) for grade / language / era. */
function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-white/[0.21] px-2 py-[3px] text-[13px] uppercase leading-none tracking-wide text-white backdrop-blur-sm"
      style={{ fontFamily: "var(--font-jersey)" }}
    >
      {children}
    </span>
  );
}

/** Illustration-category badge (Figma gambar 2: white 3% fill + drop shadow). */
function CategoryBadge({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-[3px] text-[13px] uppercase leading-none tracking-wide text-white"
      style={{
        fontFamily: "var(--font-jersey)",
        background: "rgba(255,255,255,0.03)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
      }}
    >
      {children}
    </span>
  );
}

/** The IDRX coin as specified in Figma (fill #0F56E6). */
function IdrxCoin({ size = 24 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55), background: "#0F56E6" }}
      className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none text-white"
    >
      X
    </span>
  );
}

export default function MarketCard({
  listing,
  currency,
  showStatus = false,
}: {
  listing: Listing;
  currency: Currency;
  /** Opt-in owner view: overlay a "LISTED" / "IN VAULT" chip on the art. */
  showStatus?: boolean;
}) {
  return (
    <Link
      href={`/marketplace/${listing.id}`}
      aria-label={`View ${listing.name}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-white/5 text-left transition hover:border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      {/* Image parent — frosted white 9% (Figma) */}
      <div className="relative bg-white/[0.09] p-3 backdrop-blur-sm">
        {showStatus &&
          (listing.status === "ACTIVE" ? (
            <span
              className="absolute left-2 top-2 z-10 inline-flex items-center rounded-md px-2 py-[3px] text-[13px] uppercase leading-none tracking-wide text-[#171717]"
              style={{ fontFamily: "var(--font-jersey)", backgroundImage: GOLD_GRADIENT }}
            >
              Listed
            </span>
          ) : (
            <span
              className="absolute left-2 top-2 z-10 inline-flex items-center rounded-md bg-white/10 px-2 py-[3px] text-[13px] uppercase leading-none tracking-wide text-white backdrop-blur-sm"
              style={{ fontFamily: "var(--font-jersey)" }}
            >
              In Vault
            </span>
          ))}
        <Img
          src={listing.image}
          alt={listing.name}
          className="mx-auto aspect-[3/4] w-full rounded-lg object-contain transition duration-300 group-hover:scale-[1.02]"
        />
      </div>

      {/* Lower section — #181507 */}
      <div className="flex flex-1 flex-col bg-[#181507] p-3.5">
        {/* grade / language / era badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{listing.grade}</Badge>
          <Badge>{listing.language === "Japan" ? "Japan" : "English"}</Badge>
          <Badge>{listing.era}</Badge>
        </div>

        {/* title + Hoshi-backed mark */}
        <div className="mt-3 flex items-center gap-2">
          <span className="truncate text-[17px] font-bold uppercase leading-tight text-white">
            {listing.name}
          </span>
          {listing.buyback > 0 && (
            <GradientText
              className="shrink-0 text-lg leading-none"
              style={{ fontFamily: "var(--font-jersey)" }}
            >
              HOSHI
            </GradientText>
          )}
        </div>

        {/* illustration category */}
        <div className="mt-2">
          <CategoryBadge>{listing.category}</CategoryBadge>
        </div>

        {/* views */}
        <div className="mt-3 flex items-center gap-1.5 text-zinc-300">
          <Img src="/visibility.png" alt="" className="h-4 w-4 opacity-80" />
          <span className="text-[15px] leading-none" style={{ fontFamily: "var(--font-jersey)" }}>
            {formatIdr(listing.views)}
          </span>
        </div>

        {/* price */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <p
            className="text-[15px] uppercase leading-none tracking-wider text-zinc-400"
            style={{ fontFamily: "var(--font-jersey)" }}
          >
            Price
          </p>
          <div
            className="mt-1.5 inline-flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(0,0,0,0.2)" }}
          >
            <IdrxCoin size={24} />
            <span
              className="text-2xl leading-none text-white"
              style={{ fontFamily: "var(--font-jersey)" }}
            >
              {formatIdr(listing.price)}
            </span>
          </div>
          <p
            className="mt-1.5 text-[15px] leading-none tabular-nums text-zinc-400"
            style={{ fontFamily: "var(--font-jersey)" }}
          >
            = {secondaryPrice(listing.price, currency)}
          </p>
        </div>
      </div>
    </Link>
  );
}
