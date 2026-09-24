import type {
  ConsignmentBase,
  ConsignmentListingRef,
  ConsignmentReturnPlan,
} from "./consignment";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/**
 * Kegagalan rute admin yang MEMBAWA STATUS HTTP-nya.
 *
 * Sebelumnya `api()` melempar `Error` biasa, jadi satu-satunya yang sampai ke layar adalah teks
 * pesannya. Layar yang perlu MEMBEDAKAN dua penolakan yang berbeda akibatnya — ganti rugi yang
 * ditolak karena kartunya sudah terjual (yang harus dipulihkan PEMBELI) versus yang ditolak
 * karena sudah pernah dibayar (nol rupiah bergerak, dan memang tidak boleh bergerak lagi) — tidak
 * punya apa pun untuk dicabangkan selain mencocokkan kalimat.
 *
 * `message` tetap apa adanya dari server, jadi pemanggil lama (`e instanceof Error ? e.message`)
 * tidak berubah perilakunya sama sekali: ini subclass `Error`.
 *
 * SENGAJA TIDAK membawa `code`: rute titipan menolak dengan ConflictException/BadRequestException
 * BIASA yang tidak punya kode kontrak (berbeda dari jalur kirim fisik di `lib/api.ts`, yang
 * memang mengirim `code`/`stage`). Field yang selalu `undefined` hanya akan mengundang pemanggil
 * mengarang kode yang tidak pernah dikirim siapa pun.
 */
