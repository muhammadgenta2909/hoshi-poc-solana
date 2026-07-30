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
  getMyPacks,
  getMyPurchases,
  getOffersMade,
  getOffersReceived,
  getProfile,
  rejectOffer,
  updateListing,
  updateProfile,
} from "@/lib/api";
import { type Listing } from "@/lib/market";
import { explorerAddressUrl, type GachaPull } from "@/lib/gacha";
import type { ActivityRecord, OfferRecord } from "@/lib/offers";
import MarketCard from "@/components/packs/MarketCard";
import { Img } from "@/components/packs/ui";
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
  ModalShell,
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

/**
 * Pilihan "Series" DIBANGUN DARI DATA YANG BENAR-BENAR DIMUAT, bukan dari daftar
 * tetap. Dulu isinya `MARKET_SETS` (Classic/Jungle/Promo/Rare/Evolving) — lima set
 * contoh sisa fase data dummy. Set kartu sungguhan berasal dari katalog
 * CollectorCrypt (`card.set`, fallback `card.category`) dan berupa string bebas
 * seperti "Fossil - 1st Edition - English"; di produksi hanya ~14% baris yang
 * kebetulan cocok dengan lima nilai itu, jadi memilih series apa pun akan
 * mengosongkan tab. Diturunkan begini, setiap opsi dijamin punya minimal satu baris.
 */
const seriesOptionsFrom = (values: (string | null | undefined)[]): string[] => [
  ALL_SERIES,
  ...[...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v))].sort((a, b) =>
    a.localeCompare(b),
  ),
];

/** ISO → ms. Tanggal yang tak terbaca jadi 0: comparator yang mengembalikan NaN
 *  membuat Array.sort meninggalkan urutan sembarang, bukan melempar error — persis
 *  jenis kegagalan diam yang bikin "Newest/Oldest" terlihat tidak bekerja. */
const time = (iso: string | null | undefined): number => {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? 0 : t;
};

/** Satu kartu di tab Assets — hasil beli (Listing) ATAU hasil buka pack (GachaPull).
 *  Keduanya dinormalkan ke bentuk ini supaya search, filter series, sort dan paging
 *  berlaku pada SATU daftar. Sebelumnya kartu hasil pull dirender terpisah di atas
 *  grid, jadi ia lolos dari filter series dan tidak pernah ikut diurutkan. */
type AssetRow =
  | { kind: "listing"; key: string; name: string; series: string | null; at: string; listing: Listing }
  | { kind: "pull"; key: string; name: string; series: string | null; at: string; pull: GachaPull };

