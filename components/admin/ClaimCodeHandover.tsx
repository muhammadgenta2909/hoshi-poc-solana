"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KODE KLAIM — barang yang PULANG BERSAMA PEMILIK KARTU.

   Operator sedang berdiri di ruang tamu orang, memegang ponsel, dan baru saja menerima kartu
   senilai puluhan juta dari seseorang yang belum punya akun Hoshi. Kode ini adalah satu-satunya
   benang yang nanti menyambungkan kartu itu ke akunnya. Kalau kode ini tidak benar-benar
   berpindah tangan sebelum operator pamit, kartunya akan tergeletak di rak tanpa pemilik dan
   tidak ada layar mana pun yang bisa memperbaikinya sendiri.

   Karena itu komponen ini SENGAJA merepotkan: ia tidak bisa ditutup dengan "Selesai" sampai
   operator menyatakan kodenya sudah diberikan. Bukan untuk menyulitkan — untuk memindahkan satu
   langkah dari "nanti diingat" menjadi "sekarang dilakukan".

   TIGA CARA MEMBERIKANNYA, karena tiga keadaan berbeda benar-benar terjadi di lapangan:
     • SALIN   — operator menempelkannya ke chat apa pun yang sedang terbuka.
     • WHATSAPP— nomor pemiliknya sudah dicatat di tanda terima; ini jalur yang paling sering.
                 Tombolnya HANYA muncul untuk nomor yang yakin Indonesia (lihat `waTarget`); untuk
                 nomor lain ia hilang DAN alasannya ditulis, karena tombol yang lenyap tanpa
                 penjelasan membuat operator pamit tanpa menyerahkan kode sama sekali.
     • CETAK   — rumah tanpa sinyal, atau pemilik yang memang ingin secarik kertas. Slipnya
                 dicetak dari jendela terpisah supaya tidak bergantung pada gaya halaman admin.

   KODE INI HANYA MUNCUL SEKALI. Server menyimpan hash-nya, bukan kodenya — jadi tidak ada layar
   yang bisa menampilkannya lagi nanti, termasuk layar ini. Yang hilang diganti dengan kode BARU.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useMemo, useState } from "react";
import { formatClaimCode } from "@/lib/consignment";
import { copyText } from "@/components/account/ui";

/**
 * Kenapa tombol WhatsApp tidak bisa ditampilkan. Bukan kode internal — tiap nilai punya kalimat
 * sendiri untuk operator, karena "tombolnya hilang tanpa penjelasan" adalah kegagalannya sendiri.
 */
export type WaRefusal =
  /** Tidak ada angka sama sekali di kolom nomor HP. */
  | "KOSONG"
  /** Ditulis sebagai nomor internasional, dan kode negaranya BUKAN +62. */
  | "LUAR_NEGERI"
  /** Ada angkanya, tapi bentuknya bukan nomor HP Indonesia (fixed line, salah ketik, dua nomor). */
  | "BUKAN_HP_INDONESIA";

export type WaTarget = { ok: true; wa: string } | { ok: false; why: WaRefusal };

/**
 * Bagian nasional (tanpa 62/0) sebuah nomor HP Indonesia.
 *
 * Diawali `8`, lalu SALAH SATU dari 1,2,3,5,7,8,9 — itu seluruh blok prefix seluler yang dipakai
 * di Indonesia (0811–0819, 0821–0823/0828, 0831–0838, 0851–0859, 0877–0878, 0881–0889, 0895–0899).
 * Tidak ada 80x, 84x, atau 86x di sini, dan justru ketiadaan itu yang bekerja: nomor Jepang
 * (080…), Vietnam, atau Cina yang ditulis tanpa tanda `+` jatuh di luar pola ini alih-alih
 * diam-diam menjadi nomor Indonesia yang sah.
 *
 * Panjang total 9–12 angka (0811-123-456 yang pendek sampai 0896-xxxx-xxxx yang panjang).
 */
const ID_MOBILE_NSN = /^8[1235789]\d{7,10}$/;

