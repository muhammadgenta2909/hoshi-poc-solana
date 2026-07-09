// Client-side offers (localStorage), keyed by listing id. POC: real offer
// persistence (visible to the seller) needs a backend Offer model — for now a
// submitted "Make Offer" persists per browser and is merged into the offers list.

import type { Offer } from "./cardDetail";

const key = (id: string) => `hoshi:offers:${id}`;

export function getLocalOffers(id: string): Offer[] {
  try {
    const raw = localStorage.getItem(key(id));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Offer[]) : [];
  } catch {
    return [];
  }
}

/** Prepend a new offer and persist. Returns the updated list. */
export function addLocalOffer(id: string, offer: Offer): Offer[] {
  const next = [offer, ...getLocalOffers(id)];
  localStorage.setItem(key(id), JSON.stringify(next));
  return next;
}
