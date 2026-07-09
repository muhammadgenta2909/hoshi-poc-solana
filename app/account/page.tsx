"use client";

// Profile page — the user's own account. ASSETS is wired to the real purchases
// endpoint (same source as the Vault); the remaining tabs are POC empty states
// matching the reference until their backends land.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { getMyPurchases } from "@/lib/api";
import type { Listing } from "@/lib/market";
import MarketCard from "@/components/packs/MarketCard";
import {
  AccountShell,
  ProfileBanner,
  Tabs,
  Panel,
  EmptyState,
  TextInput,
  Select,
  PrimaryButton,
  GhostButton,
  copyText,
  SearchIcon,
  InboxIcon,
} from "@/components/account/ui";

const TABS = ["ASSETS", "ACTIVITY", "ACTIVE LISTINGS", "OFFERS MADE", "OFFERS RECEIVED"] as const;
type Tab = (typeof TABS)[number];

const PERIODS = ["Last 7 days", "Last 14 days", "Last 30 days", "Last 60 days", "Last year", "All time"];

type SortKey = "newest" | "oldest";

// Typed explicitly so <Select> infers T = SortKey (a bare `as const` widens to string).
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

export default function ProfilePage() {
  const { token, hydrated, isAuthed } = useAuth();
  const { publicKey } = useWallet();
  const { open } = useWalletConnect();

  const [tab, setTab] = useState<Tab>("ASSETS");
  const [items, setItems] = useState<Listing[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [period, setPeriod] = useState("Last 60 days");

  const address = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!token) return;
    let alive = true;
    getMyPurchases(token)
      .then((d) => alive && setItems(d))
      .catch(() => {})
      .finally(() => alive && setLoadedFor(token));
    return () => {
      alive = false;
    };
  }, [token]);

  const loading = !!token && loadedFor !== token;

  const assets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
    return sort === "oldest" ? [...filtered].reverse() : filtered;
  }, [items, query, sort]);

  const onCopy = useCallback(() => {
    if (address) copyText(address);
  }, [address]);

  return (
    <AccountShell active="Vault">
      <ProfileBanner name="Unnamed" address={address} joined="2026" onCopy={onCopy} />

      <div className="mt-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-5">
        {!hydrated ? (
          <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>
        ) : !isAuthed ? (
          <ConnectGate connected={!!publicKey} onConnect={open} />
        ) : tab === "ASSETS" ? (
          <>
            <FilterRow>
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <TextInput
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search cards by name…"
                  className="pl-10"
                />
              </div>
              <Select
                value={sort}
                onChange={setSort}
                options={SORTS}
                ariaLabel="Sort cards"
                className="sm:w-44"
              />
            </FilterRow>

            {loading ? (
              <p className="py-16 text-center text-zinc-400">Loading your collection…</p>
            ) : assets.length === 0 ? (
              <EmptyState
                title={query ? "No cards match your search" : "No assets yet"}
                sub={query ? "Try a different name." : "Cards you buy on the marketplace show up here."}
                action={
                  !query && (
                    <Link href="/marketplace">
                      <PrimaryButton>Browse marketplace</PrimaryButton>
                    </Link>
                  )
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((l) => (
                  <MarketCard key={l.id} listing={l} currency="IDR" />
                ))}
              </div>
            )}
          </>
        ) : tab === "ACTIVE LISTINGS" ? (
          <>
            <FilterRow>
              <div className="flex-1" />
              <Select
                value={period}
                onChange={setPeriod}
                options={PERIODS}
                ariaLabel="Filter period"
                className="sm:w-44"
              />
            </FilterRow>
            <EmptyState
              title="No active listings yet"
              sub="List a card from your collection to see it here."
              action={
                <Link href="/vault">
                  <GhostButton>Go to my collection</GhostButton>
                </Link>
              }
            />
          </>
        ) : tab === "ACTIVITY" ? (
          <EmptyState
            icon={<InboxIcon className="h-9 w-9" />}
            title="No activity yet"
            sub="Purchases, sales and offers will appear here."
          />
        ) : (
          <EmptyState
            icon={<InboxIcon className="h-9 w-9" />}
            title={tab === "OFFERS MADE" ? "No offers made" : "No offers received"}
            sub={
              tab === "OFFERS MADE"
                ? "Offers you make on cards will be tracked here."
                : "Offers others make on your cards will show up here."
            }
          />
        )}
      </div>
    </AccountShell>
  );
}

function FilterRow({ children }: { children: ReactNode }) {
  return <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">{children}</div>;
}

function ConnectGate({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  return (
    <Panel className="px-6 py-16">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 text-center">
        <p className="text-[15px] font-semibold text-zinc-200">
          {connected ? "Verify your wallet to view your profile" : "Connect your wallet to view your profile"}
        </p>
        <p className="text-[13px] text-zinc-500">
          Your assets, activity and offers are tied to your wallet.
        </p>
        <PrimaryButton onClick={onConnect} className="mt-1">
          {connected ? "Sign to verify" : "Connect wallet"}
        </PrimaryButton>
      </div>
    </Panel>
  );
}
