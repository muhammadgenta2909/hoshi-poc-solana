"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   STRUK SERAH TERIMA TITIPAN — kertas yang ditandatangani di ruang tamu orang, DUA LEMBAR.

   Ini satu-satunya barang di seluruh fitur titipan yang tidak hidup di server. Ia kertas, dan
   itulah gunanya: salinan yang dipegang PEMILIK KARTU adalah satu-satunya bukti yang tidak bisa
   kami ubah, kami hapus, atau kami sangkal — tidak seperti setiap baris database di repo ini.
   Foto, jejak audit, dan stempel custody semuanya bukti yang HOSHI yang membuatnya; selembar
   kertas bertanda tangan dua pihak, yang satu lembarnya ada di lemari orang lain, bukan.

   ┌──── KENAPA DUA LEMBAR, IDENTIK, DALAM SATU KALI CETAK ────────────────────────────────────┐
   │ Risiko yang ditakutkan pemilik produk berbunyi: "jangan sampai kita menjual kartu          │
   │ seseorang, tapi ternyata dia sudah jual sendiri ke orang lain." Yang menutup risiko itu     │
   │ bukan kecanggihan melainkan hitam di atas putih yang DIPEGANG KEDUA PIHAK. Satu lembar      │
   │ saja berarti hanya satu pihak yang punya bukti — dan pihak itu adalah kami, yang juga       │
   │ memegang barangnya. Bukti sepihak tentang barang orang lain bukan bukti.                    │
   │                                                                                            │
   │ Dua lembar itu SENGAJA identik ISI KESEPAKATANNYA — syarat, harga, komisi, rincian kartu,  │
   │ tanda tangan — dan hanya berbeda di kepalanya ("LEMBAR UNTUK PEMILIK KARTU" / "LEMBAR      │
   │ UNTUK HOSHI"). Kesepakatan yang berbeda sedikit saja akan melahirkan persoalan yang lebih  │
   │ buruk daripada tidak ada struk sama sekali: dua kertas bertanda tangan yang berbunyi lain. │
   │                                                                                            │
   │ SATU HAL YANG MEMANG BEDA, DAN HARUS BEDA: kode klaim hanya tercetak di lembar PEMILIK.    │
   │ Ia kunci pembawa, bukan isi kesepakatan. Alasan lengkapnya ada di atas fungsi `sheet`.     │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   JENDELA TERPISAH, seperti `ClaimCodeHandover.printSlip` — dan alasannya sama persis: halaman
   admin itu gelap dan penuh panel, dan mencetaknya berarti melawan seluruh gaya globalnya.
   Dokumen sendiri jauh lebih pasti, dan isinya bisa disusun sebagai apa yang memang dibutuhkan:
   selembar perjanjian yang masih terbaca setahun kemudian. TIDAK ADA library baru — `window.open`
   + `document.write`, persis jalur yang sudah terbukti jalan di ponsel operator.

   ⚠️ NOMOR IDENTITAS LENGKAP TIDAK PERNAH ADA DI SINI, karena ia tidak pernah ada di mana pun:
   backend hanya menyimpan JENIS dokumen + EMPAT ANGKA TERAKHIR. Kertas yang memuat nomor KTP utuh
   adalah barang berharga milik orang lain yang beredar di tas operator.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useState } from "react";
import { commissionPct, estimatedPayout, formatClaimCode } from "@/lib/consignment";

/**
 * Apa yang dicetak. Nama field-nya sengaja SAMA PERSIS dengan kolom baris titipan
 * (`ConsignmentBase`), supaya kedua layar yang memakainya bisa menyerahkan barisnya apa adanya
 * dan tidak ada satu pun tempat yang memetakan ulang nilai — pemetaan ulang adalah tempat
 * "harga di struk" dan "harga di database" mulai bisa berbeda.
 */
