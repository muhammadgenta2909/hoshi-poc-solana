"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN BARU — catatan kesepakatan, ditulis di depan pemilik kartu.

   Layar ini SENGAJA tidak menerima kartunya. Yang dibuat di sini hanyalah baris berstatus
   "Belum diterima": kesepakatan sudah ada, barangnya belum. Serah terima dicatat di langkah
   berikutnya (foto → "Terima kartu"), dan hanya langkah itu yang membuka hak untuk dipajang.

   Dua hal yang dipisah itu bukan birokrasi: selama keduanya jadi satu tombol, akan selalu ada
   godaan memajang kartu yang "besok diambil" — dan kartu yang masih di tangan orang lain bisa
   ia jual sendiri ke pembeli lain.

   ┌──── SATU PERTANYAAN YANG HARUS DIJAWAB DULUAN ────────────────────────────────────────────┐
   │ "Orang ini sudah punya akun Hoshi, atau belum?"                                           │
   │                                                                                            │
   │ Kebanyakan kolektor lokal yang didatangi BELUM punya. Karena itu jalur "belum punya akun"  │
   │ bukan jalur darurat — ia jalur yang normal, dan layar ini tidak memperlakukannya sebagai   │
   │ kegagalan menemukan akun. Operator memilih salah satu dengan sadar; tidak ada yang         │
   │ terpilih sendiri.                                                                          │
   │                                                                                            │
   │ TIDAK ADA KOLOM EMAIL DI SINI, dan itu keputusan keamanan, bukan penyederhanaan. Di        │
   │ backend `User.email` tidak unik dan tidak pernah diverifikasi — hanya `walletAddress` yang │
   │ `@unique`. Siapa pun bisa mengetik alamat email orang lain di pengaturannya sendiri.       │
   │ Menyambungkan kartu puluhan juta ke "siapa pun yang mengaku memakai alamat itu" berarti    │
   │ menyerahkan barang orang ke orang lain. Yang menyambungkan adalah KODE KLAIM yang benar-   │
   │ benar berpindah tangan di ruangan yang sama dengan kartunya.                               │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   SATU LAGI, SOAL IDENTITAS: yang disimpan hanya JENIS dokumen + EMPAT ANGKA TERAKHIR. Nomor
   identitas lengkap tidak pernah dikirim, tidak pernah disimpan, tidak pernah ditampilkan.

   TIGA HAL YANG DITENTUKAN OLEH TEMPAT LAYAR INI DIPAKAI — ruang tamu orang, di ponsel:
     • DRAF yang selamat. Isian disimpan otomatis dan dipulihkan kalau tab-nya hilang; dibuang
       begitu titipannya tersimpan, supaya kartu berikutnya tidak mewarisi data kartu sebelumnya.
       (Blok DRAF di bawah.)
     • PERINGATAN KARTU MENTAH, di detik keputusan. Kartu tanpa grading bisa diterima tapi belum
       bisa dipajang; operator harus tahu itu SEBELUM kartunya berpindah tangan, bukan sesampainya
       di kantor. (Blok peringatan di bagian "Kartunya".)
     • KARTU BERIKUTNYA DARI PEMILIK YANG SAMA. Satu kunjungan hampir tidak pernah satu kartu.
       (`nextCardSameOwner`.)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminStorageKey, useAdminAuth } from "@/lib/adminAuth";
import {
  createAdminConsignment,
  type ConsignorCandidate,
  type CreateConsignmentInput,
} from "@/lib/admin-api";
import { commissionPct } from "@/lib/consignment";
import ClaimCodeHandover from "@/components/admin/ClaimCodeHandover";
import HandoverReceiptButton, {
  receiptDataFrom,
  type HandoverReceiptData,
} from "@/components/admin/HandoverReceipt";
import ConsignorPicker, { PickedConsignor } from "@/components/admin/ConsignorPicker";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/** Komisi bawaan (5%) — nilai yang dipakai pemilik produk hari ini. Dibekukan per baris titipan. */
const DEFAULT_COMMISSION_BPS = 500;

const GRADERS = ["", "PSA", "CGC", "BGS"] as const;
const ID_KINDS = ["", "KTP", "SIM", "PASPOR"] as const;
const RAW_CONDITIONS = ["", "NM", "LP", "MP", "HP", "DMG"] as const;

/** Jawaban atas "orang ini sudah punya akun Hoshi?". "" = belum dijawab, dan itu bukan default. */
type OwnerMode = "" | "AKUN" | "TANPA_AKUN";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   DRAF — formulir ini harus selamat dari ponsel operator.

   Ini bukan formulir yang diisi di meja dengan tab yang tenang. Ia diisi sambil berdiri, di
   ruang tamu orang, pada ponsel Android yang juga sedang membuka WhatsApp dan kamera. Gestur
   "kembali" yang tak sengaja, Android yang membuang tab karena kehabisan memori, atau satu
   ketukan pada notifikasi — dan seluruh isinya hilang DENGAN KOLEKTORNYA MASIH DUDUK DI SANA,
   menunggu operator mengetik ulang nama, nomor HP, dan catatan kondisi sepanjang tiga kalimat.

   Langkah FOTO di sebelah (`components/admin/ConsignmentPhotos.tsx`) sudah punya disiplin ini:
   ia mengunggah satu per satu supaya tidak ada draft yang bisa lenyap bersama tab-nya. Formulir
   sebelum foto tidak punya apa pun. Sekarang punya.

   SATU DRAF SAJA, dan itu cukup: satu operator mengisi satu kartu pada satu waktu. Draf beralamat
   per-peramban (localStorage), jadi ia tidak pernah menyeberang ke perangkat lain dan tidak pernah
   sampai ke server.

   DIHAPUS BEGITU TERSIMPAN. Draf yang hidup lebih lama daripada kartunya akan menempel pada kartu
   BERIKUTNYA — dan kartu berikutnya milik orang lain. Itu kegagalan yang lebih buruk daripada
   kehilangan draf.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/* Bagian kunci yang tetap. Awalan "hoshi.admin." dan akhiran identitas operator ditambahkan oleh
   `adminStorageKey` — DUA-DUANYA perlu, dan alasannya ditulis lengkap di lib/adminAuth.tsx.
   Singkatnya: ponsel ini dipakai bergantian. Tanpa akhiran identitas, operator berikutnya membuka
   formulir ini dan menemukan nama, telepon, dan empat angka KTP orang yang tidak pernah ia temui
   sudah terisi di sana — lalu ikut tersimpan ke kartu yang salah. */
