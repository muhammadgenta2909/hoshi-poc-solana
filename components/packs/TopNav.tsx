"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  ReceiptIcon,
  BoxIcon,
  LogoutIcon,
} from "@/components/account/ui";
import { markSoldSeen, useAccountBadges } from "@/lib/useAccountBadges";
import { lockBodyScroll } from "@/lib/scrollLock";

// Admin is intentionally NOT a nav entry: /admin is staff-only and reached by
// direct URL, gated by app/admin/layout.tsx. Nav is the user-facing surface.
type NavLabel = "Games" | "Marketplace" | "Vault";

const NAV: { label: NavLabel; href: string; icon?: string }[] = [
  // "Games" membuka halaman pilihan (/games): Open Packs & Open Bid Crack.
  { label: "Games", href: "/games", icon: "/nav-icon.png" },
  { label: "Marketplace", href: "/marketplace" },
  { label: "Vault", href: "/vault" },
];

/** Tab mana yang aktif ditentukan dari URL, BUKAN dari prop pemanggil: hanya rute SECTION asli
 *  (games / marketplace / vault + sub-rutenya) yang menyalakan tab. Halaman yang cuma "di bawah"
 *  sebuah section (settings, account, sell, tarik-saldo, deposit, …) TIDAK menyalakan apa pun. */
function activeSection(pathname: string | null): NavLabel | undefined {
  if (!pathname) return undefined;
  if (
    pathname === "/games" ||
    pathname.startsWith("/open-packs") ||
    pathname.startsWith("/open-bid-crack")
  )
    return "Games";
  if (
    pathname === "/marketplace" ||
    pathname.startsWith("/marketplace/") ||
    pathname === "/cart"
  )
    return "Marketplace";
  if (pathname === "/vault" || pathname.startsWith("/vault/")) return "Vault";
  return undefined;
}

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

export default function TopNav({ active: activeProp }: { active?: NavLabel }) {
  const pathname = usePathname();
  // URL = sumber kebenaran. Prop `active` dari pemanggil hanya berlaku KALAU rute-nya memang sebuah
  // section (byPath ada) — jadi /settings yang (warisan) masih mengoper active="Vault" TIDAK
  // menyalakan tab, sementara /vault dst. tetap menyala.
  const byPath = activeSection(pathname);
  const active = byPath ? (activeProp ?? byPath) : undefined;
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
      <div className="relative mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-3.5 sm:gap-3 sm:px-6">
        {/* left (MOBILE) — saldo IDRX in-app, mirip Figma. Di desktop pill saldo ada di cluster
            kanan; box ini disembunyikan (lg:hidden) supaya nav links kembali ke kiri. */}
        <div className="flex min-w-0 flex-1 items-center lg:hidden">
          <BalancePill compact className="inline-flex max-w-full" />
        </div>

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
            className="h-[26px] w-auto translate-y-[6px] sm:h-[38px] sm:translate-y-[7px]"
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
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-100 transition hover:bg-white/10 lg:hidden"
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
      className="relative inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.06] px-2.5 py-2 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 sm:rounded-2xl sm:px-4 sm:py-2.5"
    >
      <Img src="/icon-cart.png" alt="" className="h-[18px] w-[18px] shrink-0" />
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
 *  VISIBILITY IS `lg:hidden` — the same breakpoint that hides the hamburger that
 *  opens it and brings <AccountMenu> back. It used to be `md:hidden`, which left
 *  768–1023px with a hamburger, no desktop dropdown, and a drawer that rendered
 *  `display:none`: tapping the button locked body scroll behind a sheet nobody
 *  could see. Keep it in sync with DESKTOP and the `lg:` classes in the bar. */
function MobileMenu({
  open,
  onClose,
  active,
}: {
  open: boolean;
  onClose: () => void;
  active?: NavLabel;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const unlock = lockBodyScroll();
    // Growing past the breakpoint brings the desktop bar back, which already
    // holds every one of these links — leaving the sheet open would strand a
    // scroll lock behind it.
    const mq = window.matchMedia(DESKTOP);
    const onDesktop = () => mq.matches && onClose();
    mq.addEventListener("change", onDesktop);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
      mq.removeEventListener("change", onDesktop);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] lg:hidden" role="presentation" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <MobileMenuSheet onClose={onClose} active={active} />
    </div>,
    document.body,
  );
}

/** The sheet itself. Split out so it MOUNTS ONLY WHILE THE DRAWER IS OPEN:
 *  <MobileMenu> is rendered by the bar on every page, and hooks keep running in a
 *  component that returns null — the badge poll (and the balance reads inside
 *  <WalletIdentityPanel>) would otherwise run for every visitor on every page.
 *
 *  NOTE: the account icons are read INSIDE the component, never at module scope
 *  — account/ui.tsx → TopNav → account/ui.tsx is a circular import, so touching
 *  those exports at module-init time would hit their temporal dead zone. */
