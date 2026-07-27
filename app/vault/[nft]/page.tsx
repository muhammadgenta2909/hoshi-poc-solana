"use client";

// Owned pulled-card detail / manage page. Shares the SAME layout + primitives as
// the marketplace listing detail (/marketplace/[id]) via cardDetailParts, so the
// two pages look identical; only the *content* differs. A freshly-pulled card
// isn't listed yet, so it has no market data (est. value / price chart / offers /
// buy button) — those sections are simply absent (no fake data), and the action
// is "List for Sale" instead of "Buy". Identified by on-chain address; data comes
// from the caller's own pull ledger (GET /gacha/me/packs).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Listing } from "@/lib/market";
import { PAGE_BG } from "@/lib/theme";
import { getBuybackValue, getMyListings, getMyPacks } from "@/lib/api";
import { explorerAddressUrl, pullGradeLabel, type GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import TopNav from "@/components/packs/TopNav";
import ListForSaleModal from "@/components/packs/ListForSaleModal";
import BuybackModal from "@/components/packs/BuybackModal";
import { GOLD_GRADIENT, Img } from "@/components/packs/ui";
import {
  Badge,
  CONTRACT_YELLOW,
  DetailRow,
  JERSEY,
  Label,
  shortAsset,
  Stat,
  VaultVerified,
} from "@/components/packs/cardDetailParts";

const idr = new Intl.NumberFormat("id-ID");
const formatUsd6 = (b: number) =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(b / 1_000_000)}`;

// Cluster label (env-driven → mainnet-ready). Explorer/network stay in sync via
// the same NEXT_PUBLIC_SOLANA_CLUSTER that explorerAddressUrl() reads.
const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
const NETWORK_LABEL = `Solana · ${SOLANA_CLUSTER === "mainnet-beta" ? "mainnet" : SOLANA_CLUSTER}`;

export default function PulledCardPage() {
  const { nft } = useParams<{ nft: string }>();
  const { token, hydrated, login } = useAuth();
  const { setVisible } = useWalletConnect();

  const [pull, setPull] = useState<GachaPull | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [buybackOpen, setBuybackOpen] = useState(false);
  const [soldBack, setSoldBack] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    if (!token || !nft) return;
    let alive = true;
    // Pulls give us the card; listings tell us if THIS card is already for sale.
    Promise.all([getMyPacks(token), getMyListings(token).catch(() => [] as Listing[])])
      .then(([packs, listings]) => {
        if (!alive) return;
        setPull(packs.find((p) => p.nftAddress === nft) ?? null);
        setListing(
          listings.find(
            (l) => (l.ccNftAddress ?? l.nft?.assetAddress) === nft && l.status === "ACTIVE",
          ) ?? null,
        );
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoadedFor(token));
    return () => {
      alive = false;
    };
  }, [token, nft]);

  // What CollectorCrypt reckons this card is worth. Fetched separately (and
  // softly) because it is the ONLY value signal a holder has: the pack price says
  // what they paid, not what they hold. Read-only — issues no transaction.
  const [ccUsd, setCcUsd] = useState<number | null>(null);
  useEffect(() => {
    if (!token || !nft) return;
    let alive = true;
    getBuybackValue(nft, token)
      .then((v) => {
        if (alive && v.available && v.refundAmountUsdc != null) {
          setCcUsd(v.refundAmountUsdc / 1_000_000);
        }
      })
      .catch(() => {
        /* a valuation is a nicety — never let it break the card page */
      });
    return () => {
      alive = false;
    };
  }, [token, nft]);

  // Grade DIBACA dari katalog CollectorCrypt oleh backend, bukan ditebak dari nama
  // NFT. Nama metadata on-chain dibatasi 32 karakter, jadi judul katalog CC yang
  // panjang datang terpotong dan grade-nya sering ikut hilang — tebakan lama atas
  // nama itulah yang membuat kartu PSA 10 tampil "Ungraded" di halaman ini padahal
  // halaman marketplace (yang membaca field terstruktur CC) menampilkannya benar.
  const grade = useMemo(() => (pull ? pullGradeLabel(pull) : null), [pull]);
  const loading = !!token && loadedFor !== token;
  const listable = !!pull && pull.status === "OPENED" && !!pull.nftAddress;

  const handleAuth = useCallback(async () => {
    setAuthBusy(true);
    try {
      await login();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }, [login]);

  const stats: { label: string; value: string; valueColor?: string; href?: string }[] = pull
    ? [
        // "Ungraded" adalah KLAIM ("kartu ini tidak bergrade"), dan kita tidak
        // pernah tahu itu — yang kita tahu hanyalah CC belum menjawab. Kartu di
        // vault CC praktis selalu bergrade, jadi menulis "Ungraded" nyaris selalu
        // salah. Katakan apa adanya.
        {
          label: "Card Grade",
          value: grade ?? "Belum tersedia",
          valueColor: grade ? undefined : "#A1A1AA",
        },
        pull.ccGradeCert ? { label: "Certificate", value: pull.ccGradeCert } : null,
        pull.rarity ? { label: "Rarity", value: pull.rarity } : null,
        {
          label: "Contract Address",
          value: pull.nftAddress ? shortAsset(pull.nftAddress) : "Pending mint",
          valueColor: pull.nftAddress ? CONTRACT_YELLOW : "#A1A1AA",
          ...(pull.nftAddress ? { href: explorerAddressUrl(pull.nftAddress) } : {}),
        },
        { label: "Network", value: NETWORK_LABEL },
        // "Pack Price" (bukan "Acquired For" yang ambigu): ini biaya PACK yang
        // dibayar, BUKAN nilai kartu. Ditulis dua mata uang supaya tidak dikira
        // harga jual — form jual memakai rupiah.
        pull.priceUsdc != null
          ? {
              label: "Pack Price",
              value: `${formatUsd6(pull.priceUsdc)} · ≈ Rp ${idr.format(Math.round((pull.priceUsdc / 1_000_000) * 16_000))}`,
            }
          : null,
        // Nilai buyback CC — satu-satunya sinyal NILAI kartu (bukan modal pack).
        ccUsd != null
          ? {
              label: "Est. Value (CC buyback)",
              value: `$${ccUsd.toFixed(2)} · ≈ Rp ${idr.format(Math.round(ccUsd * 16_000))}`,
            }
          : null,
      ].filter(Boolean) as { label: string; value: string; valueColor?: string; href?: string }[]
    : [];

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Vault" />

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <Link
          href="/vault"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-400 transition hover:text-white"
        >
          ← Back to Vault
        </Link>

        {!hydrated || loading ? (
          <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>
        ) : !token ? (
          <GateCard busy={authBusy} onConnect={() => setVisible(true)} onSign={handleAuth} />
        ) : error ? (
          <p className="py-24 text-center text-sm text-red-400">{error}</p>
        ) : !pull ? (
          <NotFound />
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            {/* LEFT — framed slab + card details (matches marketplace LeftColumn) */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-5 rounded-2xl bg-white/[0.09] p-5 backdrop-blur-sm">
                {pull.nftImage ? (
                  <Img
                    src={pull.nftImage}
                    alt={pull.nftName ?? "Pulled card"}
                    className="max-h-[520px] w-auto max-w-full object-contain drop-shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
                  />
                ) : (
                  <div className="grid aspect-[5/7] w-full place-items-center">
                    <Img src="/card-back.svg" alt="" className="h-32 w-auto opacity-60" />
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-[#181507] p-4">
                <Label className="mb-3">Card Details</Label>
                <div className="flex flex-col gap-2">
                  <DetailRow label="Origin" value="Pack pull" />
                  {pull.rarity && <DetailRow label="Rarity" value={pull.rarity} />}
                  <DetailRow label="Grade" value={grade ?? "Belum tersedia"} />
                  <DetailRow label="Network" value={NETWORK_LABEL} />
                </div>
              </div>
            </div>

            {/* RIGHT — badges → title → provenance → stats + list action */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  style={JERSEY}
                  className="inline-flex items-center rounded-md bg-yellow-400 px-2.5 py-1 text-[15px] uppercase leading-none tracking-wide text-[#171717]"
                >
                  Pulled
                </span>
                {pull.rarity && (
                  <span
                    style={{ ...JERSEY, background: "#2EC500" }}
                    className="inline-flex items-center rounded-md px-2.5 py-1 text-[15px] uppercase leading-none tracking-wide text-white"
                  >
                    {pull.rarity}
                  </span>
                )}
                {/* Badge grade hanya muncul kalau grade-nya memang diketahui —
                    badge "belum tersedia" cuma jadi kebisingan di deretan ini. */}
                {grade && <Badge>{grade}</Badge>}
              </div>

              {/* Judul katalog CC yang LENGKAP kalau ada; `nftName` (metadata
                  on-chain) dipotong 32 karakter, jadi ia hanya cadangan. */}
              <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">
                {pull.ccItemName ?? pull.nftName ?? "Your card"}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2">
                  <span
                    className="h-6 w-6 shrink-0 rounded-full"
                    style={{ backgroundImage: GOLD_GRADIENT }}
                    aria-hidden
                  />
                  <span className="text-sm text-zinc-300">
                    Held in your <span className="font-semibold text-zinc-100">Vault</span>
                  </span>
                </span>
                {/* Kartu hasil pack fisiknya di vault CollectorCrypt → labeli CC,
                    konsisten dengan halaman marketplace (bukan hardcoded HOSHI). */}
                <VaultVerified source={listing?.source ?? "COLLECTORCRYPT"} />
              </div>

              {/* content panel (#181507): stats → list action — mirrors marketplace */}
              <div className="mt-6 rounded-2xl bg-[#181507] p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-white/10 pb-5 sm:grid-cols-3">
                  {stats.map((s) => (
                    <Stat key={s.label} label={s.label} value={s.value} valueColor={s.valueColor} href={s.href} />
                  ))}
                </div>

                <div className="mt-6">
                  {soldBack ? (
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-5 py-4 text-center">
                      <p className="text-sm font-semibold text-emerald-300">
                        Kartu ini sudah dijual balik ke CollectorCrypt.
                      </p>
                      <Link
                        href="/vault"
                        className="mt-1 inline-block text-[13px] text-emerald-200/80 underline underline-offset-2"
                      >
                        ← Kembali ke Vault
                      </Link>
                    </div>
                  ) : listing ? (
                    <Link
                      href={`/marketplace/${listing.id}`}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.08] px-6 py-4 text-[15px] font-semibold text-emerald-300 transition hover:bg-emerald-400/[0.14]"
                    >
                      Listed for Rp {idr.format(listing.price)} — view in marketplace ↗
                    </Link>
                  ) : listable ? (
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 transition hover:brightness-105 active:scale-[0.99]"
                      style={{
                        backgroundImage: GOLD_GRADIENT,
                        border: "1px solid #F2C101",
                        boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)",
                      }}
                    >
                      <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                        List for Sale
                      </span>
                    </button>
                  ) : (
                    <p className="text-center text-[13px] text-zinc-500">
                      This card can’t be listed yet.
                    </p>
                  )}

                  {/* Instant buyback — CollectorCrypt's own 72-hour offer. Shown
                      alongside listing because they are genuine alternatives:
                      sell now at their price, or set your own and wait. Hidden
                      once the card is listed (it is spoken for) or already sold. */}
                  {!soldBack && !listing && listable && (
                    <button
                      type="button"
                      onClick={() => setBuybackOpen(true)}
                      className="mt-3 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-6 py-3.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.08]"
                    >
                      Jual balik ke CollectorCrypt
                      <span className="ml-1.5 text-[12px] font-normal text-zinc-500">
                        · instant, jendela 72 jam
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {modalOpen && pull && (
        <ListForSaleModal
          pull={pull}
          onClose={() => setModalOpen(false)}
          onListed={(l) => {
            setListing(l);
            setModalOpen(false);
          }}
        />
      )}

      {buybackOpen && pull?.nftAddress && (
        <BuybackModal
          nftAddress={pull.nftAddress}
          nftName={pull.nftName}
          onClose={() => setBuybackOpen(false)}
          onSold={() => setSoldBack(true)}
        />
      )}
    </div>
  );
}

function GateCard({
  busy,
  onConnect,
  onSign,
}: {
  busy: boolean;
  onConnect: () => void;
  onSign: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
      <p className="text-sm text-zinc-400">Connect your wallet and sign in to view this card.</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConnect}
          className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
        >
          Connect wallet
        </button>
        <button
          type="button"
          onClick={onSign}
          disabled={busy}
          className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-50"
        >
          {busy ? "…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
      <p className="text-sm text-zinc-400">
        This card isn’t in your collection (or hasn’t settled yet).
      </p>
      <Link
        href="/vault"
        className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
      >
        ← Back to Vault
      </Link>
    </div>
  );
}