export type HandoverReceiptData = {
  id: string;

  /* pemilik — SNAPSHOT hari serah terima */
  consignorNameAtIntake: string;
  consignorIdKind?: string | null;
  /** EMPAT ANGKA TERAKHIR saja. Tidak ada tempat di sini untuk nomor lengkap. */
  consignorIdLast4?: string | null;

  /* tempat & waktu */
  receivedAtPlace: string;
  /**
   * Tanggal serah terima (ISO). Untuk titipan yang sudah diterima, isi dengan
   * `custodyAcceptedAt`; untuk yang baru dicatat, biarkan kosong → hari ini. Struk yang dicetak
   * ulang berbulan-bulan kemudian TIDAK BOLEH memakai tanggal cetaknya.
   */
  handoverDate?: string | null;

  /* kartunya */
  cardName: string;
  cardSet?: string | null;
  cardNumber?: string | null;
  language?: string | null;
  tcg?: string | null;
  grader?: string | null;
  certNumber?: string | null;
  gradeLabel?: string | null;
  gradeScore?: number | null;
  rawCondition?: string | null;
  conditionNote: string;

  /* kesepakatan */
  askPriceIdr: number;
  reservePriceIdr?: number | null;
  commissionBps: number;

  /**
   * Kode klaim — HANYA kalau pemiliknya belum punya akun Hoshi dan kodenya baru saja terbit.
   * Ia hidup di memori halaman saja dan tidak bisa dibaca ulang dari server, jadi mencetaknya di
   * struk ini adalah salah satu dari sedikit kesempatan ia berpindah tangan.
   */
  claimCode?: string | null;
};

/**
 * Baris titipan → isi struk. SATU pemetaan, dipakai ketiga layar yang mencetaknya.
 *
 * Pemetaannya DITULIS TANGAN (bukan `{ ...row }`) dengan sengaja: baris titipan membawa jauh
 * lebih banyak kolom daripada yang pantas dicetak — foto, jejak audit, id pesanan, dan kapan
 * kode klaimnya kedaluwarsa. Menyebar barisnya akan membuat setiap kolom BARU di backend
 * diam-diam ikut masuk ke struk bertanda tangan, dan kertas yang isinya bertambah sendiri bukan
 * dokumen yang bisa dipegang siapa pun.
 *
 * DUA HAL YANG SENGAJA DIPUTUSKAN DI SINI, bukan di layar pemanggilnya:
 *   • tanggalnya adalah `custodyAcceptedAt` kalau kartunya SUDAH diterima, dan HARI INI kalau
 *     belum. Struk yang dicetak ulang berbulan-bulan kemudian tidak boleh berbunyi lain dari
 *     lembar yang sudah ditandatangani.
 *   • harganya adalah `askPriceIdr` — harga yang DISEPAKATI saat serah terima — dan TIDAK PERNAH
 *     harga listing yang sedang tayang. Harga listing bisa berubah lewat rute harga; yang
 *     tertulis di kertas bertanda tangan tidak.
 */
