// Dummy data + helpers for the secondary Marketplace. Reuses the shared rarity
// system (Tier / TIER_COLOR) from packs.ts so rarity styling never diverges.

import type { Tier } from "./packs";
import { TIER_COLOR } from "./packs";

/** Card sets available on the market (mirrors the LiveCard set values). */
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
 * Payload for listing a card (POST /marketplace). Mirrors the backend
 * CreateListingDto 1:1; the seller identity is set server-side from the JWT.
 */
export type NewListingInput = {
  name: string;
  set: MarketSet;
  rarity: Tier;
  image: string;
  /** IDRX ask price (integer). */
  price: number;
  /** Hoshi expected value in IDRX (integer). */
  expectedValue: number;
  /** Optional guaranteed buyback in IDRX; 0 ⇒ not Hoshi-backed. */
  buyback?: number;
  grade: string;
  grader: Grader;
  gradeScore: number;
  language: Language;
  era: Era;
  element: Element;
  category: CardCategory;
  /** Optional link to a Card catalog entry. */
  cardId?: string;
  imageBack?: string;
  certificate?: string;
  vaultLocation?: string;
  cardNumber?: string;
  variant?: string;
  contractAddress?: string;
  priceHistory?: number[];
};

export type ListingNft = {
  id: string;
  assetAddress: string;
  mintTx?: string | null;
};

/** A single secondary-market listing (a graded, pulled card). */
export type Listing = {
  id: string;
  /** All market listings are graded cards; kept for back-compat with older code. */
  kind: "card" | "pack";
  name: string;
  set: MarketSet;
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
  /** View count shown next to the visibility icon. */
  views: number;
  /** Listing status from the backend (ACTIVE while live). Absent on mock data. */
  status?: ListingStatus;
  /** NFT minted to the buyer after marketplace purchase. Null while still ACTIVE. */
  nft?: ListingNft | null;
};

/** Listing status (mirrors the backend ListingStatus enum). */
export type ListingStatus = "ACTIVE" | "SOLD" | "CANCELLED";

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

// 1 IDRX ≈ 1 IDR (a stablecoin), with a small spread so the "= IDR" line reads
// realistically slightly under the IDRX ask. USD via a flat POC devnet rate.
const IDRX_TO_IDR = 0.99773;
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
