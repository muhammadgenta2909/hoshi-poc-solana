export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

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
    throw new Error(msg);
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
  type: "PACK" | "RESELLER" | "P2P";
  /** Model PM: CC vault (harga default, Hoshi 0%) vs Hoshi vault (5% / stok Hoshi). null = pack/topup. */
  vault: "CC" | "HOSHI" | null;
  status: string;
  priceIdr: number;
  item: string | null;
  buyer: string;
  seller: string | null;
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
  p2p: { count: number; grossIdr: number };
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

export type RedemptionSource = "PACK" | "CC_CATALOG" | "P2P" | "HOSHI";

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
