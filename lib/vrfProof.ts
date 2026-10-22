// Membaca bukti VRF CollectorCrypt yang BENTUKNYA TIDAK KITA KETAHUI.
//
// Backend mengetik respons GET /api/gacha/verify/:memo sebagai Record<string, unknown>
// dan meneruskannya apa adanya dari CC — kontraknya tidak pernah mengenumerasi isinya.
// Jadi semua yang ada di file ini memperlakukan responsnya sebagai JSON ASING: boleh
// berupa apa saja, boleh berubah sewaktu-waktu, dan tidak boleh membuat layar crash.
//
// Dua aturan yang tidak boleh dilanggar:
//
//  1. TIDAK ADA VONIS — TITIK. File ini tidak punya, dan tidak boleh punya lagi, fungsi
//     yang menyimpulkan "sah"/"tidak sah" dari respons CC. Versi sebelumnya punya
//     (`readVerdict`) dan ia bisa dibuat HIJAU oleh field yang sama sekali bukan soal
//     undian: `creators[].verified` dan `grouping[].verified` (field standar Metaplex/DAS
//     — artinya kreator/otoritas koleksi menandatangani METADATA-nya), `collection.verified`,
//     bahkan `payer.isValid`. Payload bergaya DAS memang wajar muncul di keluarga API CC
//     yang sama, dan endpoint ini bicara soal undian sebuah pack — NFT yang dimenangkan
//     sangat mungkin ikut tertanam di dalamnya. Karena bentuk responsnya tidak dienumerasi
//     siapa pun, setiap aturan vonis adalah tebakan; dan tebakan yang meleset ke arah hijau
//     di layar kepercayaan lebih merusak daripada tidak ada layarnya sama sekali.
//
//     Tugas file ini karena itu tinggal tiga: RATAKAN responsnya, POTONG dengan jujur
//     (dan katakan kalau dipotong), dan TAUTKAN hanya yang benar-benar bisa dibuktikan.
//
//  2. TAUTAN HANYA ATAS BUKTI POSITIF (lihat `detectLink`). Kalau jalur kuncinya tidak
//     menyatakan nilai itu tanda tangan / alamat / slot, nilainya tampil sebagai teks
//     biasa. Diam itu benar dan tidak berbiaya; satu tautan mati ke "account does not
//     exist" merusak persis layar yang tugasnya membuat klaim bisa dicek.

import { explorerAddressUrl, explorerBlockUrl, explorerTxUrl } from "./gacha";

/* ---------------- perataan (flatten) ---------------- */

/** Batas kedalaman rekursi. Objek yang lebih dalam dari ini dipotong dan ditandai. */
const MAX_DEPTH = 6;
/** Batas jumlah baris yang ditampilkan — respons raksasa tidak boleh menggantung tab. */
const MAX_ROWS = 200;
/** Batas panjang teks satu nilai. Yang utuh tetap ada di blok JSON mentah. */
const MAX_TEXT = 512;

export type ProofLeafKind = "string" | "number" | "boolean" | "null" | "note";

/** Tautan ke Solana Explorer untuk satu nilai yang JALUR KUNCI + bentuknya dikenali. */
export type ProofLink = {
  kind: "tx" | "address" | "block";
  url: string;
  /** Label Indonesia untuk chip tautannya. */
  label: string;
};

/** Satu daun dari respons, sudah diratakan jadi jalur-kunci + teks. */
export type ProofRow = {
  /** Jalur kunci apa adanya, mis. ["result", "txSignature"] atau ["proofs", "0", "slot"]. */
  path: string[];
  /** Nilai yang sudah jadi teks siap tampil (mungkin dipotong — lihat `clipped`). */
  text: string;
  kind: ProofLeafKind;
  /** `true` kalau `text` dipotong di MAX_TEXT. */
  clipped: boolean;
  /** Tautan Explorer bila jalur kunci + bentuk nilainya mendukung; `null` kalau tidak. */
  link: ProofLink | null;
};

export type FlatProof = {
  rows: ProofRow[];
  /** `true` kalau ada bagian respons yang tidak ditampilkan (kena MAX_ROWS/MAX_DEPTH). */
  truncated: boolean;
};

const clip = (s: string): { text: string; clipped: boolean } =>
  s.length > MAX_TEXT ? { text: `${s.slice(0, MAX_TEXT)}…`, clipped: true } : { text: s, clipped: false };

