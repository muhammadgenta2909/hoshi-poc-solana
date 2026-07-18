// Pack-opening video, chosen by the pulled card's rarity. The reveal takeover
// (components/packs/RipReveal.tsx) plays one of these clips before showing the
// card. Single source of truth so the reveal AND the page's prefetch agree.
//
// Rarity → clip:
//   Holo                               → its own "holo" clip
//   Epic (and Hoshi's Legendary tiers) → the hype "epic" clip
//   everything else (Common/Uncommon/Rare) → the standard "rare" clip (default)

import type { OpenResult } from "./openPack";

export const PACK_VIDEOS = {
  rare: "/video/open-packs-rare.mp4",
  epic: "/video/open-packs-epic.mp4",
  holo: "/video/open-packs-holo.mp4",
} as const;

/** Every clip the reveal might play — the open-packs page prefetches all of them. */
export const ALL_PACK_VIDEOS: readonly string[] = Object.values(PACK_VIDEOS);

/**
 * The clip to play for a given pull. Reads the shown rarity label
 * (`real.rarityLabel` from CollectorCrypt, else the Hoshi `rarity` tier) and is
 * null-safe: before the purchase settles it returns the default clip.
 */
export function packVideoSrc(result: OpenResult | null): string {
  const label = (result?.real?.rarityLabel ?? result?.rarity ?? "").toLowerCase();
  if (label.includes("holo")) return PACK_VIDEOS.holo;
  if (label.includes("epic") || label.includes("legendary")) return PACK_VIDEOS.epic;
  return PACK_VIDEOS.rare;
}
