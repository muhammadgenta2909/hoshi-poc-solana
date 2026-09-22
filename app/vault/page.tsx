"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { isDomesticShippableListing, type Listing } from "@/lib/market";
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
  hoshiListingRef,
  relistListing,
  type CardRedemption,
  type RedemptionStatus,
} from "@/lib/api";
import { explorerAddressUrl, pullGradeLabel, winnersToLiveCards, type GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useFavorites } from "@/lib/favorites";
import { HeartIcon } from "@/components/account/ui";
import { useFinishListingEscrow } from "@/lib/useListingEscrow";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import MarketCard, { Badge, CategoryBadge } from "@/components/packs/MarketCard";
import ListForSaleModal from "@/components/packs/ListForSaleModal";
import {
  PayModal,
  readPendingPayment,
  clearPendingPayment,
} from "@/components/packs/PayWithRupiah";
import ShippingFlowModal, {
  clearPendingShip,
  isActionableShipStatus,
  isResignShipStatus,
  readPendingShip,
  STATUS_LABEL,
} from "@/components/packs/ShippingFlowModal";
import { isDomesticActionableStatus } from "@/components/packs/DomesticShipModal";
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

/**
 * KUNCI untuk mencocokkan satu listing yang dimiliki user dengan baris permintaan kirimnya.
 *
 * Backend menulis identitas kartu ke kolom `CardRedemption.nftAddress` untuk KEDUA rail: alamat
 * NFT untuk kartu vault CollectorCrypt, turunan `hoshi-listing:<id>` untuk kartu STOK HOSHI
 * (yang memang tidak punya alamat NFT — settlement-nya database-only). Fungsi ini menghasilkan
 * kunci yang SAMA dari sisi klien, jadi satu peta status melayani kedua rail.
 *
 * RAIL DOMESTIK DIPERIKSA DULU, dan urutan itu wajib: sebuah baris stok Hoshi bisa (dari jalur
 * demo/warisan) punya alamat NFT, dan backend MENORMALKAN baris seperti itu ke identitas
 * domestik. Memeriksa alamat NFT lebih dulu akan mencari dengan kunci yang tidak pernah ditulis →
 * status kirimnya tidak pernah ketemu, badge-nya hilang, dan kartu yang sedang dikirim tetap
 * terlihat seperti kartu yang bebas.
 *
 * KARTU TITIPAN IKUT DI SINI. Fisiknya ada di rak yang sama di Indonesia, jadi ia dikirim lewat
 * kurir lokal persis seperti stok Hoshi — tapi `hoshiStock` untuknya SELALU false (predikat itu
 * menuntut tidak ada penjual, dan kartu titipan punya penjual: pemiliknya). Membaca `hoshiStock`
 * saja di sini berarti pembeli kartu titipan membayar penuh lalu tidak punya satu pun tombol
 * untuk meminta kartunya. `isDomesticShippableListing` adalah predikat yang lebih luas itu, satu
 * salinan, dipakai di sini dan di /withdraw.
 */
const shipKeyForListing = (l: Listing): string | null =>
  isDomesticShippableListing(l)
    ? hoshiListingRef(l.id)
    : (l.nft?.assetAddress ?? l.ccNftAddress ?? null);

