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
  /** Real artwork URL — when present it replaces the placeholder. */
  image?: string;
  expectedValue: number;
  dropRates: DropRate[];
};

const TIER_COLOR: Record<Tier, string> = {
  Common: "#22c55e",
  Rare: "#3b82f6",
  Epic: "#a855f7",
  Legendary: "#f59e0b",
  "Legendary Rare": "#fb7185",
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
    expectedValue: 12500,
    dropRates: rates(70, 22, 6, 1.8, 0.2),
  },
  {
    id: "uc",
    name: "Hoshi Pack UC",
    tierLabel: "UC",
    group: "Normal Hoshi Pack",
    price: 15000,
    accent: "linear-gradient(160deg,#71717a,#27272a)",
    expectedValue: 19000,
    dropRates: rates(62, 26, 9, 2.7, 0.3),
  },
  {
    id: "r",
    name: "Hoshi Pack R",
    tierLabel: "R",
    group: "Special Hoshi Pack",
    price: 50000,
    accent: "linear-gradient(160deg,#b45309,#451a03)",
    expectedValue: 16250000,
    dropRates: rates(55, 27, 13, 4.6, 0.4),
  },
  {
    id: "sr",
    name: "Hoshi Pack SR",
    tierLabel: "SR",
    group: "Special Hoshi Pack",
    price: 75000,
    accent: "linear-gradient(160deg,#fbbf24,#b45309)",
    expectedValue: 24250000,
    dropRates: rates(50, 25, 15, 4.5, 0.5),
  },
];

export type LiveCard = {
  id: number;
  name: string;
  set: string;
  price: number;
  accent: string;
};

export const LIVE_CARDS: LiveCard[] = [
  { id: 1, name: "Charizard VMAX", set: "Classic", price: 24250000, accent: "linear-gradient(160deg,#f97316,#7c2d12)" },
  { id: 2, name: "Blastoise GX", set: "Classic", price: 12100000, accent: "linear-gradient(160deg,#38bdf8,#0c4a6e)" },
  { id: 3, name: "Venusaur EX", set: "Jungle", price: 9800000, accent: "linear-gradient(160deg,#4ade80,#14532d)" },
  { id: 4, name: "Mewtwo VSTAR", set: "Promo", price: 31500000, accent: "linear-gradient(160deg,#c084fc,#4c1d95)" },
  { id: 5, name: "Pikachu Illustrator", set: "Rare", price: 88000000, accent: "linear-gradient(160deg,#fde047,#a16207)" },
  { id: 6, name: "Rayquaza VMAX", set: "Evolving", price: 27400000, accent: "linear-gradient(160deg,#34d399,#065f46)" },
];
