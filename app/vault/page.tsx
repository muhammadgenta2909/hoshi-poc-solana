"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import type { Listing } from "@/lib/market";
import { LIVE_CARDS } from "@/lib/packs";
import { PAGE_BG } from "@/lib/theme";
import { getMyPurchases } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import MarketCard from "@/components/packs/MarketCard";
import { GradientText, Img } from "@/components/packs/ui";

// Vault = the cards a user has purchased (backend: GET /marketplace/me/purchases).
// Marketplace buy now mints a Metaplex Core NFT to the buyer and returns the asset link.
function shortAsset(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function VaultPage() {
  const { token, hydrated, login } = useAuth();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletConnect();

  const [items, setItems] = useState<Listing[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    getMyPurchases(token)
      .then((d) => alive && setItems(d))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => alive && setLoadedFor(token));
    return () => {
      alive = false;
    };
  }, [token]);

  // No wallet yet → open the modal; wallet but not logged in → run login.
  const handleAuth = useCallback(async () => {
    setError(null);
    setAuthBusy(true);
    try {
      if (!publicKey) {
        setVisible(true);
        return;
      }
      await login();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }, [publicKey, login, setVisible]);

  const loading = !!token && loadedFor !== token;

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Vault" />
      <LiveTicker cards={LIVE_CARDS} />

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-zinc-500">
              The cards you&apos;ve bought on the marketplace live here.
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Your Vault
            </h1>
          </div>
          <Link
            href="/sell"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[14px] font-semibold text-zinc-100 transition hover:bg-white/10"
          >
            <span className="text-yellow-400">+</span> List for Sale
          </Link>
        </header>

        {!hydrated ? (
          <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>
        ) : !token ? (
          <GateCard busy={authBusy} onClick={handleAuth} connected={!!publicKey} error={error} />
        ) : loading ? (
          <p className="py-16 text-center text-zinc-400">Loading your collection…</p>
        ) : error ? (
          <GateCard
            busy={authBusy}
            onClick={handleAuth}
            connected={!!publicKey}
            error={error}
            relogin
          />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((l) => (
              <div key={l.id} className="flex flex-col gap-2">
                <MarketCard listing={l} currency="IDR" />
                {l.nft?.assetAddress && (
                  <a
                    href={`https://explorer.solana.com/address/${l.nft.assetAddress}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] px-3 py-2 text-center text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/[0.1]"
                  >
                    NFT {shortAsset(l.nft.assetAddress)}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

/** Gate: prompt to connect wallet / sign in before the collection can be shown. */
function GateCard({
  busy,
  onClick,
  connected,
  error,
  relogin,
}: {
  busy: boolean;
  onClick: () => void;
  connected: boolean;
  error: string | null;
  relogin?: boolean;
}) {
  const label = busy
    ? "Processing…"
    : relogin
      ? "Sign in again"
      : connected
        ? "Sign in to view collection"
        : "Connect wallet";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
      <Img src="/notes.png" alt="" className="h-12 opacity-40" />
      <p className="text-sm text-zinc-400">
        Connect your wallet and sign in to see the cards you own.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-50"
      >
        {label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Empty collection. */
function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
      <GradientText style={{ fontFamily: "var(--font-jersey)" }} className="text-3xl">
        No cards yet
      </GradientText>
      <p className="text-sm text-zinc-400">
        You haven&apos;t bought any cards yet. Explore the marketplace to start your collection.
      </p>
      <Link
        href="/marketplace"
        className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
      >
        Go to Marketplace →
      </Link>
    </div>
  );
}
