"use client";

// Bukti undian VRF — satu panel, dipakai di dua tempat:
//   · /open-packs  → dibungkus VrfProofModal, dibuka dari layar hasil (RipReveal)
//   · /vault/[nft] → ditempel langsung di halaman kartu
//
// Aturan mainnya ada di lib/vrfProof.ts dan berlaku mutlak di sini: bentuk respons
// CollectorCrypt TIDAK kita ketahui, jadi panel ini TIDAK PERNAH MEMBERI VONIS.
// Tidak ada "Terverifikasi ✓", tidak ada blok hijau, tidak ada blok merah — dulu ada,
// dan vonis hijau itu bisa dipicu oleh field yang sama sekali bukan soal undian
// (`creators[].verified`, `grouping[].verified`, `collection.verified` — semuanya
// pernyataan Metaplex/DAS soal METADATA). Tugas panel ini sekarang satu kalimat:
// AMBILKAN catatan undian dari CollectorCrypt, TAMPILKAN apa adanya, dan KATAKAN
// dengan jelas apa yang tidak kami lakukan atasnya.
//
// Dua aturan turunan yang juga mutlak:
//   · Teks dari hulu (pesan galat backend / CC) TIDAK PERNAH masuk ke DOM di layar ini.
//     Pesan itu lewat pemeta pesan ramah milik klien gacha dan bisa berbunyi hal-hal
//     seperti "saldo treasury demo habis (USDC devnet)" — kalimat yang, di layar
//     kepercayaan seorang pembeli mainnet, adalah kebohongan sekaligus kebocoran.
//     Setiap sebab kegagalan punya kalimat kita sendiri di bawah; `detail` dari hulu
//     hanya boleh ke console.
//   · Semua kalimat kegagalan TIDAK menyiratkan undiannya dicurangi: tidak bisa
//     memeriksa sekarang ≠ ada yang salah dengan undianmu.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { verifyVrf, type VrfProofFailure } from "@/lib/api";
import { lockBodyScroll } from "@/lib/scrollLock";
import {
  collectLinks,
  flattenProof,
  rawProofText,
  rowLabel,
  shortMiddle,
} from "@/lib/vrfProof";
import { GOLD_GRADIENT } from "./ui";

// `detail` SENGAJA tidak ada di state: yang tidak disimpan tidak bisa bocor ke layar.
type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; raw: unknown }
  | { phase: "failed"; reason: VrfProofFailure };

/* ---------------- salinan teks (untuk orang yang tidak tahu VRF) ---------------- */

/**
 * Penjelasan untuk pembaca yang tidak pernah dengar istilah "VRF" — dan memang tidak
 * perlu. Istilah "provably fair" tidak dipakai: buat pembaca Indonesia itu bukan
 * penjelasan, cuma jargon pemasaran.
 *
 * Setiap klaim di sini sudah dicocokkan ke kode backend sebelum ditulis:
 *   · memo diterbitkan CC dan IKUT TERTULIS di transaksi pembayaran pack — backend
 *     memindai byte transaksi dan menolak yang tidak memuatnya
 *     (gacha.service.ts `assertTransactionCarriesMemo`, dipakai di jalur user-bayar
 *     sebelum submit dan di jalur treasury sebelum menandatangani);
 *   · baris memo↔user ditulis ke ledger SEBELUM transaksi ditandatangani/diteruskan,
 *     jadi jauh sebelum openPack (undian) dijalankan (`generate()` / jalur treasury);
 *   · rarity datang utuh dari VRF mereka dan disimpan apa adanya — tidak pernah
 *     dihitung ulang di sisi kita.
 *
 * Yang DIHAPUS dari versi sebelumnya, karena tidak benar: "Hoshi tidak bisa mengintip
 * lebih dulu" (server kita menerima kartunya dari CC sebelum animasi buka pack jalan —
 * reveal-nya kosmetik) dan "tidak bisa mengulang undiannya diam-diam" (layar ini tidak
 * membuktikan itu: memverifikasi nomor X hanya bicara soal undian X).
 */
function Explainer() {
  return (
    <div className="flex flex-col gap-2 text-[13px] leading-relaxed text-zinc-400">
      <p>
        Kartu yang kamu dapat ditentukan oleh{" "}
        <span className="font-semibold text-zinc-200">CollectorCrypt</span> lewat undian acak
        yang dijalankan dan dicatat di blockchain Solana — bukan oleh Hoshi. Hasilnya kami
        simpan apa adanya: Hoshi tidak menghitung ulang rarity-nya.
      </p>
      <p>
        Setiap pembelian pack punya satu nomor undian. Nomor itu ikut tertulis di dalam
        transaksi pembayaran pack ini di blockchain — server Hoshi menolak meneruskan
        transaksi pembayaran yang tidak memuatnya — dan nomornya sudah tercatat atas namamu
        sebelum undiannya dijalankan. Nomor itu ada di bawah ini, dan dari nomor itulah
        catatan undiannya ditarik.
      </p>
      <p className="text-zinc-500">
        Yang <span className="font-semibold text-zinc-400">tidak</span> dibuktikan layar ini,
        biar jelas: kartunya sampai ke server Hoshi lebih dulu, baru animasi buka pack jalan
        di layarmu — animasi itu tampilan, bukan saat undiannya terjadi. Memeriksa nomor ini
        juga hanya bicara soal undian nomor ini. Dan isi catatannya tidak kami nilai sama
        sekali; kami cuma mengambilkannya dari CollectorCrypt untukmu.
      </p>
    </div>
  );
}

