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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   HTTP 429 — DAN KENAPA PESAN SERVER TIDAK BOLEH DIPAKAI APA ADANYA DI SINI.

   Semua rute di backend duduk di bawah ThrottlerGuard global, dan rute penukaran kode klaim punya
   remnya sendiri (5 percobaan/menit/IP). Yang dikirim Nest saat rem itu bekerja adalah
   `{ statusCode: 429, message: "ThrottlerException: Too Many Requests" }` — kalimat bahasa Inggris
   yang menyebut nama sebuah KELAS.

   Di layar mana pun itu buruk; di `/titipan/klaim` ia adalah kegagalan produk. Yang sedang berdiri
   di depannya adalah kolektor yang kartunya SUDAH DIBAWA PERGI oleh tim Hoshi, sedang menyalin 10
   simbol dari tulisan tangan di struk ke layar ponsel. Salah ketik lima kali dalam semenit sama
   sekali tidak aneh — dan yang ia terima sebagai jawaban adalah nama kelas Java-esque, tanpa satu
   kata pun tentang apa yang harus ia lakukan berikutnya.

   ⚠️ INI BUKAN PELONGGARAN REM. Batas, jendela, dan perilaku throttle-nya tidak disentuh sama
   sekali — yang berubah hanya KALIMAT yang dibacakan kepada pemilik kartunya, ditambah satu
   header (`Retry-After`) yang backend memang sudah kirim dan sekarang boleh dibaca browser.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Jendela throttle backend, detik. Cermin `ttl: 60000` (global maupun rute kode klaim). */
const THROTTLE_WINDOW_SECONDS = 60;

/** Batas percobaan kode klaim per menit — cermin `@Throttle({ limit: 5 })` di controller. */
export const CLAIM_CODE_ATTEMPTS_PER_MINUTE = 5;

/**
 * Kegagalan karena rem, bukan karena yang diketik salah — DUA hal yang sangat berbeda bagi orang
 * yang membacanya, jadi ia punya tipe sendiri supaya layar bisa membedakannya tanpa mengendus
 * teks pesan.
 */
export class ThrottledError extends Error {
  /** Detik sampai boleh mencoba lagi. Selalu ≥ 1 — "tunggu 0 detik" bukan instruksi. */
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "ThrottledError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Detik sampai boleh mencoba lagi.
 *
 * Dibaca dari header `Retry-After` yang dikirim ThrottlerGuard. Header itu baru TERBACA dari
 * browser karena backend mencantumkannya di `exposedHeaders` (lihat `src/main.ts`); kalau ia
 * tidak terbaca — proxy yang membuangnya, backend versi lama, CORS yang belum diperbarui —
 * jawabannya JATUH KE JENDELA PENUH. Itu batas atas yang jujur: menunggu terlalu lama sedikit
 * tidak melukai siapa pun, sedangkan menebak terlalu pendek mengirim orangnya menabrak rem yang
 * sama sekali lagi.
 */
function retryAfterSeconds(res: Response): number {
  const raw = res.headers.get("retry-after");
  const n = raw == null ? NaN : Number(raw.trim());
  // Batas atas 1 jam: nilai aneh dari proxy tidak boleh berubah jadi "tunggu 9 hari".
  return Number.isFinite(n) && n >= 1 && n <= 3600
    ? Math.ceil(n)
    : THROTTLE_WINDOW_SECONDS;
}

/** "42 detik" / "2 menit" — lama tunggu dalam satuan yang enak dibaca. */
export const waitPhrase = (seconds: number): string => {
  const s = Math.max(1, Math.ceil(seconds));
  return s < 60 ? `${s} detik` : `${Math.ceil(s / 60)} menit`;
};

/** Kalimat umum untuk rute titipan mana pun yang kena rem. */
const throttledMessage = (seconds: number): string =>
  `Terlalu banyak permintaan dari perangkat ini dalam waktu singkat. Tunggu ${waitPhrase(
    seconds,
  )}, lalu coba lagi. Tidak ada yang rusak dan tidak ada yang hilang — halaman ini cuma sedang diminta pelan-pelan.`;

/**
 * Kalimat untuk kolektor yang salah ketik kode klaimnya beberapa kali.
 *
 * Tiga hal yang HARUS ada di dalamnya, dan ketiganya pernah tidak ada: berapa lama menunggu,
 * bahwa kodenya perlu dicocokkan ulang DARI STRUK (di situlah salah ketiknya lahir), dan bahwa
 * ini bukan pertanda kartunya bermasalah.
 *
 * Catatan alfabet di dalamnya bukan hiasan: `I`, `L`, `O` dan `U` TIDAK ADA di Crockford Base32,
 * jadi coretan yang terbaca seperti "I" atau "O" di tulisan tangan pasti angka 1 atau 0. Itu
 * persis jenis salah baca yang membuat orang mengetik kode yang bentuknya sah tapi isinya salah —
 * dan kolom input di halaman klaim memang sudah memetakannya otomatis, jadi yang tersisa adalah
 * memberitahunya supaya ia berhenti curiga pada hurufnya sendiri.
 */
export const claimCodeThrottledMessage = (seconds: number): string =>
  `Terlalu banyak percobaan kode. Penukaran kode dibatasi ${CLAIM_CODE_ATTEMPTS_PER_MINUTE} ` +
  `percobaan per menit — batas itu yang membuat kode kartumu tidak bisa ditebak orang lain. ` +
  `Tunggu ${waitPhrase(seconds)}, lalu coba lagi.\n\n` +
  `Sambil menunggu, cocokkan sekali lagi dengan kode di tanda terima yang kamu pegang: ` +
  `${CLAIM_CODE_LENGTH} simbol, huruf besar-kecil dan tanda hubung tidak berpengaruh, dan huruf ` +
  `I, L, O, U tidak pernah dipakai — coretan yang terlihat seperti itu pasti angka 1 atau 0. ` +
  `Kartumu tetap tercatat atas namamu di Hoshi selama kamu menunggu; tidak ada yang berubah ` +
  `karena kode yang salah ketik.`;

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
    // Ditangkap SEBELUM `message` server dibaca: pada 429 isinya "ThrottlerException: Too Many
    // Requests", dan tidak ada layar yang boleh menampilkan itu kepada pemilik kartu.
    if (res.status === 429) {
      const wait = retryAfterSeconds(res);
      throw new ThrottledError(throttledMessage(wait), wait);
    }
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
    // ⚠️ "Tim kami akan menghubungimu" adalah janji SATU ARAH, dan satu arah saja tidak cukup di
    // baris yang memberitahu seseorang bahwa barangnya hilang di tangan kami. Layar yang
    // menampilkannya WAJIB menyertakan tautan ke tim (`consignmentLostSupportDraft` +
    // `supportComposeHref`) — lihat `app/titipan/page.tsx`. Kalimat ini tidak membawa tautannya
    // sendiri karena ia string, bukan komponen; itu bukan izin untuk menampilkannya sendirian.
    case "LOST":
      return "Kartu hilang atau rusak saat ada di penyimpanan kami. Tim kami akan menghubungimu.";
    case "CANCELLED":
      return "Kesepakatan dibatalkan sebelum serah terima. Tidak ada kartu yang berpindah.";
    default:
      return "Status: " + c.status;
  }
};

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SATU KALIMAT TAMBAHAN UNTUK PEMILIK KARTU: DI MANA KARTUKU SEKARANG, DAN KAPAN IA SAMPAI?   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * TERPISAH dari `ownerStatusLine`, dan itu disengaja. Status menjawab "apa keadaan titipannya";
 * baris ini menjawab pertanyaan yang benar-benar ada di kepala orang yang baru saja meminta
 * barangnya kembali — dan menggabungkannya jadi satu kalimat akan membuat salah satunya hilang.
 *
 * DUA KEADAAN YANG PALING MUDAH TERTUKAR, dan keduanya disebut apa adanya:
 *   diminta, belum dikirim → "kartunya MASIH AMAN DI RAK KAMI". Itu bukan basa-basi: selama
 *                            kartunya di sini, ia masih tanggung jawab Hoshi, dan pemiliknya
 *                            berhak tahu bahwa tidak ada yang hilang hanya karena belum ada resi.
 *   sudah dikirim          → NOMOR RESI, supaya "sudah dikirim" bisa ia periksa SENDIRI di situs
 *                            kurirnya, bukan dipercaya karena "kata Hoshi".
 *
 * ⚠️ TIDAK ADA SATU KATA PUN TENTANG TAGIHAN DI SINI, dan tidak boleh ditambahkan: ongkir balik
 * DICATAT di sisi operator, tidak pernah ditagihkan ke pemilik kartu. Menarik kartu GRATIS, dan
 * kalimat yang menyiratkan sebaliknya menghapus seluruh nilai tuas itu.
 *
 * null = tidak ada yang perlu dikatakan (belum ada permintaan kembali sama sekali).
 */