/**
 * Ratakan JSON sembarang jadi daftar baris. Aman untuk: bukan objek sama sekali,
 * objek/array bersarang, null, array kosong, string sangat panjang, dan (secara
 * teori) struktur melingkar — masing-masing keluar sebagai baris, bukan lemparan.
 */
export function flattenProof(raw: unknown): FlatProof {
  const rows: ProofRow[] = [];
  let truncated = false;
  // JSON.parse tidak mungkin menghasilkan siklus, tapi `raw` bertipe unknown dan
  // pemanggil lain boleh mengirim apa saja — penjaganya murah, pasangnya sekarang.
  const seen = new WeakSet<object>();

  const addLeaf = (path: string[], text: string, kind: ProofLeafKind) => {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      return;
    }
    const c = clip(text);
    rows.push({
      path,
      text: c.text,
      kind,
      clipped: c.clipped,
      // Tautan hanya dicari untuk nilai yang TIDAK dipotong: separuh tanda tangan
      // bukan tanda tangan, dan tautan ke separuhnya cuma menipu.
      link: c.clipped ? null : detectLink(path, text, kind),
    });
  };

  const walk = (value: unknown, path: string[], depth: number) => {
    if (rows.length >= MAX_ROWS) {
      truncated = true;
      return;
    }

    if (value === null) return addLeaf(path, "null", "null");

    switch (typeof value) {
      case "string":
        return addLeaf(path, value, "string");
      case "number":
        return addLeaf(path, Number.isFinite(value) ? String(value) : "(bukan angka)", "number");
      case "bigint":
        return addLeaf(path, String(value), "number");
      case "boolean":
        return addLeaf(path, value ? "true" : "false", "boolean");
      case "undefined":
        return addLeaf(path, "(kosong)", "note");
      case "object":
        break;
      default:
        // function / symbol — mustahil dari JSON, tapi jangan crash kalau muncul.
        return addLeaf(path, "(tidak bisa ditampilkan)", "note");
    }

    const obj = value as object;
    if (seen.has(obj)) return addLeaf(path, "(rujukan berulang)", "note");
    seen.add(obj);

    if (depth >= MAX_DEPTH) {
      truncated = true;
      return addLeaf(path, "(terlalu dalam — lihat JSON mentah)", "note");
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return addLeaf(path, "(daftar kosong)", "note");
      obj.forEach((item, i) => walk(item, [...path, String(i)], depth + 1));
      return;
    }

    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return addLeaf(path, "(kosong)", "note");
    for (const [k, v] of entries) walk(v, [...path, k], depth + 1);
  };

  walk(raw, [], 0);
  return { rows, truncated };
}

/** Label baris: jalur kunci yang terbaca, atau "(respons)" untuk nilai akar. */
/**
 * Label baris. Dipotong di MAX_TEXT juga — sebelumnya hanya NILAI yang dipotong, sementara
 * label dirakit dari nama kunci apa adanya, jadi satu kunci sepanjang 50.000 karakter
 * memampang dinding teks (membungkus, tidak menggeser halaman, tapi tetap merusak).
 */
export const rowLabel = (row: ProofRow): string =>
  row.path.length === 0 ? "(respons)" : clip(row.path.join(" › ")).text;

/* ---------------- deteksi rujukan on-chain ---------------- */

/** Alfabet base58 Bitcoin/Solana — tanpa 0, O, I, l. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

const normKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Segmen indeks array (`proof › 0`). Bukan nama kunci, jadi tak pernah jadi dasar apa pun. */
const isIndexSegment = (seg: string): boolean => /^\d+$/.test(seg);

/**
 * ALLOW-LIST tanda tangan transaksi: nama kunci yang benar-benar berkata
 * "ini tanda tangan / hash transaksi".
 */
/*
 * SENGAJA TIDAK memuat `signature` / `signatures` / `sig` telanjang. Tanda tangan transaksi
 * Solana dan tanda tangan ed25519 atas apa pun BENTUKNYA IDENTIK (64 byte → 86-88 base58),
 * jadi panjang tidak bisa memisahkan keduanya — hanya nama kuncinya yang bisa. Di dalam
 * sebuah bukti VRF, `signature` telanjang jauh lebih mungkin tanda tangan si oracle
 * ketimbang sebuah transaksi; menautkannya menghasilkan "Transaction not found" di
 * Explorer, dan di layar yang justru dibuat untuk membuktikan sesuatu, itu terbaca sebagai
 * undiannya tidak ada. Nilainya tetap ditampilkan sebagai teks — cuma tidak diklik.
 */