const DRAFT_KEY_BASE = "consignment-intake.draft.v1";

/**
 * Isi draf = persis isi formulir.
 *
 * `v` ada supaya draf dari versi formulir yang lebih tua dibuang diam-diam alih-alih memulihkan
 * separuh layar. Kolom identitas (`idLast4`) ikut disimpan — ia cuma empat angka, ia SUDAH akan
 * dikirim ke server sebentar lagi, dan draf ini dihapus pada penyimpanan yang berhasil; yang
 * sebaliknya (operator mengetik ulang nomor identitas orang dari ingatan) justru lebih rawan
 * salah. Tombol "Buang draf" ada supaya ia bisa dihapus kapan saja tanpa menunggu penyimpanan.
 */
type IntakeDraft = {
  v: 1;
  savedAt: string;
  ownerMode: OwnerMode;
  consignor: ConsignorCandidate | null;
  nameAtIntake: string;
  phone: string;
  idKind: string;
  idLast4: string;
  place: string;
  cardName: string;
  cardSet: string;
  cardNumber: string;
  language: string;
  tcg: string;
  grader: string;
  certNumber: string;
  gradeLabel: string;
  gradeScore: string;
  rawCondition: string;
  conditionNote: string;
  rawAck: boolean;
  askPrice: string;
  reservePrice: string;
  commissionBps: string;
  agreementRef: string;
  intakeReceiptRef: string;
};

/** Draf yang belum berisi apa pun yang layak dipulihkan — tidak perlu ditulis, tidak perlu diumumkan. */
const isBlankDraft = (d: Omit<IntakeDraft, "v" | "savedAt">): boolean =>
  d.ownerMode === "" &&
  d.consignor == null &&
  !d.nameAtIntake.trim() &&
  !d.phone.trim() &&
  !d.idKind &&
  !d.idLast4.trim() &&
  !d.place.trim() &&
  !d.cardName.trim() &&
  !d.cardSet.trim() &&
  !d.cardNumber.trim() &&
  !d.language.trim() &&
  !d.tcg.trim() &&
  !d.grader &&
  !d.certNumber.trim() &&
  !d.gradeLabel.trim() &&
  !d.gradeScore.trim() &&
  !d.rawCondition &&
  !d.conditionNote.trim() &&
  !d.askPrice.trim() &&
  !d.reservePrice.trim() &&
  !d.agreementRef.trim() &&
  !d.intakeReceiptRef.trim();

/** Semua akses localStorage dibungkus: mode privat/penyimpanan penuh melempar, dan formulir ini
 *  harus tetap bisa dipakai tanpa draf sama sekali — kehilangan draf bukan alasan layar mati. */
function readDraft(key: string): IntakeDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as IntakeDraft;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, d: IntakeDraft): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(d));
  } catch {
    /* penyimpanan penuh / diblokir — formulirnya tetap jalan, cuma tanpa jaring pengaman */
  }
}

