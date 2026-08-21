"use client";

// Connected-wallet account menu (the avatar dropdown). Mirrors the reference:
// address + live SOL balance + placeholder USDC/Escrow, then navigation to the
// account pages and a log-out action. When no wallet is connected it falls back
// to the Connect Wallet pill, which opens the Hoshi connect modal.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { DEVNET_USDC_MINT, fetchSplBalance, formatSol, formatUsdc } from "@/lib/tokens";
import { getBalance } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { markBalanceSeen, markSoldSeen, useAccountBadges } from "@/lib/useAccountBadges";

// formatIdr hidup di packs/ui.tsx yang ADA di siklus import ui↔TopNav↔AccountMenu (lihat catatan
// di bawah). Impor const-arrow-nya di scope-modul berisiko TDZ → pakai Intl lokal saja.
const idrFmt = new Intl.NumberFormat("id-ID");
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
  BoxIcon,
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
  // DUA grup terpisah biar "tarik DUIT" vs "tarik/kirim KARTU" nggak ketuker.
  // Balance = Rupiah (isi saldo + tarik saldo ke bank/e-wallet). "Cash Out" SELALU tampil (beda dari
  // chip "Tarik →" di panel saldo yang cuma muncul saat saldo>0) supaya WD duit gampang ketemu.
  const BALANCE_NAV: NavItem[] = [
    { label: "Deposit", href: "/deposit", icon: <DepositIcon className={iconCls} />, tint: "text-emerald-400" },
    { label: "Cash Out", href: "/tarik-saldo", icon: <WithdrawIcon className={iconCls} />, tint: "text-[#F2C101]" },
  ];
  // Physical Cards = kirim/redeem KARTU FISIK ke rumah (bukan duit).
  const CARDS_NAV: NavItem[] = [
    { label: "Ship Card", href: "/withdraw", icon: <BoxIcon className={iconCls} />, tint: "text-amber-400" },
    { label: "Shipment History", href: "/withdraw/history", icon: <HistoryIcon className={iconCls} />, tint: "text-amber-400" },
  ];

  const { disconnect } = useWallet();
  const { logout, activeAddress } = useAuth();
  const badges = useAccountBadges();
  // Angka MERAH di avatar = total yang butuh perhatian (offers + pesan belum dibaca). Dot EMAS =
  // kabar baik (saldo bertambah / kartu terjual). Tiap item menu juga membawa angkanya sendiri:
  // Profile ← offers, Messages ← pesan.
  const offersCount =
    badges.offersPending + badges.offersRejectedNew + badges.offersAccepted;
  const attentionCount = offersCount + badges.messageUnread;
  const positive = badges.balanceUp || badges.soldNew > 0;
  const hasDot = attentionCount > 0 || positive;

  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));

  // activeAddress covers BOTH a connected Phantom wallet and a Google/Privy user
  // (who has a JWT wallet but no wallet-adapter key), so both read as connected.
  const address = activeAddress;

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
        aria-label={hasDot ? "Account menu — ada notifikasi" : "Account menu"}
        className="relative inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] py-1.5 pl-1.5 pr-2.5 transition hover:bg-white/10"
      >
        {/* Dot notifikasi: angka merah = offer/pesan perlu perhatian; dot emas = saldo/terjual. */}
        {attentionCount > 0 ? (
          <span className="absolute -right-1 -top-1 z-10 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#0f0d05]">
            {attentionCount > 9 ? "9+" : attentionCount}
          </span>
        ) : (
          positive && (
            <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-[#F2C101] ring-2 ring-[#0f0d05]" />
          )
        )}
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
        <div
          // max-h + overflow-y-auto: kalau isi kepanjangan (layar pendek) dropdown SCROLL sendiri —
          // tak ngelelep keluar layar. Scrollbar disembunyikan biar tetap bersih.
          className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-80px)] w-[290px] overflow-y-auto rounded-2xl border border-white/10 bg-[#141206] shadow-[0_24px_70px_-18px_rgba(0,0,0,0.85)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="border-b border-white/[0.06] p-3">
            <WalletIdentityPanel address={address} />
            {/* Notif "kartu terjual": muncul saat ada penjualan baru. Klik → ke Vault + tandai dilihat. */}
            {badges.soldNew > 0 && (
              <Link
                href="/vault"
                onClick={() => {
                  markSoldSeen();
                  setOpen(false);
                }}
                className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.1] px-3 py-2 text-[13px] font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.16]"
              >
                🎉 {badges.soldNew} kartu terjual — lihat di Vault →
              </Link>
            )}
          </div>

          {/* primary nav */}
          <nav className="p-2">
            {MAIN.map((n) => (
              <MenuLink
                key={n.label}
                item={n}
                badge={
                  n.label === "Profile"
                    ? offersCount
                    : n.label === "Messages"
                      ? badges.messageUnread
                      : 0
                }
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Balance
            </p>
            {BALANCE_NAV.map((n) => (
              <MenuLink key={n.label} item={n} onNavigate={() => setOpen(false)} />
            ))}
          </div>

          <div className="border-t border-white/[0.06] p-2">
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Physical Cards
            </p>
            {CARDS_NAV.map((n) => (
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
  const { token } = useAuth();
  const [sol, setSol] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  // Saldo JUAL in-app (IDRX) dari hasil jual P2P — ledger backend, bukan on-chain. Beda dari SOL/USDC
  // (saldo wallet). Butuh JWT; user tanpa token (belum sign-in) → tak tampil.
  const [idrx, setIdrx] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // Read balances by ADDRESS (not the wallet-adapter key) so a Google/Privy user
  // sees their balance too. All setState in async callbacks — no sync-in-effect.
  const owner = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  useEffect(() => {
    if (!owner) return;
    let alive = true;
    connection
      .getBalance(owner, "confirmed")
      .then((l) => alive && setSol(l / LAMPORTS_PER_SOL))
      .catch(() => alive && setSol(null));
    fetchSplBalance(connection, owner, DEVNET_USDC_MINT)
      .then((b) => alive && setUsdc(b))
      .catch(() => alive && setUsdc(null));
    return () => {
      alive = false;
    };
  }, [owner, connection]);

  // Saldo jual (IDRX) — panel hanya mount saat menu dibuka, jadi mount = refetch (fresh tiap buka).
  useEffect(() => {
    if (!token) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setIdrx(null);
      return;
    }
    let alive = true;
    getBalance(token)
      .then((b) => {
        if (!alive) return;
        setIdrx(b.balanceIdrx);
        // Dropdown terbuka = user melihat saldo → tandai sudah dilihat (clear dot "saldo baru masuk").
        markBalanceSeen(b.balanceIdrx);
      })
      .catch(() => alive && setIdrx(null));
    return () => {
      alive = false;
    };
  }, [token]);

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

      {/* Live devnet balances only. The old ESCROW row is gone on purpose: no
          escrow ledger exists anywhere in the backend, so showing a number for
          it was pure fiction. */}
      <div className="mt-2 space-y-1 rounded-xl bg-white/[0.03] p-2.5">
        <BalanceRow label="SOL" value={sol === null ? "…" : formatSol(sol)} dot="#9945FF" />
        {/* Saldo JUAL in-app (IDRX, Rupiah hasil jual kartu P2P) — SELALU tampil sebagai baris saldo
            (sejajar SOL/USDC, di antara keduanya sesuai permintaan), nilai EMAS biar menonjol sebagai
            "pemasukanmu". Seluruh baris bisa diklik → /tarik-saldo (WD ke bank / e-wallet). CTA eksplisit
            ada di menu "Cash Out". Rp 0 tetap ditampilkan supaya user tahu ada saldo jual yang bisa ditarik. */}
        <Link
          href="/tarik-saldo"
          title="Saldo jual (IDRX) — tarik ke bank / e-wallet"
          className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-[#F2C101]/[0.08]"
        >
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: "#F2C101" }} />
          <span className="flex-1 tabular-nums text-[13px] font-semibold text-[#F7D046]">
            {idrx === null ? "…" : `Rp ${idrFmt.format(idrx)}`}
          </span>
          {idrx != null && idrx > 0 && (
            <span className="text-[11px] font-medium text-[#F2C101]/80">Tarik →</span>
          )}
          <span className="text-[12px] text-zinc-500">IDRX</span>
        </Link>
        <BalanceRow label="USDC" value={usdc === null ? "…" : formatUsdc(usdc)} dot="#2775CA" />
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

function MenuLink({
  item,
  onNavigate,
  badge = 0,
}: {
  item: NavItem;
  onNavigate: () => void;
  badge?: number;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-zinc-200 transition hover:bg-white/[0.05]"
    >
      <span className={item.tint ?? "text-zinc-400"}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}