export class AdminApiError extends Error {
  constructor(
    message: string,
    /** Status HTTP apa adanya. 400 = permintaannya salah bentuk/nilai; 409 = keadaannya menolak. */
    public status: number,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch { /* ignore */ }
    throw new AdminApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

/* ---------- shared pagination types ---------- */

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/* ---------- domain types matching backend response ---------- */

export type AdminStats = {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  cancelledListings: number;
  pendingEscrowListings: number;
  totalUsers: number;
  totalCards: number;
  totalRevenue: number;
};

export type AdminListingNft = {
  id: string;
  assetAddress: string;
  mintTx: string | null;
};

export type AdminListing = {
  id: string;
  name: string;
  set: string;
  rarity: string;
  image: string;
  imageBack: string | null;
  priceIdrx: number;
  expectedValueIdrx: number;
  buybackIdrx: number;
  sellerAddress: string;
  sellerId: string | null;
  grade: string;
  grader: string;
  gradeScore: number;
  language: string;
  era: string;
  element: string;
  category: string;
  views: number;
  status: string;
  listedAt: string;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  nft: AdminListingNft | null;
  cardId: string | null;
  certificate: string | null;
  vaultLocation: string | null;
  cardNumber: string | null;
  variant: string | null;
  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════════╗
   * ║ NON-NULL ⇒ KARTU TITIPAN: barang MILIK ORANG LAIN yang fisiknya ada di rak Hoshi.      ║
   * ╚════════════════════════════════════════════════════════════════════════════════════════╝
   *
   * SATU KOLOM, bukan tebakan dari bentuk. Baris titipan punya `sellerId != null` persis seperti
   * listing P2P, jadi setiap heuristik "punya penjual?" akan salah menggolongkannya.
   *
   * Layar admin listings WAJIB membacanya: Deactivate / Delete / Edit harga pada baris titipan
   * masing-masing merusak sesuatu yang tidak terlihat di layar ini (status titipan yang terbelah,
   * kartu fisik yang terkunci di rak, harga yang menyimpang dari kesepakatan pemiliknya).
   * Backend menolak ketiganya di titik tulisnya; tombol yang dimatikan di sini adalah lapis
   * KEDUA — supaya operator tidak perlu menabrak error untuk mengetahuinya.
   */
  consignmentId?: string | null;
  /** Ringkasan titipannya — hanya ada kalau `consignmentId` terisi. */
  consignment?: {
    id: string;
    /** ConsignmentStatus: INTAKE | IN_CUSTODY | LISTED | SOLD | RELEASED | LOST | CANCELLED. */
    status: string;
    /** SNAPSHOT nama pemilik saat serah-terima — tetap benar meski nama akunnya berubah. */
    consignorNameAtIntake: string;
    /** Harga yang DISEPAKATI pemiliknya. Beda dari `priceIdrx` = harga pernah menyimpang. */
    askPriceIdr: number;
  } | null;
  /** Vault provenance. Rows synced before this field default to HOSHI server-side. */
  source: "HOSHI" | "COLLECTORCRYPT";
  ccNftAddress: string | null;
  ccPriceUsd: number | null;
  ccHasBuyback: boolean;
  ccSyncedAt: string | null;
};

export type AdminCard = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string;
  set: string;
  rarity: string;
  metadataUri: string | null;
  attributes: unknown;
  createdAt: string;
  updatedAt: string;
};

export type AdminActivityItem = {
  id: string;
  /** ActivityType enum: OFFER_MADE | OFFER_CANCELED | OFFER_REJECTED | SALE_CARD
   *  | LISTED_CARD | LISTING_CANCELED | SEND_TO_VAULT | SEND_TO_HOME */
  type: string;
  itemName: string;
  itemImage: string | null;
  category: string | null;
  set: string | null;
  /** IDRX. null = event tanpa nominal (mis. offer dibatalkan). */
  amount: number | null;
  fromLabel: string | null;
  toLabel: string | null;
  listingId: string | null;
  createdAt: string;
};

/* ---------- API functions ---------- */

export const getAdminStats = (token: string) =>
  api<AdminStats>("/admin/stats", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Live on-chain treasury balances + a rough status light for the refill indicator.
 *  `configured: false` / `status: "unknown"` = balances couldn't be read (RPC/treasury
 *  not set). Amounts are human units: usd (USDC $), sol (SOL), idrx (Rupiah). */
export type AdminTreasury = {
  configured: boolean;
  usdc: number | null;
  sol: number | null;
  idrx: number | null;
  status: "healthy" | "low" | "critical" | "unknown";
  /** true = USDC/SOL adalah MOCK (staging) — UI menandainya, tak menampilkan angka $ sbg saldo asli. */
  simulated: boolean;
  /** Saldo SOL wallet escrow P2P, dibaca SERVER-SIDE (via ESCROW_ADDRESS env). null = belum di-set / gagal baca. */
  escrowSol: number | null;
  /** true saat ESCROW_ADDRESS env di-set — escrow bisa dipantau. */
  escrowConfigured: boolean;
};

export const getAdminTreasury = (token: string) =>
  api<AdminTreasury>("/admin/treasury", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------- transactions ledger + finance summary ---------- */

export type AdminTransaction = {
  id: string;
  merchantOrderId: string;
  /**
   * Ember ledger. Backend menurunkannya dari `listingKindOf` (src/common/listing-kind.ts),
   * BUKAN dari `sellerId != null`.
   *
   * CONSIGNMENT berdiri sendiri karena kartu TITIPAN juga ber-`sellerId` dan karena itu dulu
   * terbaca "P2P". Di layar uang, "P2P" berarti "kartunya milik user, kalau gagal kembalikan saja
   * uangnya" — dan untuk titipan yang terjual lalu hilang kalimat itu salah: payout-nya SUDAH cair
   * ke pemilik kartu, jadi memulihkan pembeli adalah KERUGIAN Hoshi, bukan mengembalikan uang yang
   * masih kami pegang.
   */
  type: "PACK" | "RESELLER" | "CONSIGNMENT" | "P2P";
  /**
   * Model PM: CC vault (harga default, Hoshi 0%) vs Hoshi vault (5% / stok Hoshi). null =
   * pack/topup. Di layar ini ia juga menjawab "SIAPA yang mengirim barangnya" — dan untuk baris
   * TITIPAN jawabannya SELALU Hoshi (kartunya ada di rak Hoshi), apa pun bunyi `source`-nya.
   */
  vault: "CC" | "HOSHI" | null;
  status: string;
  priceIdr: number;
  item: string | null;
  buyer: string;
  /** RESELLER → "Hoshi". P2P → penjual user. CONSIGNMENT → PEMILIK kartu titipan. PACK → null. */
  seller: string | null;
  /**
   * ╔══════════════════════════════════════════════════════════════════════════════════════════╗
   * ║ GERBANG UANG. Status REFUND_DUE cuma bilang "kami berutang" — INI yang bilang boleh atau ║
   * ║ tidaknya ditransfer.                                                                      ║
   * ╚══════════════════════════════════════════════════════════════════════════════════════════╝
   * true  → utangnya tercatat DAN uangnya memang ada pada kami; aman dikirim (manual, di luar
   *         sistem — tidak ada rail refund otomatis di repo ini).
   * false → JANGAN TRANSFER DULU. Uangnya mungkin tidak pernah benar-benar mendarat di treasury
   *         kami (pin IDRX menyimpang), atau sudah keluar ke orang lain (payout pemilik titipan),
   *         atau barangnya sudah/mungkin terkirim. Refund buta di sini = bayar dua kali.
   *         Yang harus diverifikasi disebut di `error`.
   *
   * Opsional HANYA untuk respons backend lama yang belum mengirim kolom ini. Perlakukan `undefined`
   * sebagai "tidak diketahui" — JANGAN dibaca sebagai true.
   */
  refundSafe?: boolean;
  /**
   * Teks alasan APA ADANYA yang ditulis penulis utangnya. Ini satu-satunya yang menjelaskan APA
   * yang sebenarnya terjadi dan APA yang harus diverifikasi. Tampilkan utuh — jangan diringkas.
   */
  error?: string | null;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

export type AdminSellerBalance = {
  id: string;
  wallet: string;
  label: string;
  balanceIdr: number;
};

export type AdminFinance = {
  reseller: { count: number; grossIdr: number };
  /** Hoshi jual kartu inventarisnya SENDIRI (source HOSHI). Seluruh omzet = pendapatan Hoshi. */
  hoshiInventory: { count: number; grossIdr: number };
  /**
   * P2P = listing milik USER yang kartunya TIDAK dititipkan ke Hoshi.
   *
   * Sejak ember `consignment` di bawah ada, backend MENGELUARKAN penjualan titipan dari angka ini
   * (`nonConsignedListingWhere()`). Kartu titipan juga ber-`sellerId`, jadi sebelum itu ia terhitung
   * dua kali. Konsekuensinya: menghapus tile "Titipan" dari layar TIDAK mengembalikan angkanya ke
   * P2P — ia cuma hilang, dan komisi 5% Hoshi terbaca nol.
   */
  p2p: { count: number; grossIdr: number };
  /**
   * TITIPAN — kartu milik ORANG LAIN yang fisiknya ada di rak Hoshi.
   *
   * Yang menjadi PENDAPATAN Hoshi di sini hanya `commissionIdr`. `payoutIdr` sudah menjadi saldo
   * pemilik kartu, jadi ia sudah ikut terhitung di `liabilitiesIdr` — jangan dijumlahkan lagi
   * sebagai pemasukan. `grossIdr` = keduanya, yaitu yang dibayar pembeli di luar fee QRIS.
   */
  consignment: {
    count: number;
    grossIdr: number;
    commissionIdr: number;
    payoutIdr: number;
  };
  liabilitiesIdr: number;
  pendingWithdrawalsIdr: number;
  pendingWithdrawalsCount: number;
  sellerCount: number;
  sellerBalances: AdminSellerBalance[];
  treasuryIdr: number | null;
  distributableProfitIdr: number | null;
  /** Fee marketplace Hoshi dalam basis points (500 = 5%). */
  marketplaceFeeBps: number;
  /** Komisi Hoshi dari total P2P bruto (= gross × fee). */
  p2pCommissionIdr: number;
  /** Sisa P2P bruto yang jadi saldo penjual (= gross − komisi). */
  p2pNetToSellersIdr: number;
};

export const getAdminTransactions = (
  token: string,
  params?: { page?: number; limit?: number; status?: string },
) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  const qs = q.toString();
  return api<{
    data: AdminTransaction[];
    total: number;
    page: number;
    limit: number;
  }>(`/admin/transactions${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const getAdminFinance = (token: string) =>
  api<AdminFinance>("/admin/finance", {
    headers: { authorization: `Bearer ${token}` },
  });

/* ---------------- withdrawals (payout manual) ---------------- */

export type AdminWithdrawal = {
  id: string;
  amountIdr: number;
  method: string;
  destBank: string;
  destAccount: string;
  destName: string;
  status: "REQUESTED" | "PAID" | "REJECTED";
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  userWallet: string;
  userLabel: string;
};

export const getAdminWithdrawals = (token: string, status?: string) => {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api<AdminWithdrawal[]>(`/admin/withdrawals${q}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const approveWithdrawal = (id: string, note: string, token: string) =>
  api<AdminWithdrawal>(`/admin/withdrawals/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

export const rejectWithdrawal = (id: string, note: string, token: string) =>
  api<AdminWithdrawal>(`/admin/withdrawals/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

/* ---------------- kirim kartu fisik (redemption) — admin ----------------

   DUA RAIL, dan layar admin WAJIB bisa membedakannya sekilas:

     • HOSHI_DOMESTIC — kartu STOK HOSHI yang fisiknya disimpan Hoshi di Indonesia. Pengirimannya
       paket kurir lokal biasa: NOL NFT, NOL burn, NOL USDC treasury, NOL CollectorCrypt, NOL
       tanda tangan wallet. Yang bergerak hanya ONGKIR RUPIAH dari pembeli ke treasury, dan
       RESINYA DIISI ADMIN di layar ini.
     • CC_VAULT — kartu di vault CollectorCrypt (hasil pack / katalog CC / beli antar user).
       Pengirimannya burn NFT + USDC treasury + tanda tangan wallet USER, dan RESINYA DATANG DARI
       POLL SHIPMENT CC — jangan pernah diisi tangan (backend menolak 400).

   Railnya DITURUNKAN SERVER dari kolom `CardRedemption.listingId` (non-null = domestik) dan
   dikirim sebagai field `rail`. JANGAN menyimpulkannya dari `source`: kolom itu free-form,
   nullable pada baris lama, dan baris WARISAN bisa berbunyi 'HOSHI' padahal railnya CC_VAULT. */

/**
 * SELURUH nilai enum RedemptionStatus di backend (prisma/schema.prisma).
 *
 * DULU daftar ini cuma REQUESTED/PACKING/SHIPPED/CANCELED — empat status jalur record-only — dan
 * /admin/redemptions mengindeks `STATUS_UI[r.status]` tanpa jaring. Akibatnya SETIAP baris
 * ber-status jalur real (AWAITING_PAYMENT, DELIVERED, …) melempar
 * `TypeError: Cannot read properties of undefined (reading 'cls')` dan MENJATUHKAN seluruh tab
 * "Semua". Itu latent selama kirim CC masih gelap — tapi rail DOMESTIK TIDAK digerbang flag CC
 * dan menulis AWAITING_PAYMENT begitu pembeli menekan "Bayar ongkir", jadi operator kehilangan
 * layarnya untuk SEMUA pengiriman persis saat ada uang yang sedang jalan.
 *
 * Daftar ini sekarang LENGKAP, dan layar yang memakainya WAJIB tetap punya fallback: status enum
 * BARU yang ditambahkan backend harus MEROSOT (tampil apa adanya), bukan melempar.
 */
export type RedemptionStatus =
  // Jalur record-only / domestik.
  | "REQUESTED"
  | "PACKING"
  | "SHIPPED"
  | "CANCELED"
  // Dipakai KEDUA rail.
  | "AWAITING_PAYMENT"
  | "DELIVERED"
  // Jalur REAL CC Vault — tidak pernah sah muncul di baris domestik.
  | "READY_TO_FUND"
  | "FUNDING"
  | "FUNDED"
  | "BURN_SUBMITTED"
  | "IN_TRANSIT"
  | "REFUND_DUE"
  | "RECLAIM_DUE"
  | "SHIP_FAILED_POST_BURN";

/**
 * ASAL kartu pada baris permintaan kirim — LABEL, bukan gerbang rail.
 *
 * `CONSIGNMENT` SENGAJA ADA DI SINI dan tidak boleh dihapus lagi: backend MENULISNYA
 * (`redemption.service.ts` → `source = listing.consignmentId != null ? 'CONSIGNMENT' : 'HOSHI'`)
 * supaya operator tahu kartu SIAPA yang sedang ia pegang. Selama nilai ini absen dari tipe,
 * `SOURCE_LABEL[r.source]` menghasilkan `undefined` dan React merender STRING KOSONG — jadi
 * satu-satunya petunjuk bahwa paket itu barang orang lain justru menghilang tanpa jejak.
 */
export type RedemptionSource =
  | "PACK"
  | "CC_CATALOG"
  | "P2P"
  | "HOSHI"
  | "CONSIGNMENT";

/** Rail pengiriman, DITURUNKAN SERVER dari `listingId`. Lihat blok di atas. */
export type RedemptionRail = "HOSHI_DOMESTIC" | "CC_VAULT";

export type AdminRedemption = {
  id: string;
  userId?: string;
  /** Identitas kartu. Rail CC: alamat NFT. Rail domestik: `hoshi-listing:<listingId>`. */
  nftAddress: string;
  /**
   * DISKRIMINATOR RAIL yang persisten. NON-NULL = stok Hoshi (kurir domestik). Dipakai sebagai
   * cadangan kalau `rail` absen (respons backend lama).
   */
  listingId?: string | null;
  /** Rail yang dihitung backend. Absen = respons lama → turunkan dari `listingId`. */
  rail?: RedemptionRail;
  cardName: string;
  cardImage: string | null;
  cardSet: string | null;
  /** Asal kartu → LABEL saja, BUKAN gerbang rail. null = data lama. */
  source: RedemptionSource | null;
  /**
   * Titipan yang kartunya sedang dikirim — null kalau baris ini bukan titipan.
   *
   * Dihitung server dari `Listing.consignment` (FAKTA), bukan dari `source` (label yang pada
   * baris warisan bisa berbunyi 'HOSHI'). Yang dibutuhkan operator di rak bukan kategorinya
   * melainkan NAMA pemiliknya — tanpa itu ia tidak tahu slab siapa yang harus diambil.
   */
  consignment?: {
    id: string;
    status: string;
    /** SNAPSHOT nama pemilik saat serah-terima. */
    consignorName: string;
    askPriceIdr: number;
  } | null;
  recipientName: string;
  street: string;
  apt?: string | null;
  city: string;
  state: string | null;
  zip: string;
  country: string;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
  status: RedemptionStatus;
  note?: string | null;
  /**
   * FK tagihan ongkir Rupiah (PaymentOrder, packType='SHIPPING'). Terisi begitu invoice PERTAMA
   * terbit dan TIDAK dibersihkan saat invoice-nya kedaluwarsa — jadi ia TIDAK boleh dibaca
   * sebagai "sudah lunas". Yang membuktikan ongkir LUNAS di rail domestik adalah STATUS-nya
   * (PACKING ke atas): `fulfilShipping` memindahkan AWAITING_PAYMENT → PACKING dan menandai
   * order FULFILLED dalam SATU transaksi, jadi PACKING tidak bisa ada tanpa ongkir yang lunas.
   */
  paymentOrderId?: string | null;
  /** Ongkir CC dalam base unit USDC. Selalu null/0 di rail domestik (nol USDC bergerak). */
  totalCostUsdc?: number | null;
  /** Sig transfer USDC treasury→user (rail CC). Non-null = uang treasury SUDAH keluar. */
  fundingSignature?: string | null;
  burnSignature?: string | null;
  outboundShipmentId?: string | null;
  /** false = kegagalan PASCA-danai → JANGAN refund Rupiah. Hanya bisa false di rail CC. */
  refundSafe?: boolean;
  /** Resi kurir. Rail domestik: DIISI ADMIN. Rail CC: MILIK poll shipment CC. */
  trackingIds?: string[];
  trackingUrls?: string[];
  createdAt: string;
  updatedAt?: string;
  processedAt?: string | null;

  /* ═════ KONTRAK B2 — DIHITUNG SERVER. Absen = respons backend PRA-B2 (lihat fallback). ═════ */

  /** Keadaan tagihan ongkir baris ini, diringkas dari baris PaymentOrder packType='SHIPPING'. */
  ongkir?: AdminRedemptionOngkir;
  /**
   * TOMBOL YANG BOLEH DIRENDER — dari tabel transisi yang SAMA yang ditegakkan penulisnya,
   * SUDAH dikurangi pagar ongkir.
   *
   * Dashboard TIDAK BOLEH menggambar tombolnya sendiri lagi. Tabel salinan di klien adalah
   * persis yang dulu menampilkan "Kemas"/"Kirim" pada baris domestik yang ongkirnya belum
   * ditagih — dua salinan yang menyimpang, dan yang menyimpang adalah yang dilihat operator.
   */
  allowedNextStatuses?: RedemptionStatus[];
  /**
   * Transisi yang tabelnya izinkan TAPI pagar ongkir tolak. DIRENDER DISABLED + alasannya —
   * jangan disembunyikan: operator harus tahu jalan keluarnya ada, tapi berbayar.
   */
  blockedNextStatuses?: RedemptionStatus[];
  /** Kosong = tidak ada yang tertunggak di baris ini. Kalimat siap-tampil dari server. */
  actionRequired?: string[];
};

/** Satu tagihan ongkir (PaymentOrder packType='SHIPPING') milik sebuah baris redemption. */
export type AdminOngkirOrder = {
  merchantOrderId: string;
  /** PaymentStatus: PENDING | PAID | FULFILLING | FULFILLED | EXPIRED | FAILED | REFUND_DUE. */
  status: string;
  priceIdr: number;
  /** false = JANGAN kirim uangnya; verifikasi dulu di luar sistem. */
  refundSafe: boolean;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

/**
 * Keadaan ongkir sebuah baris — DIHITUNG SERVER dari baris PaymentOrder, bukan dari kolom turunan
 * yang bisa menyimpang. Untuk rail CC semua flagnya false (`required: false`): "ongkir" di sana
 * punya kosakata sendiri (Rupiah lunas → USDC didanai → TTD user) dan tidak boleh dicampur.
 */
export type AdminRedemptionOngkir = {
  /** true ⇔ rail ini menagih ongkir Rupiah lewat invoice IDRX (yaitu: rail DOMESTIK). */
  required: boolean;
  /** true ⇔ ADA order SHIPPING berstatus FULFILLED = ongkirnya LUNAS. */
  paid: boolean;
  /** true ⇔ ada order yang pemenuhannya masih berjalan (PAID/FULFILLING) — TUNGGU. */
  inFlight: boolean;
  /** true ⇔ ada order yang sudah tercatat sebagai utang refund (REFUND_DUE). */
  refundDue: boolean;
  /** Gerbang refund order REFUND_DUE. false = JANGAN kirim uang. null = tak ada order REFUND_DUE. */
  refundSafe: boolean | null;
  /** Total Rupiah yang benar-benar LUNAS. */
  paidIdr: number;
  /** Semua tagihan ongkir baris ini, terbaru dulu. [] = belum pernah ada tagihan. */
  orders: AdminOngkirOrder[];
};

/**
 * Rail sebuah baris, fail-safe terhadap respons backend lama.
 *
 * URUTAN BACANYA DISENGAJA: `rail` dari server dulu (ia yang otoritatif), lalu FAKTA persisten
 * `listingId`. `source` TIDAK PERNAH dipakai — baris warisan bisa berbunyi 'HOSHI' padahal
 * railnya CC_VAULT, dan menebak rail dari label adalah persis cara membuat operator mengira ia
 * sedang mengemas paket kurir untuk kartu yang sebenarnya harus di-burn di CollectorCrypt.
 */
export const redemptionRail = (r: AdminRedemption): RedemptionRail =>
  r.rail ?? (r.listingId != null ? "HOSHI_DOMESTIC" : "CC_VAULT");

/**
 * POSISI ONGKIR sebuah baris DOMESTIK, untuk dijadikan satu lencana.
 *
 *   NOT_BILLED  belum pernah ada tagihan ongkir sama sekali.
 *   UNPAID      tagihan pernah/sedang terbit, uangnya BELUM mendarat.
 *   IN_FLIGHT   pembayarannya SEDANG diproses (order PAID/FULFILLING) — TUNGGU, jangan majukan.
 *   PAID        ada order SHIPPING FULFILLED → ongkirnya LUNAS.
 *   CLOSED      baris dibatalkan; utang ongkir (kalau ada) hidup di baris PaymentOrder sendiri.
 *
 * SUMBER UTAMANYA `r.ongkir` DARI SERVER (diringkas dari baris PaymentOrder). Cabang berbasis
 * status di bawah HANYA jaring untuk respons backend PRA-B2 yang belum membawa field itu — ia
 * TIDAK PERNAH dipakai kalau servernya sudah mengirimkannya, supaya tidak ada dua sumber
 * kebenaran soal posisi uang.
 *
 * Untuk rail CC fungsi ini mengembalikan null: "ongkir" di sana punya kosakata lain
 * (READY_TO_FUND = Rupiah lunas tapi USDC belum pindah) dan dua kosakata itu tidak boleh dicampur.
 */
export type DomesticOngkir = "NOT_BILLED" | "UNPAID" | "IN_FLIGHT" | "PAID" | "CLOSED";

export const domesticOngkirState = (r: AdminRedemption): DomesticOngkir | null => {
  if (redemptionRail(r) !== "HOSHI_DOMESTIC") return null;
  if (r.status === "CANCELED") return "CLOSED";
  const o = r.ongkir;
  if (o) {
    if (o.paid) return "PAID";
    if (o.inFlight) return "IN_FLIGHT";
    return o.orders.length > 0 ? "UNPAID" : "NOT_BILLED";
  }
  // ── Jaring respons PRA-B2 saja. ──
  switch (r.status) {
    case "AWAITING_PAYMENT":
      return "UNPAID";
    case "PACKING":
    case "SHIPPED":
    case "DELIVERED":
      // fulfilShipping memindahkan AWAITING_PAYMENT → PACKING dan menandai ordernya FULFILLED
      // dalam SATU transaksi, jadi status ini tidak bisa ada tanpa ongkir yang lunas.
      return "PAID";
    case "REQUESTED":
      return r.paymentOrderId ? "UNPAID" : "NOT_BILLED";
    default:
      // Status jalur CC pada baris domestik = data yang tidak mungkin lahir dari kode kita
      // (DOMESTIC_FORBIDDEN_STATUSES di backend). Jangan mengarang posisi uang untuknya.
      return null;
  }
};

/** true = ongkir paket ini BELUM masuk → mengirimnya sekarang berarti Hoshi menanggung ongkirnya. */
export const domesticOngkirUnpaid = (r: AdminRedemption): boolean => {
  const s = domesticOngkirState(r);
  return s === "NOT_BILLED" || s === "UNPAID" || s === "IN_FLIGHT";
};

/**
 * Tabel transisi CADANGAN — dipakai HANYA kalau server tidak mengirim `allowedNextStatuses`
 * (respons PRA-B2). Sejak B2, tabelnya hidup di SATU tempat di backend dan disajikan per baris
 * SUDAH dikurangi pagar ongkir; salinan klien yang menyimpang dari sana adalah persis yang dulu
 * menampilkan "Kemas"/"Kirim" untuk baris domestik yang ongkirnya belum ditagih.
 *
 * JANGAN menambah entri baru di sini. Kalau sebuah transisi baru perlu tombol, ia ditambahkan di
 * backend dan sampai ke layar lewat `allowedNextStatuses`.
 */
const FALLBACK_TRANSITIONS: Partial<Record<RedemptionStatus, RedemptionStatus[]>> = {
  REQUESTED: ["PACKING", "SHIPPED", "CANCELED"],
  PACKING: ["SHIPPED", "CANCELED"],
  SHIPPED: ["DELIVERED"],
  FUNDING: ["RECLAIM_DUE"],
  FUNDED: ["RECLAIM_DUE"],
  RECLAIM_DUE: ["CANCELED"],
  SHIP_FAILED_POST_BURN: ["DELIVERED"],
  IN_TRANSIT: ["DELIVERED"],
};

/** Tombol yang boleh dirender untuk sebuah baris. Server menang; tabel cadangan cuma jaring. */
export const allowedNextStatuses = (r: AdminRedemption): RedemptionStatus[] =>
  r.allowedNextStatuses ?? FALLBACK_TRANSITIONS[r.status] ?? [];

/** Transisi yang ADA tapi ditahan pagar ongkir. [] kalau server tidak melaporkannya. */
export const blockedNextStatuses = (r: AdminRedemption): RedemptionStatus[] =>
  r.blockedNextStatuses ?? [];

export const getAdminRedemptions = (token: string) =>
  api<AdminRedemption[]>("/admin/redemptions", {
    headers: { authorization: `Bearer ${token}` },
  });

/** Tagihan ongkir yang terdampak saat baris DOMESTIK dibatalkan admin (selalu ada, bisa []). */
export type AdminShippingRefundDebt = {
  merchantOrderId: string;
  priceIdr: number;
  statusBefore: string;
  statusAfter: string;
  action: string;
  note?: string | null;
};

/**
 * PATCH status kirim.
 *
 * `tracking` HANYA sah untuk rail HOSHI_DOMESTIC — backend menolak 400 untuk baris CC_VAULT,
 * karena di sana kolom resi MILIK poll shipment CollectorCrypt dan menimpanya tangan akan
 * mengganti nomor resi asli dengan angka karangan tanpa jejak apa pun.
 *
 * `absorbShippingFee` + `note` adalah SATU-SATUNYA cara memajukan baris DOMESTIK dari REQUESTED
 * ke PACKING/SHIPPED tanpa ongkir yang lunas — backend menolak 400 tanpa keduanya, menuntut
 * alasan minimal 10 karakter, dan MENYIMPAN alasannya permanen di kolom `note` baris itu. Bukan
 * "flag paksa" umum: di transisi lain dan di rail CC ia diabaikan.
 */
export const updateRedemptionStatus = (
  id: string,
  status: RedemptionStatus,
  token: string,
  opts?: {
    trackingIds?: string[];
    trackingUrls?: string[];
    absorbShippingFee?: boolean;
    note?: string;
  },
) =>
  api<AdminRedemption & { shippingDebts?: AdminShippingRefundDebt[] }>(
    `/admin/redemptions/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        status,
        ...(opts?.trackingIds?.length ? { trackingIds: opts.trackingIds } : {}),
        ...(opts?.trackingUrls?.length ? { trackingUrls: opts.trackingUrls } : {}),
        ...(opts?.absorbShippingFee ? { absorbShippingFee: true } : {}),
        ...(opts?.note?.trim() ? { note: opts.note.trim() } : {}),
      }),
    },
  );

/** Panjang minimum alasan "ongkir ditanggung Hoshi" — sama dengan OPERATOR_NOTE_MIN di backend. */
export const ABSORB_NOTE_MIN = 10;

/* ═══════════ F4a — TARIF ONGKIR KIRIM DOMESTIK (GET/PUT /admin/shipping/domestic-rates) ═══════════

   Sampai rute ini punya layar, SETIAP pembeli domestik ditagih ANGKA PENAMPUNG yang belum
   diputuskan pemilik produk — dan tidak ada apa pun di dashboard yang mengatakannya. Karena itu
   respons GET-nya membawa lebih dari sekadar baris tabel: `effective` (tier yang BENAR-BENAR
   dipakai jalur bayar hari ini, dari DB maupun dari penampung di kode) dan `actionRequired`
   (keputusan yang belum diambil). Tabel KOSONG bukan berarti "tidak ada yang perlu dilakukan". */

/** Satu baris tarif di tabel `domestic_shipping_rates`. */
export type AdminDomesticRate = {
  id: string;
  /** 'TIER:<NAMA>' | 'STATE:<provinsi>' | '*' (flat nasional). */
  scope: string;
  priceIdr: number;
  active: boolean;
  /** Nama provinsi yang SUDAH dinormalkan server (huruf kecil, tanda baca jadi spasi). */
  provinces: string[];
  /** true = tier PENAMPUNG untuk provinsi tak dikenal. Seharusnya TEPAT SATU yang aktif. */
  fallback: boolean;
  label: string | null;
  /** true = angkanya MASIH PENAMPUNG (belum pernah di-set manusia). */
  placeholder: boolean;
  note: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Tier yang SEDANG dipakai jalur bayar — dari DB kalau ada baris aktif, kalau tidak dari kode. */
export type AdminDomesticEffectiveTier = {
  scope: string;
  label: string | null;
  priceIdr: number;
  provinces: string[];
  fallback: boolean;
  placeholder: boolean;
  from: "DB" | "DEFAULT_TIER";
};

export type AdminDomesticRates = {
  data: AdminDomesticRate[];
  effective: AdminDomesticEffectiveTier[];
  /** Kosong = konfigurasi lengkap. Tidak kosong = pembeli SEDANG ditagih angka sementara. */
  actionRequired: string[];
  /**
   * true ⇔ TIDAK ADA satu pun baris AKTIF di DB → jalur bayar sedang memakai tier PENAMPUNG di
   * kode. Boolean tersendiri DENGAN SENGAJA: sebuah tabel kosong tidak boleh bisa terbaca sebagai
   * "beres" hanya karena `data` berukuran nol. Opsional demi respons backend lama.
   */
  usingDefaults?: boolean;
  /** Jumlah tier yang harganya masih PENAMPUNG. >0 = pembeli ditagih angka yang belum disetujui. */
  placeholderCount?: number;
  /**
   * Batas yang DITEGAKKAN service (assertSaneRate). Form WAJIB memvalidasi dengan angka ini —
   * kalau tidak, operator baru tahu tarifnya ditolak setelah menekan Simpan.
   */
  limits?: {
    minPriceIdr: number;
    maxPriceIdr: number;
    maxProvincesPerTier: number;
    maxScopeLength: number;
  };
  /** Angka PENAMPUNG di kode — yang SEDANG ditagihkan selama `usingDefaults` true. */
  placeholderPricesIdr?: { jawa: number; luarJawa: number };
  nationwideScope: string;
  tierScopePrefix: string;
  stateScopePrefix: string;
  example: {
    jawa: { scope: string; label: string; priceIdr: number; provinces: string[] };
    luarJawa: { scope: string; label: string; priceIdr: number; fallback: boolean };
    satuProvinsi: { scope: string; label: string; priceIdr: number };
  };
  resolution: string;
  note: string;
  /** PUT-nya UPSERT per `scope` → aman di-retry. */
  idempotency?: string;
};

export const getAdminDomesticRates = (token: string) =>
  api<AdminDomesticRates>("/admin/shipping/domestic-rates", {
    headers: { authorization: `Bearer ${token}` },
  });

export type SetDomesticRateInput = {
  scope?: string;
  priceIdr: number;
  /** TIDAK DISEBUT = daftar lama TIDAK diubah. Kirim [] untuk mengosongkan. */
  provinces?: string[];
  fallback?: boolean;
  label?: string;
  active?: boolean;
  note?: string;
};

export type SetDomesticRateResult = {
  rate: AdminDomesticRate;
  /** Peringatan konfigurasi yang dihitung SESUDAH tulisannya (mis. penampung bukan yang termahal). */
  warnings: string[];
  warning: string;
};

/**
 * UPSERT satu TIER (kunci: scope). Berlaku untuk tagihan BERIKUTNYA — tagihan yang sudah terbit
 * memakai nominal yang di-snapshot di baris PaymentOrder-nya. NOL dana treasury: ini hanya
 * nominal Rupiah yang ditagihkan ke pembeli.
 */
export const setAdminDomesticRate = (
  input: SetDomesticRateInput,
  token: string,
) =>
  api<SetDomesticRateResult>("/admin/shipping/domestic-rates", {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/* ═══════════ F4b — STOK HOSHI YANG BELUM BISA DIBELI (sellable=false) ═══════════

   `sellable` default false supaya baris seed/chart-filler tidak bisa dibeli. Stok yang diimpor
   SEBELUM importListings menulis `sellable: true` ikut tertahan di sana: kartunya terpajang, nol
   Rupiah bisa masuk, dan tidak ada apa pun di dashboard yang menjelaskan kenapa.

   RUTE TULISNYA SENGAJA PER-ID (maks 500), BUKAN SAPUAN: bentuk baris seed IDENTIK dengan bentuk
   stok sungguhan (`source=HOSHI` + `sellerId=null` adalah bentuk DEFAULT setiap listing), jadi
   tidak ada predikat otomatis yang bisa membedakan "kartu fisik di rak" dari "chart filler".
   Hanya manusia yang tahu. Karena itu layarnya WAJIB read-first. */

export type AdminUnsellableListing = {
  id: string;
  name: string;
  set: string | null;
  priceIdrx: number;
  status: string;
  source: string;
  sellable: boolean;
  vaultLocation: string | null;
  listedAt: string;
};

export type AdminUnsellableStock = {
  total: number;
  returned: number;
  /** Nilai yang BENAR-BENAR dipakai server sesudah dijepit — bukan yang dikirim klien. */
  limit?: number;
  offset?: number;
  hasMore?: boolean;
  data: AdminUnsellableListing[];
  /** Kosong = tidak ada stok yang tertahan. Tidak kosong = ada kartu yang nol Rupiah bisa masuk. */
  actionRequired?: string[];
  /**
   * "MANUAL_ONLY" — TIDAK ADA predikat otomatis yang bisa memisahkan baris seed dari stok nyata
   * (`source=HOSHI` + `sellerId=null` adalah bentuk DEFAULT setiap listing). Itu sebabnya rute
   * penandanya per-id dan bukan sapuan massal.
   */
  placeholderDetection?: string;
  note: string;
};

/** READ-ONLY. Baca ini DULU sebelum menandai apa pun. */
export const getAdminUnsellableStock = (token: string, limit = 200, offset = 0) =>
  api<AdminUnsellableStock>(
    `/admin/listings/unsellable?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

export type AdminSellableEligible = {
  id: string;
  name: string;
  priceIdrx: number;
  sellable: boolean;
  source: string;
  status: string;
};

export type SetListingsSellableResult = {
  requested: number;
  /** Baris yang BENAR-BENAR berubah. 0 dengan `eligible` terisi = flag-nya memang sudah sesuai. */
  changed: number;
  /** Cocok pagar bentuk (ACTIVE, bukan katalog CC, tanpa penjual user). */
  eligible: AdminSellableEligible[];
  /**
   * Id yang memenuhi pagar bentuk TAPI flag-nya SUDAH sama dengan yang diminta. INI yang
   * membedakan "tidak berubah karena sudah benar" dari "tidak berubah karena ditolak pagar" —
   * tanpanya sebuah `changed: 0` tidak bisa dibedakan dari kegagalan diam-diam, dan menjalankan
   * ulang jadi menakutkan. Opsional demi respons backend lama.
   */
  alreadyCorrect?: string[];
  /** Id yang TIDAK memenuhi pagar bentuk — tidak ada, katalog CC, listing user, atau bukan ACTIVE. */
  skipped: string[];
  warning: string;
};

/**
 * Naikkan/turunkan flag `sellable` pada daftar id EKSPLISIT (maks 500 per panggilan).
 *
 * AMAN DIJALANKAN DUA KALI: tulisannya berpagar `sellable: !sellable`, jadi panggilan kedua
 * mengubah 0 baris dan mengembalikan `changed: 0` — bukan error, dan bukan efek ganda.
 * REVERSIBEL: kirim `sellable: false` untuk membatalkan salah tandai.
 */
export const setAdminListingsSellable = (
  ids: string[],
  sellable: boolean,
  token: string,
) =>
  api<SetListingsSellableResult>("/admin/listings/sellable", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids, sellable }),
  });

export const getAdminListings = (token: string, params?: {
  page?: number; limit?: number; search?: string; status?: string; vault?: string; sort?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.status) q.set("status", params.status);
  if (params?.vault) q.set("vault", params.vault);
  if (params?.sort) q.set("sort", params.sort);
  const qs = q.toString();
  return api<PaginatedResult<AdminListing>>(`/admin/listings${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

/** Distinct vault locations across all listings — populates the "filter by vault"
 *  dropdown on the admin listings page. */
export const getAdminListingVaults = (token: string) =>
  api<string[]>("/admin/listings/vaults", {
    headers: { authorization: `Bearer ${token}` },
  });

export const getAdminListing = (id: string, token: string) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${token}` },
  });

export const createAdminListing = (data: Record<string, unknown>, token: string) =>
  api<AdminListing>("/admin/listings", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

export const updateAdminListing = (id: string, data: Record<string, unknown>, token: string) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

export const deleteAdminListing = (id: string, token: string) =>
  api<{ deleted: boolean; id: string }>(`/admin/listings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });

/** Activate / deactivate a listing (ACTIVE ⇄ CANCELLED). Deactivating hides it
 *  from the marketplace but keeps the row, so it can be re-activated later. A SOLD
 *  listing is rejected by the backend. */
export const setAdminListingStatus = (
  id: string,
  status: "ACTIVE" | "CANCELLED",
  token: string,
) =>
  api<AdminListing>(`/admin/listings/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });

export const getAdminCards = (token: string, params?: {
  page?: number; limit?: number; search?: string; set?: string; rarity?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.set) q.set("set", params.set);
  if (params?.rarity) q.set("rarity", params.rarity);
  const qs = q.toString();
  return api<PaginatedResult<AdminCard>>(`/admin/cards${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const submitContactMessage = (data: {
  listingId?: string; listingName: string; senderName: string; senderEmail: string; phone?: string; text: string;
}) => api("/admin/contact-messages", { method: "POST", body: JSON.stringify(data) });

export type AdminDailyStats = {
  dailyListings: { date: string; count: number }[];
  dailyRevenue: { date: string; amount: number }[];
  statusDistribution: { status: string; count: number }[];
  topListings: { id: string; name: string; views: number; priceIdrx: number }[];
  conversionRate: number;
};

export type ImportResult = {
  imported: number;
  items: AdminListing[];
};

export const getAdminDailyStats = (token: string, days = 365) =>
  api<AdminDailyStats>(`/admin/stats/daily?days=${days}`, {
    headers: { authorization: `Bearer ${token}` },
  });

export const importAdminListings = (items: Record<string, unknown>[], token: string, sellerOverride?: string) =>
  api<ImportResult>("/admin/listings/import", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ items, sellerOverride }),
  });

/* ---------- CollectorCrypt catalog sync ---------- */

export type CcSyncParams = {
  categories?: string;
  maxPages?: number;
  step?: number;
  listPriceMin?: number;
  listPriceMax?: number;
  markBuyback?: boolean;
};

export type CcSyncResult = {
  pagesFetched: number;
  found: number;
  created: number;
  updated: number;
  skipped: { grader: number; price: number; invalid: number };
  buybackMarked: number;
  usdIdrRate: number;
};

/** Pull CollectorCrypt's public catalog into our marketplace (source=COLLECTORCRYPT).
 *  Re-running refreshes metadata but never touches admin-edited prices. */
export const ccSyncListings = (params: CcSyncParams, token: string) =>
  api<CcSyncResult>("/admin/cc-sync", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  });

/* ---------- Vault / Inventory (custody location) ---------- */

export type AdminVaultItem = {
  id: string;
  serialNumber: string | null;
  status: string;
  storageProvider: string;
  vaultLocation: string | null;
  cardId: string;
  cardName: string;
  cardImage: string | null;
  cardSet: string | null;
  ownerWallet: string | null;
  ownerLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

// Cukup HOSHI & COLLECTORCRYPT untuk sekarang. PWCC/OTHER dihapus dari UI:
// Hoshi adalah front-end di atas CollectorCrypt — custody kartu 100% milik CC,
// jadi lokasi/provider bersifat informational (read-only), bukan dikelola Hoshi.
export const STORAGE_PROVIDERS = ["HOSHI", "COLLECTORCRYPT"] as const;
export const VAULT_STATUSES = ["STORED", "MINTING", "MINTED", "REDEEMED"] as const;

export const getAdminVaultItems = (token: string, params?: {
  page?: number; limit?: number; status?: string; provider?: string; search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.status) q.set("status", params.status);
  if (params?.provider) q.set("provider", params.provider);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return api<PaginatedResult<AdminVaultItem>>(`/admin/vault-items${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const updateAdminVaultItem = (
  id: string,
  data: { storageProvider?: string; vaultLocation?: string },
  token: string,
) =>
  api<AdminVaultItem>(`/admin/vault-items/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });

/* ---------- Users ---------- */

export type AdminUser = {
  id: string;
  walletAddress: string;
  displayName: string | null;
  role: string;
  email: string | null;
  createdAt: string;
  listings: number;
  bought: number;
  offers: number;
  packs: number;
};

export const getAdminUsers = (token: string, params?: {
  page?: number; limit?: number; search?: string; role?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.search) q.set("search", params.search);
  if (params?.role) q.set("role", params.role);
  const qs = q.toString();
  return api<PaginatedResult<AdminUser>>(`/admin/users${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const getAdminActivity = (token: string, params?: {
  page?: number; limit?: number; action?: string; search?: string;
}) => {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.action) q.set("action", params.action);
  if (params?.search) q.set("search", params.search);
  const qs = q.toString();
  return api<PaginatedResult<AdminActivityItem>>(`/admin/activity${qs ? "?" + qs : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN (consignment) — sisi OPERATOR.

   Layar yang memakainya berdiri di depan pemilik kartu, biasanya sambil memegang ponsel. Satu
   aturan dipegang di seluruh bagian ini: apa pun yang menyangkut "Hoshi sudah memegang kartunya"
   ditulis lewat SATU rute (`acceptConsignmentCustody`), satu kali, dan tidak ada rute mana pun di
   sini yang bisa membatalkan fakta itu. Berakhirnya custody adalah fakta KEDUA (release / lost),
   bukan penghapusan fakta pertama; koreksi catatan pun ditulis sebagai baris audit BARU, bukan
   sebagai kolom yang diam-diam berubah isinya.

   ⚠️ Kartu titipan BUKAN stok Hoshi. Tidak ada rute di bagian ini yang menyentuh `sellable`,
   treasury, escrow, USDC atau SOL — nol aset kripto bergerak dari layar operator.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Relasi user ringkas yang disertakan rute titipan (`select` di server). */
export type ConsignmentUserRef = {
  id: string;
  displayName: string | null;
  walletAddress: string;
};

/**
 * Satu baris titipan di konsol admin.
 *
 * Kolom mentahnya ada di `ConsignmentBase` (dipakai bersama layar pemilik). Yang ditambahkan di
 * sini hanyalah relasi yang MEMANG dikirim rute admin. Ketiganya opsional karena dua rute admin
 * mengirim kelengkapan berbeda:
 *   • `GET /admin/consignments`      → consignor + photos ringkas + listing ringkas (tanpa events)
 *   • `GET /admin/consignments/:id`  → + receivedBy + events + baris listing utuh
 */
export type AdminConsignment = ConsignmentBase & {
  consignor?: ConsignmentUserRef;
  receivedBy?: ConsignmentUserRef | null;
  listing?: ConsignmentListingRef | null;
};

/**
 * Jawaban dua rute yang MENETAPKAN HARGA (pajang & ubah harga).
 *
 * `belowReserveWarning` adalah kalimat SERVER, berisi kedua angkanya, dan kalimat yang PERSIS SAMA
 * sudah ditulis ke baris audit titipan ini. Perubahannya TETAP dilakukan — ini peringatan, bukan
 * penolakan — jadi layar wajib menampilkannya SESUDAH berhasil, bukan memperlakukannya sebagai
 * kegagalan. null = harganya tidak di bawah lantai yang disepakati (atau tidak ada lantai).
 */
export type AdminConsignmentPriced = AdminConsignment & {
  belowReserveWarning?: string | null;
};

/** Satu baris "perlu tindakan" — DIHITUNG SERVER, dikirim terpisah dari barisnya. */
export type AdminConsignmentTodo = {
  id: string;
  cardName: string;
  /** Kalimat siap-tampil. Jangan ditulis ulang di klien. */
  reasons: string[];
};

/**
 * Jawaban `GET /admin/consignments`.
 *
 * `actionRequired` adalah inti layarnya, dan ia DIHITUNG SERVER: titipan yang menggantung
 * (disepakati tapi kartunya tak pernah datang), permintaan kembali yang belum diserahkan, dan
 * kartu terjual yang masih di rak. Klien TIDAK menurunkan daftar keduanya sendiri — barang orang
 * lain yang tergeletak tanpa ada yang melihat adalah cara paling umum sebuah janji custody
 * diingkari tanpa siapa pun berniat begitu, dan dua salinan aturan berarti yang satu akan diam.
 */
/**
 * Satu kartu yang ADA di catatan kami tapi BELUM punya akun pemilik.
 *
 * DIKIRIM TERPISAH dari `actionRequired`, dan perbedaannya penting: `actionRequired` baru menyala
 * setelah ambang waktu terlewat, sedangkan daftar ini memuat SEMUANYA sejak hari pertama. Pertanyaan
 * "kartu siapa saja yang saya pegang tanpa tahu pemiliknya" harus bisa dijawab SEKARANG, bukan
 * seminggu lagi.
 *
 * Tiap baris membawa nama & telepon dari snapshot serah-terima — satu-satunya cara menghubungi
 * orangnya selama belum ada akun — plus keadaan kode klaimnya, supaya operator tahu apakah yang
 * dibutuhkan MENELEPON atau MENERBITKAN ULANG.
 */
export type AwaitingOwnerRow = {
  id: string;
  cardName: string;
  status: string;
  /** Kartunya benar-benar di rak Hoshi (bukan sekadar kesepakatan yang dicatat). */
  heldByHoshi: boolean;
  storageLocation: string | null;
  receivedAtPlace: string;
  consignorNameAtIntake: string;
  consignorPhoneAtIntake: string;
  claimCodeIssuedAt: string | null;
  claimCodeExpiresAt: string | null;
  claimCodeExpired: boolean;
  /** Tidak ada kode hidup sama sekali → satu-satunya jalan adalah menerbitkan yang baru. */
  needsClaimCode: boolean;
  createdAt: string;
};

export type AdminConsignmentList = {
  total: number;
  rows: AdminConsignment[];
  actionRequired: AdminConsignmentTodo[];
  /** Kartu yang menunggu pemiliknya — DIHITUNG SERVER, sejak hari pertama. */
  awaitingOwner: AwaitingOwnerRow[];
  awaitingOwnerCount: number;
};

/** Aksi operator pada satu baris titipan. Satu nama = satu rute = satu tombol. */
export type ConsignmentAction =
  | "PHOTO"
  | "ACCEPT"
  | "LIST"
  | "PRICE"
  | "RETURN"
  | "RELEASE"
  | "LOST"
  | "COMPENSATE"
  | "CORRECTION";

/**
 * Aksi yang MASUK AKAL untuk satu baris, diturunkan dari status.
 *
 * Ini cermin tabel transisi yang ditegakkan `ConsignmentService`, dan ia ada supaya operator
 * tidak ditawari tombol yang pasti dijawab 409. Server tetap yang memutuskan; kalau keduanya
 * pernah berbeda, YANG BENAR ADALAH SERVER.
 *
 * FAIL-CLOSED: status yang tidak dikenal hanya menyisakan aksi yang tidak mengubah keadaan
 * (tambah foto, tulis koreksi) — bukan semuanya.
 *
 * "BELUM DIKLAIM" SENGAJA TIDAK IKUT DIHITUNG DI SINI, walaupun ia juga menghalangi LIST. Kalau
 * dilipat ke sini, kartu yang belum diklaim akan kehilangan panel "Pajang" sepenuhnya — dan
 * operator tidak pernah membaca alasannya. Presedennya kartu MENTAH: aksinya tetap ditawarkan,
 * panelnya yang menjelaskan kenapa tombolnya belum boleh ditekan. Yang menolak sungguhan tetap
 * server.
 */
export const consignmentAllowedActions = (c: AdminConsignment): ConsignmentAction[] => {
  switch (c.status) {
    // Kartunya belum berpindah tangan: bukti boleh bertambah, harga masih bisa disepakati ulang,
    // lalu terima — atau batalkan (RETURN pada INTAKE = membatalkan kesepakatan).
    case "INTAKE":
      return ["PHOTO", "ACCEPT", "PRICE", "RETURN", "CORRECTION"];
    case "IN_CUSTODY":
      return ["PHOTO", "LIST", "PRICE", "RETURN", "RELEASE", "LOST", "CORRECTION"];
    // RELEASE tidak ada di sini dengan sengaja: dari LISTED, server menuntut listing-nya
    // diturunkan lebih dulu (lewat RETURN), baru kartunya boleh dicatat keluar.
    case "LISTED":
      return ["PHOTO", "PRICE", "RETURN", "LOST", "CORRECTION"];
    // Kartu sudah milik pembeli: pemilik lama tidak bisa menariknya. Tinggal keluar, atau hilang.
    case "SOLD":
      return ["PHOTO", "RELEASE", "LOST", "CORRECTION"];
    // Hilang di tangan kita: satu-satunya langkah yang tersisa adalah ganti rugi ke pemiliknya.
    case "LOST":
      return ["PHOTO", "COMPENSATE", "CORRECTION"];
    default:
      return ["PHOTO", "CORRECTION"];
  }
};

/**
 * Alasan pelepasan yang SAH untuk sebuah baris — diturunkan dari statusnya, bukan dipilih bebas.
 *
 * Server hanya menerima WITHDRAWN dari IN_CUSTODY dan SHIPPED_TO_BUYER dari SOLD. Menyodorkan
 * dropdown berisi keduanya hanya menambah satu cara untuk mendapat 409; yang benar adalah
 * memberi tahu operator apa yang sedang ia catat.
 */
export const consignmentReleaseReason = (
  c: AdminConsignment,
): { value: "WITHDRAWN" | "SHIPPED_TO_BUYER"; label: string } | null => {
  if (c.status === "IN_CUSTODY")
    return { value: "WITHDRAWN", label: "Dikembalikan ke pemiliknya" };
  if (c.status === "SOLD")
    return { value: "SHIPPED_TO_BUYER", label: "Diserahkan / dikirim ke pembeli" };
  return null;
};

/**
 * Daftar titipan. `filter: "AWAITING_OWNER"` menyaring DI SERVER ke kartu yang pemiliknya belum
 * tertaut — definisi yang sama dengan `awaitingOwner` di jawabannya, jadi daftar dan hitungannya
 * tidak bisa melenceng.
 *
 * Layar daftar hari ini menarik SEMUANYA sekali lalu menyaring di klien memakai `awaitingOwner`
 * (jumlah titipan diukur dalam puluhan — kartu FISIK yang diambil satu per satu), jadi `filter`
 * disediakan untuk pemanggil yang memang hanya butuh irisan itu.
 */
export const getAdminConsignments = (
  token: string,
  status?: string,
  filter?: "AWAITING_OWNER",
) => {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (filter) q.set("filter", filter);
  const qs = q.toString();
  return api<AdminConsignmentList>(`/admin/consignments${qs ? `?${qs}` : ""}`, {
    headers: { authorization: `Bearer ${token}` },
  });
};

export const getAdminConsignment = (id: string, token: string) =>
  api<AdminConsignment>(`/admin/consignments/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });

/** Satu foto yang dikirim ke server. `url` sudah berupa hasil unggah (`POST /admin/upload`). */
export type ConsignmentPhotoInput = {
  url: string;
  kind: string;
  note?: string;
};

/**
 * Catatan kesepakatan awal — baris `INTAKE`.
 *
 * Membuat baris ini TIDAK berarti Hoshi memegang kartunya. Sampai `acceptConsignmentCustody`
 * dipanggil, baris ini tidak bisa dipajang oleh apa pun — dan justru urutan itulah yang menutup
 * risiko "kartunya ternyata sudah dijual sendiri ke orang lain".
 */
export type CreateConsignmentInput = {
  /**
   * Akun Hoshi yang memiliki kartu — DIHILANGKAN kalau pemiliknya belum punya akun.
   *
   * Kalau diisi, ia HARUS id akun yang dipilih operator dari hasil pencarian, bukan sesuatu yang
   * diketik. Kalau dikosongkan, server menerbitkan KODE KLAIM (lihat `claimCode` di jawaban) yang
   * dibawa pulang pemiliknya, dan baris ini tidak bisa dipajang sampai kode itu dipakai.
   *
   * ⚠️ TIDAK ADA field email di sini, dan itu disengaja: `User.email` di backend tidak unik dan
   * tidak pernah diverifikasi — hanya `walletAddress` yang `@unique`. Menyambungkan kartu ke
   * "siapa pun yang mengaku memakai alamat email itu" adalah cara menyerahkan barang orang ke
   * orang lain.
   */
  consignorId?: string;
  consignorNameAtIntake: string;
  consignorPhoneAtIntake: string;
  /** "KTP" | "SIM" | "PASPOR" — opsional. */
  consignorIdKind?: string;
  /** TEPAT empat digit terakhir. Jangan pernah kirim nomor identitas lengkap. */
  consignorIdLast4?: string;
  receivedAtPlace: string;

  cardName: string;
  cardSet?: string;
  cardNumber?: string;
  language?: string;
  tcg?: string;
  /** "PSA" | "TAG" | "CGC" | "BGS". Kosong = kartu mentah (boleh dititipkan, belum dipajang). */
  grader?: string;
  certNumber?: string;
  gradeLabel?: string;
  gradeScore?: number;
  /** WAJIB, minimal 10 karakter — kalimat yang jadi tumpuan kalau ada sengketa. */
  conditionNote: string;
  rawCondition?: string;

  askPriceIdr: number;
  reservePriceIdr?: number;
  /** Komisi yang DISEPAKATI hari itu (500 = 5%). Dibekukan di baris titipan. */
  commissionBps?: number;
  agreementRef?: string;
  intakeReceiptRef?: string;
  /** Foto boleh ikut sekarang atau menyusul sebelum serah terima dicatat. */
  photos?: ConsignmentPhotoInput[];
};

/**
 * Jawaban yang MEMBAWA KODE KLAIM.
 *
 * `claimCode` ada di sini dan TIDAK di `AdminConsignment`, karena ia bukan kolom yang bisa dibaca
 * ulang: server menyimpan SHA-256-nya (`claimCodeHash`), bukan kodenya. Teks kodenya hidup tepat
 * sekali — di body respons rute yang menerbitkannya — dan tidak pernah masuk log maupun baris
 * audit. Konsekuensi untuk layar operator: kalau kodenya hilang sebelum sempat diberikan,
 * satu-satunya jalan adalah MENERBITKAN YANG BARU, bukan membuka lagi baris lama.
 */
export type AdminConsignmentWithClaimCode = AdminConsignment & {
  /**
   * Kode SUDAH BERFORMAT dari server (`4T9KM-2X7PQ`). Tidak ada kalau barisnya memang sudah punya
   * akun pemilik.
   */
  claimCode?: string | null;
  /** Umur kode sejak diterbitkan, dalam hari. Untuk kalimat; tanggal pastinya di baris. */
  claimCodeExpiresInDays?: number;
  /** Kalimat instruksi dari server untuk operator. Ditampilkan apa adanya kalau dipakai. */
  claimCodeNote?: string;
  /** true kalau ini MENGGANTIKAN kode sebelumnya (yang mati sejak detik itu). */
  reissued?: boolean;
};

export const createAdminConsignment = (input: CreateConsignmentInput, token: string) =>
  api<AdminConsignmentWithClaimCode>("/admin/consignments", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Terbitkan / terbitkan ULANG kode klaim untuk titipan yang belum punya akun pemilik.
 *
 * Kenapa "terbitkan ulang" dan bukan "lihat lagi": server menyimpan hash kodenya, jadi kode yang
 * sudah diberikan memang tidak bisa dibaca kembali oleh siapa pun — termasuk oleh Hoshi. Rute ini
 * membuat kode BARU dan MENIMPA hash yang lama dalam satu tulisan, jadi kertas lama langsung mati
 * dan tidak pernah ada dua kode hidup untuk satu titipan.
 *
 * `note` WAJIB (minimal 10 karakter) dan disimpan permanen sebagai baris audit. Itu bukan
 * formalitas: penerbitan ulang MEMATIKAN kode yang sedang dipegang seseorang, jadi "kenapa" harus
 * selalu punya jawaban tertulis ("tanda terima hilang, dikonfirmasi lewat telepon ke nomor yang
 * tercatat saat serah-terima").
 *
 * Ditolak server (409) untuk baris yang SUDAH tertaut ke sebuah akun: tidak ada lagi yang bisa
 * dibuka dengan kode, dan menerbitkannya hanya akan membuat jalan kedua ke kartu orang.
 */
export const issueAdminConsignmentClaimCode = (id: string, note: string, token: string) =>
  api<AdminConsignmentWithClaimCode>(`/admin/consignments/${id}/claim-code`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

/* ─────────────────── mencari pemilik kartu (tanpa pernah menebak) ─────────────────── */

/** Satu kandidat pemilik. Bentuknya dari `GET /admin/consignments/consignor-search`. */
export type ConsignorCandidate = {
  id: string;
  /** Alamat UTUH, bukan bentuk pendek — operator sedang membandingkannya dengan layar orang lain. */
  walletAddress: string;
  displayName: string | null;
  email: string | null;
  createdAt: string;
  /** Berapa titipan yang sudah pernah tertaut ke akun ini. */
  consignmentCount: number;
  /** Cocok PERSIS pada satu-satunya kolom unik di Hoshi. Ini identitas; sisanya kemiripan. */
  exactWalletMatch: boolean;
  /** Kolom mana yang cocok: "walletAddress" | "displayName" | "email". */
  matchedOn: string[];
};

/**
 * Jawaban pencarian pemilik — SELALU daftar, TIDAK PERNAH satu jawaban.
 *
 * Bentuk ini adalah inti keamanannya, bukan kenyamanannya. Di backend hanya `walletAddress` yang
 * `@unique`: `displayName` boleh sama persis untuk sepuluh orang, dan `email` bukan hanya tidak
 * unik — ia TIDAK PERNAH DIVERIFIKASI. Rute yang memilihkan satu kandidat akan, cepat atau lambat,
 * menautkan kartu senilai puluhan juta ke orang yang salah, dan melakukannya diam-diam.
 */
export type ConsignorSearchResult = {
  query: string;
  total: number;
  /** true = ada kandidat yang TIDAK ditampilkan. Persempit dulu; jangan memilih dari daftar yang tidak lengkap. */
  truncated: boolean;
  /** true = lebih dari satu kandidat. UI WAJIB memaksa operator memilih sendiri. */
  ambiguous: boolean;
  matches: ConsignorCandidate[];
  /** Kalimat dari server untuk operator. Ditampilkan apa adanya. */
  advice: string;
};

/**
 * Cari calon pemilik. TIDAK MENULIS APA PUN, dan tidak pernah menjawab "ini orangnya".
 *
 * Minimal 3 karakter (server menolak di bawah itu dengan 400 yang menjelaskan).
 */
export const searchAdminConsignors = (q: string, token: string) =>
  api<ConsignorSearchResult>(
    `/admin/consignments/consignor-search?q=${encodeURIComponent(q)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

/**
 * ADMIN MENAUTKAN akun pemilik ke titipan yang belum bertuan — Path A yang datang terlambat.
 *
 * Untuk keadaan yang benar-benar terjadi: pemiliknya akhirnya membuat akun tapi kertas kodenya
 * hilang, atau ia datang ke kantor membawa tanda terima bertanda tangannya. `note` WAJIB dan
 * menjawab "DARI MANA KAMU TAHU INI ORANGNYA" — itu satu-satunya hal yang tersisa kalau penautan
 * ini dipersoalkan berbulan-bulan kemudian.
 *
 * `consignorId` HARUS datang dari `searchAdminConsignors`, dipilih operator sendiri. Server
 * menolak penautan di atas baris yang sudah punya pemilik: kartu orang tidak boleh bisa berpindah
 * pemilik lewat satu panggilan admin yang salah ketik.
 */
export const linkAdminConsignor = (
  id: string,
  input: { consignorId: string; note: string },
  token: string,
) =>
  api<AdminConsignment>(`/admin/consignments/${id}/link-consignor`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Tambah foto bukti. APPEND-ONLY: tidak ada rute ubah/hapus, dan itu disengaja — bukti yang bisa
 * direvisi diam-diam bukan bukti, baik untuk pemilik kartu maupun untuk Hoshi.
 *
 * Mengembalikan BARIS TITIPAN yang sudah diperbarui (bukan barisan foto), jadi pemanggil
 * memakainya apa adanya sebagai state terbaru.
 */
export const addAdminConsignmentPhotos = (
  id: string,
  photos: ConsignmentPhotoInput[],
  token: string,
) =>
  api<AdminConsignment>(`/admin/consignments/${id}/photos`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ photos }),
  });

/**
 * ══ FAKTA YANG MENENTUKAN SEGALANYA ══
 * "Kartunya ADA DI TANGAN SAYA sekarang."
 *
 * Ditulis SEKALI, oleh orang yang benar-benar menerimanya (server mencatat pemanggilnya sebagai
 * penerima), dan TIDAK PERNAH dihapus oleh rute mana pun. Sesudah ini kartu boleh dipajang;
 * sebelum ini tidak ada apa pun yang boleh dipajang.
 *
 * Catatan kondisi TIDAK dikirim di sini: ia ditulis saat intake dan tidak bisa ditimpa. Kalau ada
 * yang perlu diluruskan, jalannya `addAdminConsignmentCorrection` — supaya koreksi terlihat
 * sebagai koreksi.
 */
export const acceptConsignmentCustody = (
  id: string,
  input: {
    storageLocation: string;
    intakeReceiptRef?: string;
    photos?: ConsignmentPhotoInput[];
    note?: string;
  },
  token: string,
) =>
  api<AdminConsignment>(`/admin/consignments/${id}/accept-custody`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Terbitkan listing untuk kartu yang SUDAH di tangan Hoshi.
 *
 * Server membuat baris `Listing` dan menulis `consignmentId`-nya di dalam transaksi yang sama
 * dengan klaim IN_CUSTODY→LISTED — jadi listing titipan tidak bisa lahir sebelum custody tercatat.
 *
 * BATAS SLICE 1: kartu MENTAH (tanpa grader) ditolak, karena kolom grader pada listing hanya
 * mengenal PSA/TAG/CGC/BGS dan mengisinya berarti memberi label palsu pada kartu orang lain.
 */
export const listAdminConsignment = (
  id: string,
  input: {
    image: string;
    imageBack?: string;
    priceIdrx?: number;
    expectedValueIdrx?: number;
    rarity?: string;
    era?: string;
    element?: string;
    category?: string;
  },
  token: string,
) =>
  api<AdminConsignmentPriced>(`/admin/consignments/${id}/listing`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Ubah harga pajang.
 *
 * Lewat rute KHUSUS (bukan PATCH listing biasa) karena harga adalah bagian dari perjanjian yang
 * ditandatangani pemilik kartu: server menulis `askPriceIdr` di baris titipan DAN `priceIdrx` di
 * listing-nya dalam satu transaksi, dan ALASANNYA disimpan permanen sebagai baris audit.
 */
export const setAdminConsignmentPrice = (
  id: string,
  input: { askPriceIdr: number; note: string },
  token: string,
) =>
  api<AdminConsignmentPriced>(`/admin/consignments/${id}/price`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Pemilik minta kartunya kembali (disampaikan langsung ke operator).
 *
 * Rute yang SAMA dengan tombol pemilik di /titipan. Efeknya tergantung status: dari INTAKE ia
 * membatalkan kesepakatan; dari IN_CUSTODY ia mencatat permintaannya; dari LISTED ia menurunkan
 * listing (`ACTIVE → CANCELLED`) dalam satu klaim atomik. Kalau kartunya TERJUAL lebih dulu,
 * klaim itu kalah dan server menolak — tidak ada jalan di mana pembeli dan pemilik lama sama-sama
 * menang. GRATIS: nol Rupiah bergerak di jalur ini.
 */
export const requestAdminConsignmentReturn = (
  id: string,
  token: string,
  note?: string,
  /**
   * KE MANA kartunya pulang, dan siapa yang menanggung ongkirnya.
   *
   * Ditanyakan DI SINI karena inilah momen paling murah untuk menanyakannya: pemiliknya sedang
   * bicara dengan operator. Sesudah teleponnya ditutup, melengkapinya berarti menelepon kembali
   * — dan itulah bagaimana sebuah kartu berakhir tercatat "ditarik" berminggu-minggu tanpa
   * pernah dikirim ke mana pun.
   *
   * OPSIONAL, dan opsionalnya disengaja: permintaan "saya mau kartu saya kembali" tidak boleh
   * bisa gagal karena sebuah kode pos. Yang TIDAK opsional adalah alamat pada saat kartunya
   * ditandai keluar — server menolaknya di sana.
   *
   * TIDAK BERLAKU untuk baris INTAKE (kartunya tidak pernah berpindah tangan); server menolak,
   * bukan mengabaikannya diam-diam.
   */
  returnPlan?: ConsignmentReturnPlan,
) =>
  api<AdminConsignment>(`/admin/consignments/${id}/withdraw`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      ...(note ? { note } : {}),
      ...(returnPlan ? { returnPlan } : {}),
    }),
  });

/**
 * Kartu FISIK keluar dari Hoshi — kembali ke pemiliknya (WITHDRAWN, dari IN_CUSTODY) atau ke
 * pembeli (SHIPPED_TO_BUYER, dari SOLD).
 *
 * Ini fakta kedua (`custodyReleasedAt`), bukan pembatalan fakta pertama. Sesudah ini baris
 * titipan tidak bisa dipajang, dijual, atau dikirim oleh apa pun. Kartu HILANG punya rutenya
 * sendiri, supaya "hilang" tidak pernah bisa tercatat diam-diam sebagai pengembalian biasa.
 *
 * ── UNTUK `WITHDRAWN`: SERVER MENOLAK KALAU KITA TIDAK TAHU KE MANA KARTUNYA PERGI ───────────
 *
 * Kurir menuntut alamat LENGKAP (dicatat di rute penarikan, atau dikirim lagi di sini lewat
 * `returnPlan`) DAN nama kurir + nomor resi. Ambil sendiri menuntut catatan SIAPA yang mengambil.
 * Penolakannya berkode `CONSIGNMENT_RETURN_INCOMPLETE` dan kalimatnya menyebut apa yang kurang —
 * tampilkan apa adanya, jangan ditulis ulang di sini.
 *
 * Kalau ditolak, TIDAK ADA yang berubah: kartunya tetap tercatat di rak Hoshi. Itu arah gagal
 * yang benar — kartu yang masih ada di rak tidak boleh bisa "selesai".
 *
 * `SHIPPED_TO_BUYER` tidak tersentuh aturan itu: resi pengiriman ke pembeli hidup di jalur kirim
 * fisik (`CardRedemption`), bukan di sini.
 */
export const releaseAdminConsignment = (
  id: string,
  input: {
    releaseReason: "WITHDRAWN" | "SHIPPED_TO_BUYER";
    note: string;
    releaseReceiptRef?: string;
    /** Rencana pengembalian, kalau baru dicatat sekarang (pemiliknya datang tanpa pemberitahuan). */
    returnPlan?: ConsignmentReturnPlan;
    /** WAJIB berpasangan untuk metode COURIER. */
    returnCourier?: string;
    returnTrackingNo?: string;
    /** WAJIB untuk metode PICKUP: nama orang yang benar-benar berdiri di depan Anda. */
    returnPickedUpBy?: string;
  },
  token: string,
) =>
  api<AdminConsignment>(`/admin/consignments/${id}/release`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Kartu HILANG atau RUSAK saat ada di penyimpanan Hoshi.
 *
 * Jalan keluar yang jujur, dan ia harus ada: tanpa rute ini satu-satunya cara "menyelesaikan"
 * baris seperti itu adalah berpura-pura kartunya masih ada. Server menurunkan listing-nya juga
 * dalam transaksi yang sama, jadi kartu yang hilang tidak bisa terus dijual.
 *
 * GANTI RUGI TIDAK OTOMATIS: rute ini tidak memindahkan uang sepeser pun.
 */
export const markAdminConsignmentLost = (id: string, note: string, token: string) =>
  api<AdminConsignment>(`/admin/consignments/${id}/lost`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

/**
 * Jawaban SUKSES ganti rugi. `credited` HANYA pernah `true`.
 *
 * Dulu baris kedua dijawab `{ credited: false }` dengan HTTP 200, dan layar menampilkan toast
 * hijau "Ganti rugi tercatat di saldo pemilik" sambil NOL rupiah bergerak. Sekarang keadaan itu
 * terbit sebagai 409. `compensationIdr` adalah nominal yang BENAR-BENAR dikreditkan — dibaca
 * server dari `askPriceIdr` (angka di struk), bukan dari body permintaan — jadi layar menampilkan
 * apa yang TERJADI, bukan apa yang diminta.
 */
export type AdminConsignmentCompensated = AdminConsignment & {
  credited: true;
  compensationIdr: number;
};

/**
 * Ganti rugi ke pemilik kartu yang HILANG di tangan Hoshi — lewat ledger saldo yang sudah ada.
 *
 * ══ NOMINALNYA TIDAK DIKETIK OPERATOR ══
 * Dasarnya `askPriceIdr`: "Harga jual yang disepakati" yang TERCETAK di struk serah terima dua
 * lembar yang ditandatangani kedua pihak. Server membacanya sendiri dari baris titipan.
 *
 * `amountIdr` di sini KONFIRMASI, bukan perintah: kalau dikirim dan BERBEDA dari `askPriceIdr`,
 * server menolak 400 yang menyebut kedua angkanya. Layar operator tetap mengirimkannya — bukan
 * dari kotak isian (tidak ada lagi), melainkan dari angka yang SEDANG DITAMPILKAN di layar itu.
 * Gunanya persis satu: kalau baris yang dimuat layar sudah basi (harganya berubah sejak halaman
 * ini dibuka), yang terjadi adalah penolakan yang menyebut kedua angka — bukan pembayaran diam-
 * diam sebesar angka yang tidak pernah dilihat operator.
 *
 * TIGA PENOLAKAN yang WAJIB dibaca sebagai KEGAGALAN oleh pemanggil (semuanya melempar, jadi
 * tidak ada jalan di mana layar bisa menampilkan hijau sambil nol rupiah bergerak):
 *   • 409 "SUDAH TERJUAL …"      → yang wajib dipulihkan PEMBELI; utangnya sudah dicatat otomatis
 *                                  sebagai REFUND_DUE pada order pembayarannya.
 *   • 409 "SUDAH pernah tercatat" → menyebut nominal, penerima, dan tanggalnya. Nol rupiah bergerak.
 *   • 400 "BERBEDA dari harga jual yang disepakati" → angka di layar bukan angka di server.
 * Ketiganya ConflictException/BadRequestException BIASA tanpa kode kontrak — bercabanglah pada
 * `AdminApiError.status` + teks pesannya, jangan mengarang kode yang tidak dikirim server.
 */
export const compensateAdminConsignment = (
  id: string,
  input: { amountIdr?: number; note: string },
  token: string,
) =>
  api<AdminConsignmentCompensated>(`/admin/consignments/${id}/compensate`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });

/**
 * Koreksi catatan intake.
 *
 * TIDAK menimpa kolom apa pun — ditulis sebagai baris audit BARU, supaya koreksi TERLIHAT sebagai
 * koreksi. Catatan kondisi yang bisa diubah diam-diam sesudah sengketa dimulai tidak ada harganya
 * sebagai bukti, bagi kedua pihak.
 */
export const addAdminConsignmentCorrection = (id: string, note: string, token: string) =>
  api<AdminConsignment>(`/admin/consignments/${id}/correction`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ note }),
  });

/* ─────────────────────────── KOREKSI LABEL (menimpa kolomnya) ─────────────────────────── */

/**
 * Field LABEL yang boleh dikoreksi. SEMUANYA opsional; minimal SATU wajib ada (ditegakkan server
 * supaya pesannya bisa menjelaskan garis bukti/label, bukan sekadar "validation failed").
 *
 * ⚠️ ARTI TIGA NILAI YANG BERBEDA, dan salah membacanya berarti menghapus kolom orang:
 *   • field TIDAK ADA di objek  → tidak disentuh
 *   • string KOSONG ("")        → KOSONGKAN kolomnya (koreksi yang benar kadang berarti menghapus:
 *                                 nomor sertifikat yang diketik untuk kartu yang ternyata mentah)
 *   • ada isinya                → timpa dengan nilai itu
 * `cardName` DIKECUALIKAN dari string kosong: ia judul publik kartunya dan server menolaknya.
 *
 * `gradeScore` TIDAK BISA DIKOSONGKAN lewat rute ini (server hanya menerima angka 0–10; tidak ada
 * bentuk "kosong" untuknya di DTO). Pemanggil yang ingin menghapus grading menghapus `gradeLabel`
 * dan `grader`-nya.
 */
export type CorrectConsignmentLabelInput = {
  /** Judul PUBLIK kartu — disalin ke `Listing.name`. Tidak boleh string kosong. */
  cardName?: string;
  cardSet?: string;
  cardNumber?: string;
  certNumber?: string;
  gradeLabel?: string;
  /** 0–10. Tidak ada cara mengosongkannya lewat rute ini. */
  gradeScore?: number;
  /** "PSA" | "TAG" | "CGC" | "BGS", atau "" = kartunya ternyata MENTAH (kosongkan kolomnya). */
  grader?: string;
  /** WAJIB, minimal 10 karakter: APA yang salah dan DARI MANA tahu nilai yang benar. */
  note: string;
};

/** Satu kolom yang benar-benar berubah — apa, dari apa, jadi apa. Ditulis server, bukan ditebak. */
export type ConsignmentLabelChange = {
  field:
    | "cardName"
    | "cardSet"
    | "cardNumber"
    | "certNumber"
    | "grader"
    | "gradeLabel"
    | "gradeScore";
  before: string | number | null;
  after: string | number | null;
};

/**
 * Jawaban koreksi label: baris titipan terbaru + APA yang berubah menurut server.
 *
 * `corrected` dipakai layar untuk melaporkan perubahan yang BENAR-BENAR tertulis (server membuang
 * field yang nilainya sudah sama), dan `listingUpdated` menjawab pertanyaan yang tidak boleh
 * ditebak: apakah judul yang dilihat publik ikut diperbaiki? `false` bisa berarti listing-nya
 * sudah tidak ACTIVE (baris itu snapshot apa yang dibeli pembeli — bukan milik kita untuk diubah)
 * atau memang tidak ada kolom listing yang perlu ikut berubah.
 */
export type AdminConsignmentLabelCorrected = AdminConsignment & {
  corrected: ConsignmentLabelChange[];
  listingUpdated: boolean;
};

/**
 * ══ KOREKSI LABEL — SATU-SATUNYA RUTE DI FITUR TITIPAN YANG MENIMPA KOLOM ══
 *
 * Garisnya tegas: `conditionNote` dan foto adalah BUKTI dan TETAP tidak punya rute ubah. Yang
 * dikoreksi di sini adalah LABEL — klaim tentang kartu MANA ini, yang bisa dicek terhadap kartu
 * fisiknya sendiri dan terhadap situs grader-nya. Label yang salah ketik bukan bukti tentang apa
 * pun; ia cuma salah — dan `cardName` disalin LANGSUNG ke judul publik listing-nya.
 *
 * Server menulis dalam SATU transaksi: kolom titipan + judul listing yang MASIH ACTIVE + baris
 * audit `LABEL_CORRECTION` yang menyimpan nilai SEBELUM dan SESUDAH. Jejak itu bisa dibaca
 * PEMILIK KARTUNYA SENDIRI di /titipan.
 *
 * EMPAT PENOLAKAN yang layar harus cerminkan SEBELUM tombolnya ditekan (semuanya juga ditegakkan
 * server, dan kalau keduanya pernah berbeda, YANG BENAR ADALAH SERVER):
 *   • `grader` DITOLAK 409 kalau titipannya sudah punya pembeli — grading yang dibaca pembeli SAAT
 *     IA MEMBAYAR tidak boleh berubah sesudahnya. Field label lain tetap boleh.
 *   • MENGOSONGKAN `grader` ditolak 409 selama listing-nya masih ACTIVE (`Listing.grader` NOT NULL
 *     dan tidak ada nilai yang jujur di sana untuk kartu mentah). Turunkan dulu pajangannya.
 *   • `certNumber` terisi + `grader` kosong ditolak 400: kunci anti-dobel-titip adalah PASANGAN
 *     (grader, certNumber), dan di Postgres grader NULL membuat kunci itu tidak pernah bentrok.
 *   • Nomor sertifikat yang bentrok dengan titipan HIDUP lain ditolak 409 (pra-cek; yang
 *     benar-benar menegakkan tetap partial unique index di database).
 * Ditambah GERBANG OPTIMISTIK: kalau salah satu nilai yang dikoreksi sudah berubah sejak layar
 * dimuat, server menolak 409 dan TIDAK menulis apa pun — muat ulang barisnya dulu.
 */
export const correctAdminConsignmentLabel = (
  id: string,
  input: CorrectConsignmentLabelInput,
  token: string,
) =>
  api<AdminConsignmentLabelCorrected>(`/admin/consignments/${id}/label`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  });
