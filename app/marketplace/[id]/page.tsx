"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import Link from "next/link";
import { secondaryPrice } from "@/lib/market";
import type { CardDetail, Offer } from "@/lib/cardDetail";
import {
  ApiError,
  buyListing,
  getListingDetail,
  getMyPurchases,
  registerListingView,
} from "@/lib/api";

import { useAuth } from "@/lib/useAuth";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import MarketCard from "@/components/packs/MarketCard";
import CardActions from "@/components/packs/CardActions";
import { GOLD_GRADIENT, GradientText, Img, formatIdr } from "@/components/packs/ui";

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;
const GREEN = "#3DDC84";
const CONTRACT_YELLOW = "#FEF003";

function shortAsset(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/* ------------------------------- primitives ------------------------------- */

/** Blue IDRX coin (Figma fill #0F56E6). */
function IdrxCoin({ size = 24 }: { size?: number }) {
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
function Label({ children, className = "" }: { children: ReactNode; className?: string }) {
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
function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={JERSEY}
      className="inline-flex items-center rounded-md bg-white/[0.21] px-2.5 py-1 text-[15px] uppercase leading-none tracking-wide text-white backdrop-blur-sm"
    >
      {children}
    </span>
  );
}

/** Small up-arrow triangle used by the green % change indicators. */
function UpArrow({ color = GREEN }: { color?: string }) {
  return (
    <svg viewBox="0 0 10 8" className="h-2 w-2.5" aria-hidden>
      <path d="M5 0l5 8H0z" fill={color} />
    </svg>
  );
}

/* --------------------------------- chart ---------------------------------- */

/** Green price sparkline: #3DDC84 line + vertical fade area (Figma linear). */
function PriceSparkline({ data, className = "h-24" }: { data: number[]; className?: string }) {
  const raw = useId();
  const gid = "spark" + raw.replace(/[^a-zA-Z0-9]/g, "");
  const points = data.length >= 2 ? data : [data[0] ?? 0, data[0] ?? 0];
  const W = 280;
  const H = 96;
  const PAD = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const line = points.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      role="img"
      aria-label="Price history, trending up"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.5" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={GREEN}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ------------------------------ left column ------------------------------- */

type Side = "FRONT" | "BACK";

function FrontBackToggle({
  side,
  onSide,
}: {
  side: Side;
  onSide: (s: Side) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-black/40 p-1">
      {(["FRONT", "BACK"] as const).map((s) => {
        const active = side === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSide(s)}
            aria-pressed={active}
            className={`rounded-full px-5 py-1.5 text-sm font-bold transition ${
              active ? "text-[#171717]" : "text-zinc-300 hover:text-white"
            }`}
            style={active ? { backgroundImage: GOLD_GRADIENT } : undefined}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}

/** Card-detail row — label in Outfit, value in Jersey 10 (per Figma). */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3.5 py-3">
      <span className="text-sm text-zinc-400">{label}</span>
      <span className="text-[15px] leading-none text-zinc-100" style={JERSEY}>
        {value}
      </span>
    </div>
  );
}

function LeftColumn({ detail }: { detail: CardDetail }) {
  const [side, setSide] = useState<Side>("FRONT");
  const { image, imageBack, name } = detail.listing;
  const src = side === "FRONT" ? image : (imageBack ?? image);
  return (
    <div className="flex flex-col gap-4">
      {/* framed card art (parent: white 9% + blur, per Figma) + front/back toggle */}
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-white/[0.09] p-5 backdrop-blur-sm">
        <Img
          src={src}
          alt={`${name} — ${side.toLowerCase()}`}
          className="max-h-[520px] w-auto max-w-full object-contain drop-shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
        />
        <FrontBackToggle side={side} onSide={setSide} />
      </div>

      {/* CARD DETAILS */}
      <div className="rounded-2xl bg-[#181507] p-4">
        <Label className="mb-3">Card Details</Label>
        <div className="flex flex-col gap-2">
          {detail.details.map((d) => (
            <DetailRow key={d.label} label={d.label} value={d.value} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ right column ------------------------------ */

/** Stat — label in Jersey 10, value below in Outfit (per Figma). */
function Stat({ label, value, valueColor, href }: { label: string; value: string; valueColor?: string; href?: string }) {
  const content = href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
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

function VaultVerified() {
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

const BADGE: Record<string, string> = {
  PENDING: "text-yellow-400 border-yellow-400/30",
  ACCEPTED: "text-green-400 border-green-400/30",
  REJECTED: "text-red-400 border-red-400/30",
};

function OfferRow({ offer }: { offer: Offer }) {
  const status = offer.status ?? "PENDING";
  return (
    <li className="flex items-center justify-between py-3">
      <div>
        <p className="text-[17px] leading-none text-zinc-100" style={JERSEY}>
          {offer.user}
        </p>
        <p className="mt-2 text-[13px] text-zinc-500">{offer.ago}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${BADGE[status] ?? BADGE.PENDING}`}>
          {status}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-black/25 px-3 py-2">
          <IdrxCoin size={20} />
          <span className="text-[17px] leading-none text-white" style={JERSEY}>
            {formatIdr(offer.amount)}
          </span>
        </span>
      </div>
    </li>
  );
}

function RightColumn({
  detail,
  offers,
  onOffer,
  onBuy,
  buying,
  unavailable,
  owned,
  buyMsg,
}: {
  detail: CardDetail;
  offers: Offer[];
  onOffer: (offer: Offer) => void;
  onBuy: () => void;
  buying: boolean;
  unavailable: boolean;
  owned: boolean;
  buyMsg: string | null;
}) {
  const { listing } = detail;
  const trendUp = detail.change30dPct >= 0;
  const trendColor = trendUp ? GREEN : "#F87171";
  const stats = [
    { label: "Card Grade", value: listing.grade },
    detail.certificate ? { label: "Certificate", value: detail.certificate } : null,
    { label: "Est. Market Value", value: `IDR ${formatIdr(detail.estMarketValueIdr)}` },
    detail.vaultLocation ? { label: "Vault Location", value: detail.vaultLocation } : null,
    {
      label: "Contract Address",
      value: detail.contractAddress ? shortAsset(detail.contractAddress) : "Pending mint",
      valueColor: detail.contractAddress ? CONTRACT_YELLOW : "#A1A1AA",
      ...(detail.contractAddress ? { href: `https://explorer.solana.com/address/${detail.contractAddress}?cluster=devnet` } : {}),
    },
  ].filter(Boolean) as { label: string; value: string; valueColor?: string; href?: string }[];
  return (
    <div className="flex flex-col">
      {/* badges + views */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.tags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
        <span className="ml-1 inline-flex items-center gap-1.5 text-zinc-300">
          <Img src="/visibility.png" alt="" className="h-[18px] w-[18px] opacity-80" />
          <span className="text-[17px] leading-none" style={JERSEY}>
            {formatIdr(listing.views)}
          </span>
        </span>
      </div>

      {/* title */}
      <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">{detail.title}</h1>

      {/* consigned + vault verified */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2">
          <span
            className="h-6 w-6 shrink-0 rounded-full"
            style={{ backgroundImage: GOLD_GRADIENT }}
            aria-hidden
          />
          <span className="text-sm text-zinc-300">
            Consigned by <span className="font-semibold text-zinc-100">{detail.consignedBy}</span>
          </span>
        </span>
        <VaultVerified />
      </div>

      {/* content panel (#181507): CARD GRADE → offers, consistent left/right padding */}
      <div className="mt-6 rounded-2xl bg-[#181507] p-5 sm:p-6">
      {/* stats */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-white/10 pb-5 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} valueColor={s.valueColor} href={s.href} />
        ))}
      </div>

      {/* buy now + chart */}
      <div className="mt-6">
        <Label>Buy Now</Label>
        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-center">
          <div className="lg:col-span-3">
            <div className="flex items-center gap-3">
              <IdrxCoin size={34} />
              <span className="text-4xl leading-none text-white" style={JERSEY}>
                {formatIdr(listing.price)}
              </span>
              <span className="inline-flex items-center gap-1 text-sm" style={{ ...JERSEY, color: trendColor }}>
                <span className={trendUp ? "" : "rotate-180"}>
                  <UpArrow color={trendColor} />
                </span>
                {trendUp ? "+" : ""}
                {detail.change30dPct}% 30D
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-500" style={JERSEY}>
              = {secondaryPrice(listing.price, "IDR")}
            </p>
          </div>
          <div className="lg:col-span-2">
            <PriceSparkline data={detail.priceHistory} className="h-16" />
          </div>
        </div>
      </div>

      {/* actions */}
      <button
        type="button"
        onClick={onBuy}
        disabled={buying || unavailable}
        className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101", boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)" }}
      >
        <Img src="/icon-buy.png" alt="" className="h-5 w-5" />
        <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
          {unavailable ? "Sold" : buying ? "Processing…" : "Buy Card"}
        </span>
      </button>
      {buyMsg && (
        <p
          className={`mt-2 text-center text-sm ${owned ? "text-[#3DDC84]" : "text-red-400"}`}
        >
          {buyMsg}
        </p>
      )}
      {owned && (
        <Link
          href="/vault"
          className="mt-3 block w-full rounded-2xl bg-white/[0.04] px-6 py-3.5 text-center text-[15px] font-semibold text-zinc-100 transition hover:bg-white/[0.08]"
        >
          View in Vault →
        </Link>
      )}

      <CardActions listing={listing} onOffer={onOffer} />

      {/* offers */}
      <div className="mt-7">
        <Label>Offers Received ({offers.length})</Label>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {offers.map((o, i) => (
            <OfferRow key={i} offer={o} />
          ))}
        </ul>
      </div>
      </div>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function CardDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");
  const { token, login } = useAuth();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletConnect();

  const [detail, setDetail] = useState<CardDetail | null>(null);
  // Loading is derived from "the id whose fetch last finished" — this avoids a
  // synchronous setState inside the effect and re-loads automatically when id changes.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [sold, setSold] = useState(false);
  const [owned, setOwned] = useState(false);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    // Fetch detail + (if logged in) purchases, to tell whether we already own this card.
    Promise.all([
      getListingDetail(id)
        .then((d) => {
          if (!alive) return;
          setDetail(d);
          setSold(false); // reset session purchase state for the new card
          setBuyMsg(null);
          setPendingOffers([]);
        })
        .catch(() => alive && setDetail(null)),
      token
        ? getMyPurchases(token)
            .then((ps) => alive && setOwned(ps.some((p) => p.id === id)))
            .catch(() => alive && setOwned(false))
        : Promise.resolve().then(() => {
            if (alive) setOwned(false);
          }),
    ]).finally(() => alive && setLoadedId(id));
    return () => {
      alive = false;
    };
  }, [id, token]);

  // Register view on every detail page mount. Backend handles dedup inside the
  // session window if needed; we remove client-side sessionStorage block so clicks
  // from marketplace always count.
  useEffect(() => {
    if (!id) return;
    registerListingView(id)
      .then((r) =>
        setDetail((d) =>
          d && d.listing.id === id ? { ...d, listing: { ...d.listing, views: r.views } } : d,
        ),
      )
      .catch((err) => console.warn("View registration failed", err));
  }, [id]);

  const loading = loadedId !== id;
  // Not buyable: just purchased this session, OR the backend status isn't ACTIVE.
  const unavailable =
    sold ||
    (!!detail?.listing.status && detail.listing.status !== "ACTIVE");

  const handleBuy = useCallback(async () => {
    if (!detail || unavailable) return;
    // No wallet yet → open the wallet-select modal, then the user clicks Buy again.
    if (!publicKey) {
      setVisible(true);
      setBuyMsg("Select and connect a wallet, then click Buy Card again.");
      return;
    }
    setBuyMsg(null);
    setBuying(true);
    const doBuy = (t: string) => buyListing(detail.listing.id, t);
    try {
      // Needs a JWT: use the stored token, or trigger wallet login (nonce→sign).
      let t = token ?? (await login());
      let bought: Awaited<ReturnType<typeof buyListing>> | null = null;
      try {
        bought = await doBuy(t);
      } catch (e) {
        // Stale token -> log in again once and retry.
        if (e instanceof ApiError && e.status === 401) {
          t = await login();
          bought = await doBuy(t);
        } else throw e;
      }
      if (bought) {
        setDetail((d) =>
          d && d.listing.id === bought.id ? { ...d, listing: bought } : d,
        );
      }
      setSold(true);
      setOwned(true);
      setBuyMsg(
        bought?.nft?.assetAddress
          ? `Purchased. NFT minted: ${shortAsset(bought.nft.assetAddress)}`
          : "Purchased. NFT mint recorded.",
      );
    } catch (e) {
      setBuyMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(false);
    }
  }, [detail, unavailable, token, login, publicKey, setVisible]);

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Marketplace" />

      {loading ? (
        <main className="mx-auto max-w-[1400px] px-4 py-20 text-center sm:px-6">
          <p className="text-lg text-zinc-400">Loading card…</p>
        </main>
      ) : !detail ? (
        <main className="mx-auto max-w-[1400px] px-4 py-20 text-center sm:px-6">
          <p className="text-lg text-zinc-300">Card not found.</p>
          <Link href="/marketplace" className="mt-3 inline-block text-sm text-yellow-400 hover:brightness-110">
            ← Back to marketplace
          </Link>
        </main>
      ) : (
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <LeftColumn detail={detail} />
            <RightColumn
              detail={detail}
              offers={[...pendingOffers, ...detail.offers]}
              onOffer={(offer: Offer) => setPendingOffers((prev) => [offer, ...prev])}
              onBuy={handleBuy}
              buying={buying}
              unavailable={unavailable}
              owned={owned}
              buyMsg={buyMsg}
            />
          </div>

          {/* More cards — full marketplace cards */}
          <section className="mt-16">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                More Cards from {detail.collectionLabel}
              </h2>
              <Link
                href="/marketplace"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.08]"
              >
                View All
                <Img src="/icon-right-marketplace.png" alt="" className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {detail.related.map((l) => (
                <MarketCard key={l.id} listing={l} currency="IDR" />
              ))}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