// Redemption yang membuat kartu SUDAH keluar dari vault: begitu burn tersubmit, NFT tak lagi di
// wallet (di prod di-burn; di staging disimulasi disembunyikan).
//
// FUNDED SENGAJA TIDAK di sini: di status itu ongkirnya sudah didanai ke wallet user tapi burn-nya
// BELUM ditandatangani — kartunya masih utuh di vault.
//
// ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
// │ `SHIPPED` DIKELUARKAN DARI DAFTAR INI DENGAN SENGAJA.                                        │
// │                                                                                              │
// │ SHIPPED adalah status yang DITULIS ADMIN pada rail DOMESTIK: paketnya baru saja diserahkan   │
// │ ke kurir, dan justru DI SITULAH pembeli paling butuh melihat kartunya — bersama resinya.     │
// │ Selama status ini ikut menyembunyikan baris, pembeli yang sudah membayar dua kali (kartu +   │
// │ ongkir) melihat kartunya LENYAP dari Vault pada hari pengiriman dan tidak punya satu pun     │
// │ jejak paketnya. Rail domestik juga tidak pernah mem-burn apa pun (settlement-nya             │
// │ database-only), jadi tidak ada aset yang benar-benar hilang dari wallet di status ini.       │
// │                                                                                              │
// │ Kartunya sekarang bertahan dengan badge "📦 Dikirim" sampai DELIVERED — dan DELIVERED tetap  │
// │ di dalam daftar, karena di sana kartunya memang sudah ada di tangan pemiliknya.              │
// │ Untuk rail CC, SHIPPED cuma status record-only warisan (alurnya BURN_SUBMITTED → IN_TRANSIT  │
// │ → DELIVERED, ketiganya tetap di sini), jadi perubahan ini tidak menyentuh jalur itu.         │
// └──────────────────────────────────────────────────────────────────────────────────────────────┘
const SHIPPED_OUT = new Set<RedemptionStatus>([
  "BURN_SUBMITTED",
  "IN_TRANSIT",
  "DELIVERED",
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
  // Resume KIRIM KARTU FISIK sepulang dari halaman bayar ongkir. returnUrl ongkir dibangun backend
  // (hoshi-backend/src/payments/payments.service.ts, createShippingOrder) dan menunjuk ke /vault —
  // jadi halaman INI yang harus melanjutkan sesinya. Sebelum ini hanya /withdraw yang membaca
  // readPendingShip(), sehingga user yang baru saja membayar ongkir mendarat di grid tanpa cara
  // apa pun untuk meneruskan ke tanda tangan. Pola & key-nya sama persis dengan /withdraw.
  const [shipping, setShipping] = useState<{ redemptionId: string } | null>(null);
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
    // Ongkir kirim fisik punya KEY SENDIRI (hoshi_pending_ship) supaya tak bentrok dengan resume
    // pack/listing/top-up di atas — jadi keduanya boleh hidup berdampingan dan dicek berurutan.
    // Modal-nya dibuka dalam mode resume: ia poll status sampai READY_TO_FUND lalu lanjut ke tanda
    // tangan. Tanpa blok ini, returnUrl ongkir yang menunjuk ke /vault berujung buntu.
    if (CC_SHIPPING_ENABLED) {
      const pendingShip = readPendingShip();
      if (pendingShip) setShipping({ redemptionId: pendingShip.redemptionId });
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
          r.kind === "pull" ? r.pull.nftAddress : shipKeyForListing(r.listing);
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
            <p className="text-[13px] text-white">
              Every card you own — pulled from packs or bought on the marketplace.
            </p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Your Vault
            </h1>
            <p className="mt-1 text-[12px] text-zinc-200">
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
                e.kind === "pull" ? e.pull.nftAddress : shipKeyForListing(e.listing);
              // Status pra-burn → badge (kartu keluar-vault sudah difilter keluar di atas).
              const ship = nft ? redemptionByNft.get(nft) : undefined;
              const shipActive = !!ship && !SHIPPED_OUT.has(ship);
              // RAIL DOMESTIK (kurir lokal): stok Hoshi ATAU kartu TITIPAN — dua-duanya fisiknya
              // ada di rak Hoshi di Indonesia. Dibaca dari flag yang DITURUNKAN SERVER, bukan
              // ditebak dari "tidak punya alamat NFT", karena tebakan itu ikut menyapu baris
              // seed/placeholder.
              const domesticRow = e.kind === "bought" && isDomesticShippableListing(e.listing);
              /* Bisa dilanjutkan sendiri oleh user?
                 • rail DOMESTIK → ya selama ongkirnya belum lunas, dan SENGAJA TIDAK digerbang
                   CC_SHIPPING_ENABLED: rail ini tidak menyentuh CollectorCrypt sama sekali.
                 • rail CC       → hanya saat flag ON. isResignShipStatus(FUNDED) WAJIB ikut: uang
                   treasury sudah keluar, kartunya masih utuh, dan yang kurang cuma satu tanda
                   tangan; dulu status itu tidak ada di daftar mana pun sehingga jatuh ke badge
                   "Sedang dikirim" yang tidak bisa diklik — salah DAN buntu. */
              const canContinue =
                !!ship &&
                (domesticRow
                  ? isDomesticActionableStatus(ship)
                  : CC_SHIPPING_ENABLED &&
                    (isActionableShipStatus(ship) || isResignShipStatus(ship)));
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
                      // Jalan masuk ke permintaan kirim untuk kartu STOK HOSHI yang belum punya
                      // permintaan aktif. Tanpa ini pembeli yang baru saja membayar mendarat di
                      // /vault dan tidak punya satu pun tombol yang meminta kartunya — persis
                      // keadaan yang membuat pekerjaan ini ada.
                      canShipDomestic={domesticRow && !shipActive}
                    />
                  )}
                  {shipActive &&
                    ship &&
                    // Grid ini layar yang paling sering dilihat, jadi ia HARUS memakai helper yang
                    // sama dengan /withdraw dan /vault/[nft] — bukan daftar status sendiri yang
                    // bisa (dan pernah) ketinggalan satu status.
                    (canContinue ? (
                      <Link
                        href="/withdraw"
                        className="absolute left-2 top-2 z-10 rounded-full border border-yellow-400/50 bg-yellow-500/90 px-2 py-0.5 text-[10px] font-bold text-[#171717] shadow transition hover:brightness-110"
                      >
                        {domesticRow
                          ? "📦 Bayar ongkir"
                          : isResignShipStatus(ship)
                            ? "📦 Tanda tangani"
                            : "📦 Selesaikan kirim"}
                      </Link>
                    ) : (
                      // Flag OFF (record-only) atau status yang sudah berjalan → badge info biasa,
                      // teksnya diambil dari STATUS_LABEL supaya tidak ada kalimat yang cuma hidup
                      // di file ini dan bisa bertentangan dengan layar lain.
                      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full border border-sky-400/40 bg-sky-500/90 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                        📦 {STATUS_LABEL[ship]}
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

      {/* Resume KIRIM FISIK sepulang bayar ongkir (returnUrl backend → /vault). Sama seperti di
          /withdraw: mode resume, dan saat ditutup pending-nya dibersihkan + koleksi di-reload
          supaya badge kirimnya (mis. "Tanda tangani") langsung sesuai status terbaru. */}
      {CC_SHIPPING_ENABLED && shipping && (
        <ShippingFlowModal
          redemptionId={shipping.redemptionId}
          resume
          onFinished={() => setReloadKey((k) => k + 1)}
          onClose={() => {
            clearPendingShip();
            setShipping(null);
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
  // Key = SESSION address (adapter key, else the JWT user's wallet), sama dengan yang
  // dibaca banner /account dan /settings — user Google tak punya publicKey adapter, jadi
  // memakai useWallet() di sini akan menulis ♥ ke bucket "anon" yang tak pernah dibaca.
  const { activeAddress: wallet } = useAuth();
  const { favorites, toggle } = useFavorites(wallet);
  const faved = !!pull.nftAddress && favorites.includes(pull.nftAddress);
  const [maxNote, setMaxNote] = useState(false);
  // Grade dari katalog CC ("PSA 10"), null bila CC belum memberi tahu → badge hilang.
  const grade = pullGradeLabel(pull);

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

      {/* Card panel — a <div> (NOT a <Link>) so the in-body actions (List for Sale / NFT) aren't
          nested inside an anchor. Image + title link to the detail page instead. */}
      <div className="group flex flex-col overflow-hidden rounded-2xl border border-white/5 text-left transition hover:border-white/15">
        {/* Image parent — frosted white 9% (Figma); click-through to detail. */}
        <Link
          href={`/vault/${pull.nftAddress}`}
          aria-label={`View ${pull.ccItemName ?? pull.nftName ?? "your card"}`}
          className="relative block bg-white/[0.09] p-3 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          {/* PULLED origin badge — restyled to the Jersey/gold chip MarketCard uses. */}
          <span
            className="absolute left-2 top-2 z-10 inline-flex items-center rounded-md px-2 py-[3px] text-[13px] uppercase leading-none tracking-wide text-[#171717]"
            style={{ fontFamily: "var(--font-jersey)", backgroundImage: GOLD_GRADIENT }}
          >
            Pulled
          </span>
          {pull.nftImage ? (
            <Img
              src={pull.nftImage}
              alt={pull.nftName ?? "Pulled card"}
              className="mx-auto aspect-[3/4] w-full rounded-lg object-contain transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="mx-auto grid aspect-[3/4] w-full place-items-center rounded-lg bg-white/[0.04]">
              <Img src="/card-back.svg" alt="" className="h-24 w-auto opacity-60" />
            </div>
          )}
        </Link>

        {/* Lower section — #181507; carries badges, title, set, and the in-body actions. */}
        <div className="flex flex-1 flex-col bg-[#181507] p-3.5">
          {/* grade / rarity badges — hanya yang benar-benar diketahui (mirror MarketCard:
              field kosong = badge hilang, bukan tebakan). */}
          <div className="flex flex-wrap items-center gap-1.5">
            {grade && <Badge>{grade}</Badge>}
            {pull.rarity && <Badge>{pull.rarity}</Badge>}
          </div>

          {/* title + vault mark — kartu hasil pull selalu ter-vault di CollectorCrypt,
              jadi selalu tampil "CC" teal (sama seperti MarketCard source=COLLECTORCRYPT).
              `ccItemName` = judul katalog CC lengkap; `nftName` (metadata on-chain, 32 char)
              cuma cadangan. */}
          <Link href={`/vault/${pull.nftAddress}`} className="mt-3 flex items-center gap-2 focus-visible:outline-none">
            <span className="truncate text-[17px] font-bold uppercase leading-tight text-white transition group-hover:text-yellow-100">
              {pull.ccItemName ?? pull.nftName ?? "Your card"}
            </span>
            <span
              className="shrink-0 text-lg leading-none text-[#38E5D0]"
              style={{ fontFamily: "var(--font-jersey)" }}
              title="Vault: CollectorCrypt"
            >
              CC
            </span>
          </Link>

          {/* seri/set kartu (analog CategoryBadge di MarketCard) — hanya bila CC memberi tahu. */}
          {pull.ccSet && (
            <div className="mt-2">
              <CategoryBadge>{pull.ccSet}</CategoryBadge>
            </div>
          )}

          {/* Aksi DI DALAM body card, di bawah judul (permintaan user) — bukan tombol lepas di luar. */}
          <div className="mt-3 flex flex-col gap-2">
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
          </div>
        </div>
      </div>

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
  canShipDomestic = false,
}: {
  listing: Listing;
  /** listingId kalau kartu ini SUDAH dipajang lagi (dari server saat load). */
  initialListedId: string | null;
  /**
   * true = kartu STOK HOSHI milik user yang BELUM punya permintaan kirim aktif → tawarkan jalan
   * masuk ke /withdraw. Diputuskan parent (ia yang memegang peta status kirim), bukan disimpulkan
   * di sini dari `hoshiStock` saja — kalau tidak, kartu yang ongkirnya sedang dibayar akan
   * menampilkan ajakan "minta dikirim" untuk kedua kalinya.
   */
  canShipDomestic?: boolean;
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
  // Bucket-nya SESSION address, bukan publicKey adapter (lihat catatan di PullCard).
  const { activeAddress: favWallet } = useAuth();
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

      {/* ─── MINTA DIKIRIM (kartu yang fisiknya di rak Hoshi: STOK HOSHI atau TITIPAN) ───────
          Jalan masuk yang sebelumnya TIDAK ADA di seluruh aplikasi. Kedua jenis kartu ini settle
          database-only (tak punya alamat NFT), jadi tanpa jalan masuk ini ia tidak pernah lolos
          saringan pemilih kartu di /withdraw dan tidak pernah punya halaman detail vault —
          pembeli bisa membayar penuh lalu tidak punya satu pun tombol yang meminta kartunya.

          Ditaruh SEBELUM "List for Sale" dengan sengaja: pembeli kartu fisik biasanya ingin
          kartunya, bukan menjualnya lagi. Aksen EMAS = rail kurir domestik, warna yang sama
          dipakai lencana rail di /withdraw dan di dashboard admin. */}
      {canShipDomestic && (
        <Link
          href="/withdraw"
          className="rounded-xl border border-[#F2C101]/45 bg-[#F2C101]/[0.12] px-3 py-2 text-center text-xs font-semibold text-[#F2C101] transition hover:bg-[#F2C101]/[0.2]"
          title="Kartu ini ada di gudang Hoshi di Indonesia — kamu cuma membayar ongkir kurir. Tidak ada NFT yang dibakar dan tidak ada tanda tangan wallet."
        >
          📦 Kirim ke rumah — bayar ongkir
        </Link>
      )}

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
      ) : listing.consigned === true ? (
        /* KARTU TITIPAN yang sudah kamu beli. Menjualnya ulang dari sini akan menghidupkan lagi
           baris listing yang masih terikat ke catatan titipan penjual sebelumnya — server
           menolaknya, dan itu benar. Jadi tombolnya tidak ditawarkan, dan alasannya dikatakan. */
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[11px] leading-relaxed text-zinc-400">
          Kartu titipan belum bisa dijual ulang dari sini. Minta dikirim dulu, atau hubungi tim
          Hoshi untuk menitipkannya lagi.
        </p>
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
  const { token, login, canAutoRecover } = useAuth();
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
      /* ── 403 TIDAK PERNAH MENYENTUH SESI, DAN 401 TIDAK MEMBUKA MODAL SENDIRI ──────────────
         Dulu baris ini menyamakan 401 dan 403, lalu membuka modal SAMBUNGKAN WALLET untuk
         keduanya. Dua hal salah di situ:

           403 berarti "kamu memang login, tapi ini bukan hakmu". Mengajak orang menyambungkan
           wallet di situ menyuruh ia memperbaiki hal yang tidak rusak.

           401 untuk user Google membuka modal wallet kepada orang yang tidak punya wallet dan
           tidak pernah butuh satu. Sejak `lib/api` memulihkan sesi Google di latar, yang benar
           adalah DIAM — percobaan berikutnya berhasil sendiri.

         Modal hanya untuk yang benar-benar tidak punya jalan pulih otomatis, dan pesannya
         ditulis di `error` supaya ia tahu kenapa layarnya berubah. */
      if (e instanceof ApiError && e.status === 401 && !canAutoRecover) {
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
            <Img src={listing.image} alt={listing.name} className="h-full w-full bg-white/[0.03] object-contain" />
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
