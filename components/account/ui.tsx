"use client";

// Shared building blocks for the account area (Profile, Settings, Messages,
// Swap, Deposit/Shipment, Withdraw, Withdraw History). One source of truth so
// every page reads as the same product. Hoshi = warm-dark + gold ACCENTS only —
// deliberately restrained on gradients (a single soft banner sheen, gold on
// primary buttons / active states, nothing that fights the content).

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { PAGE_BG, ACCOUNT_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import { Img } from "@/components/packs/ui";

export const GOLD = "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)";
export const PANEL = "rounded-2xl border border-white/[0.07] bg-white/[0.03]";
export const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-yellow-400/50 focus:bg-white/[0.05]";

export const shortAddr = (a: string, head = 4, tail = 4) =>
  a.length <= head + tail + 1 ? a : `${a.slice(0, head)}…${a.slice(-tail)}`;

/* ------------------------------ page shell -------------------------------- */

/** Standard account page frame: calm background + TopNav + centered container.
 *  Pass `wide` for full-width tools (Withdraw wizard), otherwise ~1080px. */
export function AccountShell({
  children,
  active,
  wide = false,
  calm = true,
}: {
  children: ReactNode;
  active?: "Games" | "Marketplace" | "Vault";
  wide?: boolean;
  /** calm = restrained ACCOUNT_BG (default). Set false to match marketplace glow. */
  calm?: boolean;
}) {
  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background: calm ? ACCOUNT_BG : PAGE_BG,
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav active={active} />
      <main className={`mx-auto ${wide ? "max-w-[1240px]" : "max-w-[1080px]"} px-4 py-7 sm:px-6`}>
        {children}
      </main>
    </div>
  );
}

/* ------------------------------ profile banner ---------------------------- */

/** The identity banner: the "Your Favorite Card" hero with the avatar straddling
 *  its lower edge, name + rename pencil on the left, wallet + copy on the right.
 *  Pass `onRefresh` to hang the gold refresh badge off the avatar. */
