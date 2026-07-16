"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useCart } from "@/lib/useCart";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { Img } from "./ui";
import BalancePill from "./BalancePill";
import AccountMenu, { WalletIdentityPanel } from "@/components/account/AccountMenu";
import {
  CloseIcon,
  UserIcon,
  GearIcon,
  MessageIcon,
  SwapArrowsIcon,
  DepositIcon,
  WithdrawIcon,
  HistoryIcon,
  LogoutIcon,
} from "@/components/account/ui";

// Admin is intentionally NOT a nav entry: /admin is staff-only and reached by
// direct URL, gated by app/admin/layout.tsx. Nav is the user-facing surface.
type NavLabel = "Games" | "Marketplace" | "Vault";

const NAV: { label: NavLabel; href: string; icon?: string }[] = [
  // "Games" membuka halaman pilihan (/games): Open Packs & Open Bid Crack.
  { label: "Games", href: "/games", icon: "/nav-icon.png" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Vault", href: "/vault" },
];

// Breakpoint that splits the two navbars: Tailwind's `lg`, i.e. laptop and up.
// Below it the links and the account menu collapse into the hamburger; at or
// above it the bar is exactly what it always was — links inline on the left,
// account dropdown on the right.
//
// It is `lg`, not `md`, because the whole right cluster (balance + the labelled
// "Your Cart ( n )" pill + the account pill) plus the inline links no longer fit
// a 768–1023px viewport: the row overflowed the gutter, crushed the balance pill
// below its own content and pushed the page into a horizontal scrollbar. Keep
// this string in sync with the `lg:` classes below — the drawer closes itself on
// the same query, so a drift would strand it open on the desktop bar.
const DESKTOP = "(min-width: 1024px)";

export default function TopNav({ active }: { active?: NavLabel }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Stable: the drawer's scroll-lock effect depends on it, and a fresh identity
  // each render would tear the lock down and rebuild it on every re-render.
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[#0a0907]/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="relative mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3.5 sm:px-6">
        {/* left — primary nav (laptop and up) */}
        <nav className="hidden flex-1 items-center gap-7 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.label} label={n.label} href={n.href} active={active === n.label} icon={n.icon} />
          ))}
        </nav>

        {/* center — logo. Below `lg` the nav column is display:none, so a
            `flex-1 justify-center` box would only centre the logo inside the LEFT
            HALF of the bar (the right cluster's min-content makes the two columns
            unequal) — and it would jog sideways as the balance loads. Pin it to
            the bar's own centre instead, and hand it back to the flex flow at lg,
            where the three columns balance on their own. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:flex lg:flex-none lg:translate-x-0 lg:translate-y-0">
          {/* translate-y nudges the wordmark to optical center: the asset carries a
              white underline-glow in its lower half, so the box centers a touch high. */}
          <Img
            src="/logo.png"
            alt="HOSHI"
            className="h-[34px] w-auto translate-y-[7px] sm:h-[38px]"
          />
        </div>

        {/* right — balance + cart, then the account dropdown (laptop) or the
            hamburger (below it), never both. The logo is absolutely positioned
            below lg, so this cluster is free to own the whole row. */}
        {/* min-w-fit is load-bearing: `flex-1` is basis-0, so the cluster is handed
            an equal share of the row and Chrome will shrink it BELOW its own
            content — and because it is justify-end, the overflow spills leftwards,
            crushing the balance pill and painting it over the logo. Flooring the
            box at its content width keeps the row honest; the nav column, which
            has slack, gives up the difference. */}
        <div className="flex min-w-fit flex-1 items-center justify-end gap-2 sm:gap-3">
          <BalancePill className="hidden shrink-0 lg:inline-flex" />
          <CartButton />
          <div className="hidden lg:block">
            <AccountMenu />
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-zinc-100 transition hover:bg-white/10 lg:hidden"
          >
            <MenuIcon />
          </button>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} active={active} />
    </header>
  );
}

/** Cart pill — icon + "Your Cart ( n )" (client cart; count is 0 on SSR →
 *  hydration-safe). The label drops below `sm`, where the count rides along as a
 *  badge so the pill still says how full the cart is. */
function CartButton() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      aria-label={`Your cart (${count} ${count === 1 ? "item" : "items"})`}
      className="relative inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 sm:px-4"
    >
      <BagIcon />
      <span className="hidden whitespace-nowrap sm:inline">
        Your Cart <span className="tabular-nums text-zinc-400">( {count} )</span>
      </span>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold leading-none text-[#171717] sm:hidden">
          {count}
        </span>
      )}
    </Link>
  );
}

/* ------------------------------ mobile drawer ------------------------------ */

/** The small-screen menu: the nav links plus everything the desktop account
 *  dropdown holds, in one sheet. Portalled to <body> so it can't be trapped by
 *  the header's sticky stacking context.
 *
 *  NOTE: the account icons are read INSIDE the component, never at module scope
 *  — account/ui.tsx → TopNav → account/ui.tsx is a circular import, so touching
 *  those exports at module-init time would hit their temporal dead zone. */