/** Kalimat untuk tiap sebab kegagalan — SELURUHNYA tulisan kita sendiri, tidak satu
 *  karakter pun berasal dari pesan hulu. Tidak ada yang menyiratkan hasil undiannya
 *  bermasalah: yang gagal adalah PEMERIKSAANNYA. */
function failureCopy(reason: VrfProofFailure): { title: string; body: string } {
  switch (reason) {
    case "NOT_FOUND":
      return {
        title: "Nomor undian ini belum dikenali",
        body:
          "Verifikator CollectorCrypt belum menemukan catatan untuk nomor ini. Catatan on-chain " +
          "kadang butuh beberapa saat sampai terbaca di sisi mereka. Coba lagi beberapa menit " +
          "lagi — kartumu sendiri tetap aman di Vault.",
      };
    case "TIMEOUT":
      return {
        title: "Verifikator tidak menjawab tepat waktu",
        body:
          "Permintaannya terkirim, tapi jawabannya tidak datang sebelum batas waktu. Ini soal " +
          "koneksi ke CollectorCrypt, bukan soal hasil undianmu. Coba lagi sebentar.",
      };
    case "UNREACHABLE":
      return {
        title: "Verifikator sedang tidak bisa dihubungi",
        body:
          "Kami tidak berhasil menyambung ke verifikator — bisa jaringanmu, bisa juga layanan " +
          "mereka sedang mati. Artinya pemeriksaannya belum bisa dijalankan sekarang, bukan " +
          "berarti ada yang salah dengan undianmu.",
      };
    case "NOT_JSON":
      return {
        title: "Jawabannya tidak bisa dibaca",
        body:
          "Verifikator membalas, tapi isinya bukan data yang bisa kami baca. Kami tidak " +
          "menyimpulkan apa pun dari balasan seperti ini. Coba lagi nanti.",
      };
    case "SERVER":
    default:
      return {
        title: "Pemeriksaannya gagal di tengah jalan",
        body:
          "Jalur pemeriksaan ke CollectorCrypt membalas dengan galat. Itu masalah di jalur " +
          "pemeriksaannya, bukan vonis atas undianmu. Nomor undiannya tetap berlaku — coba " +
          "lagi nanti, dan kalau terus begini kirimkan nomor itu ke tim Hoshi.",
      };
  }
}

/* ---------------- panel ---------------- */

/**
 * Panel bukti. TIDAK pernah mengambil data sendiri saat mount: satu kunjungan
 * halaman tidak boleh otomatis jadi satu permintaan ke CollectorCrypt (ada
 * ThrottlerGuard 60/menit per IP di depan route-nya), dan di layar hasil pull,
 * panel bukti yang menyembul tanpa diminta terbaca seperti pembelaan diri.
 * Permintaannya berangkat hanya kalau user menekan tombolnya.
 */
export default function VrfProofPanel({
  memo,
  className = "",
}: {
  memo: string;
  className?: string;
}) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const run = useCallback(async () => {
    setState({ phase: "loading" });
    const res = await verifyVrf(memo);
    if (res.ok) {
      setState({ phase: "done", raw: res.raw });
      return;
    }
    // `detail` berasal dari hulu (pesan backend / CC) dan berhenti DI SINI: cukup untuk
    // menelusuri lewat console, tidak pernah dirender. Lihat catatan di kepala berkas.
    if (res.detail) console.warn(`[vrf-proof] ${res.reason}: ${res.detail}`);
    setState({ phase: "failed", reason: res.reason });
  }, [memo]);

  return (
    <section className={`flex min-w-0 flex-col gap-4 ${className}`}>
      <div className="flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold text-white">Undian ini bisa kamu periksa sendiri</h3>
        <Explainer />
        <CopyRow label="Nomor undian" value={memo} />
      </div>

      {state.phase === "idle" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void run()}
            className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
            style={{ backgroundImage: GOLD_GRADIENT }}
          >
            Ambil catatan undian
          </button>
          <p className="text-[12px] leading-relaxed text-zinc-500">
            Datanya ditarik dari CollectorCrypt lewat server Hoshi, lalu ditampilkan apa
            adanya — Hoshi tidak menilainya. Sebagian nilainya mungkin kami tautkan ke Solana
            Explorer, situs publik di luar kendali kami; kami hanya menaut yang benar-benar
            pasti, jadi kalau tidak ada tautan, itu batas kehati-hatian kami — bukan berarti
            catatannya kosong.
          </p>
        </div>
      )}

      {state.phase === "loading" && (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
          <p className="text-[13px] text-zinc-300">Mengambil catatan dari CollectorCrypt…</p>
        </div>
      )}

      {state.phase === "failed" && (
        <FailureBlock reason={state.reason} onRetry={() => void run()} />
      )}

      {state.phase === "done" && <ProofBody raw={state.raw} onRetry={() => void run()} />}
    </section>
  );
}