export function receiptDataFrom(
  row: {
    id: string;
    consignorNameAtIntake: string;
    consignorIdKind: string | null;
    consignorIdLast4: string | null;
    receivedAtPlace: string;
    custodyAcceptedAt: string | null;
    cardName: string;
    cardSet: string | null;
    cardNumber: string | null;
    language: string | null;
    tcg: string | null;
    grader: string | null;
    certNumber: string | null;
    gradeLabel: string | null;
    gradeScore: number | null;
    rawCondition: string | null;
    conditionNote: string;
    askPriceIdr: number;
    reservePriceIdr: number | null;
    commissionBps: number;
  },
  claimCode?: string | null,
): HandoverReceiptData {
  return {
    id: row.id,
    consignorNameAtIntake: row.consignorNameAtIntake,
    consignorIdKind: row.consignorIdKind,
    consignorIdLast4: row.consignorIdLast4,
    receivedAtPlace: row.receivedAtPlace,
    handoverDate: row.custodyAcceptedAt,
    cardName: row.cardName,
    cardSet: row.cardSet,
    cardNumber: row.cardNumber,
    language: row.language,
    tcg: row.tcg,
    grader: row.grader,
    certNumber: row.certNumber,
    gradeLabel: row.gradeLabel,
    gradeScore: row.gradeScore,
    rawCondition: row.rawCondition,
    conditionNote: row.conditionNote,
    askPriceIdr: row.askPriceIdr,
    reservePriceIdr: row.reservePriceIdr,
    commissionBps: row.commissionBps,
    claimCode: claimCode ?? null,
  };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ RINGKASAN SYARAT — DITULIS UNTUK DIBACA ORANG, BUKAN UNTUK MELINDUNGI HOSHI.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Enam kalimat, dan tidak satu pun berbentuk pasal. Yang membaca kertas ini adalah kolektor yang
 * baru saja menyerahkan barang senilai puluhan juta kepada orang yang baru ia temui hari itu;
 * paragraf hukum enam baris di kertas seperti itu bukan perlindungan, ia cuma cara membuat orang
 * menandatangani sesuatu yang tidak ia baca.
 *
 * URUTANNYA DISENGAJA: yang paling menenangkan duluan (kartunya tetap milikmu), yang paling
 * membatasi di tengah (jangan dijual ke pihak lain), dan dua janji terberat Hoshi di akhir
 * (ganti rugi, dan apa yang terjadi kalau kami tutup). Nomor 6 adalah pertanyaan yang hampir
 * selalu ditanyakan dan hampir tidak pernah dijawab tertulis oleh siapa pun.
 *
 * ⚠️ SETIAP kalimat di sini WAJIB punya padanannya di sistem. Kalimat yang tidak ditegakkan oleh
 * apa pun berubah menjadi janji kosong bertanda tangan, dan itu lebih buruk daripada tidak
 * berjanji:
 *   1 → `Consignment.consignorId` tidak pernah berpindah ke Hoshi; kartu titipan bukan stok kami.
 *   2 → `commissionBps` adalah SNAPSHOT per baris; mengubah komisi standar tidak menyentuhnya.
 *   3 → satu-satunya hal di daftar ini yang ditegakkan oleh KEJUJURAN PEMILIK, bukan oleh kode —
 *       dan persis karena itu ia harus tertulis dan ditandatangani.
 *   4 → `POST /consignments/:id/withdraw`, selama `custodyReleasedAt` masih null. PENARIKANNYA
 *       memang gratis — tidak ada satu pun mutasi saldo di jalur itu, dan ada test yang
 *       menguncinya. Tapi ONGKOS KURIR bukan biaya penarikan: `returnShippingPayer` boleh
 *       berisi 'OWNER'. Karena itu kalimatnya TIDAK BOLEH berbunyi "tanpa biaya apa pun" —
 *       versi pertama struk ini berbunyi begitu, dan itu janji tertulis yang dibantah oleh
 *       kolom di database kami sendiri. Yang gratis tanpa syarat adalah AMBIL SENDIRI.
 *   5 → `POST /admin/consignments/:id/compensate` → `CONSIGNMENT_COMPENSATION` di buku besar.
 *       NOMINALNYA DITENTUKAN SERVER dari `askPriceIdr`, bukan diketik operator: `amountIdr` di
 *       DTO-nya kini cuma KONFIRMASI opsional yang, kalau dikirim, wajib sama persis — selisih
 *       berapa pun ditolak dengan kedua angka disebutkan. Karena itu kalimatnya WAJIB menyebut
 *       SATU angka dan menyebutnya dengan nama yang dipakai tabel harga di atas ("harga jual yang
 *       disepakati"), lengkap dengan nominalnya. Versi pertama struk ini berbunyi "sesuai nilai
 *       yang tertulis di struk ini" — padahal struk yang sama mencetak DUA angka (harga jual dan
 *       harga dasar), sehingga kalimat termahal di kertas ini justru yang paling ambigu.
 *   6 → tidak ada kode yang bisa menjamin ini; ia janji perusahaan, dan tempatnya memang di
 *       kertas bertanda tangan, bukan di database.
 *
 * Nomor 5 memuat NOMINAL, jadi daftarnya bergantung pada isi struk — karena itu ia fungsi, bukan
 * konstanta. Angka di kalimat itu dibaca dari `askPriceIdr` YANG SAMA dengan yang dicetak di tabel
 * harga; tidak ada tempat kedua yang bisa menyimpang darinya.
 */
const termsFor = (d: HandoverReceiptData): readonly string[] => [
  "Kartu ini TETAP MILIK PEMILIK selama dititipkan. Hoshi hanya menyimpan dan menjualkannya — kartu titipan bukan milik Hoshi dan tidak pernah menjadi milik Hoshi.",
  "Kalau terjual, komisi Hoshi dipotong dari harga jual. Sisanya menjadi saldo pemilik di akun Hoshi dan bisa ditarik kapan saja.",
  "Selama kartu ini dititipkan, pemilik TIDAK MENJUALNYA ke pihak lain. Satu kartu tidak bisa diserahkan ke dua pembeli.",
  "Pemilik boleh meminta kartunya kembali KAPAN SAJA selama belum terjual. Hoshi tidak memungut biaya penarikan dan tidak memotong komisi apa pun. Diambil sendiri di tempat Hoshi: gratis. Minta dikirim: ongkos kurirnya disepakati saat itu.",
  `Kalau kartu ini hilang atau rusak karena kelalaian Hoshi selama dititipkan, Hoshi mengganti sebesar HARGA JUAL YANG DISEPAKATI di struk ini, yaitu ${rp(
    d.askPriceIdr,
  )}. Hanya angka itu yang menjadi dasar ganti rugi — bukan harga dasar, dan bukan taksiran pasar saat kejadian.`,
  "Kalau Hoshi berhenti beroperasi, seluruh kartu titipan dikembalikan kepada pemiliknya masing-masing.",
];

/** Lolos-HTML untuk apa pun yang diketik manusia. Sama persis dengan `printSlip`. */
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (ch) =>
    ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
  );

