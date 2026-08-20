"use client";

import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useWalletConnect } from "@/lib/useWalletConnect";
import Link from "next/link";
import { isPokemonCard, secondaryPrice, type Listing, type RelistInput } from "@/lib/market";
import { explorerAddressUrl } from "@/lib/gacha";
import type { CardDetail, Offer } from "@/lib/cardDetail";
import {
  ApiError,
  buyListing,
  cancelListing,
  ccBuyPrepare,
  ccBuySubmit,
  CC_BUY_ENABLED,
  CC_RESELL_ENABLED,
  P2P_ENABLED,
  getListingDetail,
  getMyPurchases,
  PAYMENTS_ENABLED,
  registerListingView,
  relistListing,
  type CcBuyQuote,
} from "@/lib/api";

import { useAuth } from "@/lib/useAuth";
import { useSignSerializedTransaction } from "@/lib/useSignSerializedTransaction";
import TopNav from "@/components/packs/TopNav";
import MarketCard from "@/components/packs/MarketCard";
import { useCardActions, DarkPill } from "@/lib/useCardActions";
import { PayModal } from "@/components/packs/PayWithRupiah";
import { GOLD_GRADIENT, Img, formatIdr } from "@/components/packs/ui";
import {
  Badge,
  CONTRACT_YELLOW,
  DetailRow,
  GREEN,
  IdrxCoin,
  JERSEY,
  Label,
  shortAsset,
  Stat,
  VaultVerified,
} from "@/components/packs/cardDetailParts";

/** Number-input styling for the owner panel — mirrors the sell form's field. */
const OWNER_INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm tabular-nums text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/60";

/* ------------------------------- primitives ------------------------------- */

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

/* ------------------------------ primitives 2 ------------------------------ */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Panel bisa buka-tutup (accordion). Di Figma mobile: See Chart / Card Details / Offers Received.
 *  `defaultOpen` = kondisi awal; toggle tetap jalan di semua ukuran. */
function Accordion({
  title,
  right,
  defaultOpen = false,
  className = "bg-[#181507]",
  children,
}: {
  title: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`overflow-hidden rounded-2xl ${className}`}>
      {/* Header: bisa di-tap (accordion) HANYA di mobile. Di desktop (lg) jadi label statis +
          konten selalu terbuka — accordion memang khusus mobile (Figma); desktop tetap seperti
          layout lama (section inline, tak bisa dilipat). */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left lg:pointer-events-none"
      >
        <span className="text-[15px] uppercase tracking-wide text-white" style={JERSEY}>
          {title}
        </span>
        <span className="flex items-center gap-2">
          {right}
          <span className="lg:hidden">
            <Chevron open={open} />
          </span>
        </span>
      </button>
      {/* Konten: di mobile mengikuti state open; di desktop selalu tampil (lg:block). */}
      <div className={`px-5 pb-5 ${open ? "block" : "hidden"} lg:block`}>{children}</div>
    </div>
  );
}

/* ------------------------------ left column ------------------------------- */

type Side = "FRONT" | "BACK";

/** Toggle DEPAN/BELAKANG — KOLOM (vertikal), ditempel di pojok kanan-bawah kartu (sesuai Figma).
 *  Sisi aktif = pill emas; sisi non-aktif = teks polos. */
