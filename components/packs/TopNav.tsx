"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/useCart";
import { Img } from "./ui";
import BalancePill from "./BalancePill";
import AccountMenu from "@/components/account/AccountMenu";

// Admin is intentionally NOT a nav entry: /admin is staff-only and reached by
// direct URL, gated by app/admin/layout.tsx. Nav is the user-facing surface.
type NavLabel = "Open Packs" | "Marketplace" | "Vault";

const NAV: { label: NavLabel; href: string; icon?: string }[] = [
  { label: "Open Packs", href: "/open-packs", icon: "/nav-icon.png" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Vault", href: "/vault" },
];

export default function TopNav({ active }: { active?: NavLabel }) {
  const [scrolled, setScrolled] = useState(false);
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
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3.5 sm:px-6">
        {/* left — primary nav (desktop) */}
        <nav className="hidden flex-1 items-center gap-7 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.label} label={n.label} href={n.href} active={active === n.label} icon={n.icon} />
          ))}
        </nav>

        {/* center — logo */}
        <div className="flex flex-1 justify-center md:flex-none">
          {/* translate-y nudges the wordmark to optical center: the asset carries a
              white underline-glow in its lower half, so the box centers a touch high. */}
          <Img
            src="/logo.png"
            alt="HOSHI"
            className="h-[34px] w-auto translate-y-[7px] sm:h-[38px]"
          />
        </div>

        {/* right — cart + currency + wallet */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <CartButton />
          <BalancePill />
          <AccountMenu />
        </div>
      </div>

      {/* mobile nav row */}
      <nav className="no-scrollbar flex items-center gap-6 overflow-x-auto px-4 py-2.5 md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.label} label={n.label} href={n.href} active={active === n.label} icon={n.icon} />
        ))}
      </nav>
    </header>
  );
}

/** Cart icon + item-count badge (client cart; count is 0 on SSR → hydration-safe). */
function CartButton() {
  const { count } = useCart();
  return (
    <Link
      href="/cart"
      aria-label={`Cart (${count})`}
      className="relative grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-zinc-200 transition hover:bg-white/10"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
        <path d="M2 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H5.5" />
      </svg>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-yellow-400 px-1 text-[10px] font-bold leading-none text-[#171717]">
          {count}
        </span>
      )}
    </Link>
  );
}

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