function MobileMenuSheet({ onClose, active }: { onClose: () => void; active?: NavLabel }) {
  const { disconnect } = useWallet();
  // SESSION, not wallet connection. `isAuthed` is our JWT — the one thing BOTH
  // sign-in paths mint (Phantom via useAuth.login(), Google/Privy via
  // <PrivyBridge> → useAuth.loginWith()) — and `activeAddress` is the address to
  // DISPLAY for either: the wallet-adapter key when there is one, else the
  // signed-in user's wallet carried in the JWT. Reading `useWallet().publicKey`
  // here (as this drawer used to) shows a fully signed-in Google user "Connect
  // Wallet" and hides every account destination from them — on the only menu a
  // phone gets, because <AccountMenu> is `hidden lg:block`.
  const { isAuthed, activeAddress, logout } = useAuth();
  const { open: openConnect } = useWalletConnect();
  const badges = useAccountBadges();

  const address = activeAddress;
  // A wallet that is connected but not yet signed still gets the menu, exactly as
  // it does in the desktop dropdown (which renders on `activeAddress` alone); the
  // pages behind these links run their own token gate and ask for the signature.
  const signedIn = isAuthed || !!address;

  const iconCls = "h-[18px] w-[18px]";
  // The SAME destinations as the desktop dropdown (components/account/AccountMenu),
  // re-ordered for a phone: money first (top-up / cash-out are the errands that
  // cannot wait), then the account pages, then physical shipping.
  const BALANCE_NAV = [
    { label: "Deposit", href: "/deposit", icon: <DepositIcon className={iconCls} />, tint: "text-emerald-400" },
    { label: "Cash Out", href: "/tarik-saldo", icon: <WithdrawIcon className={iconCls} />, tint: "text-[#F2C101]" },
    // Riwayat pembayaran. WAJIB ada di sini, bukan cuma di dropdown desktop: di bawah `lg`
    // <AccountMenu> ber-`hidden`, jadi drawer ini adalah SATU-SATUNYA menu yang didapat HP —
    // entri yang cuma ditambahkan ke dropdown akan tidak terjangkau dari ponsel.
    { label: "Payment History", href: "/riwayat-pembayaran", icon: <ReceiptIcon className={iconCls} />, tint: "text-zinc-400" },
  ];
  const ACCOUNT_NAV = [
    { label: "Profile", href: "/account", icon: <UserIcon className={iconCls} /> },
    { label: "Setting", href: "/settings", icon: <GearIcon className={iconCls} /> },
    { label: "Messages", href: "/messages", icon: <MessageIcon className={iconCls} /> },
    { label: "Swap", href: "/swap", icon: <SwapArrowsIcon className={iconCls} /> },
  ];
  // Physical Cards = kirim/redeem KARTU FISIK ke rumah (bukan duit) — grup sendiri,
  // persis seperti di dropdown desktop, biar "tarik DUIT" vs "tarik KARTU" tak ketuker.
  const CARDS_NAV = [
    { label: "Ship Card", href: "/withdraw", icon: <BoxIcon className={iconCls} />, tint: "text-amber-400" },
    { label: "Shipment History", href: "/withdraw/history", icon: <HistoryIcon className={iconCls} />, tint: "text-amber-400" },
  ];

  const offersCount =
    badges.offersPending + badges.offersRejectedNew + badges.offersAccepted;

  const onLogout = () => {
    onClose();
    logout(); // clears our JWT and ends the Privy session too (see useAuth)
    disconnect().catch(() => {}); // no-op for a Google user, who has no adapter
  };

  return (
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

      {signedIn ? (
        <>
          {/* Saldo IDRX with its refresh button. The bar's own pill below `lg` is
              the compact variant (no refresh), so this is where a phone user can
              deliberately re-read the balance. */}
          <div className="border-t border-white/[0.06] p-3">
            <BalancePill className="inline-flex w-full justify-center" />
          </div>

          {/* Address + SOL/IDRX/USDC. Skipped when the session carries no address
              to show (a stored user from before walletAddress existed) — the
              links below still work, which is the part that matters. */}
          {address && (
            <div className="border-t border-white/[0.06] p-3">
              <WalletIdentityPanel address={address} />
            </div>
          )}

          {/* Notif "kartu terjual" — sama seperti di dropdown desktop. */}
          {badges.soldNew > 0 && (
            <div className="border-t border-white/[0.06] px-3 pt-3">
              <Link
                href="/vault"
                onClick={() => {
                  markSoldSeen();
                  onClose();
                }}
                className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.1] px-3 py-2 text-[13px] font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.16]"
              >
                🎉 {badges.soldNew} kartu terjual — lihat di Vault →
              </Link>
            </div>
          )}

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Balance
            </p>
            {BALANCE_NAV.map((n) => (
              <DrawerLink key={n.label} {...n} onNavigate={onClose} />
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Account
            </p>
            {ACCOUNT_NAV.map((n) => (
              <DrawerLink
                key={n.label}
                {...n}
                badge={
                  n.label === "Profile"
                    ? offersCount
                    : n.label === "Messages"
                      ? badges.messageUnread
                      : 0
                }
                onNavigate={onClose}
              />
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Physical Cards
            </p>
            {CARDS_NAV.map((n) => (
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
            Sign In
          </button>
          {/* That modal offers Phantom AND "Continue with Google", so the copy must
              not promise a wallet is the only way in. */}
          <p className="mt-2 text-center text-[12px] text-zinc-500">
            Connect a wallet or continue with Google to reach your balance, profile
            and messages.
          </p>
        </div>
      )}
    </aside>
  );
}

function DrawerLink({
  label,
  href,
  icon,
  tint,
  badge = 0,
  onNavigate,
}: {
  label: string;
  href: string;
  icon: ReactNode;
  tint?: string;
  badge?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-zinc-200 transition hover:bg-white/[0.05]"
    >
      <span className={tint ?? "text-zinc-400"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
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