export function ProfileBanner({
  name,
  address,
  joined,
  onCopy,
  onRename,
  onRefresh,
  refreshing = false,
  onEditFavorites,
  avatar = "/profile.png",
  right,
}: {
  name: string;
  address: string | null;
  joined?: string;
  onCopy?: () => void;
  /** Shows the pencil affordance next to the name when provided. */
  onRename?: () => void;
  /** Shows the refresh badge on the avatar when provided. Reloads the page data. */
  onRefresh?: () => void;
  /** Spins the badge and blocks re-entry while a reload is in flight. */
  refreshing?: boolean;
  /** Handler for the banner's corner pencil ("Your Favorite Card"). The button is
   *  part of the artwork, so it renders either way — but with nothing wired to it
   *  it stays disabled rather than pretending to work. */
  onEditFavorites?: () => void;
  avatar?: string;
  right?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!address) return;
    onCopy?.();
    if (await copyText(address)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <div className="relative">
      {/* Hero. The art is a composed panel (speech bubble + favourite-card shelf)
          that already carries its OWN rounded gold frame, so it gets no border and
          no rounded clip of ours — a second, differently-radiused edge around it
          reads as a stray outline. It renders at its own 1027:217 ratio rather than
          being cropped; width/height keep the box reserved before it decodes. */}
      <Img
        src="/banner-profile-main.png"
        alt=""
        aria-hidden
        width={1027}
        height={217}
        className="block h-auto w-full"
      />

      {/* Corner button, tucked flush into the banner's top-right with no inset. The
          asset is already the gold disc, so it needs no wrapper fill.
          right-[1.17%], not right-0: the artwork stops at x=1014 of the 1027px PNG,
          so the file carries ~12px of transparent slop down its right edge. Pinning
          to the BOX corner would hang the disc off the gold frame; 12/1027 lands it
          on the ART corner. Top needs no such nudge — the art starts at y=0. */}
      <button
        type="button"
        onClick={onEditFavorites}
        disabled={!onEditFavorites}
        aria-label={
          onEditFavorites ? "Edit your favourite cards" : "Editing favourite cards is coming soon"
        }
        title={
          onEditFavorites ? "Edit your favourite cards" : "Editing favourite cards is coming soon"
        }
        className="absolute right-[1.17%] top-0 h-7 w-7 rounded-full transition enabled:hover:brightness-110 disabled:cursor-not-allowed sm:h-8 sm:w-8"
      >
        <Img src="/icon-list.png" alt="" className="h-full w-full object-contain" />
      </button>

      {/* Avatar overlaps the banner, so pull the identity row up under it. The
          banner is now fluid (it tracks the 1027:217 ratio), so on a phone it is
          only ~75px tall — a fixed 112px avatar would sit ON TOP of the whole
          composition and bury the speech bubble. Both the avatar and the pull-up
          scale with it. */}
      <div className="relative -mt-8 flex flex-col gap-4 px-1 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-end gap-3 sm:gap-4">
          <div className="relative shrink-0">
            <Img
              src={avatar}
              alt=""
              aria-hidden
              className="h-16 w-16 rounded-full border-4 border-[#0a0907] bg-[#151105] object-cover sm:h-[112px] sm:w-[112px]"
            />
            {/* The asset already carries the gold disc, so it needs no wrapper. */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh profile"
                title="Refresh profile"
                className="absolute -left-1 bottom-0 h-6 w-6 rounded-full transition hover:brightness-110 disabled:cursor-wait sm:bottom-1.5 sm:h-8 sm:w-8"
              >
                <Img
                  src="/icon-refresh-yellow.png"
                  alt=""
                  className={`h-full w-full object-contain ${refreshing ? "motion-safe:animate-spin" : ""}`}
                />
              </button>
            )}
          </div>

          <div className="min-w-0 pb-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[22px] font-bold text-white sm:text-[28px]">{name}</h1>
              {onRename && (
                <button
                  type="button"
                  onClick={onRename}
                  aria-label="Edit display name"
                  title="Edit display name"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg transition hover:bg-white/[0.08]"
                >
                  <Img src="/icon-pen.png" alt="" className="h-4 w-4 object-contain" />
                </button>
              )}
              {joined && (
                <span className="ml-1 hidden whitespace-nowrap text-[13px] text-zinc-500 sm:inline">
                  Joined in {joined}
                </span>
              )}
            </div>
            {joined && (
              <span className="text-[13px] text-zinc-500 sm:hidden">Joined in {joined}</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 pb-1">
          {right}
          {address && (
            <button
              type="button"
              onClick={copy}
              title="Copy address"
              className="inline-flex items-center gap-2.5 font-mono text-[14px] text-zinc-200 transition hover:text-yellow-300"
            >
              {shortAddr(address, 6, 4)}
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-yellow-400/25 bg-yellow-400/10">
                <Img src="/icon-copy-yellow.png" alt="" className="h-4 w-4 object-contain" />
              </span>
              <span
                aria-live="polite"
                className={`text-[12px] font-sans text-emerald-400 transition-opacity ${
                  copied ? "opacity-100" : "opacity-0"
                }`}
              >
                Copied
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- tabs ----------------------------------- */

/** Segmented tabs, the active one ringed in gold. Controlled — the caller owns
 *  the active value.
 *
 *  `vertical` turns the row into the profile's left-hand rail, which is a column
 *  of full-width pills beside the banner rather than a strip beneath it.
 *  `labels` lets a caller show design copy ("Active Listings") while the tab
 *  VALUES stay the loud uppercase keys the pages switch on. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
  vertical = false,
  jersey = false,
  labels,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (t: T) => void;
  className?: string;
  vertical?: boolean;
  /** Pixel display face. Orthogonal to `vertical` on purpose: the profile wants it
   *  on BOTH its rail and its phone strip, while Settings' tabs stay sans. */
  jersey?: boolean;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div
      className={
        vertical
          ? `flex w-[168px] shrink-0 flex-col gap-2.5 ${className}`
          : `no-scrollbar flex gap-2.5 overflow-x-auto sm:gap-3 ${className}`
      }
    >
      {tabs.map((t) => {
        const on = t === active;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={on}
            style={jersey ? { fontFamily: "var(--font-jersey)" } : undefined}
            className={`whitespace-nowrap rounded-xl px-4 transition ${
              vertical ? "w-full py-2.5" : "min-w-[132px] flex-1 py-3"
            } ${
              // Jersey 10 is a tall, narrow pixel face — at the 12/13px the sans
              // labels use it reads as a smudge, so it steps the size up and drops
              // the uppercase tracking, which it does not need.
              jersey
                ? "text-[19px] leading-none tracking-wide"
                : "text-[12px] font-semibold uppercase tracking-[0.06em] sm:text-[13px]"
            } ${
              on
                ? "bg-yellow-400/[0.07] text-yellow-300 shadow-[inset_0_0_0_2px_rgba(250,204,21,0.85)]"
                : "bg-white/[0.03] text-zinc-400 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
          >
            {labels?.[t] ?? t}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------- panels ---------------------------------- */

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`${PANEL} ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      {children}
    </h2>
  );
}

/** Centered empty state — icon, headline, sub, optional CTA. */
export function EmptyState({
  icon,
  title,
  sub,
  action,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] px-6 py-16 text-center">
      {icon && <div className="text-zinc-600">{icon}</div>}
      <p className="text-[15px] font-semibold text-zinc-300">{title}</p>
      {sub && <p className="max-w-sm text-[13px] text-zinc-500">{sub}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* -------------------------------- form bits ------------------------------- */

/** Label on the left (or above on mobile) + control on the right. */
export function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-t border-white/[0.05] py-5 first:border-t-0 sm:grid-cols-[160px_1fr] sm:items-start sm:gap-6">
      <div className="pt-2">
        <label className="text-[14px] font-medium text-zinc-200">{label}</label>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`${INPUT} min-h-[96px] resize-y leading-relaxed ${props.className ?? ""}`}
    />
  );
}

/** Themed dropdown (the native <select> popup can't be styled). Signature:
 *  `<Select value={v} onChange={setV} options={["A","B"]} />` or with
 *  `options={[{ value: "a", label: "A" }]}`. */
export { default as Select } from "@/components/packs/Dropdown";

/** Gold-accent switch (on = brand gold). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-yellow-400" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
      {label && <span className="text-[13px] text-zinc-300">{label}</span>}
    </label>
  );
}

/* -------------------------------- buttons --------------------------------- */

export function PrimaryButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{ backgroundImage: GOLD, ...(rest.style ?? {}) }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`rounded-xl border border-white/12 bg-white/[0.03] px-5 py-2.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/* --------------------------------- modal ---------------------------------- */

/** Portal modal: backdrop + centered panel + title/close. Escape & backdrop
 *  click both close. Mount only when `open` for clean state + no SSR surface. */
export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="relative my-8 w-full rounded-2xl border border-white/10 bg-[#141206] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]"
        style={{ maxWidth }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
        <h2 className="pr-8 text-[18px] font-bold text-white">{title}</h2>
        {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------- step bar --------------------------------- */

/** Segmented progress for wizards (Withdraw). `step` is 1-based. */
export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full transition ${
            i < step ? "bg-yellow-400" : "bg-white/10"
          }`}
        />
      ))}
    </div>
  );
}

