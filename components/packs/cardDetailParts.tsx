"use client";

// Shared presentational primitives for the card-detail pages. Both the
// marketplace listing detail (/marketplace/[id]) and the vault pulled-card
// detail (/vault/[nft]) compose these, so the two pages look identical and only
// their *content* differs (buy/offers/chart on a listing vs. list-for-sale on a
// freshly-pulled card). Keep these pure/presentational — no data fetching.

import type { ReactNode } from "react";
import type { VaultSource } from "@/lib/market";
import { GradientText, Img } from "@/components/packs/ui";

export const JERSEY = { fontFamily: "var(--font-jersey)" } as const;
export const GREEN = "#3DDC84";
export const CONTRACT_YELLOW = "#FEF003";

/** Truncate a Solana address to `abc123…wxyz` for compact display. */
export function shortAsset(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Blue IDRX coin (Figma fill #0F56E6). */
export function IdrxCoin({ size = 24 }: { size?: number }) {
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

/** Small uppercase section/stat label — Jersey 10, muted. */
export function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p
      style={JERSEY}
      className={`text-[15px] uppercase leading-none tracking-wide text-zinc-500 ${className}`}
    >
      {children}
    </p>
  );
}

/** Frosted pill (grade / language / era) — Jersey 10, like the market cards. */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={JERSEY}
      className="inline-flex items-center rounded-md bg-white/[0.21] px-2.5 py-1 text-[15px] uppercase leading-none tracking-wide text-white backdrop-blur-sm"
    >
      {children}
    </span>
  );
}

/** Stat — label in Jersey 10, value below in Outfit (per Figma). Optional link. */
export function Stat({
  label,
  value,
  valueColor,
  href,
}: {
  label: string;
  value: string;
  valueColor?: string;
  href?: string;
}) {
  const content = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:brightness-110">
      {value}
    </a>
  ) : (
    value
  );
  return (
    <div className="flex flex-col gap-2">
      <span style={JERSEY} className="text-[14px] uppercase leading-none tracking-wide text-zinc-500">
        {label}
      </span>
      <span className="text-[15px] font-semibold leading-none text-white" style={{ color: valueColor }}>
        {content}
      </span>
    </div>
  );
}

/** Card-detail row — label in Outfit, value in Jersey 10 (per Figma). */
export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3.5 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-[15px] leading-none text-zinc-100" style={JERSEY}>
        {value}
      </span>
    </div>
  );
}

/** Provenance chip — reads the vault source instead of hardcoding Hoshi, so a
 *  CollectorCrypt-synced card is labelled honestly. Legacy/unset = Hoshi. */
export function VaultVerified({ source }: { source?: VaultSource }) {
  const isCC = (source ?? "HOSHI") === "COLLECTORCRYPT";
  if (isCC) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-[#38E5D0]/30 bg-[#38E5D0]/[0.08] px-2 py-1">
        <Img src="/icon-verified.png" alt="" className="h-3.5 w-3.5" />
        <span className="text-sm leading-none text-[#38E5D0]" style={JERSEY}>
          Vault Verified
        </span>
        <span className="text-[11px] text-zinc-400">by</span>
        <span className="text-sm leading-none text-[#38E5D0]" style={JERSEY}>
          COLLECTOR CRYPT
        </span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-yellow-400/25 bg-yellow-400/[0.06] px-2 py-1">
      <Img src="/icon-verified.png" alt="" className="h-3.5 w-3.5" />
      <GradientText className="text-sm leading-none" style={JERSEY}>
        Vault Verified
      </GradientText>
      <span className="text-[11px] text-zinc-400">by</span>
      <GradientText className="text-sm leading-none" style={JERSEY}>
        HOSHI
      </GradientText>
    </span>
  );
}