function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* sama: tidak ada yang perlu digagalkan karena ini */
  }
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-zinc-300">
        {label}
        {required && <span className="text-[11px] font-bold uppercase text-amber-300">wajib</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">{hint}</span>}
    </label>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
      {sub && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{sub}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function AdminTitipanBaruPage() {
  const { token } = useAdminAuth();
  const router = useRouter();

  /* ── pemilik kartu ── */
  const [ownerMode, setOwnerMode] = useState<OwnerMode>("");
  const [consignor, setConsignor] = useState<ConsignorCandidate | null>(null);
  const [nameAtIntake, setNameAtIntake] = useState("");
  const [phone, setPhone] = useState("");
  const [idKind, setIdKind] = useState<string>("");
  const [idLast4, setIdLast4] = useState("");
  const [place, setPlace] = useState("");

  /* ── kartu ── */
  const [cardName, setCardName] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [language, setLanguage] = useState("");
  const [tcg, setTcg] = useState("");
  const [grader, setGrader] = useState<string>("");
  const [certNumber, setCertNumber] = useState("");
  const [gradeLabel, setGradeLabel] = useState("");
  const [gradeScore, setGradeScore] = useState("");
  const [rawCondition, setRawCondition] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  /**
   * "Saya sudah memberitahu pemiliknya bahwa kartu mentah belum bisa dipajang."
   *
   * Hanya WAJIB kalau `grader` kosong. Bukan untuk menghalangi — menerima kartu mentah sering
   * MEMANG keputusan yang benar — tapi supaya menerimanya menjadi tindakan sadar, bukan akibat
   * sampingan dari sebuah dropdown yang dibiarkan kosong.
   */
  const [rawAck, setRawAck] = useState(false);

  /* ── kesepakatan ── */
  const [askPrice, setAskPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [commissionBps, setCommissionBps] = useState(String(DEFAULT_COMMISSION_BPS));
  const [agreementRef, setAgreementRef] = useState("");
  const [intakeReceiptRef, setIntakeReceiptRef] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Titipan yang BARU SAJA tersimpan — layar jeda antara "sudah tercatat" dan langkah berikutnya.
   *
   * `claim` berisi kode klaim HANYA kalau server menerbitkannya (jalur tanpa akun). Kode itu
   * disimpan di state halaman — bukan dilempar lewat URL — karena ia rahasia sekali-pakai: kode di
   * query string tertinggal di riwayat browser ponsel operator, dan ponsel operator bukan tempat
   * menyimpan kunci ke kartu orang.
   *
   * `receipt` adalah isi STRUK SERAH TERIMA, dan ia diambil dari BARIS YANG SERVER KEMBALIKAN —
   * bukan dari state formulir yang masih tergeletak di layar ini. Bedanya penting: yang dicetak
   * di kertas dan ditandatangani dua pihak harus persis apa yang TERSIMPAN, bukan apa yang
   * terakhir diketik. Kalau server menormalkan atau menolak sebagian isian, kertasnya ikut
   * berbunyi sesuai yang tersimpan.
   */
  const [saved, setSaved] = useState<{
    id: string;
    cardName: string;
    ownerName: string;
    ownerPhone: string;
    place: string;
    claim: { code: string; expiresAt: string | null } | null;
    receipt: HandoverReceiptData;
  } | null>(null);

  /* ── Draf: pulihkan sekali saat halaman dibuka, lalu simpan setiap kali isinya berubah ────── */

  /** null = belum ada draf yang dipulihkan. Isi = kapan draf itu terakhir disimpan. */
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  /** Gerbang: jangan menimpa draf tersimpan dengan state awal yang masih kosong. */
  const [draftReady, setDraftReady] = useState(false);

  /** Kunci draf milik operator INI. Berubah kalau yang login berganti — dan memang harus. */
  const draftKey = useMemo(() => adminStorageKey(DRAFT_KEY_BASE, token), [token]);

  useEffect(() => {
    // Tunggu token terbaca dulu. Kalau tidak, pemulihan berjalan dengan kunci ".anon", tidak
    // menemukan apa-apa, lalu membuka gerbang penyimpanan — dan draf operator ditulis ke laci
    // anonim yang tidak pernah ia baca lagi.
    if (!token) return;
    const d = readDraft(draftKey);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (d) {
      setOwnerMode(d.ownerMode);
      setConsignor(d.consignor);
      setNameAtIntake(d.nameAtIntake);
      setPhone(d.phone);
      setIdKind(d.idKind);
      setIdLast4(d.idLast4);
      setPlace(d.place);
      setCardName(d.cardName);
      setCardSet(d.cardSet);
      setCardNumber(d.cardNumber);
      setLanguage(d.language);
      setTcg(d.tcg);
      setGrader(d.grader);
      setCertNumber(d.certNumber);
      setGradeLabel(d.gradeLabel);
      setGradeScore(d.gradeScore);
      setRawCondition(d.rawCondition);
      setConditionNote(d.conditionNote);
      setRawAck(d.rawAck);
      setAskPrice(d.askPrice);
      setReservePrice(d.reservePrice);
      setCommissionBps(d.commissionBps);
      setAgreementRef(d.agreementRef);
      setIntakeReceiptRef(d.intakeReceiptRef);
      setRestoredAt(d.savedAt);
    }
    setDraftReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [token, draftKey]);

  /** Isi formulir dalam satu bentuk — dipakai untuk menyimpan draf dan tidak untuk yang lain. */
  const draftBody = useMemo(
    () => ({
      ownerMode,
      consignor,
      nameAtIntake,
      phone,
      idKind,
      idLast4,
      place,
      cardName,
      cardSet,
      cardNumber,
      language,
      tcg,
      grader,
      certNumber,
      gradeLabel,
      gradeScore,
      rawCondition,
      conditionNote,
      rawAck,
      askPrice,
      reservePrice,
      commissionBps,
      agreementRef,
      intakeReceiptRef,
    }),
    [
      ownerMode,
      consignor,
      nameAtIntake,
      phone,
      idKind,
      idLast4,
      place,
      cardName,
      cardSet,
      cardNumber,
      language,
      tcg,
      grader,
      certNumber,
      gradeLabel,
      gradeScore,
      rawCondition,
      conditionNote,
      rawAck,
      askPrice,
      reservePrice,
      commissionBps,
      agreementRef,
      intakeReceiptRef,
    ],
  );

  useEffect(() => {
    if (!draftReady) return;
    // Formulir yang kosong tidak menghasilkan draf: kalau tidak, setiap kunjungan ke halaman ini
    // akan menulis ulang draf kosong tepat sesudah penyimpanan berhasil menghapusnya.
    if (isBlankDraft(draftBody)) {
      clearDraft(draftKey);
      return;
    }
    writeDraft(draftKey, { v: 1, savedAt: new Date().toISOString(), ...draftBody });
  }, [draftReady, draftBody, draftKey]);

  /** Buang draf DAN kosongkan formulirnya — satu tombol, tanpa sisa yang membingungkan. */
  const discardDraft = () => {
    clearDraft(draftKey);
    setOwnerMode("");
    setConsignor(null);
    setNameAtIntake("");
    setPhone("");
    setIdKind("");
    setIdLast4("");
    setPlace("");
    setCardName("");
    setCardSet("");
    setCardNumber("");
    setLanguage("");
    setTcg("");
    setGrader("");
    setCertNumber("");
    setGradeLabel("");
    setGradeScore("");
    setRawCondition("");
    setConditionNote("");
    setRawAck(false);
    setAskPrice("");
    setReservePrice("");
    setCommissionBps(String(DEFAULT_COMMISSION_BPS));
    setAgreementRef("");
    setIntakeReceiptRef("");
    setRestoredAt(null);
    setError(null);
  };

  const askNum = Number(askPrice);
  const bpsNum = Number(commissionBps);

  /**
   * Yang masih kurang — ditampilkan terus, bukan baru muncul setelah tombol ditekan.
   *
   * Batas-batasnya SENGAJA sama dengan yang ditegakkan server (nama ≥2, HP ≥5, tempat ≥3,
   * catatan kondisi ≥10, grade 0–10, komisi 0–10000). Validasi klien yang lebih longgar hanya
   * memindahkan penolakan ke detik setelah operator menekan Simpan — di depan pemilik kartu.
   */
  const missing = useMemo(() => {
    const m: string[] = [];
    if (ownerMode === "") m.push("jawaban: pemiliknya sudah punya akun Hoshi atau belum");
    if (ownerMode === "AKUN" && !consignor) m.push("akun pemilik (pilih dari hasil pencarian)");
    if (nameAtIntake.trim().length < 2) m.push("nama pemilik di tanda terima");
    if (phone.trim().length < 5) m.push("nomor HP pemilik");
    if (idLast4 !== "" && idLast4.length !== 4) m.push("4 angka terakhir identitas (harus 4 digit)");
    if (place.trim().length < 3) m.push("tempat serah terima");
    if (!cardName.trim()) m.push("nama kartu");
    if (conditionNote.trim().length < 10)
      m.push("catatan kondisi (minimal satu kalimat, 10 huruf)");
    if (gradeScore.trim() !== "" && !(Number(gradeScore) >= 0 && Number(gradeScore) <= 10))
      m.push("nilai grade antara 0 dan 10");
    if (!Number.isFinite(askNum) || askNum <= 0) m.push("harga jual yang disepakati");
    if (!Number.isFinite(bpsNum) || bpsNum < 0 || bpsNum > 10_000) m.push("komisi yang wajar");
    // Bukan aturan server — aturan RUANG TAMU. Lihat blok peringatan kartu mentah di bawah.
    // Baru berlaku setelah ada kartu yang dibicarakan: menuntut centang pada formulir yang masih
    // kosong mengubah peringatan menjadi gangguan, dan peringatan yang jadi gangguan diabaikan.
    if (cardName.trim() && grader === "" && !rawAck)
      m.push("centang bahwa pemiliknya sudah diberitahu soal kartu tanpa grading");
    return m;
  }, [
    ownerMode,
    consignor,
    nameAtIntake,
    phone,
    idLast4,
    place,
    cardName,
    conditionNote,
    gradeScore,
    askNum,
    bpsNum,
    grader,
    rawAck,
  ]);

  const submit = async () => {
    if (!token || busy || missing.length > 0 || ownerMode === "") return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateConsignmentInput = {
        // Jalur TANPA_AKUN sengaja TIDAK mengirim `consignorId` sama sekali (bukan mengirim
        // string kosong): server-lah yang memutuskan menerbitkan kode klaim, dan ia memutuskannya
        // dari ketiadaan field ini.
        ...(ownerMode === "AKUN" && consignor ? { consignorId: consignor.id } : {}),
        consignorNameAtIntake: nameAtIntake.trim(),
        consignorPhoneAtIntake: phone.trim(),
        ...(idKind ? { consignorIdKind: idKind } : {}),
        ...(idLast4.trim() ? { consignorIdLast4: idLast4.trim().slice(-4) } : {}),
        receivedAtPlace: place.trim(),
        cardName: cardName.trim(),
        ...(cardSet.trim() ? { cardSet: cardSet.trim() } : {}),
        ...(cardNumber.trim() ? { cardNumber: cardNumber.trim() } : {}),
        ...(language.trim() ? { language: language.trim() } : {}),
        ...(tcg.trim() ? { tcg: tcg.trim() } : {}),
        ...(grader ? { grader } : {}),
        ...(certNumber.trim() ? { certNumber: certNumber.trim() } : {}),
        ...(gradeLabel.trim() ? { gradeLabel: gradeLabel.trim() } : {}),
        ...(gradeScore.trim() && Number.isFinite(Number(gradeScore))
          ? { gradeScore: Number(gradeScore) }
          : {}),
        ...(rawCondition ? { rawCondition } : {}),
        conditionNote: conditionNote.trim(),
        askPriceIdr: Math.round(askNum),
        ...(reservePrice.trim() && Number.isFinite(Number(reservePrice))
          ? { reservePriceIdr: Math.round(Number(reservePrice)) }
          : {}),
        commissionBps: Math.round(bpsNum),
        ...(agreementRef.trim() ? { agreementRef: agreementRef.trim() } : {}),
        ...(intakeReceiptRef.trim() ? { intakeReceiptRef: intakeReceiptRef.trim() } : {}),
      };
      const created = await createAdminConsignment(input, token);

      // ── DRAF DIBUANG TEPAT DI SINI, dan tidak sedetik lebih lambat ─────────────────────────
      // Barisnya sudah ada di server; draf yang tertinggal hanya bisa muncul kembali di atas
      // KARTU BERIKUTNYA — kartu milik orang lain — dan tidak ada layar yang akan menyadarinya.
      clearDraft(draftKey);
      setRestoredAt(null);

      // Layar jeda, bukan lompatan. Kode klaim (kalau ada) hanya hidup di jawaban INI dan tidak
      // bisa dibaca ulang dari mana pun, jadi pindah halaman sekarang berarti membuang
      // satu-satunya salinan kunci ke kartu orang selagi orangnya masih berdiri di depan
      // operator. Tanpa kode pun layar ini tetap berguna: di sinilah kartu BERIKUTNYA dari
      // pemilik yang sama ditawarkan.
      setSaved({
        id: created.id,
        cardName: created.cardName,
        ownerName: created.consignorNameAtIntake,
        ownerPhone: created.consignorPhoneAtIntake,
        place: created.receivedAtPlace,
        claim: created.claimCode
          ? { code: created.claimCode, expiresAt: created.claimCodeExpiresAt ?? null }
          : null,
        // Kartunya belum diterima pada titik ini (`custodyAcceptedAt` masih null), jadi tanggal
        // di struknya jatuh ke HARI INI — yang memang hari kertas ini ditandatangani.
        //
        // Kode klaim IKUT TERCETAK kalau ada, dan di sinilah satu-satunya kesempatan itu: server
        // hanya menyimpan sidiknya, jadi tidak ada layar mana pun yang bisa membacanya lagi nanti.
        receipt: receiptDataFrom(created, created.claimCode),
      });
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan titipan.");
      setBusy(false);
    }
  };

  /**
   * ══ KARTU BERIKUTNYA DARI PEMILIK YANG SAMA ══
   *
   * Satu kunjungan hampir tidak pernah satu kartu. Kolektor yang menyerahkan 8 kartu berarti
   * operator mengetik ulang nama, nomor HP, jenis identitas, empat angka terakhir, dan tempat
   * serah terima DELAPAN KALI — di ponsel, sambil berdiri, di ruang tamu orang. Blok pemilik
   * dipertahankan; blok kartu dan blok kesepakatan dikosongkan, karena kartu berikutnya adalah
   * kartu yang lain dengan harga yang lain.
   *
   * Komisi sengaja IKUT dipertahankan: ia disepakati per kunjungan, bukan per kartu, dan
   * mengembalikannya ke 5% diam-diam akan membekukan angka yang tidak pernah diucapkan.
   *
   * ⚠️ SETIAP baris tetap mendapat kode klaimnya SENDIRI — itu bentuk skema hari ini
   * (`claimCodeHash` `@unique` per titipan), dan layar ini menyebutkannya apa adanya alih-alih
   * membuat operator mengira satu kode menutup seluruh kunjungan. Irisan "satu kode untuk satu
   * kunjungan" adalah perubahan skema tersendiri; tidak ada apa pun di sini yang menghalanginya,
   * karena yang dipakai ulang cuma isi formulir, bukan identitas apa pun.
   */
  const nextCardSameOwner = () => {
    setSaved(null);
    setError(null);
    setCardName("");
    setCardSet("");
    setCardNumber("");
    setLanguage("");
    setTcg("");
    setGrader("");
    setCertNumber("");
    setGradeLabel("");
    setGradeScore("");
    setRawCondition("");
    setConditionNote("");
    setRawAck(false);
    setAskPrice("");
    setReservePrice("");
    setAgreementRef("");
    setIntakeReceiptRef("");
    try {
      window.scrollTo({ top: 0 });
    } catch {
      /* lingkungan tanpa window.scrollTo — tidak ada yang perlu digagalkan karena ini */
    }
  };

  /* ── Layar SESUDAH TERSIMPAN: menggantikan formulir, bukan menumpuk di bawahnya ──────────────
     Titipannya SUDAH tersimpan pada titik ini (operator tidak kehilangan apa pun kalau ia menutup
     tab). Yang belum selesai ada dua, dan keduanya hanya bisa dilakukan selagi kalian masih
     bertemu: kodenya harus berpindah tangan, dan kartu berikutnya dari tumpukan yang sama harus
     dicatat sebelum operator pamit. */
  if (saved) {
    return (
      <div className="space-y-5 pb-10">
        <header>
          <h1 className="text-[22px] font-bold text-zinc-100">Titipan tersimpan</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
            “{saved.cardName}” sudah tercatat atas nama {saved.ownerName}.
            {saved.claim
              ? " Tinggal dua hal yang harus selesai sebelum kalian berpisah."
              : " Berikutnya: cetak struknya, tanda tangani, lalu foto kartunya."}
          </p>
        </header>

        {/* ── STRUK SERAH TERIMA: PALING ATAS, SEBELUM APA PUN ────────────────────────────────
            Ini satu-satunya barang di seluruh alur yang HARUS berpindah tangan sebagai KERTAS,
            dan satu-satunya bukti yang isinya tidak bisa Hoshi ubah sendiri nanti — karena satu
            lembarnya disimpan orang lain. Kodenya ikut tercetak kalau ada.

            Ditaruh di atas panel kode klaim dengan sengaja: urutannya di lapangan adalah cetak →
            tanda tangan → baru kartunya diterima, dan layar yang menaruhnya di bawah membuat
            operator menekan "Lanjut" sebelum sempat membacanya. */}
        <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400/[0.07] p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold text-yellow-100">
            Cetak struknya sekarang, selagi kalian masih bertemu
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-yellow-100/80">
            Dua lembar identik: satu dibawa pulang {saved.ownerName}, satu disimpan Hoshi. Keduanya
            ditandatangani kedua pihak. Kartu ini <strong>belum bisa dinyatakan diterima</strong>{" "}
            sampai lembar yang sudah ditandatangani difoto — itu bukti bahwa kesepakatannya memang
            ada, yang tidak bisa dibuktikan oleh foto kartu sebagus apa pun.
          </p>
          <div className="mt-4">
            <HandoverReceiptButton
              data={saved.receipt}
              tone="utama"
              hint={
                saved.claim
                  ? "Kode klaim ikut tercetak di kedua lembar. Ini satu-satunya kesempatan kode itu masuk ke kertas — setelah layar ini ditutup, tidak ada yang bisa membacanya lagi."
                  : "Pemiliknya sudah punya akun Hoshi, jadi tidak ada kode klaim yang perlu dicetak."
              }
            />
          </div>
        </div>

        {saved.claim ? (
          /* Kedua jalan keluar berada DI DALAM gerbang "sudah saya berikan" milik komponen ini —
             termasuk "kartu berikutnya". Kartu kedua dari kunjungan yang sama bukan alasan yang
             cukup untuk meninggalkan layar yang memegang satu-satunya salinan kode kartu pertama. */
          <ClaimCodeHandover
            code={saved.claim.code}
            cardName={saved.cardName}
            ownerName={saved.ownerName}
            ownerPhone={saved.ownerPhone}
            place={saved.place}
            expiresAt={saved.claim.expiresAt}
            doneLabel="Lanjut ke foto & serah terima"
            onDone={() => router.push(`/admin/titipan/${saved.id}`)}
            secondaryLabel="Catat kartu berikutnya dari pemilik yang sama"
            onSecondary={nextCardSameOwner}
          />
        ) : (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4 sm:p-5">
            <p className="text-[13.5px] leading-relaxed text-emerald-100/85">
              Kartunya belum dinyatakan diterima — baris ini masih “Belum diterima”. Serah terima
              dicatat di halaman titipannya, setelah kartunya difoto dan struk yang sudah
              ditandatangani ikut difoto.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/admin/titipan/${saved.id}`)}
                className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
                style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
              >
                Lanjut ke foto & serah terima
              </button>
              <button
                type="button"
                onClick={nextCardSameOwner}
                className="rounded-xl border border-white/15 bg-white/[0.05] px-5 py-2.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.1]"
              >
                Catat kartu berikutnya dari pemilik yang sama
              </button>
            </div>
          </div>
        )}

        {/* Satu kunjungan hampir tidak pernah satu kartu — dan yang dipertahankan disebutkan
            terang-terangan, supaya operator tahu persis apa yang TIDAK perlu ia ketik lagi dan
            apa yang tetap harus ia isi ulang. */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
          <p className="text-[13px] font-semibold text-zinc-200">
            Masih ada kartu lain dari {saved.ownerName}?
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
            “Catat kartu berikutnya” mempertahankan nama, nomor HP, jenis identitas, empat angka
            terakhir, tempat serah terima, dan komisi — lalu mengosongkan blok kartu dan harga.
            {saved.claim
              ? " Tiap kartu tetap punya kode klaimnya sendiri, jadi tiap kode harus diberikan ke pemiliknya sebelum kalian berpisah."
              : ""}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <header>
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 transition hover:text-zinc-300">
          ← Titipan
        </Link>
        <h1 className="mt-2 text-[22px] font-bold text-zinc-100">Titipan baru</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
          Catat kesepakatannya dulu. Kartunya baru dinyatakan diterima di langkah berikutnya —
          setelah difoto — dan baru sesudah itu ia boleh dipajang.
        </p>
      </header>

      {/* ── DRAF DIPULIHKAN ──────────────────────────────────────────────────────────────────
          Diumumkan, tidak diam-diam. Formulir yang tiba-tiba sudah terisi tanpa penjelasan
          membuat operator mengira ia sedang melanjutkan kartu INI, padahal isinya bisa saja
          milik kolektor kemarin. Karena itu nama pemilik dan nama kartu di dalam draf ikut
          disebut, dan membuangnya cukup satu ketukan. */}
      {restoredAt && (
        <div className="rounded-2xl border border-sky-400/30 bg-sky-400/[0.07] px-4 py-3.5">
          <p className="text-[13px] font-semibold text-sky-100">
            Draf yang belum tersimpan dipulihkan
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-sky-100/80">
            Isian ini tersimpan otomatis di peramban ini pada{" "}
            {new Date(restoredAt).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {nameAtIntake.trim() || cardName.trim() ? (
              <>
                {" "}
                — atas nama <strong className="text-sky-50">{nameAtIntake.trim() || "—"}</strong>,
                kartu <strong className="text-sky-50">{cardName.trim() || "—"}</strong>
              </>
            ) : null}
            . Kalau ini bukan kartu yang sedang kamu catat, buang dulu sebelum mengisi.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRestoredAt(null)}
              className="rounded-lg border border-sky-300/35 bg-sky-400/10 px-3 py-1.5 text-[12px] font-semibold text-sky-100 transition hover:bg-sky-400/20"
            >
              Lanjutkan draf ini
            </button>
            <button
              type="button"
              onClick={discardDraft}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
            >
              Buang draf & mulai kosong
            </button>
          </div>
        </div>
      )}

      <Section
        title="Pemilik kartu"
        sub="Dia yang nanti menerima hasil penjualannya, jadi kartu ini harus punya tujuan yang benar sejak hari ini."
      >
        {/* ── Pertanyaan pertama, dijawab dengan sadar ── */}
        <div className="sm:col-span-2">
          <span className="mb-2 block text-[13px] font-medium text-zinc-300">
            Pemiliknya sudah punya akun Hoshi?
            <span className="ml-1.5 text-[11px] font-bold uppercase text-amber-300">wajib</span>
          </span>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setOwnerMode("AKUN")}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                ownerMode === "AKUN"
                  ? "border-yellow-400/45 bg-yellow-400/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <span className="block text-[14px] font-semibold text-zinc-100">Sudah punya</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-zinc-500">
                Cari akunnya, lalu pilih orangnya. Kartunya langsung tersambung.
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOwnerMode("TANPA_AKUN");
                setConsignor(null);
              }}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                ownerMode === "TANPA_AKUN"
                  ? "border-violet-400/50 bg-violet-400/10"
                  : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <span className="block text-[14px] font-semibold text-zinc-100">Belum punya</span>
              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-zinc-500">
                Jalan terus tanpa akun. Kartunya dapat kode klaim yang dibawa pulang pemiliknya.
              </span>
            </button>
          </div>
        </div>

        {/* ── Jalur A: cari akunnya ── */}
        {ownerMode === "AKUN" && (
          <div className="sm:col-span-2">
            <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-zinc-300">
              Cari akun pemilik
              <span className="text-[11px] font-bold uppercase text-amber-300">wajib</span>
            </span>

            {/* Yang dipilih ditampilkan MENGGANTIKAN kotak pencarian, lengkap dengan alamat wallet
                UTUH: inilah layar terakhir sebelum kartu orang tertaut ke sebuah akun, dan alamat
                yang dipendekkan membuat dua akun berbeda tampak sama persis. */}
            {consignor ? (
              <PickedConsignor user={consignor} onClear={() => setConsignor(null)} />
            ) : (
              <ConsignorPicker
                token={token}
                onPick={(u) => {
                  setConsignor(u);
                  // Nama di tanda terima diisikan sebagai USULAN, dan hanya kalau masih kosong:
                  // yang ditulis di tanda terima adalah nama yang disebut orangnya hari itu, bukan
                  // nama tampilan akun yang bisa ia ganti kapan saja.
                  if (!nameAtIntake.trim()) setNameAtIntake(u.displayName ?? "");
                }}
                emptyAction={
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerMode("TANPA_AKUN");
                      setConsignor(null);
                    }}
                    className="rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-[12px] font-semibold text-violet-200 transition hover:bg-violet-400/20"
                  >
                    Catat tanpa akun, pakai kode klaim →
                  </button>
                }
              />
            )}

            <span className="mt-1.5 block text-[11px] leading-relaxed text-zinc-500">
              Ketik nama, sebagian alamat wallet, atau email yang ia pakai — minimal 3 huruf. Email
              hanya membantu MENEMUKAN akunnya; yang menentukan orangnya adalah alamat wallet.
            </span>
          </div>
        )}

        {/* ── Jalur B: belum punya akun ── */}
        {ownerMode === "TANPA_AKUN" && (
          <div className="sm:col-span-2 rounded-xl border border-violet-400/30 bg-violet-400/[0.07] px-4 py-3.5">
            <p className="text-[13px] font-semibold text-violet-100">
              Kartunya dicatat sekarang, akunnya menyusul.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-violet-100/80">
              Setelah disimpan, layar ini menampilkan <strong>kode klaim</strong> yang harus kamu
              berikan ke pemiliknya sebelum kalian berpisah — bisa disalin, dikirim lewat WhatsApp,
              atau dicetak. Dia memakai kode itu di Hoshi untuk menyambungkan kartu ini ke akunnya.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-violet-200/70">
              Selama belum diklaim, kartu ini tetap bisa kamu terima dan simpan seperti biasa, tapi
              belum bisa dipajang: hasil penjualannya belum punya tujuan.
            </p>
          </div>
        )}

        <Field
          label="Nama di tanda terima"
          required
          hint="Ditulis apa adanya hari ini. Nama akun bisa diganti pemiliknya kapan saja; yang ini tidak."
        >
          <input value={nameAtIntake} onChange={(e) => setNameAtIntake(e.target.value)} className={INPUT} />
        </Field>

        <Field
          label="Nomor HP"
          required
          hint={
            ownerMode === "TANPA_AKUN"
              ? "Ke nomor inilah kode klaimnya dikirim lewat WhatsApp. Pastikan benar sebelum lanjut."
              : undefined
          }
        >
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="08…"
            className={INPUT}
          />
        </Field>

        <Field label="Jenis identitas">
          <select value={idKind} onChange={(e) => setIdKind(e.target.value)} className={INPUT}>
            {ID_KINDS.map((k) => (
              <option key={k} value={k} className="bg-[#121217]">
                {k || "— tidak dicatat —"}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="4 angka terakhir identitas"
          hint="HANYA empat angka terakhir. Jangan pernah catat nomor lengkapnya di mana pun."
        >
          <input
            value={idLast4}
            onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, "").slice(-4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            className={INPUT}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Tempat serah terima"
            required
            hint="mis. “Rumah pemilik, Bandung” atau “Kantor Hoshi, Jakarta”."
          >
            <input value={place} onChange={(e) => setPlace(e.target.value)} className={INPUT} />
          </Field>
        </div>
      </Section>

      <Section
        title="Kartunya"
        sub="Nomor sertifikat adalah bukti identitas terkuat yang ada — dan pemilik kartu bisa mengeceknya sendiri di situs grader-nya, tanpa perlu percaya Hoshi."
      >
        <div className="sm:col-span-2">
          <Field label="Nama kartu" required>
            <input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="mis. Charizard VMAX"
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Set / seri">
          <input value={cardSet} onChange={(e) => setCardSet(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Nomor kartu">
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Bahasa">
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="English / Japan"
            className={INPUT}
          />
        </Field>
        <Field label="TCG">
          <input
            value={tcg}
            onChange={(e) => setTcg(e.target.value)}
            placeholder="Pokemon / One Piece…"
            className={INPUT}
          />
        </Field>

        <Field
          label="Grader"
          hint="Kosongkan untuk kartu mentah (belum di-grade) — baca peringatannya di bawah sebelum menerima kartunya."
        >
          <select value={grader} onChange={(e) => setGrader(e.target.value)} className={INPUT}>
            {GRADERS.map((g) => (
              <option key={g} value={g} className="bg-[#121217]">
                {g || "— mentah / tanpa grading —"}
              </option>
            ))}
          </select>
        </Field>

        {/* ══ KARTU MENTAH: DITERIMA, DISIMPAN, TAPI BELUM BISA DIJUAL ════════════════════════
            `Listing.grader` adalah enum NOT NULL berisi PSA/CGC/BGS saja, jadi server MENOLAK
            memajang titipan tanpa grader — dan penolakannya benar: mengisi kolom itu berarti
            memberi label palsu pada kartu orang lain, persis hal yang seluruh fitur ini dibangun
            untuk tidak dilakukan.

            Masalahnya bukan aturannya, melainkan KAPAN operator mengetahuinya. Koleksi lokal
            Indonesia sebagian besar mentah. Tanpa peringatan di sini, operator menerima kartunya,
            berkata "nanti kami pajangkan", pamit — dan baru menemukan kenyataannya sesampainya di
            kantor, dengan kartu orang sudah ada di tas. Peringatannya harus berada di detik
            keputusan, bukan di layar berikutnya.

            Centangnya BUKAN penghalang: menerima kartu mentah sering memang keputusan yang benar
            (kartunya aman, tercatat, dan bisa diminta kembali kapan saja). Ia hanya memastikan
            keputusan itu diambil dengan sadar dan diucapkan ke pemiliknya. */}
        {cardName.trim() !== "" && grader === "" && (
          <div className="sm:col-span-2 rounded-xl border border-amber-400/35 bg-amber-400/[0.09] px-4 py-3.5">
            <p className="text-[13px] font-semibold text-amber-100">
              Kartu tanpa grading belum bisa dipajang di Hoshi.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-100/85">
              Listing di Hoshi wajib menyebut grader (PSA/CGC/BGS), dan menuliskan salah satunya
              untuk kartu yang belum di-grade berarti memberi label palsu pada kartu orang lain.
              Jadi kartu ini <strong>akan tercatat, boleh diterima, aman di penyimpanan, dan bisa
              diminta kembali kapan saja</strong> — tapi ia akan menunggu di rak sampai di-grade,
              dan tidak akan muncul di marketplace sebelum itu.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-100/85">
              Katakan ini ke pemiliknya <strong>sekarang</strong>, sebelum ia menyerahkan kartunya.
              Kalau kartunya sebenarnya bersertifikat, pilih grader-nya di atas.
            </p>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-amber-50">
              <input
                type="checkbox"
                checked={rawAck}
                onChange={(e) => setRawAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
              />
              <span>
                Pemiliknya sudah saya beritahu bahwa kartu ini belum bisa dipajang untuk dijual,
                dan ia tetap ingin menitipkannya.
              </span>
            </label>
          </div>
        )}
        <Field label="Nomor sertifikat">
          <input
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            placeholder="mis. 74185296"
            className={INPUT}
          />
        </Field>
        <Field label="Grade">
          <input
            value={gradeLabel}
            onChange={(e) => setGradeLabel(e.target.value)}
            placeholder="PSA 10"
            className={INPUT}
          />
        </Field>
        <Field label="Nilai grade (angka)">
          <input
            value={gradeScore}
            onChange={(e) => setGradeScore(e.target.value)}
            inputMode="decimal"
            placeholder="10"
            className={INPUT}
          />
        </Field>

        <Field label="Kondisi kartu mentah">
          <select
            value={rawCondition}
            onChange={(e) => setRawCondition(e.target.value)}
            className={INPUT}
          >
            {RAW_CONDITIONS.map((c) => (
              <option key={c} value={c} className="bg-[#121217]">
                {c || "— tidak berlaku —"}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Catatan kondisi"
            required
            hint="Tulis dengan kata-katamu sendiri, di depan pemiliknya — termasuk untuk slab (“slab utuh, tidak retak, label lurus”). Kalimat inilah yang dipakai kalau berbulan-bulan lagi ada perbedaan pendapat soal kondisi."
          >
            <textarea
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              rows={3}
              className={`${INPUT} resize-y leading-relaxed`}
            />
          </Field>
        </div>
      </Section>

      <Section title="Kesepakatan" sub="Angka-angka ini dibekukan di baris titipan hari ini.">
        <Field label="Harga jual (Rp)" required>
          <input
            value={askPrice}
            onChange={(e) => setAskPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="2500000"
            className={INPUT}
          />
        </Field>
        {/* Ini janji yang diucapkan di depan pemiliknya ("tidak akan kami lepas di bawah X"),
            bukan memo internal. Ia ditampilkan lagi di layar harga & pajang, dan di halaman
            pemiliknya sendiri — angka yang cuma bisa dibaca sebelah pihak bukan janji. */}
        <Field
          label="Harga terendah yang boleh (Rp)"
          hint="Opsional, tapi mengikat: angka ini muncul lagi setiap kali harga kartu ini diubah atau dipajang, dan pemiliknya melihatnya di halaman titipannya."
        >
          <input
            value={reservePrice}
            onChange={(e) => setReservePrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={INPUT}
          />
        </Field>

        <Field
          label="Komisi Hoshi (bps)"
          hint="500 = 5%. Disimpan per titipan, jadi perubahan komisi standar di kemudian hari tidak mengubah apa yang sudah dijanjikan untuk kartu ini."
        >
          <input
            value={commissionBps}
            onChange={(e) => setCommissionBps(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={INPUT}
          />
        </Field>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[12px] text-zinc-500">Kalau terjual di harga ini</p>
          <p className="mt-1 text-[14px] text-zinc-200">
            Pemilik menerima{" "}
            <strong className="text-emerald-300">
              Rp{" "}
              {Number.isFinite(askNum) && askNum > 0 && Number.isFinite(bpsNum)
                ? Math.max(
                    0,
                    Math.round(askNum) - Math.floor((Math.round(askNum) * Math.min(Math.max(bpsNum, 0), 10_000)) / 10_000),
                  ).toLocaleString("id-ID")
                : "—"}
            </strong>
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Komisi Hoshi {Number.isFinite(bpsNum) ? commissionPct(bpsNum) : "—"}%. Angka pastinya
            dihitung server dari jumlah yang benar-benar dibayar pembeli.
          </p>
        </div>

        <Field label="Nomor / arsip perjanjian" hint="Opsional: penanda dokumen yang ditandatangani.">
          <input value={agreementRef} onChange={(e) => setAgreementRef(e.target.value)} className={INPUT} />
        </Field>
        <Field
          label="Nomor / arsip tanda terima"
          hint="Tanda terima yang ditandatangani KEDUA pihak. Pemilik kartu memegang salinannya — ini buktinya, bukan bukti Hoshi."
        >
          <input
            value={intakeReceiptRef}
            onChange={(e) => setIntakeReceiptRef(e.target.value)}
            className={INPUT}
          />
        </Field>
      </Section>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {/* Bilah simpan — menempel di bawah layar supaya di ponsel tidak perlu menggulung balik, dan
          selalu menyebut apa yang masih kurang alih-alih menunggu tombolnya ditolak. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0b0b0f]/95 px-4 py-3 backdrop-blur lg:pl-[264px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-zinc-500">
            {missing.length === 0 ? (
              <>
                {ownerMode === "TANPA_AKUN" ? (
                  <>Siap disimpan. Setelah ini: kode klaim untuk pemiliknya, lalu foto kartunya.</>
                ) : (
                  <>Siap disimpan. Setelah ini: foto kartunya, lalu nyatakan diterima.</>
                )}
                {/* Diulang di bilah simpan: ini kalimat terakhir yang dibaca operator sebelum
                    kartunya benar-benar berpindah tangan. */}
                {cardName.trim() !== "" && grader === "" && (
                  <span className="text-amber-300">
                    {" "}
                    Kartu tanpa grading — tercatat dan aman, tapi belum bisa dipajang.
                  </span>
                )}
              </>
            ) : (
              <>Belum lengkap: {missing.join(", ")}.</>
            )}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || missing.length > 0}
            className="shrink-0 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
          >
            {busy ? "Menyimpan…" : "Simpan kesepakatan"}
          </button>
        </div>
      </div>
    </div>
  );
}
