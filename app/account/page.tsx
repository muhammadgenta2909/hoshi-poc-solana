"use client";

// Profile page — the user's own account. Every tab reads the backend:
//   ASSETS           GET  /marketplace/me/purchases
//   ACTIVITY         GET  /marketplace/me/activity
//   ACTIVE LISTINGS  GET  /marketplace/me/listings   (+ PATCH /:id, POST /:id/cancel)
//   OFFERS MADE      GET  /marketplace/me/offers-made      (+ POST /offers/:id/cancel)
//   OFFERS RECEIVED  GET  /marketplace/me/offers-received  (+ accept / reject)
//
// Accepting an offer settles the sale directly between seller and buyer — the
// admin console is no longer in that loop.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import {
  acceptOffer,
  cancelListing,
  cancelOffer,
  getMyActivity,
  getMyListings,
  getMyPurchases,
  getOffersMade,
  getOffersReceived,
  getProfile,
  rejectOffer,
  updateListing,
  updateProfile,
} from "@/lib/api";
import { MARKET_SETS, type Listing } from "@/lib/market";
import type { ActivityRecord, OfferRecord } from "@/lib/offers";
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
  SearchIcon,
  InboxIcon,
} from "@/components/account/ui";
import RenameModal from "@/components/account/RenameModal";
import {
  ActivityTable,
  ActiveListingsTable,
  EditListingModal,
  OffersMadeTable,
  OffersReceivedTable,
  Pager,
  paginate,
} from "@/components/account/ProfileTables";

const TABS = ["ASSETS", "ACTIVITY", "ACTIVE LISTINGS", "OFFERS MADE", "OFFERS RECEIVED"] as const;
type Tab = (typeof TABS)[number];

// The rail reads in the designer's sentence case; the VALUES stay uppercase so
// every `tab === "ASSETS"` branch below is untouched.
const TAB_LABELS: Record<Tab, string> = {
  ASSETS: "Assets",
  ACTIVITY: "Activity",
  "ACTIVE LISTINGS": "Active Listings",
  "OFFERS MADE": "Offers Made",
  "OFFERS RECEIVED": "Offers Received",
};

type SortKey = "newest" | "oldest";

// Typed explicitly so <Select> infers T = SortKey (a bare `as const` widens to string).
const SORTS: readonly { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
];

const ALL_SERIES = "All Series";
const SERIES_OPTIONS = [ALL_SERIES, ...MARKET_SETS];