/**
 * Nomor HP di tanda terima → target wa.me, ATAU alasan kenapa tidak ada target sama sekali.
 *
 * ┌──── SATU ATURAN, DAN ARAH GAGALNYA TIDAK BOLEH TERBALIK ──────────────────────────────────┐
 * │ `consignorPhoneAtIntake` adalah teks bebas: server hanya menuntut minimal 5 karakter, tidak │
 * │ ada validasi bentuk di mana pun. Jadi apa pun bisa ada di sana, termasuk nomor Singapura,   │
 * │ Malaysia, atau Amerika yang ditulis lengkap dengan kode negaranya.                          │
 * │                                                                                             │
 * │ Versi lama membubuhkan "62" ke APA PUN yang tersisa. `+65 9123 4567` menjadi                │
 * │ `626591234567` — sebuah nomor Indonesia yang BENAR-BENAR BISA AKTIF DAN MILIK ORANG LAIN,   │
 * │ dan ke nomor itulah tombolnya mengirim kode klaim beserta tautannya. Rute klaim sengaja     │
 * │ tidak menanyakan apa pun tentang siapa yang memegang kode, jadi siapa pun yang menerima     │
 * │ pesan itu bisa menautkan kartu orang lain ke akunnya sendiri.                               │
 * │                                                                                             │
 * │ Karena itu: tautan hanya dibuat kalau nomornya YAKIN Indonesia. Ragu = tidak ada tombol.    │
 * │ Menolak hanya berarti kodenya diserahkan lewat Salin / Cetak / tulis tangan — semuanya      │
 * │ masih ada di layar ini. Salah kirim tidak punya jalan pulang.                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Yang DITERIMA: `+62…`/`0062…` (internasional, eksplisit Indonesia), `62…`, `0…` (bentuk
 * nasional), dan `8…` (bentuk pendek tanpa nol yang biasa muncul saat nomor disalin dari kontak).
 * Semuanya masih harus lolos {@link ID_MOBILE_NSN} sesudah awalannya dilepas.
 *
 * Yang DITOLAK: apa pun yang ditulis dengan `+` atau `00` diikuti kode negara selain 62, dan apa
 * pun yang sisanya bukan nomor seluler Indonesia — termasuk nomor rumah (021…, yang memang tidak
 * punya WhatsApp) dan kolom berisi dua nomor sekaligus.
 */
export function waTarget(raw: string | null | undefined): WaTarget {
  const text = (raw ?? "").trim();
  if (!text.replace(/\D/g, "")) return { ok: false, why: "KOSONG" };

  let nsn: string;
  // Tanda `+` di mana pun di dalam teks berarti operator MENULIS kode negaranya. Maka kode negara
  // itulah yang berbicara — bukan tebakan kita. Dicari dengan indexOf, bukan startsWith, supaya
  // "HP: +65 9123 4567" tetap terbaca sebagai nomor Singapura.
  const plus = text.indexOf("+");
  if (plus >= 0) {
    const intl = text.slice(plus).replace(/\D/g, "");
    if (!intl.startsWith("62")) return { ok: false, why: "LUAR_NEGERI" };
    nsn = intl.slice(2);
  } else {
    const digits = text.replace(/\D/g, "");
    if (digits.startsWith("00")) {
      // "00" adalah awalan panggilan internasional — sama mengikatnya dengan "+".
      const intl = digits.slice(2);
      if (!intl.startsWith("62")) return { ok: false, why: "LUAR_NEGERI" };
      nsn = intl.slice(2);
    } else if (digits.startsWith("62")) {
      nsn = digits.slice(2);
    } else if (digits.startsWith("0")) {
      nsn = digits.slice(1);
    } else {
      nsn = digits;
    }
  }

  if (!ID_MOBILE_NSN.test(nsn)) return { ok: false, why: "BUKAN_HP_INDONESIA" };
  return { ok: true, wa: `62${nsn}` };
}

/**
 * Apa yang dibaca operator saat tombolnya TIDAK ADA — dan apa yang harus ia lakukan sebagai
 * gantinya. Tiap kalimat menyebut jalan keluarnya, karena kodenya tetap harus berpindah tangan
 * sebelum mereka berpisah.
 */
const WA_REFUSAL_LINE: Record<WaRefusal, string> = {
  KOSONG:
    "Tidak ada nomor HP di tanda terima ini, jadi tombol WhatsApp tidak ditampilkan. Serahkan kodenya sekarang lewat Salin atau Cetak slip, atau tulis tangan di tanda terimanya.",
  LUAR_NEGERI:
    "Nomor di tanda terima ini ditulis dengan kode negara di luar +62, dan Hoshi tidak menebak nomor luar negeri — menebaknya berarti mengirim kode ini ke nomor Indonesia milik orang lain. Serahkan kodenya lewat Salin, Cetak slip, atau tulis tangan; kirim sendiri dari WhatsApp-mu kalau nomornya memang benar.",
  BUKAN_HP_INDONESIA:
    "Nomor di tanda terima ini tidak terbaca sebagai nomor HP Indonesia (mis. nomor rumah, salah ketik, atau dua nomor dalam satu kolom), jadi tombol WhatsApp tidak ditampilkan — mengirim ke nomor yang salah jauh lebih buruk daripada tidak mengirim. Serahkan kodenya lewat Salin, Cetak slip, atau tulis tangan di tanda terimanya.",
};

