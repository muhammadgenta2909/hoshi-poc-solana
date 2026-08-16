// Dummy data + helpers for the secondary Marketplace. Reuses the shared rarity
// system (Tier / TIER_COLOR) from packs.ts so rarity styling never diverges.

import type { Tier } from "./packs";
import { TIER_COLOR } from "./packs";

/**
 * Lima set contoh dari fase data dummy. HANYA dipakai sebagai pilihan di form
 * jual manual (/sell) untuk listing Hoshi buatan sendiri.
 *
 * JANGAN pakai ini sebagai daftar "semua series yang ada". Set kartu sungguhan
 * datang dari katalog CollectorCrypt (`card.set`, fallback `card.category`) dan
 * berupa string bebas seperti "Mega Dream ex - M2a - Japanese" — di produksi
 * hanya ~14% baris yang kebetulan cocok dengan lima nilai di bawah. Filter apa
 * pun yang memakai daftar ini akan membuang mayoritas kartu asli.
 */
export type MarketSet = "Classic" | "Jungle" | "Promo" | "Rare" | "Evolving";
export const MARKET_SETS: MarketSet[] = ["Classic", "Jungle", "Promo", "Rare", "Evolving"];

/* ---------- Figma filter taxonomy ---------- */

/** Grading company shown on the slab badge and in the Grade & Grader filter. */
export type Grader = "PSA" | "CGC" | "BGS";
export const GRADERS: Grader[] = ["PSA", "CGC", "BGS"];

/** Segmented grade floor (Figma: All / 8+ / 9+ / 9.5+ / 10). */
export const GRADE_TIERS = ["All", "8+", "9+", "9.5+", "10"] as const;
export type GradeTier = (typeof GRADE_TIERS)[number];
/** Minimum numeric grade a tier accepts (All ⇒ no floor). */
export const GRADE_FLOOR: Record<GradeTier, number> = {
  All: 0,
  "8+": 8,
  "9+": 9,
  "9.5+": 9.5,
  "10": 10,
};

/** Card language (Figma badge: ENGLISH / JAPAN). */
export type Language = "English" | "Japan";

/** Era / Generation filter (Figma order). */
export type Era =
  | "Scarlet & Violet"
  | "Sword & Shield"
  | "Sun & Moon"
  | "XY"
  | "Black & White"
  | "Classic"
  | "Vintage";
export const ERAS: Era[] = [
  "Scarlet & Violet",
  "Sword & Shield",
  "Sun & Moon",
  "XY",
  "Black & White",
  "Classic",
  "Vintage",
];

/** Element filter (Figma order; extended with the common Pokémon types). */
export type Element = "Fire" | "Water" | "Rock" | "Psychic" | "Grass" | "Lightning";
export const ELEMENTS: Element[] = ["Fire", "Water", "Rock", "Psychic", "Grass", "Lightning"];

/** Illustration category — both the on-card badge and the collapsed-state tabs. */
export type CardCategory =
  | "Special Illustration"
  | "Secret Rare"
  | "Rainbow"
  | "Character Illustration"
  | "Full Art"
  | "PROMO CARD";
/** Tab row shown when the filter panel is collapsed (leads with "All"). */
export const CATEGORY_TABS: (CardCategory | "All")[] = [
  "All",
  "Special Illustration",
  "Secret Rare",
  "Rainbow",
  "Character Illustration",
  "Full Art",
  "PROMO CARD",
];

/** Display currency for the secondary "= …" price line. */
export type Currency = "IDR" | "USD";
export const CURRENCIES: Currency[] = ["IDR", "USD"];

/** Card art choices for the sell form's image picker (real /public assets). */
export const CARD_ART = ["/card1.png", "/card2.png", "/card3.png", "/card4.png", "/card-main.png"];

/** Selectable languages for the sell form. */
export const LANGUAGES: Language[] = ["English", "Japan"];

/** Illustration categories (the CATEGORY_TABS without the leading "All"). */
export const CARD_CATEGORIES: CardCategory[] = [
  "Special Illustration",
  "Secret Rare",
  "Rainbow",
  "Character Illustration",
  "Full Art",
  "PROMO CARD",
];

/**
 * Deteksi kartu Pokémon — DUA LAPIS:
 *  1) UTAMA (100% akurat): field `tcg` dari backend (asal data CollectorCrypt `card.category`,
 *     mis. "Pokemon" / "One Piece"). Kalau ADA, ia yang berkuasa — nilai eksplisit CC
 *     mengalahkan tebakan teks.
 *  2) CADANGAN: baris lokal/legacy tanpa `tcg` → heuristik kata kunci `pok[eé]mon` pada teks
 *     kartu (judul/nama/set/koleksi). Menangani "Pokémon" beraksen.
 */
