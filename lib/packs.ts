// Dummy data for the Open Packs UI. Swap `image` in for real pack art later —
// the components fall back to a styled placeholder whenever `image` is absent.

export type Tier = "Common" | "Rare" | "Epic" | "Legendary" | "Legendary Rare";

export type DropRate = { tier: Tier; pct: number; color: string };

export type Pack = {
  id: string;
  name: string;
  /** Short tier badge shown on the pack art, e.g. N / UC / R / SR. */
  tierLabel: string;
  group: "Normal Hoshi Pack" | "Special Hoshi Pack";
  price: number;
  /** CSS gradient used by the dummy art (ignored once `image` is set). */
  accent: string;
  /** Pack-wrapper thumbnail shown in the Select Pack grid. */
  image?: string;
  /** Large hero artwork for the center showcase (falls back to `image`). */
  heroImage?: string;
  /**
   * Expected value in IDRX = Σ (dropRate% × rarity value). These mirror the
   * server-authoritative catalog (hoshi-backend expectedValueIdr); production
   * should fetch GET /api/packs instead of hardcoding. NOTE: with the current
   * placeholder odds × rarity values, EV sits above price for every pack —
   * economics still needs calibration by the product/economics team.
   */
  expectedValue: number;
  dropRates: DropRate[];
};

/** Shared rarity palette — the one source of truth for tier colors app-wide. */
export const TIER_COLOR: Record<Tier, string> = {
  Common: "#22c55e",
  Rare: "#3b82f6",
  Epic: "#a855f7",
  Legendary: "#f59e0b",
  "Legendary Rare": "#fb7185",
};

/** Rarity ordering, low → high. Used to sort listings by rarity. */
export const TIER_ORDER: Tier[] = ["Common", "Rare", "Epic", "Legendary", "Legendary Rare"];

/** Drop-rate glyphs shipped in /public, keyed by tier (shared with the marketplace). */
export const TIER_ICON: Record<Tier, string> = {
  Common: "/icon-common.png",
  Rare: "/icon-rare.png",
  Epic: "/icon-epic.png",
  Legendary: "/icon-legendary.png",
  "Legendary Rare": "/icon-legendary-rare.png",
};

const rates = (
  common: number,
  rare: number,
  epic: number,
  legendary: number,
  legendaryRare: number,
): DropRate[] => [
  { tier: "Common", pct: common, color: TIER_COLOR.Common },
  { tier: "Rare", pct: rare, color: TIER_COLOR.Rare },
  { tier: "Epic", pct: epic, color: TIER_COLOR.Epic },
  { tier: "Legendary", pct: legendary, color: TIER_COLOR.Legendary },
  { tier: "Legendary Rare", pct: legendaryRare, color: TIER_COLOR["Legendary Rare"] },
];

export const PACKS: Pack[] = [
  {
    id: "n",
    name: "Hoshi Pack N",
    tierLabel: "N",
    group: "Normal Hoshi Pack",
    price: 10000,
    accent: "linear-gradient(160deg,#52525b,#18181b)",
    image: "/card-disable1.png",
    expectedValue: 57300,
    dropRates: rates(70, 22, 6, 1.8, 0.2),
  },
  {
    id: "uc",
    name: "Hoshi Pack UC",
    tierLabel: "UC",
    group: "Normal Hoshi Pack",
    price: 15000,
    accent: "linear-gradient(160deg,#71717a,#27272a)",
    image: "/card-disable2.png",
    expectedValue: 77640,
    dropRates: rates(62, 26, 9, 2.7, 0.3),
  },
  {
    id: "r",
    name: "Hoshi Pack R",
    tierLabel: "R",
    group: "Special Hoshi Pack",
    price: 50000,
    accent: "linear-gradient(160deg,#b45309,#451a03)",
    image: "/card-enable1.png",
    expectedValue: 107550,
    dropRates: rates(55, 27, 13, 4.6, 0.4),
  },
  {
    id: "sr",
    name: "Hoshi Pack SR",
    tierLabel: "SR",
    group: "Special Hoshi Pack",
    price: 75000,
    accent: "linear-gradient(160deg,#fbbf24,#b45309)",
    image: "/card-enable2.png",
    heroImage: "/card-main.png",
    expectedValue: 114750,
    dropRates: rates(50, 25, 15, 4.5, 0.5),
  },
];

export type LiveCard = {
  id: number;
  name: string;
  set: string;
  price: number;
  accent: string;
  /** Real card image URL (winner feed). When set, the ticker shows it instead of the local placeholder art. */
  imageUrl?: string;
  /** e.g. "won by 4Th3…VtyT" — replaces set + price for authentic winner data (no synthetic IDRX value). */
  subtitle?: string;
};

export const LIVE_CARDS: LiveCard[] = [
  { id: 1, name: "Charizard VMAX", set: "Classic", price: 24250000, accent: "linear-gradient(160deg,#f97316,#7c2d12)" },
  { id: 2, name: "Blastoise GX", set: "Classic", price: 12100000, accent: "linear-gradient(160deg,#38bdf8,#0c4a6e)" },
  { id: 3, name: "Venusaur EX", set: "Jungle", price: 9800000, accent: "linear-gradient(160deg,#4ade80,#14532d)" },
  { id: 4, name: "Mewtwo VSTAR", set: "Promo", price: 31500000, accent: "linear-gradient(160deg,#c084fc,#4c1d95)" },
  { id: 5, name: "Pikachu Illustrator", set: "Rare", price: 88000000, accent: "linear-gradient(160deg,#fde047,#a16207)" },
  { id: 6, name: "Rayquaza VMAX", set: "Evolving", price: 27400000, accent: "linear-gradient(160deg,#34d399,#065f46)" },
];
