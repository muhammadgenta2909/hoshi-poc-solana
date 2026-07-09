// Client-side pack opening (gacha draw) for the live demo. Deliberately mirrors
// the backend contract (hoshi-backend PacksService.open) — same weighted draw,
// RARITY_VALUE, BUYBACK_RATE, and result shape ({ rarity, card, buybackQuoteIdr })
// — so switching to the real API later is a fetch swap, not a rewrite.

import type { Pack, Tier } from "./packs";

/** Fair-market value per rarity in IDRX — mirrors backend RARITY_VALUE. */
export const RARITY_VALUE: Record<Tier, number> = {
  Common: 12_000,
  Rare: 45_000,
  Epic: 180_000,
  Legendary: 900_000,
  "Legendary Rare": 6_000_000,
};

/** Buyback ratio, matching CollectorCrypt's ~85% instant buyback. */
export const BUYBACK_RATE = 0.85;

/** Representative cards awarded per rarity (art reuses the /public card faces). */
const REVEAL_CARDS: Record<Tier, { name: string; image: string }[]> = {
  Common: [
    { name: "Bulbasaur", image: "/card1.png" },
    { name: "Squirtle", image: "/card2.png" },
  ],
  Rare: [
    { name: "Snorlax", image: "/card3.png" },
    { name: "Blastoise GX", image: "/card2.png" },
  ],
  Epic: [
    { name: "Venusaur EX", image: "/card1.png" },
    { name: "Gengar", image: "/card3.png" },
  ],
  Legendary: [
    { name: "Mewtwo VSTAR", image: "/card-main.png" },
    { name: "Rayquaza VMAX", image: "/card1.png" },
  ],
  "Legendary Rare": [
    { name: "Charizard VMAX", image: "/card-main.png" },
    { name: "Pikachu Illustrator", image: "/card2.png" },
  ],
};

/** Result of opening a pack — shape mirrors the backend open-pack response. */
export type OpenResult = {
  packId: string;
  rarity: Tier;
  card: { name: string; rarity: Tier; imageUrl: string; valueIdr: number };
  buybackQuoteIdr: number;
};

/** Weighted rarity draw from a pack's drop rates. */
export function drawTier(pack: Pack): Tier {
  const total = pack.dropRates.reduce((sum, d) => sum + d.pct, 0);
  let roll = Math.random() * total;
  for (const d of pack.dropRates) {
    roll -= d.pct;
    if (roll < 0) return d.tier;
  }
  return pack.dropRates[pack.dropRates.length - 1].tier;
}

/** Open a pack locally: draw a rarity, award a card, quote its buyback. */
export function openPackLocal(pack: Pack): OpenResult {
  const rarity = drawTier(pack);
  const pool = REVEAL_CARDS[rarity];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const valueIdr = RARITY_VALUE[rarity];
  return {
    packId: pack.id,
    rarity,
    card: { name: pick.name, rarity, imageUrl: pick.image, valueIdr },
    buybackQuoteIdr: Math.round(valueIdr * BUYBACK_RATE),
  };
}