export default function ProfilePage() {
  const { token, hydrated, isAuthed, user } = useAuth();
  const { publicKey } = useWallet();
  const { open } = useWalletConnect();

  const [tab, setTab] = useState<Tab>("ASSETS");

  const [assets, setAssets] = useState<Listing[]>([]);
  // Open-pack pulls the user owns. Assets used to show ONLY marketplace purchases, so a
  // user who only opened packs saw "No assets yet" here even though the cards are real and
  // visible in the Vault. Pulls now show in Assets too (display only — list/buyback live
  // on the Vault card).
  const [pulls, setPulls] = useState<GachaPull[]>([]);
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
      // Pulls are the newer, less-critical source — a failure here must not blank the profile.
      getMyPacks(token).catch(() => [] as GachaPull[]),
    ])
      .then(([a, l, act, made, received, pk]) => {
        if (!alive) return;
        setAssets(a);
        setPulls(pk.filter((p) => p.status === "OPENED" && !!p.nftAddress));
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

  // Kartu beli + kartu hasil pack sebagai satu daftar. `soldAt` = kapan kartu jadi
  // milik user; `listedAt` (kapan PENJUAL memajangnya, dan untuk kartu hasil sync CC
  // itu cuma waktu sync) hanya cadangan untuk baris lama yang belum membawa soldAt.
  const activeListings = useMemo(
    () => listings.filter((l) => l.status === "ACTIVE"),
    [listings],
  );
  const assetRows = useMemo<AssetRow[]>(
    () => [
      ...assets.map((l) => ({
        kind: "listing" as const,
        key: `listing:${l.id}`,
        name: l.name,
        series: l.set?.trim() || null,
        at: l.soldAt ?? l.listedAt,
        listing: l,
      })),
      ...pulls.map((p) => ({
        kind: "pull" as const,
        key: `pull:${p.memo}`,
        name: p.ccItemName ?? p.nftName ?? "Pulled card",
        series: p.ccSet?.trim() || null,
        at: p.openedAt ?? p.createdAt,
        pull: p,
      })),
    ],
    [assets, pulls],
  );

  // Opsi series milik TAB AKTIF, jadi tidak ada pilihan yang menghasilkan nol baris.
  const seriesOptions = useMemo(() => {
    if (tab === "ASSETS") return seriesOptionsFrom(assetRows.map((r) => r.series));
    if (tab === "ACTIVITY") return seriesOptionsFrom(activity.map((a) => a.item.set));
    if (tab === "ACTIVE LISTINGS") return seriesOptionsFrom(activeListings.map((l) => l.set));
    if (tab === "OFFERS MADE") return seriesOptionsFrom(offersMade.map((o) => o.item.set));
    return seriesOptionsFrom(offersReceived.map((o) => o.item.set));
  }, [tab, assetRows, activity, activeListings, offersMade, offersReceived]);

  /** Series yang benar-benar dipakai memfilter. Kalau pilihan user tidak ada di tab
   *  ini, ia jatuh balik ke "All Series" TANPA menghapus state — pindah tab tidak
   *  menyisakan tab kosong yang membingungkan, dan kembali ke tab asal memulihkan
   *  pilihannya. Selama data masih dimuat opsinya kosong, jadi ini juga mencegah
   *  filter menghabisi baris sebelum daftarnya sempat terbentuk. */
  const activeSeries = seriesOptions.includes(series) ? series : ALL_SERIES;

  const matches = (name: string, seriesOf: string | null | undefined) =>
    (!q || name.toLowerCase().includes(q)) &&
    (activeSeries === ALL_SERIES || seriesOf === activeSeries);

  const byNewest = <T,>(rows: T[], get: (r: T) => string | null | undefined) =>
    [...rows].sort((x, y) =>
      sort === "newest" ? time(get(y)) - time(get(x)) : time(get(x)) - time(get(y)),
    );

  const shownAssets = useMemo(
    () => byNewest(assetRows.filter((r) => matches(r.name, r.series)), (r) => r.at),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assetRows, q, sort, activeSeries],
  );

  const shownListings = useMemo(
    () => byNewest(activeListings.filter((l) => matches(l.name, l.set)), (l) => l.listedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeListings, q, sort, activeSeries],
  );

  const shownActivity = useMemo(
    () => byNewest(activity.filter((a) => matches(a.item.name, a.item.set)), (a) => a.createdAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, q, sort, activeSeries],
  );

  const filterOffers = (rows: OfferRecord[]) =>
    byNewest(rows.filter((o) => matches(o.item.name, o.item.set)), (o) => o.createdAt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shownMade = useMemo(() => filterOffers(offersMade), [offersMade, q, sort, activeSeries]);
  const shownReceived = useMemo(
    () => filterOffers(offersReceived),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offersReceived, q, sort, activeSeries],
  );

  /** true ⇒ tab kosong karena filter, bukan karena user belum punya apa-apa. */
  const filtering = !!q || activeSeries !== ALL_SERIES;

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

  // Konfirmasi bertema — menggantikan window.confirm() bawaan browser.
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const onCancelListing = (l: Listing) => {
    setConfirmModal({
      title: "Tarik listing",
      message: `Tarik "${l.name}" dari marketplace? Penawaran yang masih terbuka akan ditolak.`,
      confirmLabel: "Tarik",
      danger: true,
      onConfirm: () => void run(l.id, () => cancelListing(l.id, token!)),
    });
  };

  const onSaveEdit = async (input: { price: number; expectedValue: number; buyback: number }) => {
    if (!token || !editing) return;
    await updateListing(editing.id, input, token);
    refresh();
  };

  const onAccept = (o: OfferRecord) => {
    setConfirmModal({
      title: "Terima penawaran",
      message:
        `Terima ${new Intl.NumberFormat("id-ID").format(o.amount)} IDRX untuk "${o.item.name}"? ` +
        `Kartu langsung terjual di harga itu ke ${o.buyer.label}, dan penawaran lain di kartu ini ditolak.`,
      confirmLabel: "Terima",
      onConfirm: () => void run(o.id, () => acceptOffer(o.id, token!)),
    });
  };

  const onReject = (o: OfferRecord) => void run(o.id, () => rejectOffer(o.id, token!));
  const onCancelOwnOffer = (o: OfferRecord) => void run(o.id, () => cancelOffer(o.id, token!));

  const bulkCancelListings = () => {
    const ids = [...pickedListings];
    if (!ids.length) return;
    setConfirmModal({
      title: "Tarik listing",
      message: `Tarik ${ids.length} listing?`,
      confirmLabel: "Tarik",
      danger: true,
      onConfirm: () =>
        void run("bulk", async () => {
          for (const id of ids) await cancelListing(id, token!);
          setPickedListings(new Set());
        }),
    });
  };

  const bulkDeclineOffers = () => {
    const ids = [...pickedOffers];
    if (!ids.length) return;
    setConfirmModal({
      title: "Tolak penawaran",
      message: `Tolak ${ids.length} penawaran?`,
      confirmLabel: "Tolak",
      danger: true,
      onConfirm: () =>
        void run("bulk", async () => {
          for (const id of ids) await rejectOffer(id, token!);
          setPickedOffers(new Set());
        }),
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
      // Kartu beli dan kartu hasil pack diurutkan & dihalamankan BERSAMA — kalau
      // pull dirender di luar `slice`, "Newest/Oldest" tidak menyentuhnya sama sekali.
      const { slice, totalPages, page: p } = paginate(shownAssets, page, 8);
      return (
        <>
          <FilterRow
            query={query}
            setQuery={onFilter(setQuery)}
            sort={sort}
            setSort={onFilter(setSort)}
            series={activeSeries}
            setSeries={onFilter(setSeries)}
            seriesOptions={seriesOptions}
          />
          {loading && !assets.length && !pulls.length ? (
            <Loading label="Loading your collection…" />
          ) : slice.length === 0 ? (
            <EmptyState
              title={filtering ? "No cards match your filters" : "No assets yet"}
              sub={
                filtering
                  ? "Try a different name or series."
                  : "Cards you buy or pull from packs show up here."
              }
              action={
                !filtering && (
                  <Link href="/marketplace">
                    <PrimaryButton>Browse marketplace</PrimaryButton>
                  </Link>
                )
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {slice.map((row) =>
                  row.kind === "pull" ? (
                    <PullAsset key={row.key} pull={row.pull} />
                  ) : (
                    <MarketCard key={row.key} listing={row.listing} currency="IDR" showStatus />
                  ),
                )}
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
          <FilterRow
            query={query}
            setQuery={onFilter(setQuery)}
            sort={sort}
            setSort={onFilter(setSort)}
            series={activeSeries}
            setSeries={onFilter(setSeries)}
            seriesOptions={seriesOptions}
          />
          {loading && !activity.length ? (
            <Loading label="Loading your activity…" />
          ) : slice.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-9 w-9" />}
              title={filtering ? "No activity matches your filters" : "No activity yet"}
              sub={
                filtering
                  ? "Try a different name or series."
                  : "Listings, sales and offers you take part in appear here."
              }
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
          <FilterRow
            query={query}
            setQuery={onFilter(setQuery)}
            sort={sort}
            setSort={onFilter(setSort)}
            series={activeSeries}
            setSeries={onFilter(setSeries)}
            seriesOptions={seriesOptions}
          />
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
              title={filtering ? "No listings match your filters" : "No active listings"}
              sub={
                filtering
                  ? "Try a different name or series."
                  : "List a card from your collection to see it here."
              }
              action={
                !filtering && (
                  <Link href="/vault">
                    <GhostButton>Go to my collection</GhostButton>
                  </Link>
                )
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
          <FilterRow
            query={query}
            setQuery={onFilter(setQuery)}
            sort={sort}
            setSort={onFilter(setSort)}
            series={activeSeries}
            setSeries={onFilter(setSeries)}
            seriesOptions={seriesOptions}
          />
          {loading && !offersMade.length ? (
            <Loading label="Loading your offers…" />
          ) : slice.length === 0 ? (
            <EmptyState
              icon={<InboxIcon className="h-9 w-9" />}
              title={filtering ? "No offers match your filters" : "No offers made"}
              sub={
                filtering
                  ? "Try a different name or series."
                  : "Offers you make on cards are tracked here until the seller responds."
              }
              action={
                !filtering && (
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
        <FilterRow
          query={query}
          setQuery={onFilter(setQuery)}
          sort={sort}
          setSort={onFilter(setSort)}
          series={activeSeries}
          setSeries={onFilter(setSeries)}
          seriesOptions={seriesOptions}
        />
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
            title={filtering ? "No offers match your filters" : "No offers received"}
            sub={
              filtering
                ? "Try a different name or series."
                : "Offers others make on your listings show up here for you to accept or decline."
            }
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
      <ModalShell
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.title ?? ""}
        maxWidth={420}
      >
        {confirmModal && (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] leading-relaxed text-zinc-300">{confirmModal.message}</p>
            <div className="flex justify-end gap-3">
              <GhostButton onClick={() => setConfirmModal(null)}>Batal</GhostButton>
              <PrimaryButton
                onClick={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  fn();
                }}
              >
                {confirmModal.confirmLabel}
              </PrimaryButton>
            </div>
          </div>
        )}
      </ModalShell>
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
  seriesOptions,
}: {
  query: string;
  setQuery: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  series: string;
  setSeries: (v: string) => void;
  /** Diturunkan dari baris tab aktif — lihat `seriesOptionsFrom`. */
  seriesOptions: string[];
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
      {/* Hanya tampil kalau ada sesuatu untuk disaring: dengan satu opsi ("All
          Series") dropdown-nya cuma kontrol mati. Nama set katalog CC panjang
          ("Black Star Promos - Mega Evolution MEP EN - English"), jadi menunya
          dilepas dari lebar trigger dan dibatasi supaya tidak keluar layar. */}
      {seriesOptions.length > 1 && (
        <Select
          value={series}
          onChange={setSeries}
          options={seriesOptions}
          ariaLabel="Filter by series"
          className="sm:w-44"
          align="right"
          menuClassName="max-w-[min(92vw,28rem)]"
        />
      )}
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

/** A gacha-pulled card shown in the profile's Assets grid. Display-only: the real
 *  list-for-sale / buyback actions live on the Vault card, so this just proves the
 *  card is owned (art + name + PULLED badge + on-chain link) and points there. */
function PullAsset({ pull }: { pull: GachaPull }) {
  const name = pull.ccItemName ?? pull.nftName ?? "Pulled card";
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2">
        <Img
          src={pull.nftImage ?? "/card-back.svg"}
          alt={name}
          className="mx-auto max-h-56 w-auto object-contain"
        />
        <span className="absolute left-2 top-2 rounded-md bg-yellow-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#171717]">
          Pulled
        </span>
      </div>
      <p className="truncate text-sm font-medium text-zinc-200">{name}</p>
      <div className="flex gap-2">
        {pull.nftAddress && (
          <a
            href={explorerAddressUrl(pull.nftAddress)}
            target="_blank"
            rel="noreferrer"
            className="flex-1 truncate rounded-lg border border-white/10 px-2 py-1 text-center text-[11px] text-zinc-400 transition hover:bg-white/5"
          >
            NFT ↗
          </a>
        )}
        <Link
          href="/vault"
          className="flex-1 truncate rounded-lg border border-yellow-400/20 bg-yellow-400/[0.06] px-2 py-1 text-center text-[11px] font-semibold text-yellow-200 transition hover:bg-yellow-400/[0.1]"
        >
          Kelola di Vault
        </Link>
      </div>
    </div>
  );
}
