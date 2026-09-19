/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN (consignment) — kontrak klien BERSAMA untuk DUA penonton yang sangat berbeda.

   1) OPERATOR yang menerima kartu (halaman /admin/titipan…): ia berdiri di depan pemilik kartu,
      memotret, mencatat kondisi, lalu MENYATAKAN kartunya sudah di tangan Hoshi.
   2) PEMILIK kartu (halaman /titipan): ia baru menyerahkan barang bernilai jutaan rupiah dan
      ingin melihat apa yang Hoshi pegang, bukti apa yang tercatat, dan cara memintanya kembali.

   ┌──── FAKTA, BUKAN FLAG ────────────────────────────────────────────────────────────────────┐
   │ Hak sebuah kartu titipan untuk DIJUAL bergantung pada SATU fakta yang ditulis sekali oleh  │
   │ orang yang benar-benar menerima barangnya: `custodyAcceptedAt`. Ia tidak pernah dihapus;   │
   │ berakhirnya custody ditulis sebagai fakta KEDUA (`custodyReleasedAt`), bukan dengan        │
   │ membatalkan yang pertama. Itu kembaran fisik dari `Listing.escrowedAt` di jalur P2P.       │
   │                                                                                            │
   │ GERBANG SEBENARNYA ADA DI SERVER. Predikat di file ini HANYA untuk memutuskan apa yang     │
   │ pantas DITAMPILKAN — supaya UI tidak menawarkan tombol yang pasti ditolak, dan (lebih      │
   │ penting) tidak pernah berkata "kartu ini ada di Hoshi" untuk baris yang tidak membuktikan  │
   │ itu. Ia FAIL-CLOSED: apa pun yang tidak lengkap dibaca sebagai "tidak di tangan Hoshi".    │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   KARTU TITIPAN BUKAN MILIK HOSHI. Tidak ada satu pun kalimat di UI yang boleh berbunyi seolah
   Hoshi pemiliknya, dan tidak ada satu pun yang boleh menjanjikan asuransi/ganti rugi — backend
   tidak mencatat hal seperti itu, jadi UI tidak boleh mengarangnya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