/** Pesan yang dikirim ke pemilik kartu. Ditulis untuk DIBACA DIA, bukan untuk arsip Hoshi. */
function waText(params: {
  ownerName: string;
  cardName: string;
  code: string;
  claimUrl: string;
  expiresAt?: string | null;
}): string {
  const lines = [
    `Halo ${params.ownerName}, terima kasih sudah menitipkan kartunya ke Hoshi.`,
    "",
    `Kartu: ${params.cardName}`,
    `Kode klaim kamu: ${formatClaimCode(params.code)}`,
    "",
    "Kode ini yang menyambungkan kartu itu ke akun Hoshi kamu. Buka tautan di bawah, masuk/daftar, lalu masukkan kodenya:",
    params.claimUrl,
    "",
    "Setelah diklaim, kamu bisa melihat foto dan catatan kondisi kartumu, harga yang kita sepakati, dan kamu bisa memintanya kembali kapan saja tanpa biaya.",
  ];
  if (params.expiresAt) {
    lines.push(
      "",
      `Kode ini berlaku sampai ${new Date(params.expiresAt).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })}. Kalau lewat, hubungi kami dan kami kirimkan yang baru.`,
    );
  }
  lines.push("", "Jangan berikan kode ini ke siapa pun.");
  return lines.join("\n");
}

/**
 * Slip cetak — jendela terpisah dengan dokumen HTML-nya sendiri.
 *
 * Bukan `print:` utility di halaman admin: halaman itu gelap, penuh panel, dan mencetaknya berarti
 * melawan seluruh gaya globalnya. Dokumen sendiri jauh lebih pasti, dan isinya bisa disusun sebagai
 * apa yang memang dibutuhkan: secarik kertas yang berguna berbulan-bulan kemudian, bukan tangkapan
 * layar sebuah aplikasi.
 *
 * ⚠️ INI BUKAN STRUK SERAH TERIMANYA, dan jangan dijadikan begitu. Slip ini memuat SATU hal —
 * kodenya — untuk keadaan yang memang cuma butuh itu (kode diterbitkan ulang lewat telepon,
 * pemiliknya tidak sedang menyerahkan kartu apa pun). Perjanjian yang ditandatangani dua pihak
 * hidup di `components/admin/HandoverReceipt.tsx`: dua lembar identik, lengkap dengan harga,
 * komisi, syarat, dan kotak tanda tangan — dan kode klaimnya pun ikut tercetak di sana kalau ada.
 * Layar yang menawarkan keduanya menawarkan struknya lebih dulu.
 */
function printSlip(params: {
  ownerName: string;
  cardName: string;
  code: string;
  claimUrl: string;
  expiresAt?: string | null;
  place?: string | null;
}) {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (ch) =>
      ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : "&quot;",
    );
  const today = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const expiry = params.expiresAt
    ? new Date(params.expiresAt).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8" />