export function isPokemonCard(tcg: string | null | undefined, text: string): boolean {
  const t = (tcg ?? "").trim();
  if (t) return /pok[eé]mon/i.test(t); // field CC eksplisit = otoritatif
  return /pok[eé]mon/i.test(text); // cadangan: heuristik nama
}

/**
 * Payload for listing a card (POST /marketplace). Mirrors the backend
 * CreateListingDto 1:1; the seller identity is set server-side from the JWT.
 */
export type NewListingInput = {
  name: string;
  set?: MarketSet;
  rarity?: Tier;
  image: string;
  /** IDRX ask price (integer). */
  price: number;
  /** Hoshi expected value in IDRX (integer). */
  expectedValue: number;
  /** Optional guaranteed buyback in IDRX; 0 ⇒ not Hoshi-backed. */
  buyback?: number;
  /**
   * Grade slab. WAJIB untuk listing Hoshi biasa (penjual mendeklarasikannya
   * sendiri) dan DIABAIKAN sepenuhnya kalau `fromPackMemo` diisi: grade kartu
   * hasil pull dibaca server dari katalog CollectorCrypt. Karena itu opsional di
   * tipe ini — mengharuskannya berarti memaksa form mengarang nilai untuk kartu
   * yang grade-nya belum diketahui, yang persis masalah yang mau dihindari.
   */
  grade?: string;
  grader?: Grader;
  gradeScore?: number;
  language?: Language;
  era?: Era;
  element?: Element;
  category?: CardCategory;
  /** Optional link to a Card catalog entry. */
  cardId?: string;
  imageBack?: string;
  certificate?: string;
  vaultLocation?: string;
  cardNumber?: string;
  variant?: string;
  contractAddress?: string;
  priceHistory?: number[];
  /** When listing a card won from a pack: the CcPackPurchase memo. The backend
   *  verifies ownership and links the listing to the real pulled NFT. */
  fromPackMemo?: string;
};

/** Payload for re-listing a card you already own (POST /marketplace/:id/relist). */
export type RelistInput = {
  /** New IDRX ask price (integer). */
  price: number;
  expectedValue?: number;
  buyback?: number;
};

/**
 * Payload for editing a live listing (PATCH /marketplace/:id). Every field is
 * optional, but at least one must be present. Unlike RelistInput this does not
 * re-open a closed listing — it only re-prices an ACTIVE one.
 */
export type UpdateListingInput = {
  price?: number;
  expectedValue?: number;
  buyback?: number;
};

export type ListingNft = {
  id: string;
  assetAddress: string;
  mintTx?: string | null;
};

/**
 * Whose physical vault holds the card (backend `Listing.source`).
 * HOSHI = our own vault; COLLECTORCRYPT = synced from CollectorCrypt's catalog
 * (metadata theirs, our admin only edits the price on top). Drives the vault
 * badge on cards — NOT derived from `buyback > 0` anymore.
 */
export type VaultSource = "HOSHI" | "COLLECTORCRYPT";

/** Display label for each vault source (card mark + detail chip). */
export const VAULT_LABEL: Record<VaultSource, string> = {
  HOSHI: "HOSHI",
  COLLECTORCRYPT: "COLLECTOR CRYPT",
};

/** Vault sources offered as a marketplace filter facet. */
export const VAULT_SOURCES: VaultSource[] = ["HOSHI", "COLLECTORCRYPT"];

/** Human label for the vault filter rows (fuller than the terse card mark). */
export const VAULT_FILTER_LABEL: Record<VaultSource, string> = {
  HOSHI: "Hoshi vault",
  COLLECTORCRYPT: "CollectorCrypt vault",
};