async function req<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(", ") : String(b.message);
    } catch {
      /* body bukan JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/* ───────────────────────────── status & label ───────────────────────────── */

/**
 * Siklus hidup custody (cermin `ConsignmentStatus` di backend).
 *
 * Daftar ini bisa BERTAMBAH di server. Setiap layar yang memakainya WAJIB punya jalan merosot:
 * status yang tidak dikenal ditampilkan APA ADANYA, tidak melempar, dan — karena `isInHoshiCustody`
 * fail-closed — tidak pernah otomatis dianggap "boleh dijual".
 */
export type ConsignmentStatus =
  | "INTAKE" // disepakati, kartu BELUM diterima. Tidak boleh dipajang apa pun.
  | "IN_CUSTODY" // kartu ada di tangan Hoshi. custodyAcceptedAt terisi.
  | "LISTED" // ada listing ACTIVE yang menunjuk baris ini.
  | "SOLD" // pembeli sudah bayar & settle. Kartu masih di rak, tapi sudah milik pembeli.
  | "RELEASED" // kartu fisik sudah keluar dari Hoshi. Terminal.
  | "LOST" // hilang/rusak dalam penyimpanan Hoshi. Terminal.
  | "CANCELLED"; // kesepakatan batal sebelum serah terima. Terminal.

/** Label + warna satu status. Dipakai admin & pemilik supaya kosakatanya tidak bercabang. */
export type StatusUi = { label: string; cls: string };

const STATUS_UI: Record<ConsignmentStatus, StatusUi> = {
  INTAKE: { label: "Belum diterima", cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300" },
  IN_CUSTODY: { label: "Di Hoshi", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  LISTED: { label: "Dipajang", cls: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300" },
  SOLD: { label: "Terjual", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  RELEASED: { label: "Sudah keluar", cls: "border-white/15 bg-white/[0.05] text-zinc-400" },
  LOST: { label: "Hilang / rusak", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
  CANCELLED: { label: "Batal", cls: "border-white/15 bg-white/[0.05] text-zinc-400" },
};

/** Tampilan satu status — status ASING merosot jadi teks apa adanya, bukan crash. */
export const statusUi = (s: string): StatusUi =>
  STATUS_UI[s as ConsignmentStatus] ?? {
    label: s,
    cls: "border-white/15 bg-white/[0.05] text-zinc-400",
  };

/** Kalimat untuk PEMILIK kartu: apa arti status ini bagi barangnya. */
export const ownerStatusLine = (c: ConsignmentCustodyFacts & { status: string }): string => {
  switch (c.status) {
    case "INTAKE":
      return "Belum kami terima. Kartu masih di tanganmu.";
    case "IN_CUSTODY":
      return "Kartu ada di Hoshi. Belum dipajang untuk dijual.";
    case "LISTED":
      return "Kartu ada di Hoshi dan sedang dipajang di marketplace.";
    case "SOLD":
      return "Sudah terjual. Hasilnya masuk ke saldomu; kartunya menunggu dikirim ke pembeli.";
    case "RELEASED":
      return "Kartu sudah keluar dari penyimpanan Hoshi.";
    case "LOST":
      return "Kartu hilang atau rusak saat ada di penyimpanan kami. Tim kami akan menghubungimu.";
    case "CANCELLED":
      return "Kesepakatan dibatalkan sebelum serah terima. Tidak ada kartu yang berpindah.";
    default:
      return "Status: " + c.status;
  }
};

/* ───────────────────────────── foto / bukti ─────────────────────────────── */

/**
 * Jenis foto bukti. FRONT/BACK/CERT adalah yang dipakai gerbang terima-kartu di server;
 * DAMAGE/HANDOVER/OTHER bebas tapi tetap tersimpan permanen.
 */
export type ConsignmentPhotoKind = "FRONT" | "BACK" | "CERT" | "DAMAGE" | "HANDOVER" | "OTHER";

export const PHOTO_KINDS: ConsignmentPhotoKind[] = [
  "FRONT",
  "BACK",
  "CERT",
  "DAMAGE",
  "HANDOVER",
  "OTHER",
];

export const PHOTO_KIND_LABEL: Record<ConsignmentPhotoKind, string> = {
  FRONT: "Depan",
  BACK: "Belakang",
  CERT: "Sertifikat",
  DAMAGE: "Cacat / catatan",
  HANDOVER: "Serah terima",
  OTHER: "Lainnya",
};

/** Keterangan untuk operator: kenapa foto ini diminta, bukan sekadar nama slot. */
export const PHOTO_KIND_HINT: Record<ConsignmentPhotoKind, string> = {
  FRONT: "Seluruh kartu/slab dari depan. Ini yang dipakai sebagai gambar listing.",
  BACK: "Seluruh kartu/slab dari belakang.",
  CERT: "Label sertifikat sampai nomornya terbaca jelas.",
  DAMAGE: "Goresan, sudut tumpul, label miring — apa pun yang sudah ada SEBELUM dititipkan.",
  HANDOVER: "Momen serah terima / tanda terima yang ditandatangani kedua pihak.",
  OTHER: "Foto tambahan.",
};

/**
 * Satu baris foto bukti.
 *
 * `note`/`takenAt` OPSIONAL dengan sengaja: daftar admin mengirim bentuk ringkas
 * (`{ id, kind, url }`) sementara rute detail dan rute pemilik mengirim barisnya utuh. Layar
 * apa pun yang menuntut field ringkas itu akan pecah di salah satu dari dua rute.
 */
export type ConsignmentPhoto = {
  id: string;
  url: string;
  kind: ConsignmentPhotoKind | string;
  note?: string | null;
  takenAt?: string;
  createdAt?: string;
};

/**
 * Satu baris jejak audit — SIAPA melakukan APA dan KAPAN. Append-only di server: tidak ada rute
 * update/hapus, dan koreksi ditulis sebagai baris BARU ber-`kind = "CORRECTION"`.
 *
 * Ini yang membuat urutan kejadian tidak bisa dibantah belakangan, dan pemilik kartu berhak
 * melihatnya — bukti yang cuma bisa dilihat Hoshi kembali menjadi "kata Hoshi".
 */
export type ConsignmentEvent = {
  id: string;
  /** "INTAKE" | "ACCEPT_CUSTODY" | "LIST" | "PRICE" | "WITHDRAW_REQUEST" | "TAKE_DOWN" |
   *  "SOLD" | "RELEASE" | "LOST" | "CANCEL" | "PHOTO" | "CORRECTION" | … (bisa bertambah). */
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorId: string | null;
  /** Nama/wallet pendek pelakunya. null = tidak tercatat (baris sistem). */
  actorLabel: string | null;
  note: string | null;
  createdAt: string;
};

/** Judul manusiawi satu baris audit. Kind BARU merosot jadi teksnya sendiri, bukan crash. */
export const eventTitle = (kind: string): string =>
  ({
    INTAKE: "Kesepakatan dicatat",
    ACCEPT_CUSTODY: "Kartu diterima Hoshi",
    LIST: "Dipajang di marketplace",
    PRICE: "Harga diubah",
    WITHDRAW_REQUEST: "Pemilik minta kartunya kembali",
    TAKE_DOWN: "Listing diturunkan",
    SOLD: "Terjual",
    RELEASE: "Kartu keluar dari Hoshi",
    LOST: "Dicatat hilang / rusak",
    CANCEL: "Kesepakatan dibatalkan",
    PHOTO: "Foto bukti ditambahkan",
    CORRECTION: "Koreksi catatan",
    COMPENSATION: "Ganti rugi dibayarkan",
  })[kind] ?? kind;

/**
 * Siapa yang menerima kartunya — dibaca dari jejak audit.
 *
 * Rute pemilik tidak mengirim relasi `receivedBy` (hanya id-nya), tapi baris audit
 * `ACCEPT_CUSTODY` membawa `actorLabel`: nama orang yang benar-benar menekan tombol terima.
 * Itu justru sumber yang lebih jujur daripada kolom turunan.
 */
export const acceptedByLabel = (events: ConsignmentEvent[] | undefined): string | null =>
  events?.find((e) => e.kind === "ACCEPT_CUSTODY")?.actorLabel ?? null;

/* ───────────────────────── gerbang custody (klien) ──────────────────────── */

/** Bentuk minimum yang dibutuhkan untuk menjawab "Hoshi memegang kartu ini sekarang?". */
export interface ConsignmentCustodyFacts {
  status: string;
  custodyAcceptedAt: string | null;
  custodyReleasedAt: string | null;
  /** Jawaban SERVER atas pertanyaan yang sama (`inCustody`). Kalau ada, ia yang dipakai. */
  inCustody?: boolean;
}

/**
 * true ⇔ Hoshi TERBUKTI memegang kartu ini sekarang.
 *
 * SUMBER UTAMANYA `inCustody` DARI SERVER (dihitung `isInHoshiCustody` di
 * `src/common/consignment.gate.ts`). Cabang di bawahnya adalah kembaran klien dari predikat yang
 * sama, ditulis dalam urutan yang sama, dan hanya dipakai kalau server tidak mengirimkannya —
 * supaya tidak ada dua sumber kebenaran tentang barang orang lain.
 *
 * Ia TIDAK menggantikan gerbang server; ia memutuskan kalimat dan tombol mana yang pantas muncul.
 * FAIL-CLOSED: tanggal terima kosong, tanggal keluar terisi, atau status tak dikenal → false.
 */
export function isInHoshiCustody(c: ConsignmentCustodyFacts): boolean {
  if (typeof c.inCustody === "boolean") return c.inCustody;
  return (
    c.custodyAcceptedAt != null &&
    c.custodyReleasedAt == null &&
    (c.status === "IN_CUSTODY" || c.status === "LISTED")
  );
}

/**
 * Boleh minta kartunya kembali?
 *
 * Cermin tabel §5.1 kontrak backend:
 *   INTAKE      → boleh (belum ada kartu yang berpindah; barisnya jadi CANCELLED)
 *   IN_CUSTODY  → boleh
 *   LISTED      → boleh (server menurunkan listing-nya dalam satu klaim atomik)
 *   SOLD        → TIDAK PERNAH. Kartunya sudah milik pembeli.
 *   RELEASED / LOST / CANCELLED → tidak ada yang bisa ditarik.
 *
 * Jawaban akhirnya tetap milik server: kalau kartunya terjual pada detik yang sama, klaim
 * atomiknya kalah dan server menjawab konflik — bukan UI ini yang memutuskan.
 */
export function canRequestReturn(status: string): boolean {
  return status === "INTAKE" || status === "IN_CUSTODY" || status === "LISTED";
}

/** Alasan tombol "minta kembali" tidak tersedia — kalimat untuk pemilik kartu, bukan kode. */
export function returnBlockedReason(status: string): string | null {
  if (canRequestReturn(status)) return null;
  if (status === "SOLD")
    return "Kartu ini sudah terjual, jadi tidak bisa ditarik lagi. Hasil penjualannya ada di saldomu.";
  if (status === "RELEASED") return "Kartu ini sudah keluar dari penyimpanan Hoshi.";
  if (status === "LOST") return "Kartu ini tercatat hilang/rusak saat di penyimpanan kami.";
  if (status === "CANCELLED") return "Kesepakatan titipan ini sudah dibatalkan.";
  return "Status titipan ini belum mendukung permintaan kembali.";
}

/* ─────────────────────────── komisi & hasil jual ────────────────────────── */

export const BPS_DENOMINATOR = 10_000;

/**
 * Persen komisi dari `commissionBps` yang DIBEKUKAN saat serah terima.
 *
 * SENGAJA dibaca dari baris titipan, bukan dari konstanta di frontend: yang dijanjikan ke
 * pemilik kartu adalah angka di perjanjian yang ia tanda tangani hari itu. Kalau suatu saat
 * Hoshi mengubah komisi standar, kartu yang sudah di rak tidak boleh ikut berubah.
 */
export const commissionPct = (bps: number): number =>
  Math.min(Math.max(bps, 0), BPS_DENOMINATOR) / 100;

/** Perkiraan hasil bersih pemilik dari sebuah harga pajang (SEBELUM potongan lain apa pun). */
export const estimatedPayout = (priceIdr: number, bps: number): number =>
  Math.max(0, priceIdr - Math.floor((priceIdr * Math.min(Math.max(bps, 0), BPS_DENOMINATOR)) / BPS_DENOMINATOR));

/* ─────────────────────── verifikasi sertifikat (grader) ─────────────────── */

/**
 * Tautan cek sertifikat DI SITUS GRADER-nya sendiri.
 *
 * Inti kenapa ini ada: bukti kepemilikan/keaslian yang TIDAK bergantung pada kata-kata Hoshi.
 * Kalau kita tidak punya tautan yang benar untuk satu grader, kembalikan null dan tampilkan
 * nomornya saja — menebak URL lalu mengirim pemilik kartu ke halaman 404 lebih buruk daripada
 * tidak menautkan sama sekali.
 */
export function certLookupUrl(grader: string | null, certNumber: string | null): string | null {
  if (!certNumber) return null;
  const n = encodeURIComponent(certNumber.trim());
  if (!n) return null;
  switch ((grader ?? "").toUpperCase()) {
    case "PSA":
      return `https://www.psacard.com/cert/${n}`;
    case "CGC":
      return `https://www.cgccards.com/certlookup/${n}/`;
    case "BGS":
      // Beckett tidak punya deep-link per-sertifikat yang stabil → arahkan ke pencariannya.
      return "https://www.beckett.com/grading/card-lookup";
    default:
      return null;
  }
}

/* ──────────────────────────── bentuk data (DTO) ─────────────────────────── */

/**
 * KOLOM MENTAH satu baris titipan.
 *
 * Backend mengirim baris Prisma APA ADANYA (`{ ...row, inCustody }`), jadi nama field di sini
 * adalah nama kolomnya — bukan bentuk yang dirapikan serializer. Itu juga alasan semua tanggal
 * bertipe string: JSON.
 *
 * Bagian yang bergantung pada RUTE (relasi `listing`, `consignor`, `receivedBy`, ada-tidaknya
 * `events`) sengaja TIDAK ada di sini: tiga rute mengirim kelengkapan yang berbeda, dan tipe yang
 * berpura-pura semuanya sama akan pecah di salah satunya.
 */
export type ConsignmentBase = {
  id: string;
  status: ConsignmentStatus | string;

  /* pemilik — SNAPSHOT hari serah terima (bukan profil yang bisa berubah) */
  consignorId: string;
  consignorNameAtIntake: string;
  consignorPhoneAtIntake: string;
  consignorIdKind: string | null;
  /** EMPAT DIGIT TERAKHIR saja. Nomor identitas lengkap tidak pernah disimpan backend. */
  consignorIdLast4: string | null;

  /* penerima — `receivedById` baru terisi saat serah terima DICATAT, bukan saat kesepakatan */
  receivedById: string | null;
  receivedAtPlace: string;

  /* kartunya */
  cardName: string;
  cardSet: string | null;
  cardNumber: string | null;
  language: string | null;
  tcg: string | null;
  /** "PSA" | "CGC" | "BGS"; null = kartu MENTAH (belum di-grade). */
  grader: string | null;
  certNumber: string | null;
  gradeLabel: string | null;
  gradeScore: number | null;

  /* bukti */
  conditionNote: string;
  rawCondition: string | null;
  intakeReceiptRef: string | null;
  agreementRef: string | null;
  photos?: ConsignmentPhoto[];
  events?: ConsignmentEvent[];

  /* kesepakatan */
  askPriceIdr: number;
  reservePriceIdr: number | null;
  commissionBps: number;

  /* fakta custody — append-only, tidak pernah dihapus */
  custodyAcceptedAt: string | null;
  custodyReleasedAt: string | null;
  releaseReason: string | null;
  releaseReceiptRef: string | null;
  storageProvider: string | null;
  storageLocation: string | null;
  withdrawRequestedAt: string | null;

  /* hasil */
  soldOrderId: string | null;
  payoutIdrx: number | null;
  commissionIdrx: number | null;

  createdAt: string;
  updatedAt: string;

  /** Jawaban server atas gerbang custody. Dipakai lebih dulu oleh `isInHoshiCustody`. */
  inCustody?: boolean;
};

/** Listing yang menempel pada satu titipan (relasi 1-1 lewat `Listing.consignmentId`). */
export type ConsignmentListingRef = {
  id: string;
  status: string;
  priceIdrx: number;
  image?: string | null;
  listedAt?: string | null;
  soldAt?: string | null;
  buyerId?: string | null;
  category?: string | null;
  set?: string | null;
};

/** Satu titipan sebagaimana dilihat PEMILIKNYA (`GET /consignments/mine`). */
export type MyConsignment = ConsignmentBase & {
  listing?: ConsignmentListingRef | null;
};

/* ───────────────────────────── panggilan API ────────────────────────────── */

/**
 * Semua titipan milik user yang sedang login — LENGKAP dengan foto, catatan kondisi, dan jejak
 * auditnya. Terbaru dulu (urutan dari server).
 *
 * Kelengkapan itu disengaja di backend: buktinya milik pemilik kartu, bukan milik Hoshi.
 */
export const getMyConsignments = (token: string) =>
  req<MyConsignment[]>("/consignments/mine", token);

/**
 * "Minta kartu saya kembali."
 *
 * GRATIS, dan itu bukan detail kosmetik: hak menarik kartu kapan saja tanpa biaya adalah alasan
 * orang berani menitipkan barang mahal. Nol rupiah bergerak di jalur ini.
 *
 * Kalau kartunya TERJUAL pada detik yang sama, server memenangkan salah satu saja: entah
 * listing-nya turun (kartu kembali ke pemilik, pembeli di-refund) atau penjualannya jadi
 * (pemilik dibayar). Tidak pernah keduanya — dan pesan penolakannya sudah berbunyi persis itu,
 * jadi tampilkan apa adanya; jangan diterjemahkan ulang di UI.
 */
export const requestConsignmentReturn = (id: string, token: string, note?: string) =>
  req<MyConsignment>(`/consignments/${id}/withdraw`, token, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