function FailureBlock({ reason, onRetry }: { reason: VrfProofFailure; onRetry: () => void }) {
  const copy = failureCopy(reason);
  return (
    // Amber, bukan merah: merah membaca sebagai "ada yang salah dengan undianmu",
    // padahal yang gagal cuma pemeriksaannya.
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3.5">
      <p className="break-all text-[13px] font-semibold text-amber-200">{copy.title}</p>
      {/* break-all: kalimatnya milik kita sendiri, tapi blok galat tidak boleh jadi
          satu-satunya tempat halaman ini bisa digeser ke samping. */}
      <p className="break-all text-[12px] leading-relaxed text-zinc-400">{copy.body}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 self-start rounded-lg border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/10"
      >
        Coba lagi
      </button>
    </div>
  );
}

/** Hasil yang SUDAH ditarik: keterangan apa ini (BUKAN vonis) → tautan Explorer →
 *  isi respons yang sudah diratakan → JSON mentah. */
function ProofBody({ raw, onRetry }: { raw: unknown; onRetry: () => void }) {
  const { rows, truncated } = useMemo(() => flattenProof(raw), [raw]);
  const links = useMemo(() => collectLinks(rows), [rows]);
  const rawText = useMemo(() => rawProofText(raw), [raw]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <RecordHeader hasLinks={links.length > 0} truncated={truncated} />

      {links.length > 0 && (
        <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Periksa di Solana Explorer
          </p>
          <div className="flex min-w-0 flex-col gap-1.5">
            {links.map(({ row, link }) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.08]"
              >
                <span className="min-w-0">
                  <span className="block text-[11px] text-zinc-500">{link.label}</span>
                  <span className="block truncate font-mono text-[12px] text-zinc-200">
                    {shortMiddle(row.text, 8, 8)}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] font-semibold" style={{ color: "#FEF003" }}>
                  Buka ↗
                </span>
              </a>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Explorer adalah situs publik milik pihak lain. Isinya tidak bisa kami atur — itu
            justru gunanya.
          </p>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
          Isi jawaban CollectorCrypt
        </p>
        <div className="flex min-w-0 flex-col gap-1.5">
          {rows.length === 0 ? (
            <p className="text-[12px] text-zinc-500">Jawabannya kosong.</p>
          ) : (
            rows.map((row, i) => (
              <div
                key={`${row.path.join(".")}-${i}`}
                className="min-w-0 rounded-lg bg-white/[0.02] px-3 py-2"
              >
                <p className="break-all text-[11px] uppercase tracking-wide text-zinc-500">
                  {rowLabel(row)}
                </p>
                <p
                  className={`mt-0.5 break-all font-mono text-[12px] ${
                    row.kind === "note" || row.kind === "null" ? "text-zinc-500" : "text-zinc-200"
                  }`}
                >
                  {row.text}
                </p>
                {row.clipped && (
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Dipotong — nilai utuhnya ada di JSON mentah di bawah.
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        {truncated && (
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Jawabannya lebih panjang dari yang ditampilkan di sini. Yang utuh ada di JSON mentah.
          </p>
        )}
      </div>

      <RawBlock text={rawText} />

      <button
        type="button"
        onClick={onRetry}
        className="self-start text-[12px] font-medium text-zinc-500 underline underline-offset-4 transition hover:text-zinc-300"
      >
        Ambil ulang
      </button>
    </div>
  );
}

/**
 * Keterangan di atas hasil. BUKAN vonis, dan tidak boleh pernah jadi vonis: netral,
 * bunyinya sama untuk setiap respons, dan isinya cuma menyebut benda ini apa + apa yang
 * TIDAK kami lakukan atasnya. Kalau responsnya terpotong, itu dikatakan di sini juga —
 * pembaca tidak boleh mengira daftar di bawah adalah seluruh isinya.
 */
function RecordHeader({ hasLinks, truncated }: { hasLinks: boolean; truncated: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3.5">
      <p className="text-[13px] font-semibold text-zinc-200">Catatan undian dari CollectorCrypt</p>
      <p className="text-[12px] leading-relaxed text-zinc-400">
        Ini jawaban mereka untuk nomor undian di atas, apa adanya. Hoshi{" "}
        <span className="font-semibold text-zinc-200">
          tidak memeriksa, tidak menilai, dan tidak menyatakan apa pun
        </span>{" "}
        tentang isinya — kami cuma mengambilkannya untukmu.
        {/* Kalimat ini HARUS bercerita tentang APA YANG KAMI LAKUKAN, bukan tentang apa yang
            ada di dalam payload. Versi sebelumnya berbunyi "tidak ada nilai di dalamnya yang
            bisa kami pastikan sebagai rujukan on-chain" — itu klaim tentang DATANYA, dan ia
            salah setiap kali aturan kami sendiri yang menolak menautkan. Payload berbungkus
            `proof` bisa memuat tanda tangan transaksi 88 karakter yang terpampang jelas di
            daftar bawah, sementara kalimat itu menyatakan tidak ada rujukan on-chain di sana. */}
        {hasLinks
          ? " Sebagian nilainya kami tautkan ke Solana Explorer — hanya yang nama kunci dan bentuknya sama-sama menyebut rujukan on-chain; sisanya tampil sebagai teks."
          : " Tidak ada yang kami tautkan di sini: aturan penautan kami sengaja sempit dan hanya menaut yang benar-benar pasti, jadi diamnya kami bukan berarti isinya kosong. Semuanya tetap terlihat apa adanya di bawah."}
        {truncated
          ? " Jawabannya juga lebih panjang daripada yang muat di daftar bawah, jadi yang terlihat di sana belum seluruh isinya; yang utuh ada di JSON mentah."
          : ""}
      </p>
    </div>
  );
}

/** JSON mentah — posisi sekunder, tertutup, bisa disalin. Pembaca yang skeptis
 *  mau benda aslinya, bukan ringkasan kita. */
function RawBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard diblokir (izin / HTTP / iOS lama) — teksnya tetap terpampang dan
      // bisa diseleksi manual, jadi tidak ada yang hilang. Tidak perlu layar error.
    }
  };

  return (
    <details className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02]">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-[12px] font-semibold text-zinc-400 transition hover:text-zinc-200">
        Jawaban mentah (JSON)
      </summary>
      <div className="min-w-0 border-t border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="mb-2 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/10"
        >
          {copied ? "Tersalin" : "Salin JSON"}
        </button>
        {/* whitespace-pre-wrap + break-all: string sepanjang apa pun membungkus ke
            bawah, jadi halamannya tidak pernah bisa digeser ke samping. */}
        <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-400">
          {text}
        </pre>
      </div>
    </details>
  );
}

/** Baris nilai + tombol salin (pola yang sama dengan ID pengiriman di ShippingFlowModal). */
function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* clipboard diblokir — nilainya tetap bisa diseleksi manual */
    }
  };
  return (
    <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
        <p className="mt-0.5 break-all font-mono text-[12px] text-zinc-200">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        className="shrink-0 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/10"
      >
        {copied ? "Tersalin" : "Salin"}
      </button>
    </div>
  );
}

/* ---------------- pembungkus modal (dipakai layar hasil pull) ---------------- */

/**
 * Modal di z-[130] — DI ATAS takeover RipReveal (z-[110]), supaya bukti yang dibuka
 * dari layar hasil tidak tenggelam di balik reveal-nya sendiri.
 */
export function VrfProofModal({
  memo,
  cardName,
  onClose,
}: {
  memo: string;
  cardName?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape ditelan di sini supaya ia menutup MODAL-nya saja; tanpa ini, listener
      // Escape milik RipReveal ikut jalan dan takeover-nya ikut tertutup sekalian.
      e.stopPropagation();
      onClose();
    };
    // Fase capture: didengar sebelum listener bubble milik komponen lain.
    document.addEventListener("keydown", onKey, true);
    // Kunci scroll BERSAMA (lib/scrollLock). Modal ini hidup DI DALAM RipReveal, yang
    // juga mengunci. Dengan pola simpan/pulihkan lama, unmount serentak (tombol back,
    // pindah rute dari dalam modal) membuat RipReveal — induknya, dan induk lebih dulu
    // dibongkar React — memulihkan "" , lalu modal ini memulihkan "hidden" yang sempat
    // ia rekam: halaman tinggal tak bisa di-scroll sampai reload.
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      unlock();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-black/80 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bukti undian"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-[440px] overflow-y-auto overflow-x-hidden rounded-2xl border border-white/10 bg-[#141206] p-5 text-left"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-white">Bukti undian</h2>
            {cardName && <p className="mt-0.5 truncate text-[12px] text-zinc-500">{cardName}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        <VrfProofPanel memo={memo} />
      </div>
    </div>,
    document.body,
  );
}
