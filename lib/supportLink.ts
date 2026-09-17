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