<title>Kode klaim titipan — ${esc(params.cardName)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         color: #111; line-height: 1.55; max-width: 620px; margin: 0 auto; padding: 8px; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #555; margin: 0 0 18px; }
  .code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 30px; font-weight: 700; letter-spacing: 3px; text-align: center;
          border: 2px dashed #111; border-radius: 10px; padding: 16px 10px; margin: 4px 0 6px; }
  .codehint { font-size: 11px; color: #555; text-align: center; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px; }
  td { padding: 6px 0; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  td.k { color: #555; width: 42%; }
  ol { font-size: 13px; padding-left: 18px; margin: 0 0 18px; }
  li { margin-bottom: 5px; }
  .warn { font-size: 12px; border-left: 3px solid #111; padding: 8px 12px; background: #f6f6f6; }
  .foot { font-size: 11px; color: #666; margin-top: 22px; }
</style></head>
<body>
  <h1>Kode klaim titipan Hoshi</h1>
  <p class="sub">Simpan kertas ini. Kode di bawah yang menyambungkan kartumu ke akun Hoshi-mu.</p>

  <div class="code">${esc(formatClaimCode(params.code))}</div>
  <p class="codehint">Huruf besar-kecil tidak masalah. Tanda hubung boleh ditulis, boleh tidak.</p>

  <table>
    <tr><td class="k">Kartu</td><td>${esc(params.cardName)}</td></tr>
    <tr><td class="k">Atas nama</td><td>${esc(params.ownerName)}</td></tr>
    <tr><td class="k">Diterima pada</td><td>${esc(today)}${
      params.place ? ` · ${esc(params.place)}` : ""
    }</td></tr>
    ${expiry ? `<tr><td class="k">Kode berlaku sampai</td><td>${esc(expiry)}</td></tr>` : ""}
  </table>

  <ol>
    <li>Buka <strong>${esc(params.claimUrl)}</strong></li>
    <li>Masuk atau buat akun Hoshi.</li>
    <li>Masukkan kode di atas.</li>
  </ol>

  <p class="warn">
    Kartu ini tetap milikmu. Hoshi menyimpan dan menjualkannya sesuai kesepakatan, dan kamu bisa
    memintanya kembali kapan saja selama belum terjual — tanpa biaya. <strong>Jangan berikan kode
    ini kepada siapa pun</strong>; siapa pun yang memegangnya bisa mengklaim kartu ini ke akunnya.
  </p>

  <p class="foot">Kertas ini bukan pengganti tanda terima serah terima yang kalian tanda tangani.</p>
</body></html>`;

  const w = window.open("", "_blank", "width=680,height=820");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Beri browser satu tarikan napas untuk melakukan layout sebelum dialog cetaknya muncul;
  // tanpa ini sebagian browser mencetak halaman yang masih kosong.
  w.setTimeout(() => w.print(), 250);
  return true;
}

export default function ClaimCodeHandover({
  code,
  cardName,
  ownerName,
  ownerPhone,
  place,
  expiresAt,
  reissued,
  onDone,
  doneLabel = "Sudah saya berikan ke pemiliknya",
  onSecondary,
  secondaryLabel,
}: {
  code: string;
  cardName: string;
  ownerName: string;
  ownerPhone?: string | null;
  place?: string | null;
  expiresAt?: string | null;
  /** true kalau ini kode PENGGANTI — kode sebelumnya sudah mati sejak detik ini. */
  reissued?: boolean;
  onDone?: () => void;
  doneLabel?: string;
  /**
   * Jalan keluar KEDUA dari layar ini (mis. "catat kartu berikutnya dari pemilik yang sama").
   *
   * Ia berada DI DALAM gerbang yang sama dengan `onDone` dan mati sampai kotak centangnya diisi:
   * apa pun yang memindahkan operator dari layar ini membuang satu-satunya salinan kodenya, dan
   * kartu kedua dari kunjungan yang sama bukan alasan yang cukup untuk itu.
   */
  onSecondary?: () => void;
  secondaryLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [printFailed, setPrintFailed] = useState(false);
  const [handed, setHanded] = useState(false);

  /**
   * Tautan klaim. Dibangun dari origin yang SEDANG DIBUKA operator, bukan dari konstanta: konsol
   * admin dipakai di production, staging, dan laptop developer, dan tautan yang menunjuk ke
   * lingkungan yang salah adalah tautan yang tidak akan pernah bisa dipakai pemiliknya.
   */
  const claimUrl = useMemo(() => {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/titipan/klaim?kode=${encodeURIComponent(code)}`;
  }, [code]);

  const wa = waTarget(ownerPhone);
  const pretty = formatClaimCode(code);

  return (
    <div className="rounded-2xl border border-violet-400/35 bg-violet-400/[0.08] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold text-violet-100">
          {reissued ? "Kode klaim baru" : "Kode klaim untuk pemilik kartu"}
        </h2>
        <span className="rounded-md border border-violet-400/40 bg-violet-400/15 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
          tampil sekali
        </span>
      </div>

      <p className="mt-1.5 text-[12.5px] leading-relaxed text-violet-100/80">
        {reissued
          ? "Kode sebelumnya sudah tidak berlaku sejak detik ini. "
          : "Pemilik kartu ini belum punya akun Hoshi. "}
        Kode di bawah adalah satu-satunya cara kartunya tersambung ke akunnya nanti — dan ia tidak
        bisa ditampilkan lagi setelah layar ini ditutup, karena Hoshi hanya menyimpan sidik
        kodenya, bukan kodenya. <strong className="text-violet-50">Berikan sekarang, selagi kalian masih bertemu.</strong>
      </p>

      {/* Kodenya sendiri: sebesar mungkin, karena sering dibacakan keras-keras. */}
      <div className="mt-4 rounded-xl border border-dashed border-violet-300/40 bg-black/25 px-4 py-5 text-center">
        <p className="font-mono text-[26px] font-bold tracking-[0.18em] text-violet-50 sm:text-[32px]">
          {pretty}
        </p>
        <p className="mt-2 text-[11px] text-violet-200/70">
          Huruf besar-kecil tidak masalah · tanda hubung boleh ditulis, boleh tidak
        </p>
      </div>

      {expiresAt && (
        <p className="mt-2 text-center text-[12px] text-violet-200/80">
          Berlaku sampai{" "}
          {new Date(expiresAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
          . Lewat dari itu, terbitkan kode baru dari halaman titipan ini.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            void copyText(`${pretty}\n${claimUrl}`).then((okCopy) => {
              setCopied(okCopy);
              if (okCopy) window.setTimeout(() => setCopied(false), 2500);
            });
          }}
          className="rounded-xl border border-violet-300/35 bg-violet-400/10 px-4 py-2.5 text-[13px] font-semibold text-violet-100 transition hover:bg-violet-400/20"
        >
          {copied ? "Tersalin ✓" : "Salin kode + tautan"}
        </button>

        {wa.ok && (
          <a
            href={`https://wa.me/${wa.wa}?text=${encodeURIComponent(
              waText({ ownerName, cardName, code, claimUrl, expiresAt }),
            )}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-400/35 bg-emerald-400/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20"
          >
            Kirim lewat WhatsApp
          </a>
        )}

        <button
          type="button"
          onClick={() => {
            const okPrint = printSlip({ ownerName, cardName, code, claimUrl, expiresAt, place });
            setPrintFailed(!okPrint);
          }}
          className="rounded-xl border border-white/15 bg-white/[0.05] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
        >
          Cetak slip
        </button>
      </div>

      {/* ── TOMBOL WHATSAPP TIDAK ADA: katakan KENAPA, dan katakan apa gantinya ──────────────
          Tombol yang hilang tanpa sepatah kata membuat operator mengira layarnya rusak dan pamit
          tanpa menyerahkan kodenya sama sekali — kegagalan yang berakhir sama: kartu di rak tanpa
          pemilik. Nomornya ikut ditampilkan apa adanya supaya ia bisa menelepon/mengirim sendiri
          setelah memastikan nomor itu memang benar. */}
      {!wa.ok && (
        <div className="mt-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-amber-100">{WA_REFUSAL_LINE[wa.why]}</p>
          {wa.why !== "KOSONG" && ownerPhone?.trim() && (
            <p className="mt-1.5 text-[11px] text-amber-200/75">
              Yang tercatat di tanda terima:{" "}
              <span className="font-mono text-amber-100">{ownerPhone.trim()}</span>
            </p>
          )}
        </div>
      )}
      {printFailed && (
        <p className="mt-2 text-[11px] leading-relaxed text-amber-200">
          Jendela cetak diblokir browser. Izinkan pop-up untuk situs ini, atau salin kodenya lalu
          tuliskan di tanda terima.
        </p>
      )}

      {onDone && (
        <div className="mt-5 border-t border-violet-300/20 pt-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-violet-100">
            <input
              type="checkbox"
              checked={handed}
              onChange={(e) => setHanded(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-violet-400"
            />
            <span>
              Kode ini sudah benar-benar sampai ke {ownerName || "pemilik kartu"} — dikirim,
              dicetak, atau dicatat di tanda terimanya.
            </span>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDone}
              disabled={!handed}
              className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
            >
              {doneLabel}
            </button>
            {onSecondary && secondaryLabel && (
              <button
                type="button"
                onClick={onSecondary}
                disabled={!handed}
                className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {secondaryLabel}
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-violet-200/70">
            Setelah layar ini ditutup, kode di atas tidak bisa dibaca lagi oleh siapa pun. Yang
            hilang diganti dengan kode baru dari halaman titipan ini.
          </p>
        </div>
      )}
    </div>
  );
}