const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Alamat halaman klaim — dibangun dari origin yang SEDANG DIBUKA operator, bukan dari konstanta.
 *
 * Alasan yang sama persis dengan `ClaimCodeHandover`: konsol admin dipakai di production,
 * staging, dan laptop developer, dan alamat yang menunjuk lingkungan yang salah adalah alamat
 * yang tidak akan pernah bisa dipakai pemiliknya — kali ini TERCETAK di kertas yang ia simpan.
 */
const claimUrl = () =>
  `${typeof window === "undefined" ? "" : window.location.origin}/titipan/klaim`;

const tanggal = (iso?: string | null) =>
  new Date(iso ?? Date.now()).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

/**
 * Identitas pemilik dalam satu baris — dan tidak pernah lebih dari itu.
 *
 * Tanpa jenis dokumen atau tanpa empat angkanya, barisnya berisi NAMA SAJA alih-alih "KTP ••••"
 * yang kosong. Kolom identitas yang terlihat terisi padahal tidak adalah cara sebuah struk
 * berbohong tanpa ada yang berbohong.
 */
function identitas(d: HandoverReceiptData): string {
  const kind = (d.consignorIdKind ?? "").trim();
  const last4 = (d.consignorIdLast4 ?? "").trim();
  if (!kind && !last4) return d.consignorNameAtIntake;
  if (!last4) return `${d.consignorNameAtIntake} · ${kind}`;
  return `${d.consignorNameAtIntake} · ${kind || "Identitas"} ••••${last4}`;
}

