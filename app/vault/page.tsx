"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import type { Listing } from "@/lib/market";
import type { LiveCard } from "@/lib/packs";
import { PAGE_BG } from "@/lib/theme";
import { getGachaWinners, getMyListings, getMyPacks, getMyPurchases } from "@/lib/api";
import { explorerAddressUrl, winnersToLiveCards, type GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import MarketCard from "@/components/packs/MarketCard";
import ListForSaleModal from "@/components/packs/ListForSaleModal";
import { GradientText, Img } from "@/components/packs/ui";

// Vault = every card the user owns, from BOTH sources (CC-style single collection):
//   • marketplace buys  → GET /marketplace/me/purchases
//   • gacha pulls        → GET /gacha/me/packs
// A pulled card mints straight to the wallet, so it shows here the moment the
// pack is opened — not only on the Solana explorer.
function shortAsset(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** A successfully-opened pull with a minted card address is a real owned card. */
const isOwnedPull = (p: GachaPull): boolean => p.status === "OPENED" && !!p.nftAddress;

export default function VaultPage() {
  const { token, hydrated, login } = useAuth();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletConnect();

  const [items, setItems] = useState<Listing[]>([]);
  const [pulls, setPulls] = useState<GachaPull[]>([]);
  // nftAddress → listingId untuk listing yang masih AKTIF. Tanpa ini, grid tidak
  // tahu kartu mana yang SUDAH dipajang, jadi tombol "List for Sale" tetap muncul
  // untuk kartu yang sudah listed → klik → error "sudah dipajang".
  const [listedMap, setListedMap] = useState<Map<string, string>>(new Map());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  // Ticker "kemenangan terbaru" — SELALU dari data asli /gacha/winners (bukan mock),
  // sama seperti halaman Open Packs. Mulai kosong, terisi saat fetch.
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      getGachaWinners()
        .then((ws) => { if (alive && ws.length) setLiveCards(winnersToLiveCards(ws)); })
        .catch(() => { /* jangan kosongkan ticker saat gagal — pertahankan yang ada */ });
    };
    load();
    const id = setInterval(load, 25_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    // Both sources load together. A pulls-only failure must NOT blank the whole
    // vault (it's the newer, less-critical source), so it's caught softly; only a
    // marketplace failure surfaces the sign-in-again gate.
    Promise.all([
      getMyPurchases(token),
      getMyPacks(token).catch(() => [] as GachaPull[]),
      getMyListings(token).catch(() => [] as Listing[]),
    ])
      .then(([bought, myPacks, listings]) => {
        if (!alive) return;
        setItems(bought);
        setPulls(myPacks.filter(isOwnedPull));
        // Cocokkan via ccNftAddress (di-set saat list, @unique) — relasi `nft` baru
        // terisi saat terjual, jadi tidak bisa dipakai untuk listing yang masih aktif.
        const m = new Map<string, string>();
        for (const l of listings) {
          if (l.status !== "ACTIVE") continue;
          const key = l.ccNftAddress ?? l.nft?.assetAddress;
          if (key) m.set(key, l.id);
        }
        setListedMap(m);
      })
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
      <LiveTicker cards={liveCards} />

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-zinc-500">
              Every card you own — pulled from packs or bought on the marketplace.
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Your Vault
            </h1>
            <p className="mt-1 text-[12px] text-zinc-600">
              Mau jual? Buka kartunya dan pilih “List for Sale”.
            </p>
          </div>
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
        ) : items.length === 0 && pulls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pulls.map((p) => (
              <PullCard
                key={p.memo}
                pull={p}
                initialListedId={p.nftAddress ? (listedMap.get(p.nftAddress) ?? null) : null}
              />
            ))}
            {items.map((l) => (
              <div key={l.id} className="flex flex-col gap-2">
                <MarketCard listing={l} currency="IDR" showStatus />
                {l.nft?.assetAddress && (
                  <a
                    href={explorerAddressUrl(l.nft.assetAddress)}
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

/** A gacha-pulled card in the collection. Real minted cNFT: shows its art + name
 *  + a "PULLED" origin badge, links out to on-chain proof, and — CollectorCrypt
 *  vault style — carries its OWN "List for Sale" action (open THIS card, set a
 *  price) instead of a vague global button. Listing ties to the real NFT. */
function PullCard({
  pull,
  initialListedId,
}: {
  pull: GachaPull;
  /** listingId kalau kartu ini SUDAH dipajang (dari server saat load). */
  initialListedId: string | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  // Listing yang dibuat DI SESI INI (override optimistik setelah user memajang).
  const [listedId, setListedId] = useState<string | null>(null);
  const effectiveListedId = listedId ?? initialListedId;
  const listable = pull.status === "OPENED" && !!pull.nftAddress;

  return (
    <div className="flex flex-col gap-2">
      {/* Card visual → click through to the CC-style detail/manage page. */}
      <Link
        href={`/vault/${pull.nftAddress}`}
        className="group relative block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-yellow-400/40"
      >
        <span className="absolute left-2 top-2 z-10 rounded-md bg-yellow-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#171717]">
          Pulled
        </span>
        {pull.nftImage ? (
          <Img
            src={pull.nftImage}
            alt={pull.nftName ?? "Pulled card"}
            className="aspect-[5/7] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid aspect-[5/7] w-full place-items-center bg-white/[0.04]">
            <Img src="/card-back.svg" alt="" className="h-24 w-auto opacity-60" />
          </div>
        )}
        <div className="p-2.5">
          {/* Judul katalog CC yang lengkap kalau sudah tersinkron; `nftName`
              (metadata on-chain) terpotong 32 karakter, jadi cuma cadangan. */}
          <p className="truncate text-[13px] font-semibold text-zinc-100">
            {pull.ccItemName ?? pull.nftName ?? "Your card"}
          </p>
          {pull.rarity && <p className="text-[11px] text-zinc-500">{pull.rarity}</p>}
        </div>
      </Link>

      {effectiveListedId ? (
        <Link
          href={`/marketplace/${effectiveListedId}`}
          className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-2 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.14]"
        >
          Listed ✓ — lihat di marketplace
        </Link>
      ) : listable ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-xl border border-yellow-400/30 bg-yellow-400/[0.1] px-3 py-2 text-center text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/[0.18]"
        >
          + List for Sale
        </button>
      ) : null}

      {pull.nftAddress && (
        <a
          href={explorerAddressUrl(pull.nftAddress)}
          target="_blank"
          rel="noreferrer"
          className="truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.08]"
        >
          NFT {shortAsset(pull.nftAddress)}
        </a>
      )}

      {modalOpen && (
        <ListForSaleModal
          pull={pull}
          onClose={() => setModalOpen(false)}
          onListed={(listing) => {
            setListedId(listing.id);
            setModalOpen(false);
          }}
        />
      )}
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
