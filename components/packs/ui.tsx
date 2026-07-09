import type { CSSProperties, ImgHTMLAttributes, ReactNode } from "react";
import type { Pack } from "@/lib/packs";

const idr = new Intl.NumberFormat("id-ID");

/** Shared gold brand gradient (Figma: linear #FBB222 -> #FFF600). */
export const GOLD_GRADIENT = "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)";

/**
 * White hairlines down the LEFT & RIGHT edges ONLY, fading out toward the top
 * and bottom ends (Figma) — never a solid full-height line. Layered as
 * background-images so they paint over the element's fill color without extra
 * DOM; combine with a Tailwind `bg-*` (background-color) and a `rounded-*`.
 */
export const SIDE_LINES: CSSProperties = {
  backgroundImage:
    "linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.45) 26%, rgba(255,255,255,0.45) 74%, transparent 100%), linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.45) 26%, rgba(255,255,255,0.45) 74%, transparent 100%)",
  backgroundSize: "1px 100%, 1px 100%",
  backgroundPosition: "left center, right center",
  backgroundRepeat: "no-repeat",
};

/** Selected/idle treatment for toggle tiles (pack cells, market cards, filter
 *  toggles) — one source of truth so "selected" reads identically app-wide. */
export const TOGGLE_SELECTED =
  "border-yellow-400 bg-yellow-400/10 shadow-[0_0_0_1px_rgba(250,204,21,0.4),0_0_26px_-6px_rgba(250,204,21,0.65)]";
export const TOGGLE_IDLE =
  "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]";

/** Format an amount with id-ID thousands separators (75.000). */
export const formatIdr = (amount: number) => idr.format(amount);

/** Plain <img> for real /public assets — next/image isn't needed for fixed-size UI chrome. */
export function Img(props: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} />;
}

/** Text painted with the gold brand gradient (background-clip: text). */
export function GradientText({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{
        backgroundImage: GOLD_GRADIENT,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Three short dashes used as a section-label marker (Figma "--- Label").
 *  Inherits the label color via `bg-current`. */
export function LabelStrip({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`mr-1.5 inline-flex items-center gap-[3px] ${className}`}>
      <span className="h-[1.5px] w-[7px] rounded-full bg-current" />
      <span className="h-[1.5px] w-[7px] rounded-full bg-current" />
      <span className="h-[1.5px] w-[7px] rounded-full bg-current" />
    </span>
  );
}

/** The blue IDRX token coin. */
export function IdrxGlyph({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}
      className="inline-grid shrink-0 place-items-center rounded-full bg-[#2f6bff] font-bold leading-none text-white shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
    >
      X
    </span>
  );
}

/** IDRX coin + amount formatted with id-ID thousands separators (75.000). */
export function Idrx({
  amount,
  size = 16,
  className = "",
}: {
  amount: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 tabular-nums ${className}`}>
      <IdrxGlyph size={size} />
      <span>{idr.format(amount)}</span>
    </span>
  );
}

/** Pack artwork — real image if set, otherwise a styled placeholder.
 *  `hero` picks the large center artwork (heroImage), falling back to the thumb. */
export function PackArt({
  pack,
  label,
  big = false,
  hero = false,
  className = "",
}: {
  pack: Pack;
  label?: string;
  big?: boolean;
  hero?: boolean;
  className?: string;
}) {
  const src = hero ? pack.heroImage ?? pack.image : pack.image;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={pack.name} className={`object-contain ${className}`} />
    );
  }
  return (
    <div
      className={`relative isolate overflow-hidden rounded-2xl ${className}`}
      style={{ background: pack.accent }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 45% at 50% 16%, rgba(255,255,255,0.45), transparent 70%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 grid place-items-center px-2 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <span
            className={`font-pixel leading-none text-yellow-50 drop-shadow-[0_2px_0_rgba(0,0,0,0.4)] ${
              big ? "text-2xl" : "text-[11px]"
            }`}
          >
            HOSHI
          </span>
          {label && (
            <span className="rounded bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/85">
              {label}
            </span>
          )}
        </div>
      </div>
      <span className="pointer-events-none absolute bottom-1 right-1.5 text-[8px] font-medium uppercase tracking-wider text-white/40">
        dummy
      </span>
    </div>
  );
}

/** Small card thumbnail placeholder used in the live ticker. */
export function CardThumb({
  accent = "linear-gradient(160deg,#f59e0b,#7c2d12)",
  className = "",
}: {
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md ${className}`}
      style={{ background: accent }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,255,255,0.4), transparent 70%)",
        }}
      />
      <span className="absolute inset-0 grid place-items-center text-sm text-white/85">★</span>
    </div>
  );
}

/* ---------- icons ---------- */

type IconProps = { className?: string };

export function SwapIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H4" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h16" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function InfoIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function ShieldIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