/**
 * Baris "kartunya": yang kosong DIBUANG, bukan dicetak sebagai "—".
 *
 * ┌──── APA YANG DIKETIK, TERBACA DI KERTAS — TANPA KECUALI ──────────────────────────────────┐
 * │ Versi pertama fungsi ini mencetak nomor sertifikat HANYA di dalam cabang `if (d.grader)`.  │
 * │ Akibatnya: operator mengetik nomor sertifikat tapi dropdown grader-nya tertinggal kosong,  │
 * │ dan struk yang ditandatangani berbunyi "Kartu mentah (tidak di-grade)" sambil MEMBUANG     │
 * │ nomornya. Pemilik pulang membawa kertas bertanda tangan yang menggambarkan slab PSA-nya    │
 * │ sebagai kartu mentah — dan kertas itu, bukan layar admin kami, yang ia bawa kalau protes.  │
 * │                                                                                            │
 * │ Karena itu nomor sertifikat (dan grade yang sempat diketik) dicetak DI LUAR cabang grader. │
 * │ Kalau datanya memang janggal — ada nomor sertifikat tapi grader-nya kosong — kejanggalan   │
 * │ itu HARUS terlihat di kertas, bukan dirapikan diam-diam olehnya. Formulir intake sekarang  │
 * │ mencegah kombinasi itu lahir (server pun menolaknya), tapi baris lama dan cetak ulang      │
 * │ bertahun kemudian tetap bisa membawanya.                                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function cardLines(d: HandoverReceiptData): [string, string][] {
  const rows: [string, string][] = [["Nama kartu", d.cardName]];
  const detail = [d.cardSet, d.cardNumber, d.language, d.tcg]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" · ");
  if (detail) rows.push(["Set / nomor / bahasa / TCG", detail]);

  const cert = (d.certNumber ?? "").trim();
  const grade = [d.gradeLabel, d.gradeScore != null ? `skor ${d.gradeScore}` : null]
    .filter(Boolean)
    .join(" · ");

  if (d.grader) {
    rows.push(["Grading", [d.grader, grade || null].filter(Boolean).join(" · ")]);
  } else {
    rows.push(["Grading", "Kartu mentah (tidak di-grade)"]);
    if ((d.rawCondition ?? "").trim()) {
      rows.push(["Kondisi", (d.rawCondition ?? "").trim()]);
    }
    // Grade yang tercatat tanpa grader adalah keterangan setengah jadi — tapi membuangnya dari
    // kertas berarti mengarang keterangan yang lain. Dicetak apa adanya, dengan label yang tidak
    // berpura-pura ia berasal dari grader mana pun.
    if (grade) rows.push(["Grade yang dicatat", grade]);
  }

  // Slab bernomor: identitas yang bisa dicek DI SITUS GRADER-nya sendiri — satu-satunya baris di
  // kertas ini yang tidak bersandar pada "kata Hoshi". Dicetak apa pun isi dropdown grader-nya.
  if (cert) rows.push(["Nomor sertifikat", cert]);

  rows.push(["Catatan kondisi saat diterima", d.conditionNote]);
  return rows;
}

/**
 * Satu lembar.
 *
 * ATURANNYA: isi KESEPAKATAN haram berbeda antara kedua lembar (lihat blok pembuka berkas ini).
 * Dua lembar yang syarat, harga, atau rincian kartunya menyimpang adalah dua perjanjian berbeda
 * yang sama-sama bertanda tangan, dan yang dirugikan selalu pihak yang tidak menyimpan aslinya.
 *
 * ┌──── SATU PENGECUALIAN, DAN CUMA SATU: KODE KLAIM ────────────────────────────────────────┐
 * │ Kode klaim BUKAN bagian dari kesepakatan — ia kunci pembawa. Struk ini sendiri menulis    │
 * │ "siapa pun yang memegangnya bisa mengklaim kartu ini ke akunnya", dan kalimat itu benar.  │
 * │                                                                                            │
 * │ Karena itu mencetaknya di lembar Hoshi merusak persis hal yang dijaga seluruh rancangan    │
 * │ kode klaim: bahwa kode itu BERPINDAH TANGAN di ruangan yang sama dengan kartunya, ke satu  │
 * │ orang saja. Lembar Hoshi berakhir di map kantor; map kantor bisa dibuka siapa pun yang ada │
 * │ di kantor, dan kartu puluhan juta berpindah akun tanpa pemiliknya pernah tahu.             │
 * │                                                                                            │
 * │ LEBIH BURUK LAGI kalau digabung dengan syarat foto: lembar bertanda tangan WAJIB difoto    │
 * │ dan diunggah sebagai bukti HANDOVER. Kode yang tercetak di lembar yang difoto akan masuk   │
 * │ ke penyimpanan sebagai GAMBAR YANG TERBACA — permanen, di luar hash, dan kelihatan oleh    │
 * │ setiap admin yang membuka baris itu. Itu sebabnya lembar yang difoto adalah lembar HOSHI.  │
 * │                                                                                            │
 * │ Pemilik tetap memegang kodenya di lembarnya sendiri, yang ia bawa pulang dan tidak difoto. │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function sheet(d: HandoverReceiptData, role: "PEMILIK" | "HOSHI"): string {
  const pct = commissionPct(d.commissionBps);
  const payout = estimatedPayout(d.askPriceIdr, d.commissionBps);
  const rows = cardLines(d);

  return `<section class="page">
  <div class="role">LEMBAR UNTUK ${role === "PEMILIK" ? "PEMILIK KARTU" : "HOSHI"}</div>

  <h1>Struk serah terima titipan</h1>
  <p class="sub">
    Kartu ini DITITIPKAN kepada Hoshi untuk dijualkan. Kepemilikannya tidak berpindah.
    Kedua pihak memegang satu lembar, dan isi kesepakatannya sama.
  </p>

  <table class="kv">
    <tr><td class="k">Nomor titipan</td><td class="mono">${esc(d.id)}</td></tr>
    <tr><td class="k">Tanggal serah terima</td><td>${esc(tanggal(d.handoverDate))}</td></tr>
    <tr><td class="k">Tempat serah terima</td><td>${esc(d.receivedAtPlace)}</td></tr>
    <tr><td class="k">Pemilik kartu</td><td>${esc(identitas(d))}</td></tr>
  </table>

  <h2>Kartu yang dititipkan</h2>
  <table class="kv">
    ${rows.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("\n    ")}
  </table>

  <h2>Kesepakatan harga</h2>
  <table class="kv">
    <tr><td class="k">Harga jual yang disepakati</td><td><strong>${esc(rp(d.askPriceIdr))}</strong></td></tr>
    ${
      d.reservePriceIdr != null && d.reservePriceIdr > 0
        ? `<tr><td class="k">Harga dasar yang disepakati</td><td>${esc(
            rp(d.reservePriceIdr),
          )}</td></tr>`
        : ""
    }
    <tr><td class="k">Komisi Hoshi</td><td>${esc(String(pct))}% dari harga jual</td></tr>
    <tr><td class="k">Perkiraan diterima pemilik</td><td>${esc(rp(payout))} (pada harga di atas)</td></tr>
  </table>
  ${
    /* ┌──── KENAPA KALIMAT INI, DAN BUKAN "TIDAK DILEPAS DI BAWAH INI" ─────────────────────────┐
       │ Versi pertama struk ini memberi label "Harga dasar (tidak dilepas di bawah ini)" — dan   │
       │ TIDAK ADA satu baris kode pun yang menegakkannya. createListingFor dan updatePrice di    │
       │ backend hanya MEMPERINGATKAN (belowReserveWarning) lalu tetap menjalankan                │
       │ perubahannya. Kartu pemilik bisa tayang dan terjual di bawah angka yang tertulis di      │
       │ kertas yang ia pegang, tanpa ia pernah menyetujuinya.                                    │
       │                                                                                          │
       │ Menegakkannya di server bukan pilihan yang benar: menurunkan di bawah lantai kadang      │
       │ MEMANG disepakati ulang lewat telepon, dan memblokirnya hanya melahirkan jalan memutar   │
       │ yang tidak tercatat. Jadi yang diperbaiki adalah KERTASNYA — supaya ia berbunyi persis   │
       │ sebesar apa yang benar-benar ditegakkan: angkanya muncul kembali di layar pada detik     │
       │ keputusan harga dibuat, dan alasan melepas di bawahnya WAJIB diketik (rute harga menolak │
       │ tanpa alasan) lalu tersimpan permanen sebagai baris audit yang tidak bisa dihapus.       │
       └──────────────────────────────────────────────────────────────────────────────────────────┘ */
    d.reservePriceIdr != null && d.reservePriceIdr > 0
      ? `<p class="note">
    <strong>Harga dasar</strong> adalah angka acuan yang disepakati hari ini, bukan kunci otomatis.
    Kalau Hoshi perlu melepas kartu ini di bawah angka itu, Hoshi meminta persetujuan pemilik lebih
    dulu; alasannya dicatat permanen di riwayat titipan ini, dan pemilik bisa melihat angka dasarnya
    kapan saja di halaman titipannya.
  </p>`
      : ""
  }

  ${
    d.claimCode
      ? role === "PEMILIK"
        ? `<h2>Kode klaim — untuk menyambungkan kartu ini ke akun Hoshi kamu</h2>
  <div class="code">${esc(formatClaimCode(d.claimCode))}</div>
  <p class="codehint">
    Buka <strong>${esc(claimUrl())}</strong>, masuk atau daftar, lalu masukkan kode di atas.
    Huruf besar-kecil dan tanda hubung tidak berpengaruh. JANGAN berikan kode ini ke siapa pun —
    siapa pun yang memegangnya bisa mengklaim kartu ini ke akunnya.
  </p>`
        : `<h2>Kode klaim</h2>
  <p class="codehint">
    Kode klaim diterbitkan dan diserahkan ke pemilik kartu, TERCETAK HANYA DI LEMBARNYA.
    Lembar Hoshi sengaja tidak memuatnya — lihat catatan di bawah.
  </p>`
      : ""
  }

  <h2>Syarat titipan</h2>
  <ol class="terms">
    ${termsFor(d)
      .map((t) => `<li>${esc(t)}</li>`)
      .join("\n    ")}
  </ol>

  <div class="signs">
    <div class="sign">
      <div class="signtitle">Pemilik kartu</div>
      <div class="signbox"></div>
      <div class="signname">Nama terang: ${esc(d.consignorNameAtIntake)}</div>
      <div class="signdate">Tanggal: ${esc(tanggal(d.handoverDate))}</div>
    </div>
    <div class="sign">
      <div class="signtitle">Petugas Hoshi</div>
      <div class="signbox"></div>
      <div class="signname">Nama terang: ______________________</div>
      <div class="signdate">Tanggal: ${esc(tanggal(d.handoverDate))}</div>
    </div>
  </div>

  <p class="foot">
    ${
      role === "PEMILIK"
        ? `Simpan lembar ini. Kalau ada yang perlu ditanyakan tentang kartu ini, sebutkan nomor
    titipan di atas. Nomor identitas lengkap tidak pernah disimpan Hoshi — hanya jenis dokumen
    dan empat angka terakhirnya.`
        : `PETUGAS: LEMBAR INI yang difoto dan diunggah sebagai bukti serah terima, setelah kedua
    tanda tangan ada. Jangan memfoto lembar pemilik — di lembar itu tercetak kode klaim, dan foto
    yang terunggah membuat kode itu terbaca oleh setiap admin yang membuka baris ini. Nomor
    identitas lengkap tidak pernah disimpan Hoshi — hanya jenis dokumen dan empat angka terakhirnya.`
    }
  </p>