export default function ProfilePage() {
  const { token, hydrated, isAuthed, user } = useAuth();
  const { publicKey } = useWallet();
  const { open } = useWalletConnect();

  const [tab, setTab] = useState<Tab>("ASSETS");

  const [assets, setAssets] = useState<Listing[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [offersMade, setOffersMade] = useState<OfferRecord[]>([]);
  const [offersReceived, setOffersReceived] = useState<OfferRecord[]>([]);

  // Both flags are DERIVED, never set inside the fetch effect — writing state
  // synchronously from an effect body triggers a cascading re-render. `loaded`
  // records which (token, reloadKey) pair the data on screen belongs to, so a
  // fetch is in flight exactly while it disagrees with the current pair. Deriving
  // it this way also means logging out mid-refresh can't strand the spinner:
  // token goes null, `pending` goes false, and the badge stops on its own.
  const [loaded, setLoaded] = useState<{ token: string; key: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const stale = loaded === null || loaded.token !== token;
  const pending = !!token && (stale || loaded.key !== reloadKey);
  /** First pull for this token — nothing on screen yet, so the tabs show skeletons. */
  const loading = !!token && stale;
  /** A re-pull of data that is already on screen — spins the banner badge only. */
  const refreshing = pending && !loading;

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [series, setSeries] = useState(ALL_SERIES);
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Listing | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(user?.displayName ?? null);
  const [joined, setJoined] = useState<string | null>(null);

  const [pickedListings, setPickedListings] = useState<Set<string>>(new Set());
  const [pickedOffers, setPickedOffers] = useState<Set<string>>(new Set());

  const address = publicKey?.toBase58() ?? null;

  /** Bumped by the banner's refresh badge AND after every mutation. The fetch
   *  effect owns loading, so an action on one tab refreshes the others it affects
   *  — accepting an offer closes a listing AND writes an activity row. */
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // Everything the profile needs, in one pass, so tab switches are instant.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([
      getMyPurchases(token),
      getMyListings(token),
      getMyActivity(token),
      getOffersMade(token),
      getOffersReceived(token),
    ])
      .then(([a, l, act, made, received]) => {
        if (!alive) return;
        setAssets(a);
        setListings(l);
        setActivity(act);
        setOffersMade(made);
        setOffersReceived(received);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Failed to load your profile.");
      })
      .finally(() => {
        if (alive) setLoaded({ token, key: reloadKey });
      });
    return () => {
      alive = false;
    };
  }, [token, reloadKey]);

  // Keyed on reloadKey too, so the badge's refresh re-pulls the name/join date
  // alongside the tables rather than leaving a stale header behind.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getProfile(token)
      .then((p) => {
        if (!alive) return;
        setDisplayName(p.displayName);
        setJoined(new Date(p.createdAt).getFullYear().toString());
      })
      .catch(() => {
        /* banner falls back to the wallet address */
      });
    return () => {
      alive = false;
    };
  }, [token, reloadKey]);

  // Filters are per-tab views of the same data. Reset paging from the handler
  // that changed them — an effect would setState during render commit.
  const onFilter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setPage(1);
      set(v);
    };

  const q = query.trim().toLowerCase();
  const bySeries = <T,>(rows: T[], get: (r: T) => string | null | undefined) =>
    series === ALL_SERIES ? rows : rows.filter((r) => get(r) === series);
  const byNewest = <T,>(rows: T[], get: (r: T) => string) =>
    [...rows].sort((x, y) =>
      sort === "newest"
        ? Date.parse(get(y)) - Date.parse(get(x))
        : Date.parse(get(x)) - Date.parse(get(y)),
    );

  const shownAssets = useMemo(() => {
    const rows = bySeries(
      assets.filter((i) => !q || i.name.toLowerCase().includes(q)),
      (i) => i.set,
    );
    return byNewest(rows, (i) => i.listedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, q, sort, series]);

  const shownListings = useMemo(() => {
    const rows = bySeries(
      listings.filter((l) => l.status === "ACTIVE" && (!q || l.name.toLowerCase().includes(q))),
      (l) => l.set,
    );
    return byNewest(rows, (l) => l.listedAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, q, sort, series]);

  const shownActivity = useMemo(() => {
    const rows = bySeries(
      activity.filter((a) => !q || a.item.name.toLowerCase().includes(q)),
      (a) => a.item.set,
    );
    return byNewest(rows, (a) => a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, q, sort, series]);

  const filterOffers = (rows: OfferRecord[]) => {
    const filtered = bySeries(
      rows.filter((o) => !q || o.item.name.toLowerCase().includes(q)),
      (o) => o.item.set,
    );
    return byNewest(filtered, (o) => o.createdAt);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownMade = useMemo(() => filterOffers(offersMade), [offersMade, q, sort, series]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownReceived = useMemo(() => filterOffers(offersReceived), [offersReceived, q, sort, series]);

  /* ------------------------------ mutations ------------------------------- */

  const run = async (id: string, fn: () => Promise<unknown>) => {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      await fn();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onCancelListing = (l: Listing) => {
    if (!confirm(`Withdraw "${l.name}" from the marketplace? Open offers will be declined.`))
      return;
    void run(l.id, () => cancelListing(l.id, token!));
  };

  const onSaveEdit = async (input: { price: number; expectedValue: number; buyback: number }) => {
    if (!token || !editing) return;
    await updateListing(editing.id, input, token);
    refresh();
  };

  const onAccept = (o: OfferRecord) => {
    if (
      !confirm(
        `Accept ${new Intl.NumberFormat("id-ID").format(o.amount)} IDRX for "${o.item.name}"?\n\n` +
          `The card sells immediately at that price and is minted to ${o.buyer.label}. Other offers on it are declined.`,
      )
    )
      return;
    void run(o.id, () => acceptOffer(o.id, token!));
  };

  const onReject = (o: OfferRecord) => void run(o.id, () => rejectOffer(o.id, token!));
  const onCancelOwnOffer = (o: OfferRecord) => void run(o.id, () => cancelOffer(o.id, token!));

  const bulkCancelListings = () => {
    const ids = [...pickedListings];
    if (!ids.length || !confirm(`Withdraw ${ids.length} listing(s)?`)) return;
    void run("bulk", async () => {
      for (const id of ids) await cancelListing(id, token!);
      setPickedListings(new Set());
    });
  };

  const bulkDeclineOffers = () => {
    const ids = [...pickedOffers];
    if (!ids.length || !confirm(`Decline ${ids.length} offer(s)?`)) return;
    void run("bulk", async () => {
      for (const id of ids) await rejectOffer(id, token!);
      setPickedOffers(new Set());
    });
  };

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  /* -------------------------------- render -------------------------------- */

  const bannerName =
    displayName?.trim() || user?.displayName?.trim() || (address ? "Unnamed" : "Guest");

  const body = () => {
    if (!hydrated) return <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>;
    if (!isAuthed) return <ConnectGate connected={!!publicKey} onConnect={open} />;

    if (tab === "ASSETS") {
      const { slice, totalPages, page: p } = paginate(shownAssets, page, 8);
      return (
        <>
          <FilterRow query={query} setQuery={onFilter(setQuery)} sort={sort} setSort={onFilter(setSort)} series={series} setSeries={onFilter(setSeries)} />
          {loading && !assets.length ? (
            <Loading label="Loading your collection…" />
          ) : slice.length === 0 ? (
            <EmptyState
              title={q ? "No cards match your search" : "No assets yet"}
              sub={q ? "Try a different name." : "Cards you buy on the marketplace show up here."}
              action={
                !q && (
                  <Link href="/marketplace">
                    <PrimaryButton>Browse marketplace</PrimaryButton>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {slice.map((l) => (
                  <MarketCard key={l.id} listing={l} currency="IDR" showStatus />
                ))}
              </div>
              <Pager page={p} totalPages={totalPages} onPage={setPage} />
            </>
          )}
        </>
      );
    }

    if (tab === "ACTIVITY") {
      const { slice, totalPages, page: p } = paginate(shownActivity, page);
      return (
        <>
          <FilterRow query={query} setQuery={onFilter(setQuery)} sort={sort} setSort={onFilter(setSort)} series={series} setSeries={onFilter(setSeries)} />
          {loading && !activity.length ? (
            <Loading label="Loading your activity…" />
          ) : slice.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-9 w-9" />}
              title={q ? "No activity matches your search" : "No activity yet"}
              sub="Listings, sales and offers you take part in appear here."
            />
          ) : (
            <>
              <ActivityTable rows={slice} />
              <Pager page={p} totalPages={totalPages} onPage={setPage} />
            </>
          )}
        </>
      );
    }

    if (tab === "ACTIVE LISTINGS") {
      const { slice, totalPages, page: p } = paginate(shownListings, page);
      return (
        <>
          <FilterRow query={query} setQuery={onFilter(setQuery)} sort={sort} setSort={onFilter(setSort)} series={series} setSeries={onFilter(setSeries)} />
          {pickedListings.size > 0 && (
            <BulkBar count={pickedListings.size} onClear={() => setPickedListings(new Set())}>
              <GhostButton onClick={bulkCancelListings} disabled={busyId === "bulk"}>
                {busyId === "bulk" ? "Withdrawing…" : `Cancel ${pickedListings.size}`}
              </GhostButton>
            </BulkBar>
          )}
          {loading && !listings.length ? (
            <Loading label="Loading your listings…" />
          ) : slice.length === 0 ? (
            <EmptyState
              title="No active listings"
              sub="List a card from your collection to see it here."
              action={
                <Link href="/vault">
                  <GhostButton>Go to my collection</GhostButton>
                </Link>
              }
            />
          ) : (
            <>
              <ActiveListingsTable
                rows={slice}
                selected={pickedListings}
                onToggle={toggle(pickedListings, setPickedListings)}
                onToggleAll={(on) =>
                  setPickedListings(on ? new Set(slice.map((l) => l.id)) : new Set())
                }
                onEdit={setEditing}
                onCancel={onCancelListing}
                busyId={busyId}
              />
              <Pager page={p} totalPages={totalPages} onPage={setPage} />
            </>
          )}
        </>
      );
    }

    if (tab === "OFFERS MADE") {
      const { slice, totalPages, page: p } = paginate(shownMade, page);
      return (
        <>
          <FilterRow query={query} setQuery={onFilter(setQuery)} sort={sort} setSort={onFilter(setSort)} series={series} setSeries={onFilter(setSeries)} />
          {loading && !offersMade.length ? (
            <Loading label="Loading your offers…" />
          ) : slice.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-9 w-9" />}
              title={q ? "No offers match your search" : "No offers made"}
              sub="Offers you make on cards are tracked here until the seller responds."
              action={
                !q && (
                  <Link href="/marketplace">
                    <GhostButton>Find a card</GhostButton>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <OffersMadeTable rows={slice} onCancel={onCancelOwnOffer} busyId={busyId} />
              <Pager page={p} totalPages={totalPages} onPage={setPage} />
            </>
          )}
        </>
      );
    }

    const { slice, totalPages, page: p } = paginate(shownReceived, page);
    return (
      <>
        <FilterRow query={query} setQuery={onFilter(setQuery)} sort={sort} setSort={onFilter(setSort)} series={series} setSeries={onFilter(setSeries)} />
        {pickedOffers.size > 0 && (
          <BulkBar count={pickedOffers.size} onClear={() => setPickedOffers(new Set())}>
            <GhostButton onClick={bulkDeclineOffers} disabled={busyId === "bulk"}>
              {busyId === "bulk" ? "Declining…" : `Decline ${pickedOffers.size}`}
            </GhostButton>
          </BulkBar>
        )}
        {loading && !offersReceived.length ? (
          <Loading label="Loading offers…" />
        ) : slice.length === 0 ? (
          <EmptyState
            icon={<InboxIcon className="h-9 w-9" />}
            title={q ? "No offers match your search" : "No offers received"}
            sub="Offers others make on your listings show up here for you to accept or decline."
          />
        ) : (
          <>
            <OffersReceivedTable
              rows={slice}
              selected={pickedOffers}
              onToggle={toggle(pickedOffers, setPickedOffers)}
              onToggleAll={(on) =>
                setPickedOffers(
                  on ? new Set(slice.filter((o) => o.actionable).map((o) => o.id)) : new Set(),
                )
              }
              onAccept={onAccept}
              onReject={onReject}
              busyId={busyId}
            />
            <Pager page={p} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </>
    );
  };

  return (
    <AccountShell active="Vault">
      {/* Rail on the left, banner + identity on the right — the filter row and the
          tab body below both span the full width. Below `md` there is no room for
          a 168px rail beside the banner, so the tabs fall back to the scrolling
          strip under it. */}
      <div className="flex gap-5">
        <Tabs
          vertical
          jersey
          className="hidden md:flex"
          tabs={TABS}
          labels={TAB_LABELS}
          active={tab}
          onChange={onFilter(setTab)}
        />

        <div className="min-w-0 flex-1">
          <ProfileBanner
            name={bannerName}
            address={address}
            joined={joined ?? undefined}
            onRename={isAuthed ? () => setRenaming(true) : undefined}
            onRefresh={isAuthed ? refresh : undefined}
            refreshing={refreshing}
          />
        </div>
      </div>

      <div className="mt-6 md:hidden">
        <Tabs jersey tabs={TABS} labels={TAB_LABELS} active={tab} onChange={onFilter(setTab)} />
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="mt-5">{body()}</div>

      {editing && (
        <EditListingModal
          listing={editing}
          onClose={() => setEditing(null)}
          onSave={onSaveEdit}
        />
      )}

      {renaming && token && (
        // key on the loaded name so the modal reseeds if it opened before the
        // profile fetch resolved.
        <RenameModal
          key={displayName ?? ""}
          current={displayName ?? ""}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            const p = await updateProfile({ displayName: name }, token);
            setDisplayName(p.displayName);
          }}
        />
      )}
    </AccountShell>
  );
}

/* -------------------------------- pieces ---------------------------------- */

function Loading({ label }: { label: string }) {
  return <p className="py-16 text-center text-zinc-400">{label}</p>;
}

function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] px-4 py-2.5">
      <p className="text-[13px] text-zinc-300">
        {count} selected ·{" "}
        <button type="button" onClick={onClear} className="text-yellow-300 hover:underline">
          clear
        </button>
      </p>
      {children}
    </div>
  );
}

function FilterRow({
  query,
  setQuery,
  sort,
  setSort,
  series,
  setSeries,
}: {
  query: string;
  setQuery: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  series: string;
  setSeries: (v: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
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
        value={series}
        onChange={setSeries}
        options={SERIES_OPTIONS}
        ariaLabel="Filter by series"
        className="sm:w-40"
      />
      <Select
        value={sort}
        onChange={setSort}
        options={SORTS}
        ariaLabel="Sort"
        className="sm:w-36"
      />
    </div>
  );
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