/** A single secondary-market listing (a graded, pulled card). */
export type Listing = {
  id: string;
  /** All market listings are graded cards; kept for back-compat with older code. */
  kind: "card" | "pack";
  name: string;
  /**
   * Set/series kartu APA ADANYA dari backend. String bebas, BUKAN `MarketSet`:
   * kartu CollectorCrypt membawa nama set katalog CC ("Fossil - 1st Edition -
   * English"), hanya listing seed/manual yang memakai lima nilai `MARKET_SETS`.
   */
  set: string;
  /** Drives the rarity badge color via TIER_COLOR[rarity]. */
  rarity: Tier;
  image: string;
  /** Back-of-card art (shared Hoshi card back for POC). From the backend DTO. */
  imageBack?: string;
  /** IDRX ask price, id-ID formatted by <Idrx>. */
  price: number;
  /** Hoshi expected value in IDRX; expectedValue > price ⇒ a "good deal". */
  expectedValue: number;
  /** Guaranteed buyback amount in IDRX; > 0 ⇒ Hoshi-backed (shows the HOSHI badge). */
  buyback: number;
  /** Short wallet, matching the TopNav wallet style. */
  seller: string;
  /** ISO date, used by the "Recently Listed" sort. */
  listedAt: string;
  /**
   * ISO date kartu ini berpindah tangan; null selama belum terjual. Tab Assets
   * di /account mengurutkan dengan ini — `listedAt` milik penjual (untuk kartu
   * hasil sync CC itu waktu sync), jadi bukan "kapan saya dapat kartunya".
   * Absen pada data mock/legacy.
   */
  soldAt?: string | null;
  /* --- graded-card display fields (Figma) --- */
  /** Full slab grade string, e.g. "PSA 10". */
  grade: string;
  grader: Grader;
  /** Numeric grade for the All/8+/9+/9.5+/10 filter. */
  gradeScore: number;
  language: Language;
  era: Era;
  element: Element;
  category: CardCategory;
  /** Game / TCG franchise APA ADANYA dari CollectorCrypt ("Pokemon", "One Piece", "Magic", …).
   *  Sinyal ANDAL untuk deteksi jenis kartu (mis. ikon Pokéball). Absen/`null` pada baris
   *  lokal/legacy ⇒ pakai heuristik nama via `isPokemonCard`. */
  tcg?: string | null;
  /** View count shown next to the visibility icon. */
  views: number;
  /** Listing status from the backend (ACTIVE while live). Absent on mock data. */
  status?: ListingStatus;
  /** Vault provenance; absent on mock/legacy data ⇒ treat as "HOSHI". */
  source?: VaultSource;
  /**
   * true ⇒ CollectorCrypt has an ACTIVE buyback offer for this card. The price
   * and execution are 100% CC's — we only surface the signal, never an amount.
   */
  ccHasBuyback?: boolean;
  /** Alamat NFT on-chain kartu — di-set saat kartu hasil pack DI-LIST (@unique).
   *  Dipakai mencocokkan kartu vault ↔ listing-nya sebelum terjual (relasi `nft`
   *  baru terisi saat mint pembelian). */
  ccNftAddress?: string | null;
  /** NFT minted to the buyer after marketplace purchase. Null while still ACTIVE. */
  nft?: ListingNft | null;
};

/** Listing status (mirrors the backend ListingStatus enum). */
export type ListingStatus =
  | "PENDING_ESCROW"
  | "ACTIVE"
  | "SOLD"
  | "CANCELLED";

export type SortKey = "newest" | "price-asc" | "price-desc" | "rarity" | "value";

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Recently Listed",
  "price-asc": "Price: Low to High",
  "price-desc": "Price: High to Low",
  rarity: "Rarity",
  value: "Best Value",
};

/** Value edge vs. ask price — positive means EV above the price (a good deal). */
export const valueDeltaPct = (l: Listing) => (l.expectedValue - l.price) / l.price;

/** Rarity color for a listing's badge. */
export const rarityColor = (t: Tier) => TIER_COLOR[t];

/* ---------- fiat conversion for the secondary price line ---------- */

// 1 IDRX = 1 IDR (stablecoin, dipatok 1:1). Baris "= IDR" tampil SAMA dengan harga IDRX supaya
// tak membingungkan audiens yang bayar Rupiah (dulu ada spread 0,99773 kosmetik — dibuang). USD
// via kurs flat POC devnet.
const IDRX_TO_IDR = 1;
const IDR_TO_USD = 1 / 16_000;

export const toIdr = (idrx: number) => Math.round(idrx * IDRX_TO_IDR);
export const toUsd = (idrx: number) => Math.round(toIdr(idrx) * IDR_TO_USD);

/** Formatted secondary price for the selected display currency ("= IDR …"/"= USD …"). */
export function secondaryPrice(idrx: number, currency: Currency): string {
  if (currency === "USD") {
    return `USD ${new Intl.NumberFormat("en-US").format(toUsd(idrx))}`;
  }
  return `IDR ${new Intl.NumberFormat("id-ID").format(toIdr(idrx))}`;
}