</section>`;
}

/**
 * Cetak kedua lembar sekaligus. `false` = jendelanya diblokir browser (pemanggil WAJIB
 * mengatakannya ke operator; jendela yang tidak muncul tanpa penjelasan terbaca sebagai
 * aplikasi yang rusak, dan operator akan pamit tanpa struk).
 */
export function printHandoverReceipt(d: HandoverReceiptData): boolean {
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Struk serah terima titipan — ${esc(d.cardName)}</title>
<style>
  /* A4 adalah kertas yang dipakai di kantor. Margin sempit supaya dua lembar tetap masing-masing
     satu halaman meski catatan kondisinya panjang. */
  @page { size: A4; margin: 12mm; }

  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #111; background: #fff; line-height: 1.5; margin: 0; padding: 10px;
         font-size: 12px; }

  /* ── DUA LEMBAR = DUA HALAMAN, dan pemisahnya bukan kebetulan ────────────────────────────
     "page-break-after: always" pada lembar pertama; lembar terakhir dikecualikan supaya tidak
     melahirkan halaman ketiga yang kosong (kegagalan klasik yang membuat operator mengira
     printer-nya bermasalah). "break-after" ikut ditulis untuk mesin cetak yang lebih baru.
     Tanda petik dipakai di sini, bukan backtick: seluruh blok ini hidup di dalam template
     literal TypeScript, dan satu backtick akan mengakhirinya di tengah jalan. */
  .page { max-width: 186mm; margin: 0 auto 14mm; }
  .page + .page { border-top: 1px dashed #bbb; padding-top: 14mm; }
  @media print {
    .page { page-break-after: always; break-after: page; margin-bottom: 0; }
    .page:last-child { page-break-after: auto; break-after: auto; }
    .page + .page { border-top: 0; padding-top: 0; }
  }

  .role { display: inline-block; border: 1.5px solid #111; border-radius: 4px;
          padding: 3px 9px; font-size: 10px; font-weight: 700; letter-spacing: 1px;
          text-transform: uppercase; margin-bottom: 8px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 12px; margin: 14px 0 5px; text-transform: uppercase; letter-spacing: 0.6px;
       border-bottom: 1px solid #111; padding-bottom: 3px; }
  .sub { font-size: 11px; color: #444; margin: 0 0 12px; }

  table.kv { width: 100%; border-collapse: collapse; }
  table.kv td { padding: 4px 0; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  td.k { color: #555; width: 42%; padding-right: 10px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; }

  /* Keterangan pendek di bawah sebuah tabel (mis. arti "harga dasar"). Sengaja lebih kecil dari
     isi tabelnya tapi TIDAK abu-abu pucat: ia menjelaskan sebuah angka yang ditandatangani, jadi
     ia harus tetap terbaca di fotokopi dan di kertas termal yang memudar. */
  .note { font-size: 10.5px; color: #333; margin: 6px 0 0; line-height: 1.45; }

  .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 22px; font-weight: 700; letter-spacing: 3px; text-align: center;
          border: 2px dashed #111; border-radius: 8px; padding: 10px; margin: 6px 0 4px; }
  .codehint { font-size: 10px; color: #444; margin: 0 0 4px; }

  ol.terms { padding-left: 16px; margin: 0; }
  ol.terms li { margin-bottom: 5px; }

  /* Dua kotak tanda tangan berdampingan. "flex" dengan "wrap" supaya di kertas sempit ia
     menumpuk sendiri alih-alih terpotong di tengah. */
  .signs { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; }
  .sign { flex: 1 1 210px; }
  .signtitle { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .signbox { height: 68px; border: 1px solid #111; border-radius: 4px; }
  .signname { font-size: 10.5px; margin-top: 5px; }
  .signdate { font-size: 10.5px; color: #555; }

  .foot { font-size: 9.5px; color: #666; margin-top: 12px; line-height: 1.45; }

  /* ── KERTAS STRUK KECIL (58/80 mm) ────────────────────────────────────────────────────────
     Sebagian operator hanya membawa printer termal. Di lebar segitu, tata letak dua kolom
     mustahil: kolom kunci/nilai ditumpuk, kotak tanda tangan turun ke bawah, dan ukuran huruf
     dikecilkan secukupnya supaya masih terbaca setahun kemudian. Kedua lembarnya TETAP dua
     halaman — justru di kertas struk itu paling penting, karena satu gulungan panjang yang
     dirobek asal akan memotong salah satu tanda tangan. */
  @media print and (max-width: 110mm) {
    body { font-size: 10px; padding: 0; }
    .page { max-width: 100%; }
    h1 { font-size: 14px; }
    table.kv td { display: block; width: 100%; border-bottom: 0; padding: 1px 0; }
    td.k { width: 100%; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
    table.kv tr { display: block; border-bottom: 1px solid #ddd; padding: 3px 0; }
    .code { font-size: 16px; letter-spacing: 2px; }
    .signs { display: block; }
    .sign { margin-bottom: 10px; }
    .signbox { height: 52px; }
  }
</style></head>
<body>
${sheet(d, "PEMILIK")}
${sheet(d, "HOSHI")}
</body></html>`;

  const w = window.open("", "_blank", "width=760,height=900");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Satu tarikan napas untuk layout sebelum dialog cetaknya muncul — tanpa ini sebagian browser
  // mencetak halaman yang masih kosong. Sama dengan `printSlip`.
  w.setTimeout(() => w.print(), 250);
  return true;
}