export const ownerReturnLine = (c: {
  withdrawRequestedAt: string | null;
  custodyReleasedAt: string | null;
  releaseReason: string | null;
  returnMethod: string | null;
  returnCourier: string | null;
  returnTrackingNo: string | null;
  returnPickedUpBy: string | null;
  returnPlanReady?: boolean;
}): string | null => {
  if (c.custodyReleasedAt && c.releaseReason === "WITHDRAWN") {
    if (c.returnTrackingNo) {
      return `Sudah dikirim balik${c.returnCourier ? ` lewat ${c.returnCourier}` : ""} — nomor resi ${c.returnTrackingNo}. Kamu bisa melacaknya sendiri di situs kurirnya.`;
    }
    if (c.returnPickedUpBy) {
      return `Sudah diserahkan langsung kepada ${c.returnPickedUpBy}.`;
    }
    return "Kartunya sudah keluar dari penyimpanan Hoshi.";
  }
  if (!c.withdrawRequestedAt || c.custodyReleasedAt) return null;
  if (c.returnMethod === "PICKUP") {
    return "Menunggu kamu ambil di tempat Hoshi. Kartunya masih aman di rak kami sampai kamu datang.";
  }
  if (c.returnMethod === "COURIER") {
    return c.returnPlanReady === false
      ? "Permintaanmu sudah tercatat, tapi alamat kirimnya belum lengkap di catatan kami — tim Hoshi akan menghubungimu. Kartunya tetap aman di rak kami."
      : "Permintaanmu sudah tercatat dan kartunya sedang disiapkan untuk dikirim. Nomor resinya muncul di sini begitu paketnya berangkat; sampai saat itu kartunya masih aman di rak kami.";
  }
  return "Permintaanmu sudah tercatat. Kartunya masih aman di rak kami — tim Hoshi akan menghubungimu untuk memastikan ke mana kartunya dikembalikan.";
};

/* ───────────────────────────── foto / bukti ─────────────────────────────── */

/**
 * Jenis foto bukti.
 *
 * DUA JENIS BUKTI YANG BERBEDA, dan bedanya bukan gaya penamaan:
 *   FRONT/BACK/CERT  bukti KEADAAN BARANGNYA — menjawab "apakah sudah begitu sejak awal?"
 *   HANDOVER         bukti ADANYA KESEPAKATAN — foto STRUK SERAH TERIMA sesudah ditandatangani
 *                    kedua pihak. Foto slab sebagus apa pun tidak menjawab "dia memang setuju
 *                    menitipkannya, dengan harga dan komisi ini, pada hari itu"; hanya kertas
 *                    bertanda tangan yang salinannya ada di tangan PEMILIKNYA yang menjawabnya.
 *   DAMAGE/OTHER     tambahan, bebas.
 *
 * Yang WAJIB sebelum kartu boleh dinyatakan diterima: lihat {@link requiredPhotoKinds}.
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
  HANDOVER: "Struk serah terima",
  OTHER: "Lainnya",
};

/** Keterangan untuk operator: kenapa foto ini diminta, bukan sekadar nama slot. */
export const PHOTO_KIND_HINT: Record<ConsignmentPhotoKind, string> = {
  FRONT: "Seluruh kartu/slab dari depan. Ini yang dipakai sebagai gambar listing.",
  BACK: "Seluruh kartu/slab dari belakang.",
  CERT: "Label sertifikat sampai nomornya terbaca jelas.",
  DAMAGE: "Goresan, sudut tumpul, label miring — apa pun yang sudah ada SEBELUM dititipkan.",
  HANDOVER:
    "Struk serah terima yang SUDAH ditandatangani kedua pihak — tanda tangannya harus terlihat. Cetak struknya, tanda tangani di tempat, lalu foto lembarnya.",
  OTHER: "Foto tambahan.",
};

/**
 * Bukti yang WAJIB ada sebelum kartu boleh dinyatakan diterima — CERMIN gerbang di server
 * (`ConsignmentService.acceptCustody`).
 *
 * ┌──── DUA SALINAN ATURAN, DAN ITU DISENGAJA — TAPI ADA SYARATNYA ───────────────────────────┐
 * │ Gerbang SEBENARNYA ada di server; yang di sini cuma supaya operator tahu SEBELUM menekan  │
 * │ tombol, bukan sesudah ditolak. Justru karena itu ia harus berbunyi SAMA PERSIS: daftar    │
 * │ klien yang lebih longgar berarti tombol yang menyala lalu ditolak server (operator        │
 * │ mengira aplikasinya rusak), dan daftar yang lebih ketat berarti tombol yang mati tanpa    │
 * │ sebab yang bisa dijelaskan. Mengubah salah satu = mengubah keduanya, di perubahan yang    │
 * │ sama.                                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `certNumber` kosong = kartu mentah → CERT tidak diminta (tidak ada sertifikat untuk difoto).
 */
export const requiredPhotoKinds = (
  certNumber: string | null | undefined,
): ConsignmentPhotoKind[] =>
  (certNumber ?? "").trim()
    ? ["FRONT", "BACK", "CERT", "HANDOVER"]
    : ["FRONT", "BACK", "HANDOVER"];

/**
 * Nama satu bukti yang KURANG, ditulis sebagai yang harus operator LAKUKAN.
 *
 * Bukan label slotnya ("Struk serah terima") melainkan pekerjaannya ("foto struk serah terima
 * yang sudah ditandatangani"): kalimat ini muncul di baris "Belum bisa: …" tepat di bawah tombol
 * yang mati, dan di detik itu yang dibutuhkan operator adalah perintah, bukan nama kolom.
 */