function FrontBackToggle({
  side,
  onSide,
}: {
  side: Side;
  onSide: (s: Side) => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1.5">
      {(["FRONT", "BACK"] as const).map((s) => {
        const active = side === s;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onSide(s)}
            aria-pressed={active}
            className={`rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
              active ? "text-[#171717] shadow-[0_6px_16px_rgba(0,0,0,0.35)]" : "text-zinc-200 hover:text-white"
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

function LeftColumn({ detail, isPokemon }: { detail: CardDetail; isPokemon: boolean }) {
  const [side, setSide] = useState<Side>("FRONT");
  const { image, imageBack, name } = detail.listing;
  // Kartu CC/pack biasanya TIDAK punya gambar belakang. Kalau begitu: tampilkan hanya
  // DEPAN dan SEMBUNYIKAN tombol BACK sama sekali — jangan pernah jatuh ke card-back
  // Hoshi. Card-back berbrand Hoshi terbaca sebagai "punggung kartu ini", padahal bukan;
  // untuk kartu graded asli itu menyesatkan.
  const src = imageBack && side === "BACK" ? imageBack : image;
  // Pokéball (kanan-atas) & toggle FRONT/BACK (kanan-bawah) butuh RUANG di kanan supaya tak menutupi
  // kartu (sesuai Figma). Sisakan jalur kanan HANYA kalau ada yang perlu ditaruh di sana.
  const hasRightRail = isPokemon || !!imageBack;
  return (
    <div className="lg:sticky lg:top-6">
      {/* framed card art (parent: white 9% + blur). Ikon Pokéball kanan-ATAS (kalau Pokémon) &
          toggle FRONT/BACK vertikal kanan-BAWAH — keduanya duduk di jalur kanan yang direservasi,
          jadi kartu tak tertutup tombol. */}
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-white/[0.09] backdrop-blur-sm ${
          hasRightRail ? "py-5 pl-5 pr-24" : "p-5"
        }`}
      >
        {isPokemon && (
          <Img
            src="/pokemon.png"
            alt="Kartu Pokémon"
            className="absolute right-3 top-3 z-10 h-9 w-9 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
          />
        )}
        <Img
          src={src}
          alt={`${name} — ${imageBack && side === "BACK" ? "back" : "front"}`}
          className="max-h-[500px] w-auto max-w-full object-contain drop-shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
        />
        {imageBack && (
          <div className="absolute bottom-4 right-3 z-10">
            <FrontBackToggle side={side} onSide={setSide} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------- left column · DESKTOP (layout lama) ---------------- */

/** Toggle DEPAN/BELAKANG versi DESKTOP (layout lama): pill HORIZONTAL di bawah kartu.
 *  Sengaja dipisah dari `FrontBackToggle` (versi mobile = rail vertikal di pojok kanan
 *  kartu) supaya desktop tampil PERSIS seperti carddetail sebelum redesign. */
function FrontBackToggleDesktop({
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

/** Kolom kiri versi DESKTOP (layout lama): kartu berbingkai + toggle horizontal, LALU panel
 *  "Card Details" di bawahnya. Di layout mobile "Card Details" pindah ke accordion kolom kanan;
 *  di desktop lama ia tetap tinggal di kolom kiri (sesuai carddetail original). */
function LeftColumnDesktop({ detail }: { detail: CardDetail }) {
  const [side, setSide] = useState<Side>("FRONT");
  const { image, imageBack, name } = detail.listing;
  // Sama seperti mobile: kartu tanpa gambar belakang hanya menampilkan DEPAN — jangan pernah
  // jatuh ke card-back berbrand Hoshi (menyesatkan untuk kartu graded asli).
  const src = imageBack && side === "BACK" ? imageBack : image;
  return (
    <div className="flex flex-col gap-4">
      {/* framed card art (parent: white 9% + blur, per Figma) + front/back toggle */}
      <div className="flex flex-col items-center gap-5 rounded-2xl bg-white/[0.09] p-5 backdrop-blur-sm">
        <Img
          src={src}
          alt={`${name} — ${imageBack && side === "BACK" ? "back" : "front"}`}
          className="max-h-[520px] w-auto max-w-full object-contain drop-shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
        />
        {imageBack && <FrontBackToggleDesktop side={side} onSide={setSide} />}
      </div>

      {/* CARD DETAILS */}
      <div className="rounded-2xl bg-[#181507] p-4">
        <Label className="mb-3">Card Details</Label>
        <div className="flex flex-col gap-2">
          {detail.details
            .filter((d) => d.value != null && String(d.value).trim() !== "")
            .map((d) => (
              <DetailRow key={d.label} label={d.label} value={d.value} />
            ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ right column ------------------------------ */

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

/** Owner-only controls shown in place of the Buy button when you own the card.
 *  Not listed (SOLD/CANCELLED): set an ask price + buyback and list it for sale.
 *  Listed (ACTIVE): show the live ask and let the owner withdraw it. */
function OwnerPanel({
  listing,
  listedByMe,
  busy,
  msg,
  onRelist,
  onCancel,
}: {
  listing: Listing;
  listedByMe: boolean;
  busy: boolean;
  msg: string | null;
  onRelist: (input: RelistInput) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState(listing.price);
  // Value edge vs. the card's Hoshi expected value — same math as the sell form.
  const edge = price > 0 ? (listing.expectedValue - price) / price : 0;

  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      {listedByMe ? (
        <>
          <Label>Your Listing</Label>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="text-sm text-zinc-400">Listed for</span>
            <IdrxCoin size={26} />
            <span className="text-2xl leading-none text-white" style={JERSEY}>
              {formatIdr(listing.price)}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="mt-4 w-full rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[15px] font-semibold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Cancel Listing"}
          </button>
        </>
      ) : (
        <>
          <h3 className="text-[20px] leading-none text-white" style={JERSEY}>
            You own this card
          </h3>
          <div className="mt-4 flex flex-col gap-4">
            <label className="block">
              <span style={JERSEY} className="mb-1.5 block text-[13px] uppercase tracking-wide text-zinc-500">
                Ask price (IDRX)
              </span>
              <input
                type="number"
                value={Number.isNaN(price) ? "" : price}
                min={1}
                step={100_000}
                onChange={(e) => setPrice(Number(e.target.value))}
                className={OWNER_INPUT}
              />
            </label>
            <p className="-mt-1 text-[12px] text-zinc-500">
              Value edge:{" "}
              <span className={edge >= 0 ? "text-emerald-400" : "text-red-400"}>
                {edge >= 0 ? "+" : ""}
                {(edge * 100).toFixed(1)}%
              </span>{" "}
              {edge >= 0 ? "(reads as a good deal)" : "(priced above expected value)"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRelist({ price: Math.round(price) })}
            disabled={busy || price <= 0}
            className="mt-4 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
            style={{ backgroundImage: GOLD_GRADIENT }}
          >
            {busy ? "Listing…" : "List for Sale"}
          </button>
        </>
      )}

      {msg && <p className="mt-3 text-center text-sm text-red-400">{msg}</p>}

      <Link
        href="/vault"
        className="mt-3 block w-full rounded-2xl bg-white/[0.04] px-6 py-3.5 text-center text-[15px] font-semibold text-zinc-100 transition hover:bg-white/[0.08]"
      >
        View in Vault →
      </Link>
    </div>
  );
}

/** Props kolom kanan — DIBAGI oleh layout mobile (`RightColumn`) dan desktop
 *  (`RightColumnDesktop`) supaya keduanya menerima data + handler beli yang PERSIS sama
 *  (satu sumber → tak ada risiko jalur beli desktop menyimpang dari mobile). */
type RightColumnProps = {
  detail: CardDetail;
  offers: Offer[];
  onOffer: (offer: Offer) => void;
  onBuy: () => void;
  buying: boolean;
  unavailable: boolean;
  owned: boolean;
  /** Pemilik kartu SEKARANG = penonton? (status-aware: SOLD → pembeli; selain itu → penjual/holder).
   *  Beda dari `owned` (yang juga true untuk penjual historis): kartu yang KAMU JUAL ke orang lain
   *  → ownedNow=false, jadi chip tidak salah bilang "kamu memiliki". */
  ownedNow: boolean;
  /** true HANYA untuk kartu KATALOG-SYNC CC (tanpa penjual asli) — yang harus
   *  diselesaikan lewat CollectorCrypt. Kartu CC hasil pack yang di-list user = false. */
  isCatalogCc: boolean;
  /** true = kartu INVENTARIS HOSHI (milik Hoshi sendiri, upload admin) — buyable via Rupiah
   *  tanpa flag P2P; Hoshi = penjual, seluruh harga masuk kas Hoshi. */
  isHoshiInventory: boolean;
  buyMsg: string | null;
  onRelist: (input: RelistInput) => void;
  onCancel: () => void;
  ownerBusy: boolean;
  ownerMsg: string | null;
  /* Beli kartu katalog CollectorCrypt (settle di CC, bayar USDC). */
  ccQuote: CcBuyQuote | null;
  ccBusy: boolean;
  ccMsg: string | null;
  ccSig: string | null;
  onCcQuote: () => void;
  onCcConfirm: () => void;
  onCcCancel: () => void;
  /** Beli kartu katalog CC lewat jalur RESELLER IDRX (bayar rupiah harga kita → treasury
   *  yang beli di CC + kirim ke pembeli). Alur lokal, tanpa user pegang USDC/SOL. */
  onBuyRupiah: () => void;
};

function RightColumn({
  detail,
  offers,
  onOffer,
  onBuy,
  buying,
  unavailable,
  owned,
  ownedNow,
  isCatalogCc,
  isHoshiInventory,
  buyMsg,
  onRelist,
  onCancel,
  ownerBusy,
  ownerMsg,
  ccQuote,
  ccBusy,
  ccMsg,
  ccSig,
  onCcQuote,
  onCcConfirm,
  onCcCancel,
  onBuyRupiah,
}: RightColumnProps) {
  const { listing } = detail;
  const listedByMe = owned && listing.status === "ACTIVE";
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
      ...(detail.contractAddress ? { href: explorerAddressUrl(detail.contractAddress) } : {}),
    },
  ].filter(Boolean) as { label: string; value: string; valueColor?: string; href?: string }[];
  // Aksi kartu (offer / message / cart) — SATU sumber modal, dipakai tombol "Message Seller"
  // (atas), bilah beli fixed (mobile), dan tombol inline (desktop).
  const actions = useCardActions(listing, onOffer);
  // Jalur beli STANDAR (bukan pemilik, bukan katalog CC) = Hoshi-inventory / P2P. Hanya jalur ini
  // yang memakai bilah beli fixed (mobile) + tombol inline (desktop).
  const standardBuyable = !owned && !isCatalogCc;
  const canRupiah = PAYMENTS_ENABLED && (P2P_ENABLED || isHoshiInventory);
  // Inventaris Hoshi tak punya penjual eksternal → tak bisa ditawar / dichat.
  const showMakeOffer = standardBuyable && !isHoshiInventory;
  return (
    <div className="flex flex-col">
      {/* badges — lewati tag kosong. `tags` = [grade, language, era]; CollectorCrypt kadang tak
          mengisi language/era (pill kosong aneh). Views + share pindah ke bilah atas halaman. */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.tags
          .filter((t) => t.trim() !== "")
          .map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
      </div>

      {/* title */}
      <h1 className="mt-4 text-2xl font-bold leading-tight text-white sm:text-4xl">{detail.title}</h1>

      {/* BUY NOW — harga + %change + = IDR (di atas grafik, sesuai Figma) */}
      <div className="mt-5">
        <Label>Buy Now</Label>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
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

      {/* See Chart — accordion (Figma): kartu hitam berisi grafik hijau */}
      <div className="mt-4">
        <Accordion title="See Chart" defaultOpen className="bg-[#0e0e0e]">
          <PriceSparkline data={detail.priceHistory} className="h-28" />
        </Accordion>
      </div>

      {/* SIAPA YANG MENJUAL — pindah ke BAWAH grafik (Figma). Badge "Vault Verified by …" menyatakan
          ASAL/vault kartu (provenance). KALAU PENONTON PEMILIKNYA SEKARANG: tampilkan status
          kepemilikan, bukan "Dijual oleh …" (rancu). */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {ownedNow ? (
          <span
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-400/[0.1] px-3 py-1.5"
            title={
              listing.status === "ACTIVE"
                ? "Kamu sedang menjual kartu ini di marketplace"
                : "Kartu ini milikmu"
            }
          >
            <span className="h-5 w-5 shrink-0 rounded-full bg-emerald-400/70" aria-hidden />
            <span className="text-sm font-semibold text-emerald-200">
              {listing.status === "ACTIVE"
                ? "Kamu menjual kartu ini"
                : "Kamu memiliki kartu ini"}
            </span>
          </span>
        ) : detail.consignedBy === "collectorcrypt" ? (
          <span
            className="inline-flex items-center gap-2 rounded-full border border-[#F2C101]/45 bg-[#F2C101]/[0.1] px-3 py-1.5"
            title="Dijual oleh Hoshi — kartu graded asli, tersimpan aman di vault CollectorCrypt. Bayar Rupiah."
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundImage: GOLD_GRADIENT }}
              aria-hidden
            />
            <span className="text-sm font-semibold text-[#F2C101]">Dijual oleh Hoshi</span>
            <span className="hidden text-[11px] text-zinc-400 sm:inline">
              bayar Rupiah · dijamin asli
            </span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5"
            title="Dijual oleh sesama pengguna (lapak)"
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundImage: GOLD_GRADIENT }}
              aria-hidden
            />
            <span className="text-sm text-zinc-300">
              Dijual oleh{" "}
              <span className="font-semibold text-[#F2C101] underline decoration-[#F2C101]/50 underline-offset-2">
                {detail.consignedBy}
              </span>
            </span>
          </span>
        )}
      </div>

      {/* Message Seller — tombol berdiri sendiri, SETELAH "Dijual oleh" & SEBELUM Vault Verified
          (Figma). Hanya untuk listing P2P (ada penjual user). */}
      {showMakeOffer && (
        <button
          type="button"
          onClick={actions.openMessage}
          style={JERSEY}
          className="mt-4 w-full rounded-2xl bg-white/[0.04] px-6 py-3 text-center text-[18px] leading-none text-zinc-100 transition hover:bg-white/[0.08]"
        >
          Message Seller
        </button>
      )}

      {/* Vault Verified */}
      <div className="mt-4">
        <VaultVerified source={listing.source} />
      </div>

      {/* stats grid (Card Grade dst) — DI BAWAH harga. Mobile (Figma): 3 kolom; desktop kembali
          ke baris lebar 5 kolom seperti layout lama. */}
      <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-5 border-t border-white/10 pt-5 lg:grid-cols-5">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} valueColor={s.valueColor} href={s.href} />
        ))}
      </div>

      {/* BUY CTA — owner (list/withdraw) & katalog CC tetap inline di SEMUA ukuran. Jalur standar:
          inline HANYA di desktop (mobile pakai bilah beli fixed di bawah). */}
      {owned ? (
        <div className="mt-6">
          {buyMsg && <p className="text-center text-sm text-[#3DDC84]">{buyMsg}</p>}
          <OwnerPanel
            listing={listing}
            listedByMe={listedByMe}
            busy={ownerBusy}
            msg={ownerMsg}
            onRelist={onRelist}
            onCancel={onCancel}
          />
        </div>
      ) : isCatalogCc ? (
        // Kartu KATALOG CollectorCrypt (belum pernah dimiliki user Hoshi). Pembelian
        // DISELESAIKAN DI CC: wallet user membayar USDC langsung ke penjual CC dan
        // aset CC asli yang berpindah — Hoshi tidak pernah mint NFT untuk kartu ini.
        <div className="mt-5 rounded-2xl border border-[#38E5D0]/25 bg-[#38E5D0]/[0.06] px-5 py-4">
          {/* UTAMA: beli via Rupiah (IDRX reseller) — pembeli bayar HARGA KITA, treasury yang
              beli di CC + kirim. User Indonesia tak perlu pegang USDC/SOL. Tampil hanya kalau
              rail pembayaran menyala DAN jalur reseller di-enable (prod menyembunyikannya sampai
              settlement real di-arm); kalau mati, jatuh ke jalur CC langsung (USDC) di bawah. */}
          {PAYMENTS_ENABLED && CC_RESELL_ENABLED && (
            <>
              <button
                type="button"
                onClick={onBuyRupiah}
                disabled={unavailable}
                className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f6bff] text-[11px] font-bold text-white">
                  Rp
                </span>
                <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                  {unavailable ? "Sold" : "Beli via Rupiah"}
                </span>
              </button>
              <p className="mb-4 mt-2 text-center text-[12px] text-zinc-500">
                Bayar rupiah (QRIS / e-wallet / VA) di harga tertera. Kartu dikirim ke wallet-mu —
                tak perlu punya USDC atau SOL.
              </p>
            </>
          )}

          <p className="text-center text-sm text-[#38E5D0]" style={JERSEY}>
            Kartu ini disimpan di vault CollectorCrypt.
          </p>

          {ccSig ? (
            <div className="mt-3 text-center">
              <p className="text-sm text-[#3DDC84]">Pembelian terkirim ke jaringan.</p>
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">
                {ccSig}
              </p>
              <p className="mt-1 text-[12px] text-zinc-500">
                Kartu akan muncul di wallet Anda setelah transaksi final.
              </p>
            </div>
          ) : !CC_BUY_ENABLED ? (
            // Jangan kontradiktif: kalau CTA "Beli via Rupiah" di atas aktif (PAYMENTS_ENABLED),
            // JANGAN bilang pembelian belum diaktifkan — jalur belinya justru ada. Catatan ini
            // hanya relevan saat rail Rupiah pun mati.
            PAYMENTS_ENABLED ? null : (
              <p className="mt-1 text-center text-[13px] text-zinc-400">
                Pembelian langsung lewat Hoshi belum diaktifkan untuk kartu vault
                CollectorCrypt.
              </p>
            )
          ) : ccQuote ? (
            <div className="mt-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                <p className="text-[12px] text-zinc-400">Anda akan membayar</p>
                <p className="text-2xl font-bold text-white" style={JERSEY}>
                  {ccQuote.priceUsdc} USDC
                </p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  Dibayar dari wallet Anda langsung ke penjual CollectorCrypt.
                  Butuh USDC + sedikit SOL untuk biaya jaringan.
                </p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onCcConfirm}
                  disabled={ccBusy}
                  className="flex-1 rounded-xl px-4 py-3 text-[15px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-60"
                  style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
                >
                  {ccBusy ? "Memproses…" : "Konfirmasi & tanda tangan"}
                </button>
                <button
                  type="button"
                  onClick={onCcCancel}
                  disabled={ccBusy}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onCcQuote}
                disabled={ccBusy || unavailable}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
              >
                <span className="text-xl leading-none text-[#171717]" style={JERSEY}>
                  {unavailable ? "Sold" : ccBusy ? "Mengambil harga…" : "Beli lewat CollectorCrypt"}
                </span>
              </button>
              <p className="mt-2 text-center text-[12px] text-zinc-500">
                Harga final memakai harga USDC live CollectorCrypt, bukan harga
                tampilan di atas.
              </p>
            </>
          )}

          {ccMsg && (
            <p className="mt-3 text-center text-sm text-red-400">{ccMsg}</p>
          )}
        </div>
      ) : (
        // Jalur STANDAR (Hoshi-inventory / P2P): tombol beli inline HANYA di desktop. Di mobile
        // dipindah ke bilah beli fixed di bawah layar (lihat akhir kolom).
        <div className="mt-6 hidden lg:block">
          {canRupiah ? (
            <>
              <button
                type="button"
                onClick={onBuyRupiah}
                disabled={unavailable}
                className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101", boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)" }}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f6bff] text-[11px] font-bold text-white">
                  Rp
                </span>
                <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                  {unavailable ? "Sold" : "Beli via Rupiah"}
                </span>
              </button>
              <p className="mb-1 mt-2 text-center text-[12px] text-zinc-500">
                {isHoshiInventory
                  ? "Kartu stok Hoshi. Bayar rupiah (QRIS / e-wallet / VA) — langsung jadi milikmu."
                  : "Bayar rupiah (QRIS / e-wallet / VA). Kartu dikirim ke wallet-mu; penjual dibayar ke saldo — tak perlu USDC/SOL."}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={onBuy}
              disabled={buying || unavailable}
              className="flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101", boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)" }}
            >
              <Img src="/icon-buy.png" alt="" className="h-5 w-5" />
              <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                {unavailable ? "Sold" : buying ? "Processing…" : "Buy Card"}
              </span>
            </button>
          )}
          {buyMsg && <p className="mt-2 text-center text-sm text-red-400">{buyMsg}</p>}

          {/* Make Offer + Add to Cart hanya untuk listing P2P (ada penjual). Message Seller sudah
              dipindah ke atas (dekat "Dijual oleh"). */}
          {showMakeOffer && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <DarkPill onClick={actions.openOffer}>Make Offer</DarkPill>
              <DarkPill onClick={actions.toggleCart} active={actions.inCart}>
                {actions.inCart ? "✓ In Cart" : "Add to Cart"}
              </DarkPill>
            </div>
          )}
        </div>
      )}

      {/* Card Details — accordion (Figma) */}
      <div className="mt-4">
        <Accordion title="Card Details" defaultOpen>
          <div className="flex flex-col gap-2">
            {detail.details
              .filter((d) => d.value != null && String(d.value).trim() !== "")
              .map((d) => (
                <DetailRow key={d.label} label={d.label} value={d.value} />
              ))}
          </div>
        </Accordion>
      </div>

      {/* Offers Received — accordion (Figma) */}
      <div className="mt-4">
        <Accordion title={`Offers Received (${offers.length})`} defaultOpen>
          {offers.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada tawaran.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {offers.map((o, i) => (
                <OfferRow key={i} offer={o} />
              ))}
            </ul>
          )}
        </Accordion>
      </div>

      {/* Bilah beli FIXED (mobile) — HANYA jalur standar. Baris atas: harga + keranjang; baris
          bawah: Make Offer + (Beli via Rupiah / Buy Card). Desktop: disembunyikan (pakai inline). */}
      {standardBuyable && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#141414]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <IdrxCoin size={22} />
              <span className="shrink-0 text-xl leading-none text-white" style={JERSEY}>
                {formatIdr(listing.price)}
              </span>
              <span className="truncate text-[12px] text-zinc-500" style={JERSEY}>
                = {secondaryPrice(listing.price, "IDR")}
              </span>
            </div>
            {/* Add-to-cart hanya untuk listing P2P (punya penjual) — sejalan dengan perilaku desktop. */}
            {showMakeOffer && (
              <button
                type="button"
                onClick={actions.toggleCart}
                aria-label="Keranjang"
                aria-pressed={actions.inCart}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                  actions.inCart
                    ? "bg-yellow-400/15 text-yellow-300 ring-1 ring-yellow-400/40"
                    : "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.12]"
                }`}
              >
                <Img src="/icon-cart.png" alt="" className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className={`mx-auto mt-2.5 grid max-w-[1400px] gap-2.5 ${showMakeOffer ? "grid-cols-2" : "grid-cols-1"}`}>
            {showMakeOffer && (
              <button
                type="button"
                onClick={actions.openOffer}
                style={JERSEY}
                className="rounded-2xl bg-white/[0.06] px-4 py-3.5 text-lg leading-none text-zinc-100 transition hover:bg-white/[0.1]"
              >
                Make Offer
              </button>
            )}
            <button
              type="button"
              onClick={canRupiah ? onBuyRupiah : onBuy}
              disabled={unavailable || (!canRupiah && buying)}
              className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
            >
              {canRupiah ? (
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f6bff] text-[11px] font-bold text-white">
                  Rp
                </span>
              ) : (
                <Img src="/icon-buy.png" alt="" className="h-5 w-5" />
              )}
              <span className="text-lg leading-none text-[#171717]" style={JERSEY}>
                {unavailable ? "Sold" : canRupiah ? "Beli via Rupiah" : buying ? "Processing…" : "Buy Card"}
              </span>
            </button>
          </div>
          {buyMsg && (
            <p className="mx-auto mt-1.5 max-w-[1400px] text-center text-[12px] text-red-400">{buyMsg}</p>
          )}
        </div>
      )}

      {actions.modals}
    </div>
  );
}

/* ------------------------ right column · DESKTOP (layout lama) ------------- */

/** Kolom kanan versi DESKTOP: susunan VISUAL carddetail LAMA (baris "Consigned by …" +
 *  VaultVerified, lalu satu panel gelap berisi stats → Buy Now + sparkline kecil → aksi beli
 *  → Offers Received inline), TAPI dengan SELURUH logika beli SEKARANG (Rupiah / CC-reseller /
 *  Hoshi-inventory) supaya user bisa membeli di desktop persis seperti di mobile hari ini.
 *  Menerima `RightColumnProps` yang sama dengan `RightColumn` (mobile). */
function RightColumnDesktop({
  detail,
  offers,
  onOffer,
  onBuy,
  buying,
  unavailable,
  owned,
  isCatalogCc,
  isHoshiInventory,
  buyMsg,
  onRelist,
  onCancel,
  ownerBusy,
  ownerMsg,
  ccQuote,
  ccBusy,
  ccMsg,
  ccSig,
  onCcQuote,
  onCcConfirm,
  onCcCancel,
  onBuyRupiah,
}: RightColumnProps) {
  const { listing } = detail;
  const listedByMe = owned && listing.status === "ACTIVE";
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
      ...(detail.contractAddress ? { href: explorerAddressUrl(detail.contractAddress) } : {}),
    },
  ].filter(Boolean) as { label: string; value: string; valueColor?: string; href?: string }[];
  // Logika beli SAMA PERSIS dengan RightColumn (mobile) — jangan menyimpang: jalur uang harus identik.
  const actions = useCardActions(listing, onOffer);
  const standardBuyable = !owned && !isCatalogCc;
  const canRupiah = PAYMENTS_ENABLED && (P2P_ENABLED || isHoshiInventory);
  const showMakeOffer = standardBuyable && !isHoshiInventory;
  return (
    <div className="flex flex-col">
      {/* badges — lewati tag kosong. Views TIDAK di sini (sudah pindah ke bilah atas halaman,
          dipakai bersama kedua layout). */}
      <div className="flex flex-wrap items-center gap-2">
        {detail.tags
          .filter((t) => t.trim() !== "")
          .map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
      </div>

      {/* title */}
      <h1 className="mt-4 text-3xl font-bold leading-tight text-white sm:text-4xl">{detail.title}</h1>

      {/* consigned + vault verified (baris layout lama) */}
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
        <VaultVerified source={listing.source} />
      </div>

      {/* content panel (#181507): stats → Buy Now + chart → aksi → offers */}
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

        {/* ACTIONS — logika beli SEKARANG di dalam susunan lama. owner → OwnerPanel;
            katalog CC → Rupiah (jika CC_RESELL) + fallback CC-langsung USDC; standar →
            Rupiah / Buy Card + Make Offer / Message Seller / Add to Cart. */}
        {owned ? (
          <>
            {buyMsg && <p className="mt-5 text-center text-sm text-[#3DDC84]">{buyMsg}</p>}
            <OwnerPanel
              listing={listing}
              listedByMe={listedByMe}
              busy={ownerBusy}
              msg={ownerMsg}
              onRelist={onRelist}
              onCancel={onCancel}
            />
          </>
        ) : isCatalogCc ? (
          // Kartu KATALOG CollectorCrypt — SAMA PERSIS dengan cabang isCatalogCc di RightColumn (mobile).
          <div className="mt-5 rounded-2xl border border-[#38E5D0]/25 bg-[#38E5D0]/[0.06] px-5 py-4">
            {PAYMENTS_ENABLED && CC_RESELL_ENABLED && (
              <>
                <button
                  type="button"
                  onClick={onBuyRupiah}
                  disabled={unavailable}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f6bff] text-[11px] font-bold text-white">
                    Rp
                  </span>
                  <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                    {unavailable ? "Sold" : "Beli via Rupiah"}
                  </span>
                </button>
                <p className="mb-4 mt-2 text-center text-[12px] text-zinc-500">
                  Bayar rupiah (QRIS / e-wallet / VA) di harga tertera. Kartu dikirim ke wallet-mu —
                  tak perlu punya USDC atau SOL.
                </p>
              </>
            )}

            <p className="text-center text-sm text-[#38E5D0]" style={JERSEY}>
              Kartu ini disimpan di vault CollectorCrypt.
            </p>

            {ccSig ? (
              <div className="mt-3 text-center">
                <p className="text-sm text-[#3DDC84]">Pembelian terkirim ke jaringan.</p>
                <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">
                  {ccSig}
                </p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  Kartu akan muncul di wallet Anda setelah transaksi final.
                </p>
              </div>
            ) : !CC_BUY_ENABLED ? (
              PAYMENTS_ENABLED ? null : (
                <p className="mt-1 text-center text-[13px] text-zinc-400">
                  Pembelian langsung lewat Hoshi belum diaktifkan untuk kartu vault
                  CollectorCrypt.
                </p>
              )
            ) : ccQuote ? (
              <div className="mt-3">
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <p className="text-[12px] text-zinc-400">Anda akan membayar</p>
                  <p className="text-2xl font-bold text-white" style={JERSEY}>
                    {ccQuote.priceUsdc} USDC
                  </p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    Dibayar dari wallet Anda langsung ke penjual CollectorCrypt.
                    Butuh USDC + sedikit SOL untuk biaya jaringan.
                  </p>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={onCcConfirm}
                    disabled={ccBusy}
                    className="flex-1 rounded-xl px-4 py-3 text-[15px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-60"
                    style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
                  >
                    {ccBusy ? "Memproses…" : "Konfirmasi & tanda tangan"}
                  </button>
                  <button
                    type="button"
                    onClick={onCcCancel}
                    disabled={ccBusy}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCcQuote}
                  disabled={ccBusy || unavailable}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101" }}
                >
                  <span className="text-xl leading-none text-[#171717]" style={JERSEY}>
                    {unavailable ? "Sold" : ccBusy ? "Mengambil harga…" : "Beli lewat CollectorCrypt"}
                  </span>
                </button>
                <p className="mt-2 text-center text-[12px] text-zinc-500">
                  Harga final memakai harga USDC live CollectorCrypt, bukan harga
                  tampilan di atas.
                </p>
              </>
            )}

            {ccMsg && (
              <p className="mt-3 text-center text-sm text-red-400">{ccMsg}</p>
            )}
          </div>
        ) : (
          // Jalur STANDAR (Hoshi-inventory / P2P) — tombol beli inline (desktop selalu inline).
          <>
            {canRupiah ? (
              <>
                <button
                  type="button"
                  onClick={onBuyRupiah}
                  disabled={unavailable}
                  className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ backgroundImage: GOLD_GRADIENT, border: "1px solid #F2C101", boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)" }}
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2f6bff] text-[11px] font-bold text-white">
                    Rp
                  </span>
                  <span className="text-2xl leading-none text-[#171717]" style={JERSEY}>
                    {unavailable ? "Sold" : "Beli via Rupiah"}
                  </span>
                </button>
                <p className="mb-1 mt-2 text-center text-[12px] text-zinc-500">
                  {isHoshiInventory
                    ? "Kartu stok Hoshi. Bayar rupiah (QRIS / e-wallet / VA) — langsung jadi milikmu."
                    : "Bayar rupiah (QRIS / e-wallet / VA). Kartu dikirim ke wallet-mu; penjual dibayar ke saldo — tak perlu USDC/SOL."}
                </p>
              </>
            ) : (
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
            )}
            {buyMsg && <p className="mt-2 text-center text-sm text-red-400">{buyMsg}</p>}

            {/* Make Offer / Message Seller / Add to Cart — susunan CardActions LAMA (Make Offer
                penuh, lalu Message Seller + Add to Cart 2-kolom), memakai useCardActions SEKARANG.
                Hanya untuk listing P2P (ada penjual) — Hoshi-inventory tak bisa ditawar/dichat. */}
            {showMakeOffer && (
              <>
                <div className="mt-3">
                  <DarkPill onClick={actions.openOffer}>Make Offer</DarkPill>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <DarkPill onClick={actions.openMessage}>Message Seller</DarkPill>
                  <DarkPill onClick={actions.toggleCart} active={actions.inCart}>
                    {actions.inCart ? "✓ In Cart" : "Add to Cart"}
                  </DarkPill>
                </div>
              </>
            )}
          </>
        )}

        {/* offers — inline (Label + list), BUKAN accordion */}
        <div className="mt-7">
          <Label>Offers Received ({offers.length})</Label>
          {offers.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Belum ada tawaran.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/[0.06]">
              {offers.map((o, i) => (
                <OfferRow key={i} offer={o} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {actions.modals}
    </div>
  );
}

/** Bungkus responsif kolom kanan: satu set props → DUA layout. Desktop (lg+) memakai layout LAMA
 *  (`RightColumnDesktop`), mobile (<lg) memakai layout SEKARANG (`RightColumn`). Gating breakpoint
 *  ADA DI SINI (`hidden lg:block` vs `lg:hidden`) sehingga TEPAT satu layout tampil per ukuran. */
function RightColumnResponsive(props: RightColumnProps) {
  return (
    <div>
      <div className="hidden lg:block">
        <RightColumnDesktop {...props} />
      </div>
      <div className="lg:hidden">
        <RightColumn {...props} />
      </div>
    </div>
  );
}

/* --------------------------------- page ----------------------------------- */

export default function CardDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");
  const { token, login, activeAddress } = useAuth();
  const { setVisible } = useWalletConnect();

  const [detail, setDetail] = useState<CardDetail | null>(null);
  // Loading is derived from "the id whose fetch last finished" — this avoids a
  // synchronous setState inside the effect and re-loads automatically when id changes.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  // Modal bayar Rupiah (IDRX) untuk beli kartu katalog CC lewat jalur reseller.
  const [payOpen, setPayOpen] = useState(false);
  const [sold, setSold] = useState(false);
  const [owned, setOwned] = useState(false);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  // Owner-mode (relist / cancel) has its own busy + message, kept apart from buy.
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null);
  // Beli kartu katalog CollectorCrypt (diselesaikan di CC, bayar USDC).
  const signTx = useSignSerializedTransaction();
  const [ccQuote, setCcQuote] = useState<CcBuyQuote | null>(null);
  const [ccBusy, setCcBusy] = useState(false);
  const [ccMsg, setCcMsg] = useState<string | null>(null);
  const [ccSig, setCcSig] = useState<string | null>(null);
  const [pendingOffers, setPendingOffers] = useState<Offer[]>([]);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    // Kartu tampil BEGITU detailnya siap — TIDAK menunggu getMyPurchases. Dulu keduanya di-Promise.all
    // lalu loadedId di-set di .finally, jadi "Loading card…" bertahan sampai KEDUA request kelar →
    // klik "Lihat Kartu" terasa lambat. Sekarang loadedId di-set segera setelah detail → render satset;
    // `owned` (apakah sudah punya) menyusul paralel & cuma memutakhirkan badge, tak memblok render.
    getListingDetail(id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setSold(false); // reset session purchase state for the new card
        setBuyMsg(null);
        setPendingOffers([]);
      })
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setLoadedId(id));
    if (token) {
      getMyPurchases(token)
        .then((ps) => alive && setOwned(ps.some((p) => p.id === id)))
        .catch(() => alive && setOwned(false));
    } else {
      setOwned(false);
    }
    return () => {
      alive = false;
    };
  }, [id, token]);

  // Hitung view SEKALI per kartu per sesi browser: refresh / buka-lagi kartu yang sama TIDAK menambah
  // count. sessionStorage (bukan localStorage) → view unik per sesi, reset saat tab ditutup. Ditandai
  // SEBELUM request supaya double-invoke effect (StrictMode dev) & refresh cepat tak dobel-hitung.
  useEffect(() => {
    if (!id) return;
    let alreadyViewed = false;
    try {
      const key = "hoshi_viewed_listings";
      const seen = new Set(JSON.parse(sessionStorage.getItem(key) ?? "[]") as string[]);
      alreadyViewed = seen.has(id);
      if (!alreadyViewed) {
        seen.add(id);
        sessionStorage.setItem(key, JSON.stringify([...seen]));
      }
    } catch {
      /* storage diblokir (mode privasi) → biarkan menghitung (fail-open; count cuma kosmetik) */
    }
    if (alreadyViewed) return;
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

  // Consignor asli listing ini = saya? Artinya kartu yang SAYA pajang untuk dijual
  // (mis. hasil pack yang di-list ulang). `owned` sebelumnya hanya dari riwayat
  // BELI, jadi kartu yang kita jual sendiri tidak terdeteksi milik kita → panel
  // owner (relist/cancel) tidak muncul dan halaman terasa "stuck".
  // `consignedBy` dari backend adalah wallet BENTUK PENDEK (shortWallet: 5 depan +
  // ".." + 4 belakang), sedangkan activeAddress penuh — jadi bandingkan di bentuk
  // yang sama, kalau tidak owner-panel tidak pernah muncul.
  const consignedByMe =
    !!detail &&
    !!activeAddress &&
    detail.consignedBy ===
      (activeAddress.length <= 11
        ? activeAddress
        : `${activeAddress.slice(0, 5)}..${activeAddress.slice(-4)}`);

  // HANYA kartu KATALOG-SYNC CC (penjual sentinel 'collectorcrypt', tanpa pemilik
  // asli) yang butuh diselesaikan lewat CC. Kartu CC hasil pack yang di-list ULANG
  // oleh user punya consignor = wallet asli → itu listing biasa, boleh dibeli/
  // ditawar/di-cancel seperti kartu Hoshi lain.
  const isCatalogCc =
    !!detail &&
    detail.listing.source === "COLLECTORCRYPT" &&
    detail.consignedBy === "collectorcrypt";

  // INVENTARIS HOSHI: kartu milik Hoshi sendiri (di-upload admin) — TANPA penjual user, BUKAN
  // katalog CC, DAN ditandai `sellable` (baris seed/placeholder = false → tak ditawarkan beli).
  // Buyable via Rupiah tanpa perlu flag P2P (bukan jual-beli antar user).
  const isHoshiInventory =
    !!detail && detail.sellable && !detail.sellerConsigned && !isCatalogCc;

  const handleBuy = useCallback(async () => {
    if (!detail || unavailable) return;
    // Belum ada wallet/identitas → buka modal wallet. Cek activeAddress, BUKAN
    // publicKey: user login Google (Privy) tidak punya publicKey wallet-adapter,
    // jadi cek publicKey salah memblokir mereka padahal sudah punya address.
    if (!activeAddress) {
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
  }, [detail, unavailable, token, login, activeAddress, setVisible]);

  /* --- Beli kartu KATALOG CollectorCrypt -------------------------------------
     Dua langkah supaya user melihat nominal USDC yang SEBENARNYA sebelum wallet
     meminta tanda tangan: prepare (kutip live + backend verifikasi nominal di
     dalam transaksi) → user konfirmasi → sign → submit.
     Hoshi tidak mint apa pun di sini; aset CC asli yang berpindah. */
  const handleCcQuote = useCallback(async () => {
    if (!detail) return;
    setCcMsg(null);
    setCcBusy(true);
    try {
      let t = token ?? (await login());
      try {
        setCcQuote(await ccBuyPrepare(detail.listing.id, t));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          t = await login();
          setCcQuote(await ccBuyPrepare(detail.listing.id, t));
        } else throw e;
      }
    } catch (e) {
      setCcMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCcBusy(false);
    }
  }, [detail, token, login]);

  const handleCcConfirm = useCallback(async () => {
    if (!detail || !ccQuote) return;
    setCcMsg(null);
    setCcBusy(true);
    try {
      const signed = await signTx(ccQuote.serializedTransaction);
      const t = token ?? (await login());
      // TIDAK idempoten di sisi CC — sekali terkirim, jangan pernah diulang buta.
      const res = await ccBuySubmit(detail.listing.id, signed, t);
      setCcQuote(null);
      setSold(true);
      setCcSig(res.signature);
      setCcMsg(null);
    } catch (e) {
      setCcMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCcBusy(false);
    }
  }, [detail, ccQuote, signTx, token, login]);

  // Re-list a card we own (SOLD/CANCELLED -> ACTIVE). Mirrors handleBuy's 401 retry.
  const handleRelist = useCallback(
    async (input: RelistInput) => {
      if (!detail) return;
      setOwnerMsg(null);
      setOwnerBusy(true);
      const doRelist = (t: string) => relistListing(detail.listing.id, input, t);
      try {
        // Needs a JWT: use the stored token, or trigger wallet login (nonce→sign).
        let t = token ?? (await login());
        let relisted: Awaited<ReturnType<typeof relistListing>> | null = null;
        try {
          relisted = await doRelist(t);
        } catch (e) {
          // Stale token -> log in again once and retry.
          if (e instanceof ApiError && e.status === 401) {
            t = await login();
            relisted = await doRelist(t);
          } else throw e;
        }
        if (relisted) {
          setDetail((d) =>
            d && d.listing.id === relisted.id ? { ...d, listing: relisted } : d,
          );
        }
      } catch (e) {
        setOwnerMsg(e instanceof Error ? e.message : String(e));
      } finally {
        setOwnerBusy(false);
      }
    },
    [detail, token, login],
  );

  // Withdraw a card we own that is currently listed (ACTIVE -> CANCELLED).
  const handleCancel = useCallback(async () => {
    if (!detail) return;
    setOwnerMsg(null);
    setOwnerBusy(true);
    const doCancel = (t: string) => cancelListing(detail.listing.id, t);
    try {
      let t = token ?? (await login());
      let cancelled: Awaited<ReturnType<typeof cancelListing>> | null = null;
      try {
        cancelled = await doCancel(t);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          t = await login();
          cancelled = await doCancel(t);
        } else throw e;
      }
      if (cancelled) {
        setDetail((d) =>
          d && d.listing.id === cancelled.id ? { ...d, listing: cancelled } : d,
        );
      }
    } catch (e) {
      setOwnerMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setOwnerBusy(false);
    }
  }, [detail, token, login]);

  return (
    <div
      className="page-bg relative min-h-screen text-zinc-100"
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Marketplace" />

      {loading ? (
        <main className="mx-auto flex max-w-[1400px] flex-col items-center gap-3 px-4 py-24 text-center sm:px-6">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-yellow-400" />
          <p className="text-sm text-zinc-400">Membuka kartu…</p>
        </main>
      ) : !detail ? (
        <main className="mx-auto max-w-[1400px] px-4 py-20 text-center sm:px-6">
          <p className="text-lg text-zinc-300">Card not found.</p>
          <Link href="/marketplace" className="mt-3 inline-block text-sm text-yellow-400 hover:brightness-110">
            ← Back to marketplace
          </Link>
        </main>
      ) : (
        <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-8">
          {/* Bilah atas: Back + breadcrumb (kiri) · views + share (kanan) — sesuai Figma. */}
          <div className="mb-5">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-100 transition hover:text-white"
            >
              {/* Teks "Back" tetap putih; HANYA ikon panah yang pakai gradient emas (Figma). */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <defs>
                  <linearGradient id="backArrowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FBB222" />
                    <stop offset="100%" stopColor="#FFF600" />
                  </linearGradient>
                </defs>
                <path d="M15 19l-7-7 7-7" stroke="url(#backArrowGrad)" />
              </svg>
              Back
            </Link>
            <div className="mt-3 flex items-center justify-between gap-3">
              <nav className="min-w-0 truncate text-[16px] leading-none text-zinc-500" style={JERSEY}>
                <Link href="/marketplace" className="transition hover:text-zinc-300">
                  Marketplace
                </Link>
                <span className="mx-1.5 text-zinc-600">/</span>
                <span className="text-zinc-300">Details Card</span>
              </nav>
              <div className="flex shrink-0 items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-zinc-300">
                  <Img src="/visibility.png" alt="" className="h-[18px] w-[18px] opacity-80" />
                  <span className="text-[15px] leading-none" style={JERSEY}>
                    {formatIdr(detail.listing.views)}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Bagikan kartu"
                  onClick={() => {
                    const url = window.location.href;
                    if (typeof navigator !== "undefined" && navigator.share) {
                      navigator.share({ title: detail.title, url }).catch(() => {});
                    } else {
                      navigator.clipboard?.writeText(url).catch(() => {});
                    }
                  }}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-zinc-200 transition hover:bg-white/[0.12]"
                >
                  <Img src="/icon-share.png" alt="" className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            {/* KOLOM KIRI — desktop (lg+) pakai layout LAMA (kartu + toggle horizontal + panel
                Card Details); mobile (<lg) pakai layout SEKARANG (rail toggle vertikal, tanpa
                panel details karena details ada di accordion kolom kanan). */}
            <div>
              <div className="hidden lg:block">
                <LeftColumnDesktop detail={detail} />
              </div>
              <div className="lg:hidden">
                <LeftColumn
                  detail={detail}
                  isPokemon={isPokemonCard(
                    detail.listing.tcg,
                    `${detail.title} ${detail.listing.name} ${detail.listing.set} ${detail.collectionLabel}`,
                  )}
                />
              </div>
            </div>

            {/* KOLOM KANAN — dua layout (desktop lama / mobile sekarang), SATU set props. */}
            <RightColumnResponsive
              detail={detail}
              offers={[...pendingOffers, ...detail.offers]}
              onOffer={(offer: Offer) => setPendingOffers((prev) => [offer, ...prev])}
              onBuy={handleBuy}
              buying={buying}
              unavailable={unavailable}
              owned={owned || consignedByMe}
              // Pemilik SEKARANG (status-aware): SOLD → pembeli (`owned`=buyerId===me); selain itu →
              // penjual/holder (`consignedByMe`). Kartu yang KAMU JUAL ke orang lain (SOLD, bukan
              // pembelinya) → false, jadi chip tak salah bilang "kamu memiliki".
              ownedNow={detail.listing.status === "SOLD" ? owned : consignedByMe}
              isCatalogCc={isCatalogCc}
              isHoshiInventory={isHoshiInventory}
              buyMsg={buyMsg}
              onRelist={handleRelist}
              onCancel={handleCancel}
              ownerBusy={ownerBusy}
              ownerMsg={ownerMsg}
              ccQuote={ccQuote}
              ccBusy={ccBusy}
              ccMsg={ccMsg}
              ccSig={ccSig}
              onCcQuote={handleCcQuote}
              onCcConfirm={handleCcConfirm}
              onCcCancel={() => { setCcQuote(null); setCcMsg(null); }}
              onBuyRupiah={() => setPayOpen(true)}
            />
          </div>

          {/* More cards — full marketplace cards */}
          <section className="mt-16">
            <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <h2 className="text-lg font-bold leading-tight text-white sm:text-2xl lg:text-3xl">
                More Cards from {detail.collectionLabel}
              </h2>
              <Link
                href="/marketplace"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-zinc-100 transition hover:bg-white/[0.08] sm:text-sm"
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

      {/* Bayar Rupiah (IDRX) untuk beli kartu katalog CC — reuse modal alur gacha, tapi mode
          listing (createListingOrder). Setelah bayar+redirect, resume + status muncul di
          /open-packs (returnUrl IDRX); untuk order listing tampil "kartu dikirim, cek Vault". */}
      {payOpen && PAYMENTS_ENABLED && (CC_RESELL_ENABLED || P2P_ENABLED || isHoshiInventory) && (
        <PayModal
          listingId={id}
          packType="MARKETPLACE"
          onClose={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}