function MobileMenu({
  open,
  onClose,
  active,
}: {
  open: boolean;
  onClose: () => void;
  active?: NavLabel;
}) {
  const { publicKey, disconnect } = useWallet();
  const { logout } = useAuth();
  const { open: openConnect } = useWalletConnect();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Growing past the breakpoint brings the desktop bar back, which already
    // holds every one of these links — leaving the sheet open would strand a
    // scroll lock behind it.
    const mq = window.matchMedia(DESKTOP);
    const onDesktop = () => mq.matches && onClose();
    mq.addEventListener("change", onDesktop);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      mq.removeEventListener("change", onDesktop);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const address = publicKey?.toBase58() ?? null;
  const iconCls = "h-[18px] w-[18px]";

  const ACCOUNT = [
    { label: "Profile", href: "/account", icon: <UserIcon className={iconCls} /> },
    { label: "Setting", href: "/settings", icon: <GearIcon className={iconCls} /> },
    { label: "Messages", href: "/messages", icon: <MessageIcon className={iconCls} /> },
    { label: "Swap", href: "/swap", icon: <SwapArrowsIcon className={iconCls} /> },
  ];
  const SHIPMENTS = [
    { label: "Deposit", href: "/deposit", icon: <DepositIcon className={iconCls} />, tint: "text-emerald-400" },
    { label: "Withdraw", href: "/withdraw", icon: <WithdrawIcon className={iconCls} />, tint: "text-amber-400" },
    { label: "Withdraw History", href: "/withdraw/history", icon: <HistoryIcon className={iconCls} />, tint: "text-amber-400" },
  ];

  const onLogout = () => {
    onClose();
    logout();
    disconnect().catch(() => {});
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] md:hidden" role="presentation" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 flex h-full w-[84%] max-w-[320px] flex-col overflow-y-auto border-l border-white/10 bg-[#141206] shadow-[0_0_80px_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
          <Img src="/logo.png" alt="HOSHI" className="h-[30px] w-auto" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <nav className="p-2">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold transition ${
                active === n.label
                  ? "bg-yellow-400/[0.08] text-yellow-300"
                  : "text-zinc-200 hover:bg-white/[0.05]"
              }`}
            >
              {n.icon ? (
                <Img src={n.icon} alt="" className="h-4 w-4 object-contain" />
              ) : (
                <span className="h-4 w-4" />
              )}
              {n.label}
            </Link>
          ))}
        </nav>

        {address ? (
          <>
            {/* The bar drops the balance pill below lg, so this is the only place
                a phone user can read their IDRX balance or copy their address. */}
            <div className="border-t border-white/[0.06] p-3">
              <BalancePill className="inline-flex w-full justify-center" />
            </div>

            <div className="border-t border-white/[0.06] p-3">
              <WalletIdentityPanel address={address} />
            </div>

            <div className="border-t border-white/[0.06] p-2">
              {ACCOUNT.map((n) => (
                <DrawerLink key={n.label} {...n} onNavigate={onClose} />
              ))}
            </div>

            <div className="border-t border-white/[0.06] p-2">
              <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
                My shipments
              </p>
              {SHIPMENTS.map((n) => (
                <DrawerLink key={n.label} {...n} onNavigate={onClose} />
              ))}
            </div>

            <div className="mt-auto border-t border-white/[0.06] p-2">
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-zinc-200 transition hover:bg-white/[0.05]"
              >
                <LogoutIcon className="h-[18px] w-[18px] text-zinc-400" />
                Log out
              </button>
            </div>
          </>
        ) : (
          <div className="border-t border-white/[0.06] p-4">
            <button
              type="button"
              onClick={() => {
                onClose();
                openConnect();
              }}
              className="w-full rounded-xl px-5 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: NAV_GRADIENT }}
            >
              Connect Wallet
            </button>
            <p className="mt-2 text-center text-[12px] text-zinc-500">
              Connect to reach your profile, offers and shipments.
            </p>
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}

function DrawerLink({
  label,
  href,
  icon,
  tint,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  tint?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-zinc-200 transition hover:bg-white/[0.05]"
    >
      <span className={tint ?? "text-zinc-400"}>{icon}</span>
      {label}
    </Link>
  );
}

/* --------------------------------- nav link -------------------------------- */

// Active-nav gold gradient (Figma: linear #FBB222 -> #FFF600).
const NAV_GRADIENT = "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)";

function NavLink({
  label,
  href,
  active,
  icon,
}: {
  label: string;
  href: string;
  active?: boolean;
  icon?: string;
}) {
  return (
    <Link
      href={href}
      className={`relative inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold leading-none transition ${
        active ? "" : "text-zinc-100 hover:text-white"
      }`}
    >
      {icon && <Img src={icon} alt="" className="h-4 w-auto" />}
      {/* wrapper shrinks to the text, so the underline tracks the label width only */}
      <span className="relative inline-block">
        <span
          style={
            active
              ? {
                  backgroundImage: NAV_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter: "drop-shadow(0 1px 4px rgba(251,178,34,0.35))",
                }
              : undefined
          }
        >
          {label}
        </span>
        {active && (
          <span
            className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full"
            style={{
              backgroundImage: NAV_GRADIENT,
              boxShadow: "0 1px 4px rgba(251,178,34,0.35)",
            }}
          />
        )}
      </span>
    </Link>
  );
}

/* ---------------------------------- icons ---------------------------------- */

function BagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8h16l-1.1 11a2 2 0 0 1-2 1.8H7.1a2 2 0 0 1-2-1.8L4 8z" />
      <path d="M9 8V6.4a3 3 0 0 1 6 0V8" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
