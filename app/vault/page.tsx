"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import type { Listing } from "@/lib/market";
import type { LiveCard } from "@/lib/packs";
import {
  ApiError,
  CC_SHIPPING_ENABLED,
  getBalance,
  getGachaWinners,
  getMyListings,
  getMyPacks,
  getMyPurchases,
  getMyRedemptions,
  relistListing,
  type CardRedemption,
  type RedemptionStatus,
} from "@/lib/api";
import { explorerAddressUrl, winnersToLiveCards, type GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useFavorites } from "@/lib/favorites";
import { HeartIcon } from "@/components/account/ui";
import { useFinishListingEscrow } from "@/lib/useListingEscrow";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import MarketCard from "@/components/packs/MarketCard";
import ListForSaleModal from "@/components/packs/ListForSaleModal";
import {
  PayModal,
  readPendingPayment,
  clearPendingPayment,
} from "@/components/packs/PayWithRupiah";
import { formatIdr, GOLD_GRADIENT, GradientText, Img } from "@/components/packs/ui";

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

// Redemption yang membuat kartu SUDAH keluar dari vault: begitu burn tersubmit, NFT tak lagi di
// wallet (di prod di-burn; di staging disimulasi disembunyikan). SHIPPED = status record-only lama.
const SHIPPED_OUT = new Set<RedemptionStatus>([
  "BURN_SUBMITTED",
  "IN_TRANSIT",
  "DELIVERED",
  "SHIPPED",
]);
// Redemption yang butuh AKSI user (bayar ongkir / tanda tangani) — badge diberi warna beda + ajakan.
const NEEDS_ACTION = new Set<RedemptionStatus>([
  "REQUESTED",
  "AWAITING_PAYMENT",
  "READY_TO_FUND",
]);

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
  // nftAddress → status kirim fisik (REQUESTED/PACKING/SHIPPED). SHIPPED = kartu keluar vault.
  const [redemptions, setRedemptions] = useState<CardRedemption[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  // Ticker "kemenangan terbaru" — SELALU dari data asli /gacha/winners (bukan mock),
  // sama seperti halaman Open Packs. Mulai kosong, terisi saat fetch.
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);
  // Re-fetch koleksi setelah pembelian selesai (kartu yang baru dibeli langsung muncul).
  const [reloadKey, setReloadKey] = useState(0);
  // Resume pembayaran BELI KARTU (reseller) sepulang dari halaman bayar. Order listing sengaja
  // mendarat di /vault (bukan /open-packs): nav "Vault" benar + kartu langsung tampak di koleksi.
  const [resumePay, setResumePay] = useState<{
    orderId: string;
    packType: string;
    listingId: string;
  } | null>(null);
  // Saldo in-app penjual (hasil jual P2P). null = belum termuat.
  const [balanceIdrx, setBalanceIdrx] = useState<number | null>(null);

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
      getBalance(token).catch(() => null),
      getMyRedemptions(token).catch(() => [] as CardRedemption[]),
    ])
      .then(([bought, myPacks, listings, bal, reds]) => {
        if (!alive) return;
        setItems(bought);
        if (bal) setBalanceIdrx(bal.balanceIdrx);
        setRedemptions(reds);
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
  }, [token, reloadKey]);

  // Sepulang dari halaman bayar (Duitku/IDRX) untuk BELI KARTU: bersihkan query yang ditempel
  // gateway, lalu resume order-nya di sini. Hanya order listing (listingId ada) yang ditangani
  // /vault — order pack tetap di-resume di /open-packs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.has("merchantOrderId") ||
      params.has("resultCode") ||
      params.has("reference")
    ) {
      window.history.replaceState(null, "", "/vault");
    }
    const pending = readPendingPayment();
    if (pending?.listingId) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setResumePay({
        orderId: pending.merchantOrderId,
        packType: pending.packType,
        listingId: pending.listingId,
      });
    }
  }, []);

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

  // Gabungkan kartu hasil PULL + kartu HASIL-BELI jadi SATU daftar, urut waktu-akuisisi (terbaru
  // dulu), supaya kartu yang baru dibeli tampil di ATAS — bukan tersembunyi di bawah semua kartu
  // pull. (Dulu dirender dua blok terpisah: semua pull, lalu semua beli → kartu baru nyangkut di
  // bawah.) Cermin urutan /account: bought=soldAt??listedAt, pull=openedAt??createdAt.
  // nftAddress → status kirim aktif. SHIPPED = kartu SUDAH keluar vault (di prod NFT di-burn; di
  // staging disimulasi dgn menyembunyikannya). REQUESTED/PACKING = masih di vault, dikasih badge.
  const redemptionByNft = useMemo(() => {
    const m = new Map<string, RedemptionStatus>();
    for (const r of redemptions) {
      if (r.status === "CANCELED") continue;
      m.set(r.nftAddress, r.status);
    }
    return m;
  }, [redemptions]);

  const collection = useMemo(() => {
    const t = (s?: string | null) => (s ? Date.parse(s) : 0);
    const rows: (
      | { kind: "pull"; at: number; pull: GachaPull }
      | { kind: "bought"; at: number; listing: Listing }
    )[] = [
      ...pulls.map((p) => ({
        kind: "pull" as const,
        at: t(p.openedAt ?? p.createdAt),
        pull: p,
      })),
      ...items.map((l) => ({
        kind: "bought" as const,
        at: t(l.soldAt ?? l.listedAt),
        listing: l,
      })),
    ];
    // Sembunyikan kartu yang SUDAH KELUAR vault (burn tersubmit / dikirim). Status pra-burn
    // (REQUESTED/AWAITING_PAYMENT/READY_TO_FUND/FUNDING/FUNDED/PACKING) tetap tampil dengan badge.
    return rows
      .filter((r) => {
        const nft =
          r.kind === "pull"
            ? r.pull.nftAddress
            : (r.listing.nft?.assetAddress ?? r.listing.ccNftAddress);
        const st = nft ? redemptionByNft.get(nft) : undefined;
        return !(st && SHIPPED_OUT.has(st));
      })
      .sort((a, b) => b.at - a.at);
  }, [pulls, items, redemptionByNft]);

  const loading = !!token && loadedFor !== token;

  return (
    <div
      className="page-bg relative min-h-screen text-zinc-100"
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
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

          {/* Saldo hasil jual kartu (in-app Rupiah). Aksen EMAS (brand Hoshi) — sama dengan baris
              "Saldo Jual" di dropdown akun, jadi keduanya kebaca satu sistem. Gradient + glow supaya
              tidak flat. Muncul begitu ada penjualan. */}
          {balanceIdrx != null && balanceIdrx > 0 && (
            <div className="rounded-2xl border border-white/10 bg-[#0f0d08] px-5 py-3.5 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#F2C101] text-[13px] font-bold text-[#171717]">
                  Rp
                </span>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                    Saldo Penjualan
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold leading-none tabular-nums text-white">
                    Rp {formatIdr(balanceIdrx)}
                  </p>
                  <Link
                    href="/tarik-saldo"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#F2C101] transition hover:underline"
                  >
                    Tarik saldo →
                  </Link>
                </div>
              </div>
            </div>
          )}
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
            {collection.map((e) => {
              const nft =
                e.kind === "pull"
                  ? e.pull.nftAddress
                  : (e.listing.nft?.assetAddress ?? e.listing.ccNftAddress);
              // Status pra-burn → badge (kartu keluar-vault sudah difilter keluar di atas).
              const ship = nft ? redemptionByNft.get(nft) : undefined;
              const shipActive = !!ship && !SHIPPED_OUT.has(ship);
              const key = e.kind === "pull" ? `pull-${e.pull.memo}` : `bought-${e.listing.id}`;
              return (
                <div key={key} className="relative">
                  {e.kind === "pull" ? (
                    <PullCard
                      pull={e.pull}
                      initialListedId={
                        e.pull.nftAddress ? (listedMap.get(e.pull.nftAddress) ?? null) : null
                      }
                    />
                  ) : (
                    <BoughtCard
                      listing={e.listing}
                      initialListedId={
                        listedMap.get(
                          e.listing.ccNftAddress ?? e.listing.nft?.assetAddress ?? "",
                        ) ?? null
                      }
                    />
                  )}
                  {shipActive && ship &&
                    (CC_SHIPPING_ENABLED && NEEDS_ACTION.has(ship) ? (
                      // Flag ON: status pra-bayar/ttd → ajak user menyelesaikan di /withdraw.
                      <Link
                        href="/withdraw"
                        className="absolute left-2 top-2 z-10 rounded-full border border-yellow-400/50 bg-yellow-500/90 px-2 py-0.5 text-[10px] font-bold text-[#171717] shadow transition hover:brightness-110"
                      >
                        📦 Selesaikan kirim
                      </Link>
                    ) : (
                      // Flag OFF (record-only) atau status yang sudah berjalan → badge info biasa.
                      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-sky-400/40 bg-sky-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        📦 Sedang dikirim
                      </span>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Resume BELI KARTU (reseller) sepulang bayar → poll sampai FULFILLED, lalu koleksi
          di-reload biar kartunya langsung muncul. Kita SUDAH di /vault (nav benar). */}
      {resumePay && (
        <PayModal
          packType={resumePay.packType}
          listingId={resumePay.listingId}
          resumeOrderId={resumePay.orderId}
          // Setelah sukses, tombol "Lihat Kartu" mengantar ke DETAIL kartu yang BARU dibeli (chip
          // "Kamu memiliki kartu ini") — bukan cuma balik ke grid /vault yang dulu bikin bingung.
          successHref={`/marketplace/${resumePay.listingId}`}
          onFulfilled={() => {
            clearPendingPayment();
          }}
          onClose={() => {
            clearPendingPayment();
            setResumePay(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
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

  // Favorit (♥) — id = nftAddress; tampil di box "Your Favorite Card" di banner profil.
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58() ?? null;
  const { favorites, toggle } = useFavorites(wallet);
  const faved = !!pull.nftAddress && favorites.includes(pull.nftAddress);
  const [maxNote, setMaxNote] = useState(false);

  return (
    <div className="relative flex flex-col gap-2">
      {/* Heart favorit — SIBLING dari <Link> (bukan di dalamnya, biar bukan button-in-anchor),
          di-overlay di pojok kanan-atas art. Maks 3 favorit; kalau penuh → note singkat. */}
      {pull.nftAddress && (
        <>
          <button
            type="button"
            onClick={() => {
              const res = toggle(pull.nftAddress as string);
              if (!res.ok && res.atMax) {
                setMaxNote(true);
                window.setTimeout(() => setMaxNote(false), 2200);
              }
            }}
            aria-label={faved ? "Hapus dari favorit" : "Jadikan favorit"}
            title={faved ? "Favorit" : "Jadikan favorit (maks 3)"}
            className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/70"
          >
            <HeartIcon className={`h-4 w-4 ${faved ? "text-red-400" : "text-white/60"}`} />
          </button>
          {maxNote && (
            <span className="absolute right-2 top-11 z-20 rounded-lg bg-black/80 px-2 py-1 text-[10px] text-amber-200">
              Maks 3 favorit
            </span>
          )}
        </>
      )}

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

/** Kartu yang user BELI (dari Hoshi/reseller CC atau dari user lain). Bisa dijual ULANG
 *  (relist → jadi listing baru dengan user sebagai penjual) + link NFT on-chain. Melengkapi
 *  loop P2P: beli → punya → jual lagi. */
function BoughtCard({
  listing,
  initialListedId,
}: {
  listing: Listing;
  /** listingId kalau kartu ini SUDAH dipajang lagi (dari server saat load). */
  initialListedId: string | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [listedId, setListedId] = useState<string | null>(null);
  const effectiveListedId = listedId ?? initialListedId;
  const nftAddr = listing.nft?.assetAddress ?? listing.ccNftAddress ?? null;
  // Prod real-P2P: listing yang menunggu kartu masuk escrow (penjual belum/gagal tanda tangan).
  // Di staging/mock ini tak pernah terjadi. Tombolnya mengajak MENYELESAIKAN, bukan seolah belum
  // dilisting — RelistModal akan menerbitkannya ulang & memicu tanda tangan transfer→escrow lagi.
  const pendingEscrow = listing.status === "PENDING_ESCROW";

  // Favorit (♥) — key = listing.id (sama dgn resolusi banner di /account). Heart di semua kartu.
  const { publicKey } = useWallet();
  const favWallet = publicKey?.toBase58() ?? null;
  const { favorites, toggle } = useFavorites(favWallet);
  const faved = favorites.includes(listing.id);
  const [maxNote, setMaxNote] = useState(false);

  return (
    <div className="relative flex flex-col gap-2">
      <button
        type="button"
        onClick={() => {
          const res = toggle(listing.id);
          if (!res.ok && res.atMax) {
            setMaxNote(true);
            window.setTimeout(() => setMaxNote(false), 2200);
          }
        }}
        aria-label={faved ? "Hapus dari favorit" : "Jadikan favorit"}
        title={faved ? "Favorit" : "Jadikan favorit (maks 3)"}
        className="absolute right-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/70"
      >
        <HeartIcon className={`h-4 w-4 ${faved ? "text-red-400" : "text-white/60"}`} />
      </button>
      {maxNote && (
        <span className="absolute right-2 top-11 z-20 rounded-lg bg-black/80 px-2 py-1 text-[10px] text-amber-200">
          Maks 3 favorit
        </span>
      )}
      <MarketCard listing={listing} currency="IDR" showStatus />

      {effectiveListedId && !pendingEscrow ? (
        <Link
          href={`/marketplace/${effectiveListedId}`}
          className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] px-3 py-2 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.14]"
        >
          Listed ✓ — lihat di marketplace
        </Link>
      ) : pendingEscrow ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-xl border border-amber-400/40 bg-amber-400/[0.12] px-3 py-2 text-center text-xs font-semibold text-amber-200 transition hover:bg-amber-400/[0.2]"
        >
          Selesaikan escrow ke marketplace
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="rounded-xl border border-yellow-400/30 bg-yellow-400/[0.1] px-3 py-2 text-center text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/[0.18]"
        >
          + List for Sale
        </button>
      )}

      {nftAddr && (
        <a
          href={explorerAddressUrl(nftAddr)}
          target="_blank"
          rel="noreferrer"
          className="truncate rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold text-zinc-400 transition hover:bg-white/[0.08]"
        >
          NFT {shortAsset(nftAddr)}
        </a>
      )}

      {modalOpen && (
        <RelistModal
          listing={listing}
          onClose={() => setModalOpen(false)}
          onRelisted={(l) => {
            setListedId(l.id);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Modal ringkas untuk menjual ULANG kartu yang sudah dimiliki (hasil beli). Beda dari
 *  ListForSaleModal (yang untuk kartu hasil pull, pakai fromPackMemo): ini me-relist listing
 *  yang user-nya jadi pembeli → jadi ACTIVE lagi dengan user sebagai penjual. */
function RelistModal({
  listing,
  onClose,
  onRelisted,
}: {
  listing: Listing;
  onClose: () => void;
  onRelisted: (l: Listing) => void;
}) {
  const { token, login } = useAuth();
  const { setVisible } = useWalletConnect();
  const finishEscrow = useFinishListingEscrow();
  // Prefill dgn harga kartu sekarang (patokan nilai) biar penjual tak mulai dari kolom kosong —
  // tinggal sesuaikan. Fallback expectedValue kalau price 0/absen.
  const [price, setPrice] = useState(() => {
    const seed = listing.price > 0 ? listing.price : listing.expectedValue;
    return seed && seed > 0 ? String(Math.round(seed)) : "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceNum = Number(price);
  const valid = Number.isFinite(priceNum) && priceNum > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      let t = token;
      if (!t) t = await login();
      const relisted = await relistListing(
        listing.id,
        { price: Math.round(priceNum) },
        t,
      );
      // Real P2P (prod armed): relisted balik PENDING_ESCROW → penjual TTD transfer→escrow.
      // Staging/mock: relisted sudah ACTIVE → finishEscrow no-op.
      const l = await finishEscrow(relisted, t);
      onRelisted(l);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setVisible(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`List ${listing.name} for sale`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Jual Ulang Kartu</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-3">
          <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
            <Img src={listing.image} alt={listing.name} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">{listing.name}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Kartu milikmu — pasang harga jualnya.</p>
          </div>
        </div>

        <label className="mb-1.5 block">
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
            Harga jual (IDRX)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="mis. 1.000.000"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
          />
        </label>
        <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
          Pembeli bayar Rupiah; hasilnya masuk <span className="text-zinc-300">saldomu</span>{" "}
          setelah dipotong komisi kecil Hoshi.
        </p>

        {error && <p className="mb-3 text-[13px] text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundImage: GOLD_GRADIENT }}
        >
          {busy ? "Memajang…" : "List for Sale"}
        </button>
      </div>
    </div>,
    document.body,
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