const SIGNATURE_KEY =
  /(txsig|txid|transactionid|txhash|transactionhash|transactionsignature|^tx$|^txs$)/;

/**
 * ALLOW-LIST alamat / akun on-chain. Sengaja sempit: hanya nama yang MENYATAKAN nilainya
 * sebuah akun. `nft`, `player`, `queue`, `oracle`, `vault` dan sejenisnya dikeluarkan —
 * tanpa kata address/account/pubkey di dalamnya, mereka bisa saja nama, objek, atau id.
 */
const ADDRESS_KEY =
  /(address|mint|pubkey|publickey|account|authority|owner|wallet|payer|recipient|receiver|signer|programid|^program$|^ata$)/;

/**
 * ALLOW-LIST slot. HANYA `slot`.
 *
 * `blockHeight` / `blockNumber` / `block` SENGAJA dikeluarkan: Explorer memperlakukan
 * `/block/<n>` sebagai SLOT, sedangkan di Solana tinggi blok ≠ slot (tinggi blok tidak
 * menghitung slot yang terlewat — selisihnya puluhan juta). Menautkannya membuka blok
 * yang benar-benar ada tapi tidak ada hubungannya dengan pack si user, dan itu terbaca
 * sebagai buktinya gagal.
 */
const SLOT_KEY = /(^slot$|slot$)/;

/**
 * Nama yang membuat sebuah nilai OPAK: byte mentah, digest, atau identifier — bukan akun
 * dan bukan transaksi. Diuji pada SELURUH jalur, bukan cuma segmen terakhir, supaya
 * `proof › 0` (indeks array) dan `seed › value` (pembungkus bersarang) tidak bisa
 * mencuci nama yang ditolak. Justru di dua tempat itulah sebuah bukti VRF menaruh
 * blob byte-nya, jadi di sanalah aturan ini paling harus bekerja.
 *
 * Pengecualian: segmen yang namanya sendiri nama tanda tangan (mis. `txHash`) tidak
 * dianggap opak — di situ kata "hash" justru menyebut benda yang memang bisa ditautkan.
 */
const OPAQUE_KEY =
  /(proof|randomness|random|entropy|seed|nonce|salt|alpha|beta|gamma|commitment|digest|hash|checksum|memo|payload|blob|bytes|secret)/;

/**
 * Rentang slot yang MASUK AKAL. Plafonnya ada supaya stempel waktu unix tidak bisa
 * menyamar jadi slot: slot mainnet/devnet ada di ratusan juta (≈4,4e8 pada 2026, tumbuh
 * ≈8e7/tahun), sedangkan unix detik ≥1,7e9 dan unix milidetik ≈1,7e12 — dua-duanya di
 * atas plafon ini. Angka di luar rentang tampil sebagai teks biasa, tanpa tautan.
 * (Tinjau lagi sekitar 2033, jauh sebelum rantainya benar-benar menyentuh plafon.)
 */
const MIN_SLOT = 1_000_000;
const MAX_SLOT = 1_000_000_000;

/** Apakah string ini base58 dengan panjang dalam rentang tertentu. */
const isBase58 = (s: string, min: number, max: number): boolean =>
  s.length >= min && s.length <= max && BASE58.test(s);

const slotLink = (n: number): ProofLink | null =>
  Number.isInteger(n) && n >= MIN_SLOT && n <= MAX_SLOT
    ? { kind: "block", url: explorerBlockUrl(n), label: "Blok / slot" }
    : null;