/* -------------------------------- helpers --------------------------------- */

/** Copy text, returning whether it likely succeeded (for a "Copied!" flash). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Close-on-outside-click for dropdowns. Returns a ref to attach to the root. */
export function useOutsideClose(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

/* --------------------------------- icons ---------------------------------- */
// Stroke icons, inherit currentColor. 24x24 viewBox.

type IP = { className?: string; style?: CSSProperties };
const S = (p: IP & { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={p.className ?? "h-5 w-5"}
    style={p.style}
    aria-hidden
  >
    {p.children}
  </svg>
);

export const UserIcon = (p: IP) => (
  <S {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </S>
);
export const GearIcon = (p: IP) => (
  <S {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 3V3a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17.4 5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </S>
);
export const MessageIcon = (p: IP) => (
  <S {...p}>
    <path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.5A8 8 0 1 1 21 11.5z" />
  </S>
);
export const SwapArrowsIcon = (p: IP) => (
  <S {...p}>
    <path d="M7 10l-3-3 3-3" />
    <path d="M4 7h11a5 5 0 0 1 0 10h-1" />
    <path d="M17 14l3 3-3 3" />
    <path d="M20 17H9" />
  </S>
);
export const DepositIcon = (p: IP) => (
  <S {...p}>
    <path d="M7 17L17 7" />
    <path d="M8 7h9v9" />
  </S>
);
export const WithdrawIcon = (p: IP) => (
  <S {...p}>
    <path d="M17 7L7 17" />
    <path d="M16 17H7V8" />
  </S>
);
export const HistoryIcon = (p: IP) => (
  <S {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </S>
);
export const LogoutIcon = (p: IP) => (
  <S {...p}>
    <path d="M15 12H4" />
    <path d="M8 8l-4 4 4 4" />
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
  </S>
);
export const CopyIcon = (p: IP) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
  </S>
);
export const CloseIcon = (p: IP) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const ChevronDownIcon = (p: IP) => (
  <S {...p}>
    <path d="M6 9l6 6 6-6" />
  </S>
);
export const PlusIcon = (p: IP) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const SearchIcon = (p: IP) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4-4" />
  </S>
);
export const WarningIcon = (p: IP) => (
  <S {...p}>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </S>
);
export const InboxIcon = (p: IP) => (
  <S {...p}>
    <path d="M4 13h4l2 3h4l2-3h4" />
    <path d="M5 5h14l2 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4L5 5z" />
  </S>
);
