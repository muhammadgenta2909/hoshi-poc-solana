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
  /** true = ada penjual USER (listing P2P, fee 5% dari penjual). false = milik Hoshi sendiri /
   *  katalog CC (tak ada penjual eksternal). Sinyal andal untuk membedakan jalur beli. */
  sellerConsigned: boolean;
  /** true = stok Hoshi genuine yang boleh dibeli (jalur Hoshi-inventory). Baris seed/placeholder
   *  = false → jangan tawarkan beli. */
  sellable: boolean;
  /**
   * true = kartu TITIPAN: milik seorang user, fisiknya dipegang Hoshi (lihat `Listing.consigned`
   * di lib/market.ts untuk alasan lengkapnya).
   *
   * Kartu titipan punya `sellerConsigned === true` (penjualnya user sungguhan) TAPI tidak punya
   * NFT di escrow, jadi halaman detail TIDAK BOLEH memperlakukannya sebagai listing P2P biasa:
   * jalur belinya Rupiah tanpa flag P2P, tawar-menawar dimatikan, dan panel pemilik menawarkan
   * "minta kartu saya kembali", bukan "cancel listing".
   *
   * Opsional supaya respons backend lama tetap terbaca (absen ⇒ bukan titipan ⇒ perilaku hari ini).
   */
  consigned?: boolean;
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