/**
 * Cari rujukan on-chain di satu nilai daun — HANYA atas BUKTI POSITIF.
 *
 * Aturannya allow-list, bukan deny-list: sebuah nilai ditautkan cuma kalau JALUR
 * KUNCINYA menyatakan nilai itu apa, DAN bentuknya cocok dengan pernyataan itu.
 *
 *   · tanda tangan : kunci bergaya signature/txid/txHash + base58 86-88 karakter (64 byte)
 *   · alamat       : kunci bergaya address/mint/owner/authority + base58 43-44 karakter (32 byte)
 *   · slot         : kunci bergaya slot/block + bilangan bulat di rentang slot
 *
 * Selain itu: TIDAK ditautkan. Termasuk base58 sepanjang alamat di bawah kunci
 * `hash`/`output`/`result`/`data`/`packId` (itu digest atau id, bukan akun), isi array
 * `proof[0]`/`randomness[0]`, `seed.value`, dan `txHash` berisi 44 karakter (transaksi
 * tidak sepanjang itu — dan ia jelas bukan alamat). Nilainya tetap tampil, sebagai teks.
 */
export function detectLink(path: string[], text: string, kind: ProofLeafKind): ProofLink | null {
  const segments = path.filter((seg) => !isIndexSegment(seg)).map(normKey);
  // Segmen terakhir yang BUKAN indeks array: `proof › 0` dinilai sebagai `proof`.
  const key = segments[segments.length - 1] ?? "";
  if (!key) return null;

  // Veto opak berlaku pada LELUHUR — tapi hanya kalau kunci daunnya sendiri tidak
  // menyatakan dirinya. Endpoint ini bernama /vrf/verify, jadi bentuk paling mungkin
  // responsnya dibungkus `proof`/`randomness`; kalau veto leluhur berlaku mutlak, seluruh
  // isi bungkus itu tak pernah tertaut — layarnya bisa memampang tanda tangan transaksi
  // 88 karakter sambil tidak menawarkan satu pun tautan. Kedua allow-list di atas sudah
  // sengaja sempit (kuncinya HARUS menyebutkan bendanya), jadi daun yang lolos salah
  // satunya sudah menerangkan dirinya sendiri, apa pun pembungkusnya.
  const leafDeclaresItself =
    SIGNATURE_KEY.test(key) || ADDRESS_KEY.test(key) || SLOT_KEY.test(key);
  const ancestors = segments.slice(0, -1);
  if (!leafDeclaresItself && OPAQUE_KEY.test(key)) return null;
  if (!leafDeclaresItself && ancestors.some((seg) => OPAQUE_KEY.test(seg))) return null;

  if (kind === "number") {
    // Angka telanjang di JSON bisa apa saja (harga, indeks, timestamp); hanya nama kunci
    // yang menyebut slot/blok yang boleh jadi tautan blok.
    return SLOT_KEY.test(key) ? slotLink(Number(text)) : null;
  }

  if (kind !== "string") return null;
  const value = text.trim();
  if (!value) return null;

  // Slot yang datang sebagai string angka.
  if (SLOT_KEY.test(key)) return /^\d+$/.test(value) ? slotLink(Number(value)) : null;

  // Kunci tanda tangan: HANYA panjang tanda tangan yang ditautkan, dan tidak pernah
  // dibelokkan ke cabang alamat kalau panjangnya tidak cocok.
  if (SIGNATURE_KEY.test(key)) {
    return isBase58(value, 86, 88)
      ? { kind: "tx", url: explorerTxUrl(value), label: "Transaksi" }
      : null;
  }

  // Kunci alamat + panjang kunci publik penuh (32 byte → 43-44 karakter).
  if (ADDRESS_KEY.test(key) && isBase58(value, 43, 44)) {
    return { kind: "address", url: explorerAddressUrl(value), label: "Alamat on-chain" };
  }

  return null;
}

/** Tautan unik dari sekumpulan baris, urut sesuai kemunculannya. */
export function collectLinks(rows: ProofRow[]): { row: ProofRow; link: ProofLink }[] {
  const out: { row: ProofRow; link: ProofLink }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.link || seen.has(row.link.url)) continue;
    seen.add(row.link.url);
    out.push({ row, link: row.link });
  }
  return out;
}

/* ---------------- tampilan ---------------- */

/** Potong tengah string panjang untuk tampilan ringkas: `abcd…wxyz`. */
export const shortMiddle = (s: string, head = 6, tail = 6): string =>
  s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;

/** JSON mentah yang enak dibaca; kalau `raw` tidak bisa di-stringify, katakan begitu. */
export function rawProofText(raw: unknown): string {
  try {
    const out = JSON.stringify(raw, null, 2);
    return out ?? String(raw);
  } catch {
    return String(raw);
  }
}
