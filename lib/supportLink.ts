// Deep-link ke SATU-SATUNYA kanal user → tim yang benar-benar ada di app ini:
// Account menu → "Messages" → tab Support (app/messages/page.tsx, channel "support"),
// yang memakai POST /support/threads (lib/support.ts) dan mendarat di inbox admin
// (lib/admin-api.ts → /admin/support/threads) — thread DUA ARAH, jadi balasan tim
// sampai kembali ke user.
//
// KENAPA FILE INI ADA: layar-layar uang (mis. kegagalan pasca-danai di ShippingFlowModal)
// dulu menyuruh user "kirim ID lewat menu Bantuan". TIDAK ADA menu bernama "Bantuan" di
// app ini — jadi instruksinya tidak bisa dijalankan persis di saat user paling butuh.
// Semua copy yang menyebut kanal support WAJIB lewat sini supaya nama menunya tidak
// pernah lagi dikarang, dan supaya link-nya membuka composer yang SUDAH terisi.
//
// Kontraknya dengan app/messages/page.tsx: ?tab=support&compose=1&subject=…&body=…
// (nama query-param di bawah adalah kontrak itu — jangan ubah salah satu sisi saja).

/** Label PERSIS item Account menu yang menuju ke sini (components/account/AccountMenu.tsx). */
export const SUPPORT_MENU_LABEL = "Messages";

/** Route halaman inbox user. */
export const SUPPORT_ROUTE = "/messages";

export const SUPPORT_QUERY = {
  tab: "tab",
  compose: "compose",
  subject: "subject",
  body: "body",
} as const;

/**
 * Link ke composer support dengan isi yang SUDAH disiapkan. Dipakai tombol di layar yang
 * menyuruh user menghubungi tim — user tidak perlu menyalin apa pun secara manual.
 */
export function supportComposeHref(opts: { subject?: string; body?: string } = {}): string {
  const q = new URLSearchParams();
  q.set(SUPPORT_QUERY.tab, "support");
  q.set(SUPPORT_QUERY.compose, "1");
  if (opts.subject) q.set(SUPPORT_QUERY.subject, opts.subject);
  if (opts.body) q.set(SUPPORT_QUERY.body, opts.body);
  return `${SUPPORT_ROUTE}?${q.toString()}`;
}

/* ═══════════════════════════════════ TITIPAN (consignment) ═══════════════════════════════════
   Layar titipan adalah tempat kalimat "hubungi tim Hoshi" paling mahal di seluruh app: orang
   asing sedang memegang kartu senilai puluhan juta MILIKNYA, dan layarnya menyuruh dia
   menghubungi seseorang tanpa menyebut ke mana. Empat layar pernah berbunyi begitu tanpa satu
   pun tautan — persis kegagalan yang membuat berkas ini lahir.

   Semua draft di bawah menyebut kartunya dan keadaannya APA ADANYA, tidak menjanjikan apa pun
   (tidak ada ganti rugi, tidak ada tenggat), dan ditulis sebagai kalimat PEMILIK KARTU — karena
   dialah yang menekan tombolnya.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Bagian "kartu mana" dari sebuah draft. Sengaja menyertakan id: itu yang dicari tim di admin. */
function consignmentRef(c: { cardName?: string | null; id?: string | null }): string {
  const lines = [`Kartu: ${c.cardName?.trim() || "(nama kartu tidak tercatat di layar)"}`];
  if (c.id) lines.push(`ID titipan: ${c.id}`);
  return lines.join("\n");
}

/**
 * "Kode klaim saya tidak bisa dipakai."
 *
 * Dipakai di halaman klaim, tempat SATU kalimat penolakan menutupi semua sebab (bentuk salah,
 * tidak ada, kedaluwarsa, sudah dipakai) supaya kode orang tidak bisa ditebak. Justru karena
 * layar itu tidak boleh menjelaskan, tautan ke manusia menjadi satu-satunya jalan keluarnya.
 *
 * KODENYA TIDAK IKUT DITULIS di draft — ia rahasia sekali-pakai, dan menempelkannya ke pesan
 * yang akan tersimpan di inbox berarti menyalinnya ke satu tempat lagi.
 */
export function claimCodeSupportDraft(): { subject: string; body: string } {
  return {
    subject: "Kode klaim titipan tidak bisa dipakai",
    body:
      "Halo tim Hoshi,\n\nAku menyerahkan kartuku ke tim Hoshi dan diberi kode klaim, tapi kodenya " +
      "tidak bisa dipakai di halaman klaim.\n\n" +
      "Nama di tanda terima:\nTanggal & tempat serah terima:\nNomor tanda terima (kalau ada):\n\n" +
      "Tolong bantu periksa dan terbitkan kode baru kalau perlu. Terima kasih.",
  };
}

/** "Kartuku belum muncul di daftar titipan." — untuk keadaan kosong di /titipan. */
export function consignmentMissingSupportDraft(): { subject: string; body: string } {
  return {
    subject: "Kartu titipan belum muncul di akunku",
    body:
      "Halo tim Hoshi,\n\nAku sudah menyerahkan kartuku ke tim Hoshi, tapi kartunya belum muncul di " +
      "halaman Titipan Saya.\n\n" +
      "Nama di tanda terima:\nTanggal & tempat serah terima:\nKartu yang diserahkan:\n" +
      "Nomor tanda terima (kalau ada):\n\nTerima kasih.",
  };
}

/**
 * "Kartuku tercatat hilang/rusak di penyimpanan Hoshi."
 *
 * TIDAK menyebut angka dan TIDAK menjanjikan ganti rugi: nominalnya keputusan manusia setelah
 * bicara, dan backend pun tidak pernah membayarnya otomatis.
 */
export function consignmentLostSupportDraft(c: {
  cardName?: string | null;
  id?: string | null;
}): { subject: string; body: string } {
  return {
    subject: `Kartu titipan tercatat hilang/rusak — ${c.cardName?.trim() || "kartu saya"}`,
    body:
      `Halo tim Hoshi,\n\nDi halaman Titipan Saya, kartu ini tercatat hilang atau rusak selagi ada ` +
      `di penyimpanan Hoshi. Aku ingin tahu apa yang terjadi dan langkah berikutnya.\n\n` +
      `${consignmentRef(c)}\n\nTerima kasih.`,
  };
}

/** Pertanyaan umum tentang satu titipan (harga, status, minta kembali yang tertahan). */
export function consignmentSupportDraft(c: {
  cardName?: string | null;
  id?: string | null;
}): { subject: string; body: string } {
  return {
    subject: `Pertanyaan tentang kartu titipan — ${c.cardName?.trim() || "kartu saya"}`,
    body: `Halo tim Hoshi,\n\nAku ingin bertanya tentang kartu titipanku ini.\n\n${consignmentRef(
      c,
    )}\n\nPertanyaanku:\n\nTerima kasih.`,
  };
}

/**
 * Pesan siap-kirim untuk kegagalan jalur kirim fisik. SENGAJA menyebut ID + status apa adanya
 * dan TIDAK menjanjikan refund apa pun — tim yang memutuskan setelah mengecek ke CollectorCrypt.
 */
export function shippingSupportDraft(redemptionId: string, note: string): {
  subject: string;
  body: string;
} {
  return {
    subject: `Pengiriman kartu fisik — ${redemptionId}`,
    body: `Halo tim Hoshi,\n\nAku butuh bantuan untuk permintaan kirim kartu fisik ini.\n\nID pengiriman: ${redemptionId}\nKeterangan: ${note}\n\nTerima kasih.`,
  };
}
