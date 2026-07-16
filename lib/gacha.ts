// Data layer for the Collector Crypt gacha machines (real devnet backend).
// GET /gacha/machines is public; POST /gacha/purchase is an admin-only treasury
// pull whose recipient wallet is derived server-side from the JWT. These types
// mirror the backend contract 1:1; `machineToPack`/`pullToOpenResult` adapt them
// into the existing Open Packs shapes (lib/packs Pack, lib/openPack OpenResult)
// so the existing panels + reveal render real data with no component rewrites.

import type { DropRate, LiveCard, Pack, Tier } from "./packs";
import { TIER_COLOR } from "./packs";
import type { OpenResult } from "./openPack";

/** Collector Crypt's four rarity tiers (capitalised, as returned by the API). */
export type GachaRarity = "Common" | "Uncommon" | "Rare" | "Epic";

/** Per-rarity counts — odds are fractions (0..1); stock are integer counts. */
export type GachaRarityCounts = {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
};

/** Normalized machine (CcMachineNormalized). Extra backend fields are ignored. */
export type GachaMachine = {
  code: string;
  name: string;
  shortName: string;
  thumbnailUrl: string;
  /** Instant buyback as a percent, e.g. 85. */
  instantBuyback: number;
  turboMode: boolean;
  pointsMultiplier: number;
  targetEv: number;
  /** Whole USD, e.g. 250. */
  priceUsdcDollars: number;
  /** 6-decimal base units, e.g. 250000000. */
  priceUsdcBaseUnits: number;
  odds: GachaRarityCounts;
  stock: GachaRarityCounts;
  /** Expected value in USD. */
  ev: number;
};

/** Result of a pack pull (CcPackDto). Success => status 'OPENED' with an nft. */
export type GachaPull = {
  memo: string;
  packType: string;
  /** 'OPENED' on success. */
  status: string;
  turbo: boolean;
  /** Recipient wallet (the logged-in admin). */
  playerAddress: string;
  /** Price paid, in 6-decimal base units. */
  priceUsdc: number | null;
  rarity: GachaRarity | null;
  nftAddress: string | null;
  nftName: string | null;
  roll: string | null;
  points: number | null;
  buybackAmountUsdc: number | null;
  error: string | null;
  createdAt: string;
  openedAt: string | null;
};

/** Rarity palette for the CC tiers. Common/Rare/Epic reuse the shared Hoshi
 *  palette; Uncommon gets a distinct teal (there is no Hoshi 'Uncommon' tier). */
export const CC_RARITY_COLOR: Record<GachaRarity, string> = {
  Common: TIER_COLOR.Common,
  Uncommon: "#14b8a6",
  Rare: TIER_COLOR.Rare,
  Epic: TIER_COLOR.Epic,
};

/** A machine is available to pull only if it has stock in some rarity. */
export const isMachineAvailable = (m: GachaMachine): boolean =>
  m.stock.common + m.stock.uncommon + m.stock.rare + m.stock.epic > 0;

/** CC odds are fractions (0..1); PackDetailsPanel prints them as `${pct}%`. */
const toPct = (odd: number): number => Math.round(odd * 1000) / 10;

/**
 * PackDetailsPanel renders each DropRate's `tier` verbatim and looks its icon up
 * in TIER_ICON. Common/Rare/Epic are already valid Hoshi Tier strings, so their
 * label, icon and color all resolve correctly. "Uncommon" has no Hoshi tier, so
 * its icon simply falls back to none while the real label + percentage still
 * render truthfully. Pack.dropRates (lib/packs) is out of scope to widen, so the
 * single assertion is localized here and call sites stay cast-free.
 */
const ccDropRate = (rarity: GachaRarity, pct: number): DropRate => ({
  tier: rarity as Tier,
  pct,
  color: CC_RARITY_COLOR[rarity],
});

type PackArt = { group: Pack["group"]; accent: string; image: string; heroImage: string };

/** Reuse existing Hoshi pack art (never CC's own thumbnail), picked by price tier. */
const artForPrice = (usd: number): PackArt => {
  if (usd >= 250)
    return {
      group: "Special Hoshi Pack",
      accent: "linear-gradient(160deg,#fbbf24,#b45309)",
      image: "/card-enable2.png",
      heroImage: "/card-main.png",
    };
  if (usd >= 100)
    return {
      group: "Special Hoshi Pack",
      accent: "linear-gradient(160deg,#a855f7,#4c1d95)",
      image: "/card-enable1.png",
      heroImage: "/card-main.png",
    };
  if (usd >= 50)
    return {
      group: "Normal Hoshi Pack",
      accent: "linear-gradient(160deg,#3b82f6,#0c4a6e)",
      image: "/card-enable1.png",
      heroImage: "/card-main.png",
    };
  return {
    group: "Normal Hoshi Pack",
    accent: "linear-gradient(160deg,#52525b,#18181b)",
    image: "/card-disable1.png",
    heroImage: "/card-main.png",
  };
};