export const PHOTO_KIND_BLOCKER_LABEL: Record<ConsignmentPhotoKind, string> = {
  FRONT: "foto depan kartu",
  BACK: "foto belakang kartu",
  CERT: "foto label sertifikat",
  DAMAGE: "foto cacat",
  HANDOVER: "foto struk serah terima yang sudah ditandatangani",
  OTHER: "foto tambahan",
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

/**
 * Judul manusiawi satu baris audit. Kind BARU merosot jadi teksnya sendiri, bukan crash.
 *
 * ┌──── DAFTAR INI HARUS LENGKAP, BUKAN SEKADAR TIDAK CRASH ──────────────────────────────────┐
 * │ Jalan merosotnya (`?? kind`) menjaga layar tetap hidup untuk kind yang BELUM ada saat file │
 * │ ini ditulis. Ia BUKAN izin untuk membiarkan kind yang sudah ada tidak diterjemahkan:       │
 * │ hasilnya adalah kata seperti "CLAIM_CODE_REDEEMED" di halaman PEMILIK KARTU — orang yang   │
 * │ baru menyerahkan barang puluhan juta dan sedang membaca riwayatnya untuk menenangkan diri. │
 * │                                                                                            │
 * │ Tiga baris klaim di bawah justru yang paling penting diterjemahkan: merekalah satu-satunya │
 * │ jawaban tertulis atas "dari mana kalian tahu ini orangnya".                                │
 * │                                                                                            │
 * │ Padanannya di server: semua `kind:` di `consignment.service.ts` + `kind: 'SOLD'` yang      │
 * │ ditulis `payments.service.ts` saat settlement. Menambah kind di sana = menambah baris di   │
 * │ sini, pada perubahan yang sama.                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
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
    /* Koreksi LABEL (nama kartu, set, nomor, sertifikat, grade) — berbeda dari CORRECTION di
       atas, dan bedanya penting: baris ini MENIMPA kolomnya (dan judul listing yang sedang
       tayang), lalu menyimpan nilai sebelum-dan-sesudahnya di catatannya sendiri. Bukti
       (`conditionNote`, foto) tetap tidak punya rute ubah. */
    LABEL_CORRECTION: "Keterangan kartu diperbaiki",
    /* ── SUMBU KLAIM: bagaimana kartu ini tersambung ke sebuah akun ────────────────────────
       Ditulis dari sudut pandang PEMILIK, karena dialah yang membacanya di /titipan. */
    CLAIM_CODE_ISSUED: "Kode klaim diterbitkan untuk pemilik",
    CLAIM_CODE_REDEEMED: "Pemilik menukarkan kode klaimnya",
    CONSIGNOR_LINKED: "Pemilik ditautkan oleh admin",
    /* Belum pernah ditulis server: ganti rugi tercatat sebagai baris CORRECTION yang menyebut
       nominalnya. Dibiarkan di sini supaya kalau server suatu saat memisahkannya, baris itu
       sudah punya nama dan tidak pernah tampil sebagai token mentah. */
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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   PENGEMBALIAN KARTU — KE MANA, SIAPA YANG BAYAR ONGKIRNYA, DAN APAKAH IA SAMPAI.

   ┌──── DUA CARA, DAN KEDUANYA HARUS ADA ──────────────────────────────────────────────────────┐
   │ DIAMBIL SENDIRI  tidak butuh alamat sama sekali — dan memaksanya mengisi alamat hanya       │
   │                  melahirkan alamat karangan di baris yang paling tidak membutuhkannya.      │
   │                  Yang dicatat: SIAPA yang datang mengambil.                                 │
   │ DIKIRIM KURIR    butuh alamat LENGKAP, lalu nomor resi saat kartunya benar-benar berangkat. │
   │                                                                                            │
   │ Memaksa semuanya lewat kurir berarti menagih ongkir ke orang yang rumahnya lima menit dari  │
   │ kantor; memaksa semuanya diambil sendiri berarti kolektor di Medan tidak pernah bisa        │
   │ mendapatkan kartunya kembali.                                                               │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   ⚠️ ONGKIR BALIK DICATAT, TIDAK DITAGIHKAN. Tidak ada tagihan yang terbit, tidak ada saldo yang
   dipotong, dan menarik kartu TETAP GRATIS bagi pemiliknya. Kolom penanggung ongkir ada supaya
   ongkos yang ditanggung Hoshi berhenti jadi kebocoran yang tidak muncul di laporan mana pun —
   BUKAN supaya seseorang ditagih. Tidak boleh ada satu kalimat pun di UI yang menyiratkan
   sebaliknya kepada pemilik kartu.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

export type ConsignmentReturnMethod = "PICKUP" | "COURIER";
export type ConsignmentReturnPayer = "OWNER" | "HOSHI";

/** Alamat pengembalian — bentuk yang SAMA dengan alamat kirim domestik di backend. */
export type ConsignmentReturnAddress = {
  recipientName: string;
  phoneNumber: string;
  phoneCountryCode?: string;
  street: string;
  apt?: string;
  city: string;
  /** Provinsi. WAJIB: ia yang menentukan tier ongkir balik. */
  state: string;
  zip: string;
  /** Default "Indonesia" di server kalau dikosongkan. */
  country?: string;
};

/**
 * Body `returnPlan` — bentuk yang SAMA untuk rute penarikan dan rute pelepasan custody.
 *
 * Satu bentuk untuk dua momen, dengan sengaja: alamat bisa dicatat saat pemiliknya menelepon,
 * atau pada detik ia berdiri di depan operator. Dua bentuk yang mirip akan melahirkan dua aturan
 * "alamat lengkap" yang suatu hari berbeda.
 */
export type ConsignmentReturnPlan = {
  returnMethod: ConsignmentReturnMethod;
  /** WAJIB kalau returnMethod = "COURIER". */
  returnAddress?: ConsignmentReturnAddress;
  returnShippingPayer?: ConsignmentReturnPayer;
  /** Kosongkan untuk membiarkan server menaksir dari tarif wilayah yang sudah ada. */
  returnShippingFeeIdr?: number;
};

/** Label manusiawi. Nilai ASING merosot jadi teksnya sendiri — daftar ini bisa bertambah di server. */
export const returnMethodLabel = (m: string | null): string | null =>
  m == null
    ? null
    : m === "PICKUP"
      ? "Diambil sendiri di tempat Hoshi"
      : m === "COURIER"
        ? "Dikirim kurir"
        : m;

/**
 * Siapa yang menanggung ongkir balik, dalam kalimat.
 *
 * Kalimatnya SENGAJA tidak pernah berbunyi "pemilik ditagih": tidak ada penagihan yang terjadi.
 * Yang benar adalah "ditanggung", dan layar yang memakai kata lain akan membuat pemilik kartu
 * mengira ada uang yang akan diambil darinya.
 */
export const returnPayerLabel = (p: string | null): string | null =>
  p == null
    ? null
    : p === "HOSHI"
      ? "Ditanggung Hoshi"
      : p === "OWNER"
        ? "Ditanggung pemilik kartu"
        : p;

/** Kolom alamat yang WAJIB — cermin `RETURN_ADDRESS_REQUIRED_FIELDS` di backend. */
const RETURN_ADDRESS_REQUIRED: (keyof ConsignmentReturnAddress)[] = [
  "recipientName",
  "phoneNumber",
  "street",
  "city",
  "state",
  "zip",
];

/**
 * Formulir alamatnya sudah cukup untuk dikirim?
 *
 * Ini HANYA untuk mengaktifkan tombol atas apa yang SEDANG DIKETIK — bukan untuk menilai baris
 * yang sudah tersimpan. Untuk yang tersimpan, jawabannya datang dari server
 * (`returnAddressComplete` / `returnPlanReady`): salinan aturan di klien yang menilai data
 * tersimpan akan cepat atau lambat berbeda pendapat dengan gerbangnya.
 */
export const isReturnAddressFormComplete = (a: Partial<ConsignmentReturnAddress>): boolean =>
  RETURN_ADDRESS_REQUIRED.every((k) => (a[k] ?? "").toString().trim().length > 0);

/**
 * Kolom alamat yang bermasalah, dalam KALIMAT — atau null kalau semuanya sudah cukup.
 *
 * ┌──── KENAPA PANJANG MINIMUMNYA DICERMINKAN DI SINI ─────────────────────────────────────────┐
 * │ `ConsignmentReturnAddressDto` di backend memasang `@MinLength` di tiap kolom. Kolom yang    │
 * │ terisi TAPI terlalu pendek (kota "A", kode pos "40") lolos `isReturnAddressFormComplete` —  │
 * │ ia cuma bertanya "kosong atau tidak" — lalu ditolak ValidationPipe dengan daftar pesan      │
 * │ class-validator berbahasa Inggris. Yang membaca daftar itu adalah pemilik kartu yang sedang │
 * │ mencoba meminta barangnya sendiri kembali dari ponsel.                                      │
 * │                                                                                            │
 * │ Ini BUKAN gerbang — server tetap yang memutuskan. Ia hanya memastikan penolakan yang sudah  │
 * │ pasti terjadi dikatakan dalam bahasa yang orangnya mengerti, sebelum ia terkirim.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const RETURN_ADDRESS_RULES: {
  key: keyof ConsignmentReturnAddress;
  min: number;
  /** Nama kolomnya seperti yang tertulis di layar, supaya kalimatnya bisa ditunjuk. */
  label: string;
}[] = [
  { key: "recipientName", min: 2, label: "Nama penerima" },
  { key: "phoneNumber", min: 5, label: "Nomor telepon" },
  { key: "street", min: 5, label: "Alamat lengkap" },
  { key: "city", min: 2, label: "Kota/kabupaten" },
  { key: "state", min: 2, label: "Provinsi" },
  { key: "zip", min: 3, label: "Kode pos" },
];

