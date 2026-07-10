// Offer + Activity domain types for the profile tabs. These mirror the backend
// DTOs (marketplace.serialize.ts) 1:1 so pages can render the response directly.
//
// Offers used to live in localStorage here — a POC stand-in, because the backend
// had no way to know WHO made an offer. It does now (Offer.buyerId), so the
// browser-local copy is gone: every tab below reads the database.

import type { ListingStatus, MarketSet } from "./market";

/* --------------------------------- offers --------------------------------- */

export type OfferStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED";

export type OfferParty = {
  id: string | null;
  /** displayName, else a shortened wallet. */
  label: string;
};

/** One row of the Offers Made / Offers Received tables. */
export type OfferRecord = {
  id: string;
  listingId: string;
  /** IDRX. */
  amount: number;
  status: OfferStatus;
  createdAt: string;
  /** True while the offer can still be accepted / rejected / cancelled. */
  actionable: boolean;
  item: {
    id: string;
    name: string;
    image: string;
    category: string;
    set: MarketSet;
    price: number;
    status: ListingStatus;
  };
  buyer: OfferParty;
  seller: OfferParty;
};

export const OFFER_STATUS_STYLE: Record<OfferStatus, string> = {
  PENDING: "text-yellow-300 bg-yellow-400/10",
  ACCEPTED: "text-emerald-400 bg-emerald-400/10",
  REJECTED: "text-red-400 bg-red-400/10",
  CANCELED: "text-zinc-400 bg-white/[0.06]",
};

/* -------------------------------- activity -------------------------------- */

export type ActivityType =
  | "OFFER_MADE"
  | "OFFER_CANCELED"
  | "OFFER_REJECTED"
  | "SALE_CARD"
  | "LISTED_CARD"
  | "LISTING_CANCELED"
  | "SEND_TO_VAULT"
  | "SEND_TO_HOME";

export type ActivityRecord = {
  id: string;
  type: ActivityType;
  listingId: string | null;
  item: {
    name: string;
    image: string | null;
    category: string | null;
    set: MarketSet | null;
  };
  /** null ⇒ the event carries no amount (a withdrawn offer); rendered as "----". */
  amount: number | null;
  from: OfferParty | null;
  to: OfferParty | null;
  createdAt: string;
};

export type ActivityQuery = {
  search?: string;
  set?: string;
  sort?: "newest" | "oldest";
};

/** Row label + glyph for each event type. Icons live in /public/activity. */
export const ACTIVITY_META: Record<ActivityType, { label: string; icon: string }> = {
  OFFER_MADE: { label: "Offer Made", icon: "/activity/shopping_bag_speed.png" },
  OFFER_CANCELED: { label: "Offer Canceled", icon: "/activity/label_off.png" },
  OFFER_REJECTED: { label: "Offer Rejected", icon: "/activity/label_off.png" },
  SALE_CARD: { label: "Sale Card", icon: "/activity/sell.png" },
  LISTED_CARD: { label: "Listed Card", icon: "/activity/new_label.png" },
  LISTING_CANCELED: { label: "Listing Canceled", icon: "/activity/label_off.png" },
  SEND_TO_VAULT: { label: "Send to Vault", icon: "/activity/warehouse.png" },
  SEND_TO_HOME: { label: "Send to Home", icon: "/activity/delivery_truck_speed.png" },
};

/* -------------------------------- formatting ------------------------------- */

/** "8 Jul 2026, 08:05 AM" — the format used across the profile tables. */
export function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return `${date}, ${time}`;
}
