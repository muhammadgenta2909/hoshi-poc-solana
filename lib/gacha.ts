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
  /** PAYER wallet. On the treasury flow this is the Hoshi treasury, NOT the
   *  recipient — the card recipient is derived server-side from the JWT and is
   *  never echoed back, so the reveal shows the CONNECTED wallet instead. */
  playerAddress: string;
  /** Price paid, in 6-decimal base units. */
  priceUsdc: number | null;
  rarity: GachaRarity | null;
  nftAddress: string | null;
  /**
   * Nama METADATA on-chain. Dibatasi 32 karakter oleh standar metadata, jadi judul
   * katalog CC yang panjang datang TERPOTONG — grade yang menempel di judul bisa
   * ikut hilang. JANGAN dipakai untuk menyimpulkan grade: pakai `ccGrade*`, dan
   * `ccItemName` untuk judul lengkapnya.
   */
  nftName: string | null;
  /** Real card art resolved server-side from the CC payload (content.links.image
   *  → files[0].cdn_uri → files[0].uri). Null on older backend rows. */
  nftImage: string | null;
  roll: string | null;
  points: number | null;
  buybackAmountUsdc: number | null;
  error: string | null;
  createdAt: string;
  openedAt: string | null;

  /* --- Fakta kartu dari KATALOG CollectorCrypt (dibaca server, bukan ditebak
     dari nama). `null` = CC belum memberi tahu kita — tampilkan "belum
     diketahui". Perhatikan: null BUKAN "Ungraded"; tidak tahu ≠ tidak bergrade,
     dan menulis "Ungraded" untuk kartu PSA 10 sama salahnya dengan sebaliknya. --- */
  /** Judul katalog LENGKAP, mis. "2024 #056 Froakie PSA 10 Obf EN-Obsidian Flames". */
  ccItemName: string | null;
  /** Perusahaan grading APA ADANYA: 'PSA' | 'CGC' | 'Beckett' | 'SGC' | … */
  ccGradeCompany: string | null;
  ccGradeScore: number | null;
  /** Label mentah CC, mis. 'GEM-MT 10'. */
  ccGradeLabel: string | null;
  ccGradeCert: string | null;
  /**
   * Seri/set kartu menurut katalog CC, mis. 'Mega Dream ex - M2a - Japanese'.
   * Sumber yang SAMA dengan `Listing.set`, jadi kartu hasil pull bisa ikut filter
   * Series di /account. null = CC belum memberi tahu (jangan tampilkan tebakan).
   */
  ccSet: string | null;
  /** Nama vault fisik CC, mis. 'OmniVault'. */
  ccVault: string | null;
};

/**
 * Grade kartu untuk ditampilkan, mis. "PSA 10". `null` = CC belum memberi tahu —
 * pemanggil WAJIB menampilkannya sebagai "belum diketahui", bukan "Ungraded".
 */
export function pullGradeLabel(pull: GachaPull): string | null {
  if (!pull.ccGradeCompany || pull.ccGradeScore === null) return null;
  return `${pull.ccGradeCompany} ${pull.ccGradeScore}`;
}

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

/**
 * Pack wrapper art by price band — the wrapper's colour IS its rarity read:
 * rare = blue, epic = purple, holo = holographic (top tier). One table so the
 * bands are trivial to re-tune and adding a tier (e.g. a common/legendary
 * wrapper) is a single row. The same wrapper drives both the Select-Pack tile
 * (`image`) and the centre showcase (`heroImage`), so a $99 pack no longer shows
 * the old yellow Arceus art — it shows the pack that matches its band.
 * Ordered high→low; the first band whose `minUsd` the price clears wins.
 */
const PACK_TIERS: {
  minUsd: number;
  group: Pack["group"];
  accent: string;
  art: string;
}[] = [
  { minUsd: 100, group: "Special Hoshi Pack", accent: "linear-gradient(160deg,#4b3b7a,#0a0713)", art: "/holo.png" },
  { minUsd: 50, group: "Normal Hoshi Pack", accent: "linear-gradient(160deg,#a855f7,#4c1d95)", art: "/epic.png" },
  { minUsd: 0, group: "Normal Hoshi Pack", accent: "linear-gradient(160deg,#3b82f6,#0c4a6e)", art: "/rare.png" },
];

const artForPrice = (usd: number): PackArt => {
  const tier = PACK_TIERS.find((t) => usd >= t.minUsd) ?? PACK_TIERS[PACK_TIERS.length - 1];
  return { group: tier.group, accent: tier.accent, image: tier.art, heroImage: tier.art };
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

/** Solana cluster used for explorer links. Defaults to devnet; set
 *  NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta for mainnet (Explorer treats a missing
 *  ?cluster as mainnet, so we drop the param there). Switching networks is an env
 *  change — no code edit. */
const SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export const explorerAddressUrl = (address: string | null): string => {
  if (!address) return "";
  const base = `https://explorer.solana.com/address/${address}`;
  return SOLANA_CLUSTER === "mainnet-beta" ? base : `${base}?cluster=${SOLANA_CLUSTER}`;
};

/**
 * Adapt a REAL pull into OpenResult for RipReveal. The card's true identity
 * (nftName, exact rarity, address, explorer link) rides in `real`. Image order:
 * caller override (winners-feed lookup for old backend rows) → the pull's own
 * `nftImage` → the Hoshi card back as an honest "no art" placeholder (NEVER the
 * yellow pack wrapper — that made every reveal look like the wrong card).
 * `wallet` is the caller-supplied RECIPIENT (the connected wallet): the pull's
 * playerAddress is the treasury payer on this flow, not who received the card.
 */
export function pullToOpenResult(
  pull: GachaPull,
  fallbackPackId: string,
  opts?: { image?: string | null; recipient?: string | null },
): OpenResult {
  const rarity = ccToHoshiTier(pull.rarity);
  return {
    packId: pull.packType || fallbackPackId,
    rarity,
    card: {
      name: pull.nftName ?? "Your card",
      rarity,
      imageUrl: opts?.image ?? pull.nftImage ?? "/card-back.svg",
      valueIdr: 0,
    },
    buybackQuoteIdr: 0,
    real: {
      rarityLabel: pull.rarity ?? "Unknown",
      nftAddress: pull.nftAddress,
      explorerUrl: explorerAddressUrl(pull.nftAddress),
      priceUsdc: pull.priceUsdc,
      wallet: opts?.recipient ?? undefined,
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
