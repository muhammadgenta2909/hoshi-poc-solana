"use client";

// Connected-wallet account menu (the avatar dropdown). Mirrors the reference:
// address + live SOL balance + placeholder USDC/Escrow, then navigation to the
// account pages and a log-out action. When no wallet is connected it falls back
// to the Connect Wallet pill, which opens the Hoshi connect modal.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useAuth } from "@/lib/useAuth";
import WalletPill from "@/components/packs/WalletPill";
import {
  useOutsideClose,
  copyText,
  shortAddr,
  ChevronDownIcon,
  CopyIcon,
  UserIcon,
  GearIcon,
  MessageIcon,
  SwapArrowsIcon,
  DepositIcon,
  WithdrawIcon,
  HistoryIcon,
  LogoutIcon,
} from "./ui";

type NavItem = { label: string; href: string; icon: ReactNode; tint?: string };

// NOTE: these are built INSIDE the component (not at module scope). ui.tsx →
// TopNav → AccountMenu → ui.tsx is a circular import; referencing ui.tsx's icon
// exports at module-init time would hit their temporal dead zone. Reading them at
// render (after all modules finish loading) is safe.

export default function AccountMenu() {
  const iconCls = "h-[18px] w-[18px]";
  const MAIN: NavItem[] = [
    { label: "Profile", href: "/account", icon: <UserIcon className={iconCls} /> },
    { label: "Setting", href: "/settings", icon: <GearIcon className={iconCls} /> },
    { label: "Messages", href: "/messages", icon: <MessageIcon className={iconCls} /> },
    { label: "Swap", href: "/swap", icon: <SwapArrowsIcon className={iconCls} /> },
  ];
  const SHIPMENTS: NavItem[] = [
    { label: "Deposit", href: "/deposit", icon: <DepositIcon className={iconCls} />, tint: "text-emerald-400" },
    { label: "Withdraw", href: "/withdraw", icon: <WithdrawIcon className={iconCls} />, tint: "text-amber-400" },
    { label: "Withdraw History", href: "/withdraw/history", icon: <HistoryIcon className={iconCls} />, tint: "text-amber-400" },
  ];

  const { publicKey, disconnect } = useWallet();
  const { logout } = useAuth();

  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  const address = publicKey?.toBase58() ?? null;

  if (!address) return <WalletPill />;

  const onLogout = () => {
    setOpen(false);
    logout();
    disconnect().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-2.5 transition hover:bg-white/10"
      >
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-[#171717]"
          style={{ background: "linear-gradient(180deg,#FBB222,#FFF600)" }}
        >
          <UserIcon className="h-4 w-4" />
        </span>
        {/* Only from xl. The trigger shares the row with the balance pill and the
            labelled cart pill, and on a 1024–1279 laptop those three plus the nav
            links leave no room for it — the wordmark gets shoved ~110px off
            centre. The full address is one click away inside the dropdown. */}
        <span className="hidden font-mono text-[13px] font-semibold text-zinc-100 xl:inline">
          {shortAddr(address, 4, 4)}
        </span>
        <ChevronDownIcon className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[290px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] shadow-[0_24px_70px_-18px_rgba(0,0,0,0.85)]">
          <div className="border-b border-white/[0.06] p-3">
            <WalletIdentityPanel address={address} />
          </div>

          {/* primary nav */}
          <nav className="p-2">
            {MAIN.map((n) => (
              <MenuLink key={n.label} item={n} onNavigate={() => setOpen(false)} />
            ))}
          </nav>

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              My shipments
            </p>
            {SHIPMENTS.map((n) => (
              <MenuLink key={n.label} item={n} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.05]"
            >
              <LogoutIcon className="h-[18px] w-[18px] text-zinc-400" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wallet identity + balances. Shared by the desktop dropdown and the mobile
 *  drawer — below `lg` the dropdown is gone, so the drawer is the ONLY place a
 *  phone user can read their balance or copy their address.
 *
 *  It only ever mounts while a menu is open, so mounting is the refetch: there's
 *  no need to key the effect on an `open` flag. */
export function WalletIdentityPanel({ address }: { address: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [sol, setSol] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // All setState in async callbacks — no sync-in-effect.
  useEffect(() => {
    if (!publicKey) return;
    let alive = true;
    connection
      .getBalance(publicKey, "confirmed")
      .then((l) => alive && setSol(l / LAMPORTS_PER_SOL))
      .catch(() => alive && setSol(null));
    return () => {
      alive = false;
    };
  }, [publicKey, connection]);

  const onCopy = async () => {
    if (await copyText(address)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#171717]"
          style={{ background: "linear-gradient(180deg,#FBB222,#FFF600)" }}
        >
          <UserIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[14px] font-semibold text-white">
            {shortAddr(address, 5, 4)}
          </p>
          <p className="text-[12px] text-zinc-500">Solana</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          title="Copy address"
          aria-label="Copy address"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-yellow-300"
        >
          <CopyIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 space-y-1 rounded-xl bg-white/[0.03] p-2.5">
        <BalanceRow label="SOL" value={sol === null ? "…" : sol.toFixed(2)} dot="#9945FF" />
        <BalanceRow label="USDC" value="0.00" dot="#2775CA" />
        <BalanceRow label="ESCROW" value="0.00" dot="#7C5CFF" />
      </div>
      {copied && <p className="mt-2 text-center text-[11px] text-emerald-400">Address copied</p>}
    </>
  );
}

function BalanceRow({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1.5 py-1">
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="flex-1 tabular-nums text-[13px] font-medium text-zinc-200">{value}</span>
      <span className="text-[12px] text-zinc-500">{label}</span>
    </div>
  );
}

function MenuLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-zinc-200 transition hover:bg-white/[0.05]"
    >
      <span className={item.tint ?? "text-zinc-400"}>{item.icon}</span>
      {item.label}
    </Link>
  );
}