/**
 * Tombol cetak + kalimat kalau jendelanya diblokir.
 *
 * Dipakai di layar intake (sesudah tersimpan, selagi pemiliknya masih di depan operator) DAN di
 * halaman titipan (untuk mencetak ulang, dan untuk titipan yang struknya belum pernah dicetak).
 */
export default function HandoverReceiptButton({
  data,
  label = "Cetak struk serah terima (2 lembar)",
  hint,
  tone = "utama",
}: {
  data: HandoverReceiptData;
  label?: string;
  /** Satu kalimat di bawah tombol. Isinya berbeda per layar, jadi ia bukan urusan komponen ini. */
  hint?: string;
  /** "utama" = tombol kuning Hoshi (layar intake). "biasa" = tombol netral (halaman titipan). */
  tone?: "utama" | "biasa";
}) {
  const [blocked, setBlocked] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setBlocked(!printHandoverReceipt(data))}
        className={
          tone === "utama"
            ? "rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
            : "rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
        }
        style={
          tone === "utama"
            ? { backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }
            : undefined
        }
      >
        {label}
      </button>
      {hint && <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-400">{hint}</p>}
      {blocked && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-amber-200">
          Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi. Kalau
          memang tidak ada printer di tempat ini, tulis tangan kesepakatannya di atas kertas —
          nomor titipan, nama kartu, harga, komisi, dan tanda tangan kedua pihak — lalu foto
          lembar itu sebagai bukti “Serah terima”.
        </p>
      )}
    </div>
  );
}
