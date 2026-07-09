import type { Listing } from "./market";

export type Offer = {
  id?: string;
  user: string;
  ago: string;
  amount: number;
  status?: string;
};

export type CardDetail = {
  listing: Listing;
  title: string;
  tags: [string, string, string];
  consignedBy: string;
  certificate: string | null;
  estMarketValueIdr: number;
  vaultLocation: string | null;
  contractAddress: string | null;
  change30dPct: number;
  priceHistory: number[];
  offers: Offer[];
  details: { label: string; value: string }[];
  collectionLabel: string;
  related: Listing[];
};
