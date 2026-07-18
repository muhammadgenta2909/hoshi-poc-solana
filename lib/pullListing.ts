// Turn a pulled card (GachaPull) into a marketplace listing payload. Mirrors how
// CollectorCrypt lists from the vault: the card's identity (name, art, rarity,
// grade) is already known, so the seller really only sets a PRICE. We derive the
// rest best-effort from the pull's own metadata; the graded-card fields that
// aren't in the pull fall back to neutral display defaults.

import type { GachaPull } from "./gacha";
import type { Era, Grader, NewListingInput } from "./market";
import type { Tier } from "./packs";

/** CC's 4-tier rarity → Hoshi's Tier (there is no Hoshi "Uncommon"). */
function ccRarityToTier(rarity: string | null): Tier {
  switch (rarity) {
    case "Epic":
      return "Epic";
    case "Rare":
    case "Uncommon":
      return "Rare";
    default:
      return "Common";
  }
}

/** Pull "PSA 9" / "BGS 9.5" out of a CC card name (they almost always carry it). */
export function parseGrade(
  name: string | null,
): { grader: Grader; score: number } | null {
  const m = /\b(PSA|CGC|BGS|BECKETT|SGC)\s*(10|\d(?:\.\d)?)\b/i.exec(name ?? "");
  if (!m) return null;
  const g = m[1].toUpperCase();
  const grader: Grader = g === "CGC" ? "CGC" : g === "PSA" ? "PSA" : "BGS";
  return { grader, score: Number(m[2]) };
}

/** Pokémon TCG era from a 4-digit year in the name (matches the Era filter set). */
function eraFromName(name: string | null): Era {
  const y = /\b(19|20)\d{2}\b/.exec(name ?? "");
  const year = y ? Number(y[0]) : 0;
  if (year >= 2023) return "Scarlet & Violet";
  if (year >= 2020) return "Sword & Shield";
  if (year >= 2017) return "Sun & Moon";
  if (year >= 2014) return "XY";
  if (year >= 2011) return "Black & White";
  if (year >= 1999) return "Classic";
  return "Vintage";
}

/** Build the POST /marketplace payload for listing a pulled card. `fromPackMemo`
 *  ties it to the real on-chain NFT and proves ownership server-side. */
export function pullToListingInput(
  pull: GachaPull,
  input: { price: number; expectedValue?: number; grader: Grader; gradeScore: number },
): NewListingInput {
  const name = pull.nftName ?? "Pulled card";
  return {
    name,
    set: "Promo",
    rarity: ccRarityToTier(pull.rarity),
    image: pull.nftImage ?? "/card-back.svg",
    price: input.price,
    expectedValue: input.expectedValue ?? input.price,
    grade: `${input.grader} ${input.gradeScore}`,
    grader: input.grader,
    gradeScore: input.gradeScore,
    language: "English",
    era: eraFromName(name),
    element: "Fire",
    category: "Full Art",
    fromPackMemo: pull.memo,
  };
}