/**
 * Adapt a real machine into the Pack shape the Open Packs panels already consume.
 * `price`/`expectedValue` carry whole USD (the page renders them as USD, not IDRX);
 * `dropRates` are the real CC odds with their real labels (see `ccDropRate`).
 */
export function machineToPack(m: GachaMachine): Pack {
  const art = artForPrice(m.priceUsdcDollars);
  return {
    id: m.code,
    name: m.name,
    tierLabel: m.shortName || `$${m.priceUsdcDollars}`,
    group: art.group,
    price: m.priceUsdcDollars,
    accent: art.accent,
    image: art.image,
    heroImage: art.heroImage,
    expectedValue: Math.round(m.ev),
    dropRates: [
      ccDropRate("Common", toPct(m.odds.common)),
      ccDropRate("Uncommon", toPct(m.odds.uncommon)),
      ccDropRate("Rare", toPct(m.odds.rare)),
      ccDropRate("Epic", toPct(m.odds.epic)),
    ],
  };
}

/** Nearest Hoshi Tier for a CC rarity — drives the reveal badge color + icon only;
 *  the exact CC label is shown separately via OpenResult.real.rarityLabel. There is
 *  no Hoshi 'Uncommon', so it borrows Rare's blue to stay distinct from Common. */
const CC_TO_HOSHI_TIER: Record<GachaRarity, Tier> = {
  Common: "Common",
  Uncommon: "Rare",
  Rare: "Rare",
  Epic: "Epic",
};

const ccToHoshiTier = (rarity: GachaRarity | null): Tier =>
  rarity ? CC_TO_HOSHI_TIER[rarity] : "Common";

/** Solana devnet explorer link for a minted card address. */
const explorerAddressUrl = (address: string | null): string =>
  address ? `https://explorer.solana.com/address/${address}?cluster=devnet` : "";

/**
 * Adapt a REAL pull into OpenResult for RipReveal. The card's true identity
 * (nftName, exact rarity, address, explorer link, recipient wallet) rides in
 * `real`; `card.imageUrl` is a Hoshi placeholder (the pull endpoint returns no
 * image) and the IDRX value/buyback are 0 — a real card carries no synthetic
 * IDRX value, so the reveal shows USD + explorer instead.
 */
export function pullToOpenResult(pull: GachaPull, fallbackPackId: string): OpenResult {
  const rarity = ccToHoshiTier(pull.rarity);
  return {
    packId: pull.packType || fallbackPackId,
    rarity,
    card: {
      name: pull.nftName ?? "Your card",
      rarity,
      imageUrl: "/card-main.png",
      valueIdr: 0,
    },
    buybackQuoteIdr: 0,
    real: {
      rarityLabel: pull.rarity ?? "Unknown",
      nftAddress: pull.nftAddress,
      explorerUrl: explorerAddressUrl(pull.nftAddress),
      priceUsdc: pull.priceUsdc,
      wallet: pull.playerAddress,
      sent: pull.status === "OPENED",
    },
  };
}

/* ---------------- recent winners (live "card won" ticker) ---------------- */

/**
 * A real recent winner from GET /gacha/winners. The backend flattens each
 * getRecentWinners entry to just what the ticker needs: the card's identity
 * (name + image, resolved server-side from nft.content) plus who won it and the
 * prize tier. There is NO guaranteed USD value in the source payload, so none is
 * carried here — the ticker shows the winner + card only, never a fake price.
 */
export interface GachaWinner {
  nftAddress: string;
  name: string;
  image: string;
  winner: string;
  tier: number;
}

/** Truncate a wallet to `4 depan…4 belakang`, e.g. 4Th3Ej…VtyT → 4Th3…VtyT. */
const shortWallet = (wallet: string): string =>
  wallet.length > 8 ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : wallet;

/** Neutral gradient for winner cards — real cards carry their own art (imageUrl),
 *  so the accent is only a fallback backdrop and stays brand-neutral. */
const WINNER_ACCENT = "linear-gradient(160deg,#334155,#0f172a)";

/**
 * Map real recent winners into the LiveCard shape the marquee ticker consumes.
 * `imageUrl` carries the real card art and `subtitle` the "won by <wallet>" line;
 * `set` is blank and `price` is 0 because winner payloads have no guaranteed value
 * (LiveTicker must prefer `subtitle` over set + price when it is present).
 */
export function winnersToLiveCards(ws: GachaWinner[]): LiveCard[] {
  return ws.map((w, i) => ({
    id: i + 1,
    name: w.name,
    set: "",
    price: 0,
    accent: WINNER_ACCENT,
    imageUrl: w.image,
    subtitle: `won by ${shortWallet(w.winner)}`,
  }));
}