export const returnAddressProblem = (
  a: Partial<ConsignmentReturnAddress>,
): string | null => {
  const empty = RETURN_ADDRESS_RULES.filter(
    (r) => (a[r.key] ?? "").toString().trim().length === 0,
  );
  if (empty.length > 0) {
    return `Masih kosong: ${empty.map((r) => r.label.toLowerCase()).join(", ")}. Kurir butuh semuanya supaya kartunya sampai ke tangan yang benar.`;
  }
  const short = RETURN_ADDRESS_RULES.find(
    (r) => (a[r.key] ?? "").toString().trim().length < r.min,
  );
  if (short) {
    return `${short.label} sepertinya belum lengkap — tulis minimal ${short.min} karakter.`;
  }
  return null;
};

/**
 * Satu baris ringkas alamat pengembalian yang TERSIMPAN, untuk ditampilkan apa adanya.
 * null = belum ada alamat (bukan "alamat kosong" — dua hal yang berbeda).
 */
export const returnAddressLine = (c: {
  returnRecipientName: string | null;
  returnPhoneNumber: string | null;
  returnStreet: string | null;
  returnApt: string | null;
  returnCity: string | null;
  returnState: string | null;
  returnZip: string | null;
}): string | null => {
  if (!c.returnStreet && !c.returnCity) return null;
  const parts = [
    c.returnRecipientName,
    c.returnPhoneNumber,
    c.returnStreet,
    c.returnApt,
    c.returnCity,
    c.returnState,
    c.returnZip,
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KODE KLAIM — cara sebuah kartu tersambung ke akun pemiliknya, untuk orang yang BELUM PUNYA AKUN.

   ┌──── KENAPA BUKAN EMAIL ────────────────────────────────────────────────────────────────────┐
   │ `User.email` di backend `String?` — TIDAK unik dan TIDAK PERNAH diverifikasi; hanya        │
   │ `walletAddress` yang `@unique`. Siapa pun bisa mengetik alamat email orang lain di          │
   │ pengaturannya sendiri. Menyambungkan kartu senilai puluhan juta ke "siapa pun yang mengaku  │
   │ memakai alamat itu" bukan sekadar longgar — itu menyerahkan barang orang ke orang lain.     │
   │                                                                                            │
   │ Yang dipakai justru barang yang MEMANG berpindah tangan di ruangan yang sama dengan         │
   │ kartunya: selembar kode yang diberikan operator ke pemiliknya saat serah terima. Siapa yang │
   │ memegang kode itu adalah orang yang ada di sana.                                            │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   DUA SUMBU YANG TIDAK BOLEH DICAMPUR, dan ini sumber salah paham yang paling mahal di layar
   operator:

     "kartunya ada di tangan Hoshi?"   → custody  (`isInHoshiCustody`, custodyAcceptedAt)
     "sudah ada akun pemiliknya?"      → klaim    (`isAwaitingClaim`, consignorId/claimedAt)

   Keduanya BERDIRI SENDIRI. Sebuah kartu bisa sudah ada di rak Hoshi (custody beres) dan TETAP
   belum boleh dipajang karena belum ada akun yang akan menerima hasil penjualannya. Memakai satu
   kata untuk keduanya akan membuat operator mengira kartu yang "sudah diterima" berarti "siap
   dijual", padahal uangnya belum punya tujuan.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Status yang MENUTUP pertanyaan "masih menunggu pemiliknya tertaut?".
 *
 * CERMIN PERSIS `AWAITING_CLAIM_CLOSED_STATUSES` di `src/common/consignment.gate.ts`, yang juga
 * menjadi SQL-nya (`awaitingConsignorWhere`). Daftar ini bukan "status terminal" — itu kata yang
 * pernah dipakai di sini dan justru yang menyesatkan:
 *
 *   CANCELLED  tidak ada kartu yang pernah berpindah. Tidak ada apa pun untuk diklaim.
 *   RELEASED   kartunya sudah PULANG ke tangan pemiliknya. Penautannya masih mungkin (server
 *              sengaja tidak menutup penukaran kode di sini, supaya ia tetap bisa melihat riwayat
 *              serah-terimanya sendiri), tapi ia bukan lagi sesuatu yang HOSHI UTANG — jadi ia
 *              tidak duduk di antrean kerja operator.
 *
 * ⚠️ LOST SENGAJA TIDAK ADA DI SINI, dan jangan pernah disapu bersama RELEASED. Custody-nya
 * memang selesai, tapi kartunya TIDAK pulang: Hoshi berutang ganti rugi, dan rute `compensate`
 * menuntut pemilik yang tertaut (`requireLinkedConsignorId`) — uang tanpa akun tujuan tidak bisa
 * dibayarkan sama sekali. Baris LOST tanpa pemilik justru yang PALING mendesak dikejar, dan
 * menyembunyikannya dari layar operator berarti menghapus satu-satunya pengingat bahwa ada orang
 * yang belum dibayar untuk kartunya yang hilang di rak kami.
 */
const AWAITING_CLAIM_CLOSED_STATUSES = ["CANCELLED", "RELEASED"];

/** Bagaimana pemilik tertaut ke catatannya (`Consignment.consignorLinkMethod` di backend). */
export type ConsignorLinkMethod = "AT_INTAKE" | "CLAIM_CODE" | "ADMIN_LINK";

/**
 * Kalimat manusiawi untuk cara penautan. Nilai ASING merosot jadi teksnya sendiri, bukan crash —
 * daftar ini bisa bertambah di server.
 *
 * Ini bukan hiasan. Berbulan-bulan kemudian, "dari mana kalian tahu ini orangnya" adalah
 * pertanyaan yang harus punya jawaban, dan jawabannya berbeda untuk tiap cara: yang satu berarti
 * pemiliknya berdiri di sana saat kartunya diserahkan, yang satu berarti ia memegang kertas berisi
 * kodenya, yang satu berarti seorang admin memeriksa identitasnya dan menuliskan alasannya.
 */
export const consignorLinkMethodLabel = (m: string | null): string | null =>
  m == null
    ? null
    : ({
        AT_INTAKE: "pemiliknya sudah punya akun saat serah terima",
        CLAIM_CODE: "pemiliknya menukarkan kode klaim di tanda terimanya",
        ADMIN_LINK: "ditautkan admin setelah memeriksa identitasnya",
      })[m] ?? m;

/** Bentuk minimum untuk menjawab "baris ini masih menunggu diklaim pemiliknya?". */
export interface ConsignmentClaimFacts {
  status: string;
  consignorId: string | null;
  /** Jawaban SERVER atas pertanyaan yang sama (`awaitingOwnerClaim`). Kalau ada, ia yang dipakai. */
  awaitingOwnerClaim?: boolean;
}

/**
 * true ⇔ kartu ini belum punya akun pemilik, dan masih menunggu diklaim.
 *
 * ┌──── SIAPA YANG BERWENANG, DAN KENAPA ITU PERLU DITULIS ───────────────────────────────────┐
 * │ `awaitingOwnerClaim` DARI SERVER selalu menang, di SETIAP jalur baca: tiga rute titipan    │
 * │ mengirimkannya (`custodyFlags` di `consignment.service.ts`), jadi cabang di bawah praktis  │
 * │ hanya hidup untuk baris yang datang dari tempat lain atau dari server versi lama.          │
 * │                                                                                            │
 * │ Karena server yang menang, perbedaan sekecil apa pun antara dua sisi TIDAK akan terlihat   │
 * │ sebagai perbedaan — ia terlihat sebagai layar yang salah. Dulu klien mengecualikan         │
 * │ RELEASED/LOST/CANCELLED sementara server hanya mengecualikan CANCELLED, DAN komentar di    │
 * │ sini mengklaim keduanya predikat yang sama. Klaim itulah yang membuat selisihnya tidak     │
 * │ pernah dicari: kartu yang sudah dikembalikan ke tangan pemiliknya tetap membawa lencana    │
 * │ ungu "Belum diklaim" dan tombol "Kirim kode lagi" selamanya, menyuruh operator mengejar    │
 * │ orang untuk kartu yang sudah ada di tangannya sendiri.                                     │
 * │                                                                                            │
 * │ Yang berlaku sekarang, di KEDUA sisi: tertaut → tidak menunggu; kalau belum tertaut, yang  │
 * │ menutupnya hanya CANCELLED dan RELEASED — LOST tetap menunggu, karena di sanalah Hoshi     │
 * │ justru berutang. Cabang di bawah adalah KEMBARAN `isAwaitingConsignorClaim`, ditulis dalam │
 * │ urutan yang sama, dan ia BUKAN pendapat kedua: kalau sisi sana berubah, baris ini ikut     │
 * │ berubah pada perubahan yang SAMA — bukan "nanti kalau ketahuan".                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Cabang klien membaca `consignorId` SAJA, sama seperti `isConsignorLinked`. Server juga menyimpan
 * `consignorLinkedAt`/`consignorLinkMethod`, tapi yang menjadi GERBANG di sana hanyalah kolom
 * id-nya; klien yang menambahkan syarat sendiri akan menampilkan keadaan yang tidak bisa dicapai
 * baris mana pun, dan operator akan menunggu sesuatu yang tidak akan datang.
 *
 * {@link AWAITING_CLAIM_CLOSED_STATUSES} dikecualikan — baca di sana kenapa LOST TIDAK termasuk.
 *
 * Arah gagalnya SENGAJA berbeda dari `isInHoshiCustody`. Di sana bahayanya mengaku memegang kartu
 * yang tidak kita pegang, jadi ia fail-closed. Di sini bahayanya kebalikannya: baris tanpa pemilik
 * yang TIDAK terlihat di layar operator tidak akan pernah dikejar siapa pun — kartu orang
 * tergeletak di rak, tidak bisa dipajang, dan tidak ada yang tahu kenapa.
 */
export function isAwaitingClaim(c: ConsignmentClaimFacts): boolean {
  if (typeof c.awaitingOwnerClaim === "boolean") return c.awaitingOwnerClaim;
  if (c.consignorId != null) return false;
  return !AWAITING_CLAIM_CLOSED_STATUSES.includes(c.status);
}

/**
 * true ⇔ kartu ini boleh dipajang SEKARANG — KEDUA pertanyaan terjawab ya.
 *
 * Server mengirimkannya sebagai `listable`, dan itulah yang dipakai. Cabang klien mengulang
 * definisi yang sama: ada di rak KITA, DAN kita tahu siapa yang dibayar kalau ia terjual, DAN
 * statusnya masih IN_CUSTODY.
 *
 * ⚠️ `inCustody && !ownerLinked` adalah kombinasi yang DULU MUSTAHIL dan sekarang normal. Layar
 * yang menawarkan tombol "Pajang" berdasarkan custody saja akan menawarkan aksi yang pasti
 * ditolak server — dengan pesan tentang pemilik, di layar yang barusan bilang kartunya sudah
 * diterima.
 */
export function isListable(
  c: ConsignmentCustodyFacts & ConsignmentClaimFacts & { listable?: boolean },
): boolean {
  if (typeof c.listable === "boolean") return c.listable;
  return isInHoshiCustody(c) && !isAwaitingClaim(c) && c.status === "IN_CUSTODY";
}

/**
 * Kalimat untuk OPERATOR tentang sumbu klaim — sengaja tidak memakai kata "diterima"/"di Hoshi"
 * sama sekali, supaya ia tidak pernah terbaca sebagai kalimat tentang custody.
 */
export function claimStatusLine(c: ConsignmentClaimFacts): string | null {
  if (!isAwaitingClaim(c)) return null;
  return "Belum ada akun yang mengklaim kartu ini. Pemiliknya perlu menukarkan kode klaimnya dulu — sampai itu terjadi, hasil penjualannya tidak punya tujuan, jadi kartu ini belum bisa dipajang.";
}

/* ─────────────────────────── bentuk kode klaim ──────────────────────────── */

/**
 * Alfabet Crockford Base32 — CERMIN PERSIS `src/common/consignment-claim-code.ts` di backend.
 *
 * 32 simbol TANPA `I`, `L`, `O`, `U`. I/L/O dibuang karena tertukar dengan 1/1/0 pada tulisan
 * tangan — dan kode ini memang ditulis tangan di tanda terima lalu diketik ulang di ponsel. U
 * dibuang mengikuti Crockford, supaya kode acak tidak pernah tidak sengaja mengeja kata yang tidak
 * pantas di tanda terima bertanda tangan milik orang lain.
 */
const CLAIM_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 10 simbol × 5 bit = 50 bit entropi. Angka milik server; berkas ini hanya mencerminkannya. */
export const CLAIM_CODE_LENGTH = 10;

/** Umur kode sejak diterbitkan. Dipakai untuk menyusun kalimat, bukan sebagai gerbang. */
export const CLAIM_CODE_TTL_DAYS = 30;

/** Ukuran kelompok tampilan: `4T9KM-2X7PQ`. Tanda hubungnya KOSMETIK — server membuangnya. */
const CLAIM_CODE_GROUP = 5;

/** Satu simbol hasil pemetaan Crockford (O→0, I/L→1), atau null kalau ia bukan simbol kode. */
function claimCodeSymbol(ch: string): string | null {
  const mapped = ch === "O" ? "0" : ch === "I" || ch === "L" ? "1" : ch;
  return CLAIM_CODE_ALPHABET.includes(mapped) ? mapped : null;
}

/**
 * Bentuk SAMBIL DIKETIK: buang apa pun yang bukan simbol kode, petakan O→0 dan I/L→1, berhenti di
 * panjang kode.
 *
 * SENGAJA MEMBUANG (bukan menolak) karakter asing — di situlah bedanya dengan `normalizeClaimCode`
 * di bawah. Orang yang menempelkan "Kode klaim kamu: 4T9KM-2X7PQ" dari WhatsApp harus melihat
 * kodenya rapi di kolom, bukan kolom yang menolak seluruh tempelan. Yang memutuskan sah atau tidak
 * tetap bentuk kanoniknya — dan pada akhirnya server.
 */
export const claimCodeInput = (raw: string): string => {
  let out = "";
  for (const ch of (raw ?? "").toUpperCase()) {
    const sym = claimCodeSymbol(ch);
    if (sym == null) continue;
    out += sym;
    if (out.length === CLAIM_CODE_LENGTH) break;
  }
  return out;
};

/**
 * Bentuk KANONIK, atau null kalau ia tidak mungkin menjadi kode klaim.
 *
 * CERMIN PERSIS `normalizeClaimCode` di backend, TERMASUK sifat menolaknya: karakter di luar
 * alfabet dan panjang yang tidak tepat menghasilkan null. Gunanya di sini cuma satu — tombol
 * "Klaim" baru menyala untuk sesuatu yang memang bisa ditukarkan.
 *
 * ⚠️ `null` BUKAN pesan untuk pengguna. Server menjawab bentuk yang salah dengan penolakan yang
 * SAMA PERSIS dengan "kode tidak ditemukan"; memisahkan keduanya di layar akan mengembalikan
 * oracle yang susah payah ditutup di sana.
 */
export const normalizeClaimCode = (raw: string): string | null => {
  let out = "";
  for (const ch of (raw ?? "").toUpperCase()) {
    if (ch === "-" || ch === " " || ch === "_") continue;
    const sym = claimCodeSymbol(ch);
    if (sym == null) return null;
    out += sym;
    if (out.length > CLAIM_CODE_LENGTH) return null;
  }
  return out.length === CLAIM_CODE_LENGTH ? out : null;
};

/**
 * Tampilan untuk dibaca/disalin manusia: `4T9KM-2X7PQ`.
 *
 * Menerima BENTUK APA PUN — kode dari server (yang sudah berformat), atau isi kolom yang baru
 * setengah diketik — jadi ia aman dipakai sekaligus sebagai nilai kolom input.
 */
export const formatClaimCode = (raw: string): string => {
  const clean = claimCodeInput(raw);
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += CLAIM_CODE_GROUP) {
    groups.push(clean.slice(i, i + CLAIM_CODE_GROUP));
  }
  return groups.join("-");
};

/** Sudah berbentuk kode utuh? Kalau belum, tombol klaimnya memang belum pantas menyala. */
export const isCompleteClaimCode = (raw: string): boolean => normalizeClaimCode(raw) != null;

/**
 * Cadangan kalimat penolakan — dipakai HANYA kalau server tidak mengirimkan kalimatnya sendiri.
 *
 * Rute penukaran di backend sudah memakai SATU pesan untuk SEMUA sebab (bentuk salah, tidak
 * ditemukan, kedaluwarsa, sudah dipakai, titipan dibatalkan), dan pesan itulah yang ditampilkan
 * apa adanya — memecahnya di klien akan mengembalikan oracle yang ditutup di sana. Konstanta ini
 * ada supaya kegagalan yang tidak membawa pesan (proxy, body bukan JSON) tidak berubah menjadi
 * "HTTP 404" di depan orang yang baru menyerahkan kartunya.
 *
 * ⚠️ Kalimat ini (dan kalimat penolakan dari server, yang berbunyi serupa) menyuruh orang
 * menghubungi tim Hoshi. Layar yang menampilkannya WAJIB menyertakan tautannya
 * (`claimCodeSupportDraft` + `supportComposeHref`) — lihat `app/titipan/klaim/page.tsx`. Justru
 * KARENA layar itu tidak boleh menjelaskan sebab penolakan, pintu ke manusia adalah satu-satunya
 * jalan keluar yang tersisa; "hubungi tim Hoshi" tanpa tautan berarti tidak ada jalan keluar.
 */
export const CLAIM_CODE_REJECTED =
  "Kode klaim ini tidak berlaku. Periksa lagi kode pada tanda terima kamu — huruf besar-kecil dan " +
  "tanda hubung tidak berpengaruh. Kode hanya bisa dipakai sekali dan berlaku " +
  `${CLAIM_CODE_TTL_DAYS} hari sejak diterbitkan; kalau sudah lewat atau kertasnya hilang, ` +
  "hubungi tim Hoshi yang menerima kartumu untuk penerbitan ulang.";

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

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   RENTANG HARGA YANG BENAR-BENAR BISA DITAGIHKAN

   Batas IDRX berlaku pada nominal yang DITAGIHKAN ke pembeli, bukan pada harga kartunya: biaya
   layanan QRIS ~0,7% DITAMBAHKAN di atas harga, jadi rentang harga kartu yang sah lebih sempit
   daripada rentang mint (Rp 20.000 – Rp 1 miliar).

   ⚠️ DIKETIK ULANG DI SINI, DAN ITU DISENGAJA — DENGAN SATU SYARAT. Sumbernya adalah
   `CHARGEABLE_PRICE_MIN_IDRX` / `CHARGEABLE_PRICE_MAX_IDRX` di backend
   (`src/payments/idrx-mint-bounds.ts`), yang MENGHITUNG kedua angka ini dari fee-nya dan punya
   test yang memakukannya persis ke 19.860 dan 993.048.659. Frontend ini tidak mengimpor apa pun
   dari repo backend dan belum ada rute yang mengirimkan batasnya, jadi tidak ada cara membacanya
   saat ini. Kalau suatu hari fee QRIS berubah, KEDUA angka di bawah ikut berubah di sana dan HARUS
   diperbarui di sini — yang gagal bukan tagihannya, melainkan petunjuk di formulir intake, dan itu
   gagal dengan diam.

   Yang MENEGAKKANNYA tetap server: `createIntake` menolak `askPriceIdr` di luar rentang ini
   (`isChargeablePrice`), begitu pula rute pajang dan rute ubah harga. Angka di sini hanya supaya
   operator tahu batasnya SEBELUM menyepakati harga di depan pemilik kartu — bukan sesudah.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Harga kartu terendah yang tagihannya masih bisa terbit. */
export const CHARGEABLE_PRICE_MIN_IDR = 19_860;

/** Harga kartu tertinggi yang tagihannya masih bisa terbit. */
export const CHARGEABLE_PRICE_MAX_IDR = 993_048_659;

/** "Rp 19.860 – Rp 993.048.659" — satu bentuk, dipakai di petunjuk maupun di kalimat penolakan. */
export const chargeablePriceRange = (): string =>
  `Rp ${CHARGEABLE_PRICE_MIN_IDR.toLocaleString("id-ID")} – Rp ${CHARGEABLE_PRICE_MAX_IDR.toLocaleString(
    "id-ID",
  )}`;

/**
 * Harga ini bisa ditagihkan ke pembeli?
 *
 * Ambangnya PERSIS sama dengan `isChargeablePrice` di server — inklusif di kedua ujung. Harga yang
 * belum diketik (kosong → NaN/0) dijawab `false`, tapi layar pemanggil yang memutuskan apakah itu
 * pantas disebut sebagai kesalahan: "belum diisi" bukan "di luar rentang".
 */
export const isChargeablePrice = (priceIdr: number): boolean =>
  Number.isFinite(priceIdr) &&
  priceIdr >= CHARGEABLE_PRICE_MIN_IDR &&
  priceIdr <= CHARGEABLE_PRICE_MAX_IDR;

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   DUA ANGKA YANG TIDAK BOLEH TERTUKAR — dan yang pernah tertukar, dengan akibat yang mahal.

   ┌──── ANGKA DI STRUK vs ANGKA DI PAJANGAN ───────────────────────────────────────────────────┐
   │ `askPriceIdr`      HARGA YANG DISEPAKATI. Ia tertulis di struk serah-terima bertanda tangan │
   │                    yang DIPEGANG PEMILIKNYA. Ia tidak berubah karena apa pun yang terjadi   │
   │                    di marketplace.                                                          │
   │ `listing.priceIdrx` HARGA PAJANG. Admin boleh menurunkannya (mis. 20jt → 17jt), dan ia      │
   │                    hanya berarti SELAMA PAJANGANNYA HIDUP (`status === "ACTIVE"`).          │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   KENAPA INI PUNYA FUNGSINYA SENDIRI. `Listing.consignmentId` @unique di backend: relasinya 1-1
   dan baris listing yang SAMA dipakai ulang saat kartunya dipajang lagi. Jadi titipan yang
   pemiliknya tarik dari pajangan TETAP menggendong baris listing CANCELLED berisi harga pajang
   TERAKHIRNYA. `c.listing?.priceIdrx ?? c.askPriceIdr` — yang terlihat wajar — karenanya membaca
   angka dari pajangan yang sudah mati dan menyebutnya "harga yang disepakati": pemiliknya membaca
   angka yang LEBIH RENDAH daripada yang ada di kertas yang ia pegang, di halaman yang seluruh
   gunanya adalah membuktikan bahwa kami memegang janji.

   `listMine` di backend sekarang juga TIDAK MENGIRIM listing yang CANCELLED, jadi ini lapis
   kedua — bukan satu-satunya. Dua lapis disengaja: yang satu menutup jalur datanya, yang satu
   menutup kemungkinan sebuah layar menulis rumus itu lagi.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Bentuk minimum untuk menjawab "berapa harga kartu ini, dan harga yang mana". */
export type ConsignmentPriceFacts = {
  askPriceIdr: number;
  listing?: { status: string; priceIdrx: number } | null;
};

/**
 * HARGA YANG DISEPAKATI — angka di struk. SELALU `askPriceIdr`, tanpa kecuali.
 *
 * Sengaja sebuah fungsi meski isinya satu field: yang dijaga bukan perhitungannya, melainkan
 * larangan menambahkan `?? listing.priceIdrx` ke dalamnya suatu hari nanti.
 */
export const agreedPriceIdr = (c: ConsignmentPriceFacts): number => c.askPriceIdr;

/**
 * HARGA PAJANG YANG BENAR-BENAR TAYANG, atau null kalau tidak ada pajangan hidup.
 *
 * null ≠ 0: "tidak sedang dipajang" bukan "dipajang nol rupiah". FAIL-CLOSED — status apa pun
 * selain ACTIVE (CANCELLED, SOLD, PENDING_ESCROW, atau nilai baru dari server) dibaca sebagai
 * tidak tayang.
 */
export const livePriceIdr = (c: ConsignmentPriceFacts): number | null =>
  c.listing && c.listing.status === "ACTIVE" ? c.listing.priceIdrx : null;

/**
 * Pajangannya masih bisa dibuka di marketplace?
 *
 * Listing CANCELLED adalah JALAN BUNTU, bukan tautan — dan tautan ke jalan buntu di halaman yang
 * sedang membuktikan bahwa barang orang aman adalah kerugian bersih. SOLD tetap boleh dibuka:
 * itu bukti penjualannya, dan pemiliknya berhak melihat halaman yang membuat kartunya laku.
 */
export const hasOpenableListing = (c: {
  listing?: { id: string; status: string } | null;
}): boolean =>
  !!c.listing && (c.listing.status === "ACTIVE" || c.listing.status === "SOLD");

/* ─────────────────────────── harga terendah yang disepakati ─────────────────────────── */

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `reservePriceIdr` ADALAH JANJI YANG DIUCAPKAN DI DEPAN PEMILIK KARTU.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Operator duduk di ruang tamu orang dan berkata "kami tidak akan melepas di bawah Rp 20 juta",
 * lalu mengetik angka itu. Selama angka itu tidak muncul lagi di layar mana pun, ia tidak
 * mengikat apa pun: berminggu-minggu kemudian orang yang sama (atau orang lain) bisa menurunkan
 * harga ke Rp 15 juta tanpa satu pun layar menyebut bahwa ada janji yang sedang dilanggar.
 *
 * Ini SENGAJA bukan gerbang. Menurunkan di bawah lantai kadang MEMANG yang disepakati ulang lewat
 * telepon, dan memblokirnya hanya akan melahirkan jalan memutar yang tidak tercatat. Yang
 * dibutuhkan adalah angkanya TERLIHAT pada detik keputusan dibuat, supaya menurunkannya menjadi
 * tindakan sadar yang alasannya tertulis — dan alasan itu memang sudah wajib di rute harga.
 *
 * Padanannya di server: `belowReserveWarning()` di `consignment.service.ts`, yang dipakai rute
 * pajang DAN rute ubah harga, mengembalikan kalimatnya di `belowReserveWarning` pada respons, dan
 * menuliskan kalimat yang sama ke baris audit. Ambangnya PERSIS SAMA — `harga < reserve`, tanpa
 * toleransi: kalau tidak, operator melihat layar yang tenang lalu menerima peringatan dari server
 * — atau, jauh lebih buruk, sebaliknya.
 *
 * SATU-SATUNYA tambahan di sisi ini adalah `priceIdr > 0`, dan itu bukan ambang yang berbeda:
 * kolom harga yang masih KOSONG terbaca sebagai 0, dan 0 di sini berarti "belum ada angka", bukan
 * "harga nol rupiah". Server tidak pernah menemui keadaan itu (DTO-nya menolak harga ≤ 0), jadi
 * tidak ada satu pun harga yang benar-benar bisa dikirim yang dijawab berbeda oleh kedua sisi.
 *
 * PEMBAGIAN TUGASNYA: fungsi di sini menjawab tentang harga yang SEDANG DIKETIK dan belum
 * tersimpan (server belum tahu apa-apa soal itu). Untuk harga yang SUDAH berlaku, jawabannya
 * sudah ada di baris — bendera `belowReserve` dari server — dan itu yang dipakai.
 */
export const isBelowReserve = (
  priceIdr: number,
  reservePriceIdr: number | null | undefined,
): boolean =>
  reservePriceIdr != null &&
  reservePriceIdr > 0 &&
  Number.isFinite(priceIdr) &&
  priceIdr > 0 &&
  priceIdr < reservePriceIdr;

/** Kalimat peringatan untuk OPERATOR, atau null kalau harganya masih di atas lantai. */
export const reserveWarning = (
  priceIdr: number,
  reservePriceIdr: number | null | undefined,
): string | null =>
  isBelowReserve(priceIdr, reservePriceIdr)
    ? `Harga ini DI BAWAH harga terendah yang disepakati dengan pemilik kartu (Rp ${Number(
        reservePriceIdr,
      ).toLocaleString("id-ID")}). Bicarakan dulu dengan dia, lalu tulis kesepakatannya di kolom alasan — alasan itu tersimpan permanen.`
    : null;

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
    case "TAG":
      // TAG (Technical Authentication & Grading) menyediakan halaman CERT SEARCH resmi di
      // domainnya sendiri: nomor sertifikat diketik di situ untuk membuka DIG Report kartunya.
      // SENGAJA TIDAK deep-link per-sertifikat: tautan "DIG Report" yang bisa dibagikan hidup di
      // pemendek `tagd.co`, bukan di taggrading.com, dan kita belum memverifikasinya. Mengikuti
      // aturan berkas ini — menebak URL lalu mengirim pemilik kartu ke halaman 404 lebih buruk
      // daripada memberinya halaman pencarian yang PASTI ada. Sama persis dengan cara BGS di
      // bawah ditangani.
      return "https://taggrading.com/pages/cert-search";
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
  /**
   * Akun Hoshi yang memiliki kartu ini — dan ia BOLEH null.
   *
   * null berarti kartunya sudah tercatat (mungkin malah sudah ada di rak Hoshi) tapi BELUM ADA
   * akun yang terhubung ke sana: pemiliknya belum punya akun saat kartunya diserahkan. Baris
   * seperti itu tidak bisa dipajang, karena hasil penjualannya tidak punya tujuan.
   *
   * Yang menyambungkannya kemudian adalah KODE KLAIM yang dipegang pemiliknya — bukan email.
   * `User.email` di backend tidak unik dan tidak pernah diverifikasi (hanya `walletAddress` yang
   * `@unique`), jadi mencocokkan kartu senilai puluhan juta ke "siapa pun yang mengaku memakai
   * alamat email itu" adalah cara paling mudah menyerahkan barang orang ke orang lain.
   */
  consignorId: string | null;
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
  /** "PSA" | "TAG" | "CGC" | "BGS"; null = kartu MENTAH (belum di-grade). */
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

  /* ── PENGEMBALIAN KARTU KE PEMILIKNYA: KE MANA, SIAPA YANG BAYAR, APAKAH SAMPAI ────────────
     Sebelum kolom-kolom ini ada, satu-satunya hal yang diketahui sistem tentang kartu yang
     "ditarik" adalah bahwa ia ditarik. Ke mana ia dikirim, siapa yang menanggung ongkirnya, dan
     apakah ia benar-benar sampai tidak tercatat di mana pun — jadi sebuah baris bisa berbunyi
     selesai sementara kartunya masih di rak.

     "DITARIK" DAN "SUDAH PULANG" ADALAH DUA FAKTA YANG BERBEDA. `withdrawRequestedAt` adalah
     permintaannya; `custodyReleasedAt` adalah perpindahan fisiknya. Layar TIDAK BOLEH menurunkan
     yang kedua dari yang pertama: selama kartunya masih di rak, ia masih tanggung jawab Hoshi. */

  /** "PICKUP" (diambil sendiri) | "COURIER" (dikirim kurir). null = belum ditentukan. */
  returnMethod: string | null;

  /* Alamat tujuan — SNAPSHOT, bentuknya SAMA dengan alamat kirim domestik (`CardRedemption`). */
  returnRecipientName: string | null;
  returnPhoneCountryCode: string | null;
  returnPhoneNumber: string | null;
  returnStreet: string | null;
  returnApt: string | null;
  returnCity: string | null;
  /** Provinsi. Ikut menentukan tier ongkir balik. */
  returnState: string | null;
  returnZip: string | null;
  returnCountry: string | null;

  /* Resi — bukti yang bisa diperiksa PEMILIK KARTU sendiri, bukan "kata Hoshi". */
  returnCourier: string | null;
  returnTrackingNo: string | null;

  /** Siapa yang mengambil kartunya di tempat (metode PICKUP). "Kapan"-nya `custodyReleasedAt`. */
  returnPickedUpBy: string | null;

  /**
   * "OWNER" | "HOSHI". ⚠️ DICATAT SAJA — penagihannya BELUM otomatis, dan tidak ada satu Rupiah
   * pun yang bergerak dari sini. Menarik kartu tetap GRATIS bagi pemiliknya; UI TIDAK BOLEH
   * menulis kalimat yang berbunyi seolah pemilik akan ditagih.
   */
  returnShippingPayer: string | null;
  /** Nominal ongkir balik (Rupiah utuh). 0 = digratiskan/diambil sendiri; null = belum dicatat. */
  returnShippingFeeIdr: number | null;

  /* penautan pemilik — SUMBU KEDUA, terpisah dari custody (lihat §KODE KLAIM di atas) */
  /** Kapan pemiliknya tertaut. null = belum pernah. Fakta append-only, seperti stempel custody. */
  consignorLinkedAt: string | null;
  /** Lewat mana ia tertaut: saat serah-terima, lewat kode klaim, atau ditautkan admin. */
  consignorLinkMethod: ConsignorLinkMethod | string | null;

  /* kode klaim — HASH-nya yang disimpan server; TEKS kodenya tidak pernah ada di baris ini */
  claimCodeIssuedAt: string | null;
  /** Kapan kode yang berlaku sekarang kedaluwarsa. null = tidak ada kode hidup. */
  claimCodeExpiresAt: string | null;

  /* hasil */
  soldOrderId: string | null;
  payoutIdrx: number | null;
  commissionIdrx: number | null;

  createdAt: string;
  updatedAt: string;

  /* ── TIGA JAWABAN TERPISAH DARI SERVER (`custodyFlags`), dan memang harus terpisah ──────────
     inCustody          kartunya ADA di rak Hoshi.
     ownerLinked        kita TAHU siapa yang dibayar kalau ia terjual.
     awaitingOwnerClaim kartunya tercatat, tapi pemiliknya belum menukarkan kode klaimnya.
     listable           boleh dipajang SEKARANG — hanya kalau dua yang pertama sama-sama ya.

     `inCustody && !ownerLinked` dulu mustahil dan sekarang normal. Menurunkan salah satunya dari
     yang lain di klien akan menghidupkan kembali persis anggapan itu. */
  inCustody?: boolean;
  ownerLinked?: boolean;
  awaitingOwnerClaim?: boolean;
  listable?: boolean;

  /* ── PENGEMBALIAN, DIJAWAB SERVER (`custodyFlags`) ──────────────────────────────────────────
     returnAddressComplete  alamat pengembaliannya lengkap menurut SATU-SATUNYA definisi yang ada
                            (`isReturnAddressComplete` di backend). Relevan untuk COURIER.
     returnPlanReady        kita tahu CUKUP untuk berani melepas custody.
     returnPending          sudah diminta kembali, TAPI kartunya MASIH di rak kita.

     KENAPA TIDAK DIHITUNG DI SINI. Aturannya sudah hidup di dua tempat yang tidak bisa dilanggar
     (predikat klaim + CHECK database). Salinan ketiga di klien berarti salah satunya akan
     diam-diam salah, lalu menawarkan tombol "Catat kartu keluar" yang pasti ditolak — sementara
     pemilik kartunya berdiri menunggu di depan meja. */
  returnAddressComplete?: boolean;
  returnPlanReady?: boolean;
  returnPending?: boolean;

  /* ── LANTAI HARGA, dijawab server (lihat `custodyFlags`) ────────────────────────────────────
     effectivePriceIdr  harga yang BENAR-BENAR berlaku: harga listing kalau ia masih tayang,
                        kalau tidak harga kesepakatan. Itu angka yang dilihat pembeli.
     belowReserve       harga yang berlaku SEKARANG ada di bawah `reservePriceIdr`.

     Keduanya tentang harga yang SUDAH berlaku. Untuk harga yang sedang DIKETIK operator (belum
     tersimpan) server belum punya pendapat — itu tugas `reserveWarning` di berkas ini. */
  effectivePriceIdr?: number;
  belowReserve?: boolean;
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
export const requestConsignmentReturn = (
  id: string,
  token: string,
  note?: string,
  returnPlan?: ConsignmentReturnPlan,
) =>
  req<MyConsignment>(`/consignments/${id}/withdraw`, token, {
    method: "POST",
    body: JSON.stringify({
      ...(note ? { note } : {}),
      ...(returnPlan ? { returnPlan } : {}),
    }),
  });

/**
 * ══ TUKARKAN KODE KLAIM ══  `POST /consignments/claim`  ·  body `{ code }`
 *
 * Dipanggil oleh orang yang SEDANG LOGIN, jadi yang tertaut ke kartu itu adalah akun yang
 * wallet-nya sudah menandatangani SIWS — bukan alamat email yang diketik sendiri. Itulah seluruh
 * isi keamanannya: kode yang berpindah tangan bersama kartunya, ditambah akun yang terbukti
 * menandatangani.
 *
 * Jawabannya SATU baris titipan (server menjawab `byId` dari baris yang baru tertaut): satu kode
 * membuka tepat satu kartu, karena `claimCodeHash` `@unique` di sana.
 *
 * ── PESAN PENOLAKAN DIPAKAI APA ADANYA, dan itu keputusan yang perlu dijelaskan ───────────────
 * Rute ini di backend sudah menjawab SEMUA sebab dengan objek yang SAMA PERSIS — bentuk salah,
 * tidak ditemukan, kedaluwarsa, sudah dipakai, titipan dibatalkan — justru supaya ia tidak bisa
 * dipakai menebak kode orang. Jadi kalimatnya aman ditampilkan, dan ia LEBIH BERGUNA daripada
 * kalimat karangan klien: ia menyebut masa berlaku dan menyebut penerbitan ulang sebagai jalan
 * keluarnya. Yang TIDAK boleh terjadi adalah klien memecahnya lagi berdasarkan status HTTP —
 * itu mengembalikan oracle yang ditutup di sana.
 *
 * Kegagalan yang TIDAK membawa kalimat (proxy, body bukan JSON) merosot ke `CLAIM_CODE_REJECTED`
 * untuk 4xx, dan ke pesan apa adanya untuk 5xx — "server sedang bermasalah" memang bukan jawaban
 * tentang kodenya, dan menyamarkannya hanya akan membuat orang mengetik ulang kode yang benar.
 */
export async function redeemClaimCode(code: string, token: string): Promise<MyConsignment> {
  // Dinormalkan di klien juga, memakai aturan yang SAMA PERSIS dengan server (Crockford, O→0,
  // I/L→1). Bukan untuk menggantikan normalisasi server — ia tetap menormalkan lagi — melainkan
  // supaya yang melintasi jaringan adalah bentuk kanoniknya, bukan tempelan WhatsApp lengkap
  // dengan spasi dan tanda kutipnya.
  const normalized = normalizeClaimCode(code);
  const res = await fetch(`${API_BASE}/consignments/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    // Bentuk yang tidak mungkin TETAP DIKIRIM (apa adanya) alih-alih ditolak di sini: penolakan
    // lokal dan penolakan server harus terlihat sama persis bagi pengguna, dan satu-satunya cara
    // menjamin itu adalah membiarkan server yang menjawabnya.
    body: JSON.stringify({ code: normalized ?? code }),
  });

  if (!res.ok) {
    // ══ REM, BUKAN PENOLAKAN KODE — dan bedanya penting bagi orang yang membacanya ══
    //
    // 429 TIDAK mengatakan apa pun tentang kode yang baru diketik: ia mengatakan bahwa sudah ada
    // terlalu banyak percobaan dari IP ini semenit terakhir. Dibiarkan lewat ke cabang di bawah,
    // yang muncul di layar adalah `message` mentah dari Nest — "ThrottlerException: Too Many
    // Requests" — kepada kolektor yang sedang mencoba mengklaim kartunya sendiri. Ditangkap di
    // SINI, di atas semua cabang lain, karena ia satu-satunya kegagalan di rute ini yang BUKAN
    // tentang kodenya, dan karena ia satu-satunya yang punya jawaban konkret: tunggu sekian detik.
    if (res.status === 429) {
      const wait = retryAfterSeconds(res);
      throw new ThrottledError(claimCodeThrottledMessage(wait), wait);
    }
    let msg: string | null = null;
    try {
      const b = (await res.json()) as { message?: string | string[] };
      if (b?.message) msg = Array.isArray(b.message) ? b.message.join(", ") : String(b.message);
    } catch {
      /* body bukan JSON */
    }
    if (msg) throw new Error(msg);
    throw new Error(
      res.status >= 400 && res.status < 500 ? CLAIM_CODE_REJECTED : `HTTP ${res.status}`,
    );
  }

  return (await res.json()) as MyConsignment;
}
