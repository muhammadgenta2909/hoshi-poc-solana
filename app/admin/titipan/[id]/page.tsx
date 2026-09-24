"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   SATU TITIPAN — layar kerja operator: bukti, serah terima, pajang, dan jalan keluarnya.

   ┌──── SATU FAKTA YANG MENENTUKAN SEGALANYA ─────────────────────────────────────────────────┐
   │ "Terima kartu" menulis tanggal terima SEKALI, dan tidak ada tombol di mana pun yang bisa   │
   │ menghapusnya. Kartu keluar dari Hoshi dicatat sebagai fakta KEDUA (dikembalikan / hilang), │
   │ bukan dengan membatalkan yang pertama. Karena itu tidak ada satu pun aksi di halaman ini   │
   │ yang bisa membuat sebuah kartu "tidak pernah dititipkan".                                  │
   │                                                                                            │
   │ Konsekuensinya buat operator: tombol "Terima kartu" hanya boleh ditekan kalau kartunya     │
   │ BENAR-BENAR sudah ada di tangan. Layar ini menolak menekannya selama bukti wajib kurang.   │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   CATATAN INTAKE TIDAK BISA DIEDIT — dan itu fitur, bukan keterbatasan. Catatan kondisi, foto,
   dan identitas kartu tidak punya rute ubah di server; yang perlu diluruskan ditulis sebagai
   KOREKSI, yaitu baris audit baru. Catatan kondisi yang bisa diubah diam-diam sesudah sengketa
   dimulai tidak ada harganya sebagai bukti — untuk kedua pihak.

   Gerbang sebenarnya ada di server; tombol di sini hanya disusun supaya operator tahu SEBELUM
   menekan, bukan sesudah ditolak. Nol USDC, nol SOL, nol escrow bergerak dari halaman ini.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  acceptConsignmentCustody,
  addAdminConsignmentCorrection,
  AdminApiError,
  compensateAdminConsignment,
  consignmentAllowedActions,
  consignmentReleaseReason,
  getAdminConsignment,
  issueAdminConsignmentClaimCode,
  linkAdminConsignor,
  listAdminConsignment,
  markAdminConsignmentLost,
  releaseAdminConsignment,
  requestAdminConsignmentReturn,
  setAdminConsignmentPrice,
  type AdminConsignment,
  type ConsignmentAction,
  type ConsignorCandidate,
} from "@/lib/admin-api";
import {
  certLookupUrl,
  commissionPct,
  consignorLinkMethodLabel,
  estimatedPayout,
  eventTitle,
  isAwaitingClaim,
  isInHoshiCustody,
  isReturnAddressFormComplete,
  reserveWarning,
  requiredPhotoKinds,
  returnAddressLine,
  returnMethodLabel,
  returnPayerLabel,
  statusUi,
  PHOTO_KIND_BLOCKER_LABEL,
  type ConsignmentPhotoKind,
  type ConsignmentReturnMethod,
  type ConsignmentReturnPayer,
  type ConsignmentReturnPlan,
} from "@/lib/consignment";
import ConsignmentPhotos from "@/components/admin/ConsignmentPhotos";
import ClaimCodeHandover from "@/components/admin/ClaimCodeHandover";
import LabelCorrectionPanel from "@/components/admin/LabelCorrectionPanel";
import HandoverReceiptButton, { receiptDataFrom } from "@/components/admin/HandoverReceipt";
import ConsignorPicker, { PickedConsignor } from "@/components/admin/ConsignorPicker";
import { ConfirmDialog } from "@/components/account/ui";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/** Panjang minimum catatan manusia — sama dengan yang ditegakkan DTO backend (NOTE_MIN). */
const NOTE_MIN = 10;

const rp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const dt = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/**
 * ╔════════════════════════════════════════════════════════════════════════════════════════════╗
 * ║ GANTI RUGI YANG DITOLAK HARUS TERBACA SEBAGAI DITOLAK.                                     ║
 * ╚════════════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Bug lamanya persis ini: operator salah ketik, mengulang, server menolak, layar tetap hijau —
 * dan operator pulang mengira pemiliknya sudah dibayar. Fungsi ini hanya menyusun SATU KALIMAT
 * JUDUL yang bisa dibaca sekilas; teks lengkap dari server tetap ditampilkan apa adanya di
 * bawahnya, karena ia menyebut nominal, order pembeli, dan tanggal yang tidak boleh ditulis ulang.
 *
 * Bercabang pada STATUS HTTP + TEKS PESAN, dan itu disengaja: ketiga penolakan baru ini adalah
 * `ConflictException`/`BadRequestException` biasa yang TIDAK membawa kode kontrak. Mengarang kode
 * yang tidak pernah dikirim server hanya akan membuat cabang yang diam-diam tidak pernah kena.
 *
 * Cabang terakhir (bukan 400/409, mis. jaringan putus) SENGAJA tidak berkata "tidak ada uang yang
 * berpindah": permintaan yang tidak pernah terjawab bisa saja sudah sempat menulis di server.
 */
const compensateFailureTitle = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : "";
  const status = e instanceof AdminApiError ? e.status : 0;
  if (status === 409 && /SUDAH TERJUAL/i.test(msg)) {
    return "DITOLAK — kartunya sudah terjual sebelum hilang, jadi yang wajib dipulihkan PEMBELI, bukan pemilik. Nol rupiah masuk ke saldo pemilik.";
  }
  if (status === 409 && /SUDAH pernah tercatat/i.test(msg)) {
    return "DITOLAK — ganti rugi untuk titipan ini SUDAH pernah dibayar. Penekanan tadi tidak memindahkan satu rupiah pun.";
  }
  if (status === 400 && /BERBEDA dari harga jual/i.test(msg)) {
    return "DITOLAK — angka di layar ini tidak sama dengan yang tercatat di server. Muat ulang halamannya, lalu cocokkan lagi dengan struk yang ditandatangani.";
  }
  if (status === 409) {
    return "DITOLAK — keadaan titipan ini tidak mengizinkannya. Tidak ada uang yang berpindah.";
  }
  if (status === 400) {
    return "DITOLAK — permintaannya tidak sah. Tidak ada uang yang berpindah.";
  }
  return "GAGAL — dan tidak ada kepastian uangnya TIDAK berpindah. Periksa saldo pemiliknya sebelum mencoba lagi.";
};

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
      {sub && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.05] py-2 first:border-t-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="text-right text-[13px] text-zinc-200">{value}</span>
    </div>
  );
}

export default function AdminTitipanDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");
  const { token } = useAdminAuth();

  const [c, setC] = useState<AdminConsignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  /** Naik setiap kali baris ini DIBACA ULANG dari server. Lihat catatan di `load()`. */
  const [rowEpoch, setRowEpoch] = useState(0);

  /* form-form aksi */
  const [storageLocation, setStorageLocation] = useState("");
  const [acceptNote, setAcceptNote] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [listImage, setListImage] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [releaseReceipt, setReleaseReceipt] = useState("");
  const [releaseNote, setReleaseNote] = useState("");

  /* ── KE MANA KARTUNYA PULANG ──────────────────────────────────────────────────────────────
     Ditanyakan di layar penarikan, bukan di layar pelepasan custody, karena momen paling murah
     untuk menanyakan alamat adalah momen pemiliknya masih bicara dengan operator. Sesudah
     teleponnya ditutup, melengkapinya berarti menelepon kembali — dan begitulah sebuah kartu
     berakhir tercatat "ditarik" berminggu-minggu tanpa pernah dikirim ke mana pun. */
  const [retMethod, setRetMethod] = useState<ConsignmentReturnMethod>("COURIER");
  const [retName, setRetName] = useState("");
  const [retPhone, setRetPhone] = useState("");
  const [retStreet, setRetStreet] = useState("");
  const [retApt, setRetApt] = useState("");
  const [retCity, setRetCity] = useState("");
  const [retState, setRetState] = useState("");
  const [retZip, setRetZip] = useState("");
  /** Kosong = belum diputuskan. Sengaja BUKAN default "HOSHI": menebaknya berarti menyembunyikan
      pertanyaannya, dan ongkos yang tidak pernah ditanyakan adalah ongkos yang tidak pernah
      terlihat di laporan mana pun. */
  const [retPayer, setRetPayer] = useState<ConsignmentReturnPayer | "">("");
  /** Kosong = biarkan server menaksir dari tarif wilayah yang sudah dipakai kirim domestik. */
  const [retFee, setRetFee] = useState("");

  /* ── BUKTI SERAH TERIMA PENGEMBALIAN: resi, atau nama yang mengambil ── */
  const [retCourier, setRetCourier] = useState("");
  const [retTracking, setRetTracking] = useState("");
  const [retPickedUpBy, setRetPickedUpBy] = useState("");
  const [lostNote, setLostNote] = useState("");
  /* TIDAK ADA `compAmount` LAGI, dan itu inti perubahannya: nominal ganti rugi bukan keputusan
     operator. Server membacanya dari `askPriceIdr` — angka yang TERCETAK di struk serah terima
     yang ditandatangani kedua pihak. Kotak isian kosong di sini dulu mengundang persis kesalahan
     yang paling mahal ("kurang satu nol") pada satu-satunya aksi di layar ini yang memindahkan
     uang sungguhan. */
  const [compNote, setCompNote] = useState("");
  /** Hasil ganti rugi — SUKSES maupun DITOLAK, ditampilkan di panelnya sendiri, bukan sebagai
      toast hijau yang sama untuk dua kejadian yang berlawanan. */
  const [compResult, setCompResult] = useState<
    null | { ok: boolean; title: string; detail: string }
  >(null);
  const [correction, setCorrection] = useState("");
  const [confirm, setConfirm] = useState<
    null | { kind: "ACCEPT" } | { kind: "RETURN" } | { kind: "RELEASE" } | { kind: "LOST" } | { kind: "COMPENSATE" }
  >(null);

  /**
   * Kode klaim yang baru saja terbit dan belum berpindah tangan.
   *
   * Hidup di state halaman dan TIDAK PERNAH di URL: ia rahasia sekali-pakai, dan query string
   * tertinggal di riwayat browser ponsel operator. Server pun tidak bisa menampilkannya lagi —
   * yang disimpan di sana hanya sidiknya.
   */
  const [handover, setHandover] = useState<{ code: string; expiresAt: string | null } | null>(null);
  const [claimNote, setClaimNote] = useState("");
  /* Penautan langsung oleh admin (Path A yang datang terlambat). */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkPick, setLinkPick] = useState<ConsignorCandidate | null>(null);
  const [linkNote, setLinkNote] = useState("");

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getAdminConsignment(id, token);
      setC(row);
      setStorageLocation(row.storageLocation ?? "");
      setListPrice(String(row.askPriceIdr ?? ""));
      setNewPrice(String(row.listing?.priceIdrx ?? row.askPriceIdr ?? ""));
      setListImage(
        row.listing?.image ??
          row.photos?.find((p) => p.kind === "FRONT")?.url ??
          row.photos?.[0]?.url ??
          "",
      );
      /* Rencana pengembalian yang SUDAH tersimpan mengisi formulirnya kembali — supaya
         memperbaiki satu kode pos tidak berarti mengetik ulang seluruh alamat, dan supaya
         operator melihat apa yang sebenarnya tercatat alih-alih formulir kosong yang membuatnya
         mengira belum ada apa-apa. */
      if (row.returnMethod === "PICKUP" || row.returnMethod === "COURIER") {
        setRetMethod(row.returnMethod);
      }
      setRetName(row.returnRecipientName ?? "");
      setRetPhone(row.returnPhoneNumber ?? "");
      setRetStreet(row.returnStreet ?? "");
      setRetApt(row.returnApt ?? "");
      setRetCity(row.returnCity ?? "");
      setRetState(row.returnState ?? "");
      setRetZip(row.returnZip ?? "");
      setRetPayer(
        row.returnShippingPayer === "OWNER" || row.returnShippingPayer === "HOSHI"
          ? row.returnShippingPayer
          : "",
      );
      setRetFee(row.returnShippingFeeIdr == null ? "" : String(row.returnShippingFeeIdr));
      setRetCourier(row.returnCourier ?? "");
      setRetTracking(row.returnTrackingNo ?? "");
      setRetPickedUpBy(row.returnPickedUpBy ?? "");
      /* ── KENAPA ADA PENGHITUNG DI SINI ──────────────────────────────────────────────────
         Formulir koreksi label disemai dari nilai yang TERSIMPAN, dan ia dipakai persis ketika
         nilai itu ternyata sudah berubah di server (gerbang optimistik menolak, operator menekan
         "muat ulang"). Tanpa penanda ini, formulirnya tetap memegang nilai basi dari sebelum
         pemuatan ulang — dan mengirimkannya lagi hanya menghasilkan penolakan yang sama.
         Dipakai sebagai `key` panel itu, jadi setiap pembacaan ULANG dari server menyemainya
         kembali; penyimpanan yang berhasil TIDAK lewat sini (ia memakai baris dari responsnya
         sendiri), sehingga pesan berhasilnya tidak ikut terhapus. */
      setRowEpoch((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat titipan.");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  const photos = useMemo(() => c?.photos ?? [], [c]);

  /**
   * Bukti yang WAJIB sebelum kartu boleh dinyatakan diterima — cermin gerbang di server, dan
   * daftarnya hidup di SATU tempat (`lib/consignment.ts`) supaya kedua sisi tidak bisa melenceng.
   */
  const requiredKinds = useMemo<ConsignmentPhotoKind[]>(
    () => requiredPhotoKinds(c?.certNumber),
    [c?.certNumber],
  );

  /** Apa yang masih kurang untuk menekan "Terima kartu". Ditampilkan, bukan disembunyikan. */
  const acceptBlockers = useMemo(() => {
    const m: string[] = [];
    for (const k of requiredKinds) {
      if (!photos.some((p) => p.kind === k)) m.push(PHOTO_KIND_BLOCKER_LABEL[k]);
    }
    if (!storageLocation.trim()) m.push("lokasi penyimpanan");
    return m;
  }, [photos, requiredKinds, storageLocation]);

  const allowed: ConsignmentAction[] = c ? consignmentAllowedActions(c) : [];
  const can = (a: ConsignmentAction) => allowed.includes(a);

  /**
   * Formulir rencana pengembalian → body `returnPlan`, atau `undefined` kalau belum ada yang
   * layak dikirim.
   *
   * ALAMAT SETENGAH JADI SENGAJA TIDAK DIKIRIM. Server akan menolaknya — dan itu benar — tapi
   * penolakan itu membatalkan SELURUH permintaan, termasuk bagian yang sebenarnya berhasil:
   * "pemiliknya minta kartunya kembali". Permintaan itu tidak boleh bisa gagal karena sebuah
   * kode pos. Jadi yang dikirim hanya rencana yang utuh; yang setengah jadi ditahan di layar,
   * dengan kalimat yang menjelaskan apa akibatnya.
   */
  const returnPlanPayload = (): ConsignmentReturnPlan | undefined => {
    const feeRaw = retFee.trim();
    const fee = feeRaw === "" ? null : Number(feeRaw);
    const extras = {
      ...(retPayer ? { returnShippingPayer: retPayer } : {}),
      ...(fee != null && Number.isFinite(fee) ? { returnShippingFeeIdr: fee } : {}),
    };
    if (retMethod === "PICKUP") return { returnMethod: "PICKUP", ...extras };
    const address = {
      recipientName: retName.trim(),
      phoneNumber: retPhone.trim(),
      street: retStreet.trim(),
      ...(retApt.trim() ? { apt: retApt.trim() } : {}),
      city: retCity.trim(),
      state: retState.trim(),
      zip: retZip.trim(),
    };
    if (!isReturnAddressFormComplete(address)) return undefined;
    return { returnMethod: "COURIER", returnAddress: address, ...extras };
  };

  /**
   * Satu pembungkus untuk semua aksi. Semua rute menjawab dengan baris terbaru.
   *
   * Dua rute penetap harga menambahkan `belowReserveWarning`: kalimat SERVER yang menyebut kedua
   * angkanya, dan yang PERSIS SAMA sudah ditulis ke baris audit. Ia DIBAWA ke pesan berhasil apa
   * adanya — aksinya memang berhasil (ini peringatan, bukan penolakan), tapi "harga ini di bawah
   * yang dijanjikan ke pemiliknya" tidak boleh lenyap di balik kata "Harga diperbarui."
   */
  const run = async (
    fn: () => Promise<AdminConsignment & { belowReserveWarning?: string | null }>,
    okMsg: string,
  ) => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const row = await fn();
      setC(row);
      setOk(row.belowReserveWarning ? `${okMsg} ${row.belowReserveWarning}` : okMsg);
    } catch (e) {
      // Pesan server dipakai APA ADANYA: ia sudah menjelaskan posisi kartu dan uangnya lebih baik
      // daripada terjemahan mana pun yang bisa ditulis di sini.
      setError(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  /**
   * Terbitkan kode klaim BARU untuk titipan yang belum punya akun pemilik.
   *
   * "Baru", bukan "lihat lagi": server menyimpan sidik kodenya, jadi kode yang sudah diberikan
   * memang tidak bisa dibaca ulang oleh siapa pun — termasuk oleh Hoshi. Itu sekaligus yang
   * membuat rute ini aman dipakai sebagai tegur berkala: setiap penerbitan mematikan yang
   * sebelumnya, jadi kertas lama yang beredar entah di mana berhenti berlaku.
   *
   * Tidak memakai `run()` karena jawabannya membawa sesuatu yang harus ditangkap SEKARANG dan
   * tidak ikut tersimpan di state baris: kodenya sendiri.
   *
   * `note` WAJIB (min 10 karakter) dan disimpan permanen sebagai baris audit. Itu bukan
   * formalitas: penerbitan MEMATIKAN kode yang mungkin sedang dipegang seseorang, jadi "kenapa"
   * harus selalu punya jawaban tertulis.
   */
  const issueClaimCode = async () => {
    if (!token || busy || !c || claimNote.trim().length < NOTE_MIN) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await issueAdminConsignmentClaimCode(c.id, claimNote.trim(), token);
      // Kodenya DIPISAHKAN dari baris sebelum barisnya disimpan ke state: teks kode hidup di satu
      // tempat saja (`handover`), yang sengaja dibersihkan begitu operator selesai memberikannya.
      // Menyimpannya juga di dalam `c` berarti ia ikut hidup selama halaman ini terbuka, tanpa satu
      // pun pembaca yang membutuhkannya.
      const { claimCode, ...row } = res;
      setC(row);
      setClaimNote("");
      if (claimCode) {
        setHandover({ code: claimCode, expiresAt: res.claimCodeExpiresAt ?? null });
      } else {
        setError(
          "Server tidak mengirimkan kode baru untuk titipan ini — kemungkinan besar sudah ada akun yang mengklaimnya.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menerbitkan kode klaim.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════════╗
   * ║ GANTI RUGI — SATU-SATUNYA AKSI DI LAYAR INI YANG MEMINDAHKAN UANG SUNGGUHAN.           ║
   * ╚════════════════════════════════════════════════════════════════════════════════════════╝
   *
   * TIDAK memakai `run()`, dan itu bukan selera: `run()` menampilkan satu pesan hijau untuk
   * "berhasil" dan satu pesan merah untuk "aksi gagal" — sementara aksi ini punya TIGA cara
   * ditolak yang akibatnya berbeda-beda bagi orang yang uangnya sedang dibicarakan, dan satu cara
   * berhasil yang wajib menyebut NOMINAL YANG BENAR-BENAR DIKREDITKAN (dibaca server dari struk,
   * bukan dari layar ini).
   *
   * `amountIdr` dikirim sebagai KONFIRMASI, diambil dari angka yang SEDANG DITAMPILKAN di layar
   * ini — bukan dari kotak isian (tidak ada lagi). Gunanya persis satu: kalau baris yang dimuat
   * layar sudah basi, yang terjadi adalah penolakan 400 yang menyebut KEDUA angka — bukan
   * pembayaran diam-diam sebesar angka yang tidak pernah dilihat siapa pun.
   */
  const payCompensation = async () => {
    if (!token || busy || !c || compNote.trim().length < NOTE_MIN) return;
    setBusy(true);
    setError(null);
    setOk(null);
    setCompResult(null);
    try {
      const res = await compensateAdminConsignment(
        c.id,
        { amountIdr: c.askPriceIdr, note: compNote.trim() },
        token,
      );
      const { credited, compensationIdr, ...row } = res;
      setC(row);
      /* `credited` HANYA pernah `true` di server hari ini — "sudah pernah dibayar" terbit sebagai
         409. Tapi backend LAMA menjawab 200 + `{ credited: false }` untuk pembayaran kedua, dan
         layar inilah yang dulu menampilkannya sebagai hijau sambil nol rupiah bergerak. Kalau
         jawaban seperti itu pernah muncul lagi (mis. layar ini menghadap backend yang belum
         diperbarui), ia dibaca sebagai KEGAGALAN. */
      if (credited !== true) {
        setCompResult({
          ok: false,
          title: "TIDAK DIBAYAR — server menjawab bahwa tidak ada kredit yang dibuat.",
          detail:
            "Kemungkinan besar ganti rugi untuk titipan ini sudah pernah tercatat sebelumnya. " +
            "Periksa saldo pemiliknya dan riwayat di bawah sebelum melakukan apa pun lagi — " +
            "jangan membayar ulang dari layar ini.",
        });
        return;
      }
      setCompNote("");
      setCompResult({
        ok: true,
        title: `${rp(compensationIdr)} BENAR-BENAR dikreditkan ke saldo pemilik.`,
        detail:
          "Sebesar harga jual yang disepakati di struk serah terima. Tercatat permanen di " +
          "riwayat titipan ini, dan pemiliknya bisa membacanya sendiri. Penekanan berikutnya " +
          "akan DITOLAK — ledger saldo append-only, satu ganti rugi per titipan.",
      });
    } catch (e) {
      setCompResult({
        ok: false,
        title: compensateFailureTitle(e),
        // Pesan server APA ADANYA: ia menyebut nominal yang sudah tercatat, order pembelinya, dan
        // tanggalnya — informasi yang menentukan langkah berikutnya dan tidak boleh ditulis ulang.
        detail: e instanceof Error ? e.message : "Server menolak tanpa penjelasan.",
      });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading && !c) return <p className="py-16 text-center text-[13px] text-zinc-500">Memuat…</p>;

  if (!c)
    return (
      <div className="space-y-4">
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 hover:text-zinc-300">
          ← Titipan
        </Link>
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error ?? "Titipan tidak ditemukan."}
        </p>
      </div>
    );

  const ui = statusUi(c.status);
  const inCustody = isInHoshiCustody(c);
  const certUrl = certLookupUrl(c.grader, c.certNumber);
  const release = consignmentReleaseReason(c);

  /* ── PENGEMBALIAN: APA YANG SUDAH TERCATAT, DAN APA YANG MASIH KURANG ─────────────────────
     Jawaban "sudah lengkap?" untuk data yang SUDAH TERSIMPAN datang dari server
     (`returnPlanReady` / `returnAddressComplete`). Layar ini hanya menilai apa yang SEDANG
     DIKETIK — dua pertanyaan yang berbeda, dan menggabungkannya berarti menaruh salinan ketiga
     aturan "alamat lengkap" di klien, yang cepat atau lambat akan berbeda pendapat dengan
     gerbangnya. */
  const typedPlan = returnPlanPayload();
  /** Cara pengembalian yang BERLAKU untuk pelepasan ini: yang sedang diketik, kalau ada; kalau
      tidak, yang sudah tersimpan di baris. */
  const effectiveReturnMethod: string | null = typedPlan?.returnMethod ?? c.returnMethod;
  /** Alamat pengembalian yang sudah TERSIMPAN, satu baris — null berarti memang belum ada. */
  const storedReturnAddress = returnAddressLine(c);
  /** Kartunya sudah diminta kembali, dan ia MASIH di rak kita. */
  const returnPending = c.returnPending ?? (c.withdrawRequestedAt != null && !c.custodyReleasedAt);

  /**
   * Apa yang masih kurang sebelum kartu boleh dinyatakan KELUAR sebagai pengembalian.
   * Ditampilkan, bukan disembunyikan — sama seperti `acceptBlockers`. Gerbang sebenarnya tetap
   * di server; daftar ini ada supaya operator tahu SEBELUM menekan, bukan sesudah ditolak.
   */
  const returnReleaseBlockers: string[] = [];
  if (release?.value === "WITHDRAWN") {
    if (!effectiveReturnMethod) {
      returnReleaseBlockers.push("cara pengembalian (diambil sendiri / dikirim kurir)");
    } else if (effectiveReturnMethod === "COURIER") {
      if (!typedPlan && c.returnAddressComplete !== true) {
        returnReleaseBlockers.push("alamat tujuan yang lengkap");
      }
      if (!retCourier.trim()) returnReleaseBlockers.push("nama kurir");
      if (!retTracking.trim()) returnReleaseBlockers.push("nomor resi");
    } else if (effectiveReturnMethod === "PICKUP" && !retPickedUpBy.trim()) {
      returnReleaseBlockers.push("nama orang yang mengambil");
    }
  }
  /**
   * Siapa yang MENERIMA kartunya.
   *
   * Hanya ada kalau serah terimanya sudah dicatat: kolom `receivedById` sudah terisi sejak baris
   * kesepakatan dibuat (oleh admin yang mencatat), jadi membacanya mentah-mentah akan menampilkan
   * "diterima oleh X" untuk kartu yang belum diterima siapa pun. Sumber pertama adalah baris audit
   * ACCEPT_CUSTODY — pelakunya yang sebenarnya.
   */
  const receiverLabel = c.custodyAcceptedAt
    ? (c.events?.find((e) => e.kind === "ACCEPT_CUSTODY")?.actorLabel ??
      c.receivedBy?.displayName?.trim() ??
      c.receivedBy?.walletAddress ??
      null)
    : null;
  /** Kartu MENTAH belum bisa dipajang (kolom grader listing cuma kenal PSA/TAG/CGC/BGS). */
  const rawUnlistable = c.grader == null;
  /** SUMBU KEDUA, berdiri sendiri dari custody: sudah ada akun yang akan menerima uangnya? */
  const awaitingClaim = isAwaitingClaim(c);

  /* ── APA YANG SEBENARNYA TERJADI SESUDAH "TERIMA KARTU" ───────────────────────────────────
     Dialog konfirmasinya dulu berbunyi "Sesudah ini kartu boleh dipajang" dan notifikasinya
     "Sekarang boleh dipajang." — untuk SETIAP baris, termasuk dua yang server tolak memajangnya
     dengan pasti: kartu MENTAH (kolom grader listing cuma kenal PSA/TAG/CGC/BGS) dan titipan yang
     pemiliknya belum menukarkan kode klaim (hasil penjualannya tidak punya tujuan).

     Operator membaca kalimat itu di teras rumah kolektor, berkata "sudah masuk, nanti kami
     pajangkan", lalu pamit — dan baru tahu kenyataannya di kantor. Layar ini SUDAH menghitung
     kedua keadaan itu; yang kurang hanya memakainya untuk mencabangkan kalimatnya. */
  const afterAcceptBlockers: string[] = [];
  if (rawUnlistable) {
    afterAcceptBlockers.push(
      "kartu ini belum punya grading (kolom grader pada listing hanya mengenal PSA/TAG/CGC/BGS)",
    );
  }
  if (awaitingClaim) {
    afterAcceptBlockers.push(
      "pemiliknya belum menukarkan kode klaim, jadi hasil penjualannya belum punya tujuan",
    );
  }
  /** Cara membereskannya, disebut spesifik — supaya operator tidak perlu menebak langkah berikutnya. */
  const afterAcceptFix = rawUnlistable
    ? awaitingClaim
      ? " Kalau slab-nya sebenarnya ada, betulkan lewat “Koreksi keterangan kartu” di bawah; kode klaimnya diterbitkan ulang lewat panel ungu di atas."
      : " Kalau slab-nya sebenarnya ada dan dropdown Grader cuma tertinggal kosong, betulkan lewat “Koreksi keterangan kartu” di bawah — tanpa perlu mengarang pengembalian atau kehilangan."
    : awaitingClaim
      ? " Kode klaimnya bisa diterbitkan ulang lewat panel ungu di atas, atau akunnya ditautkan langsung dari sana."
      : "";

  /* ── Layar serah-terima kode: MENGGANTI halaman, bukan modal ──────────────────────────────
     Kodenya hanya hidup di memori halaman ini. Modal yang tertutup karena jari menyenggol latar
     akan membuangnya, dan operator harus menerbitkan kode ketiga di depan pemilik kartu. */
  if (handover) {
    return (
      <div className="space-y-5 pb-10">
        <header>
          <h1 className="text-[22px] font-bold text-zinc-100">Kode klaim diterbitkan</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
            Untuk “{c.cardName}”, atas nama {c.consignorNameAtIntake}.
          </p>
        </header>
        <ClaimCodeHandover
          code={handover.code}
          cardName={c.cardName}
          ownerName={c.consignorNameAtIntake}
          ownerPhone={c.consignorPhoneAtIntake}
          place={c.receivedAtPlace}
          expiresAt={handover.expiresAt}
          reissued
          doneLabel="Kembali ke titipan ini"
          onDone={() => {
            setHandover(null);
            void load();
          }}
        />

        {/* ── STRUK LENGKAP DENGAN KODENYA ─────────────────────────────────────────────────
            Ditawarkan DI SINI karena di sinilah satu-satunya tempat kodenya masih terbaca.
            Begitu layar ini ditutup, struk yang dicetak dari halaman titipan tidak akan pernah
            memuat kode lagi — bukan karena disembunyikan, melainkan karena server memang hanya
            menyimpan sidiknya. Kalau pemiliknya butuh kertas, ini kesempatannya. */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
          <p className="text-[13px] font-semibold text-zinc-200">
            Sekalian cetak struk serah terimanya?
          </p>
          <div className="mt-3">
            <HandoverReceiptButton
              data={receiptDataFrom(c, handover.code)}
              tone="biasa"
              label="Cetak struk + kode klaim (2 lembar)"
              hint="Dua lembar identik, keduanya memuat kode di atas. Lembar pemilik dibawa pulang bersama kodenya; lembar Hoshi disimpan setelah ditandatangani."
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <header>
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 transition hover:text-zinc-300">
          ← Titipan
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-bold text-zinc-100">{c.cardName}</h1>
          <span className={`rounded-md border px-2 py-0.5 text-[12px] font-semibold ${ui.cls}`}>
            {ui.label}
          </span>
          {c.gradeLabel && (
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[12px] text-zinc-300">
              {c.gradeLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-zinc-500">
          Milik <strong className="text-zinc-300">{c.consignorNameAtIntake}</strong> · komisi{" "}
          {commissionPct(c.commissionBps)}% · harga {rp(c.askPriceIdr)}
        </p>
      </header>

      {/* ── Keadaan custody: satu kalimat, paling atas, tanpa jargon ── */}
      <div
        className={`rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed ${
          inCustody
            ? "border-sky-400/25 bg-sky-400/[0.07] text-sky-100"
            : c.status === "INTAKE"
              ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100"
              : "border-white/10 bg-white/[0.03] text-zinc-300"
        }`}
      >
        {c.status === "INTAKE" && (
          <>
            <strong>Kartu belum diterima.</strong> Selama serah terimanya belum dicatat, kartu ini
            tidak bisa dipajang oleh siapa pun — dan memang begitu seharusnya: kartu yang masih di
            tangan pemiliknya masih bisa ia jual sendiri ke orang lain.
          </>
        )}
        {inCustody && (
          <>
            <strong>Kartu ada di Hoshi</strong> sejak {dt(c.custodyAcceptedAt)}
            {c.storageLocation ? ` · ${c.storageLocation}` : ""}. Diterima oleh{" "}
            {receiverLabel ?? "—"}
            {c.receivedAtPlace ? ` di ${c.receivedAtPlace}` : ""}.
          </>
        )}
        {c.status === "SOLD" && (
          <>
            <strong>Sudah terjual.</strong> Kartunya{" "}
            {c.custodyReleasedAt ? "sudah keluar dari penyimpanan" : "masih di rak"} — pemiliknya
            sudah dibayar {rp(c.payoutIdrx)} (komisi Hoshi {rp(c.commissionIdrx)}).
          </>
        )}
        {c.status === "RELEASED" && (
          <>
            <strong>Kartu sudah keluar dari Hoshi</strong> pada {dt(c.custodyReleasedAt)}
            {c.releaseReason ? ` (${c.releaseReason})` : ""}.
          </>
        )}
        {c.status === "LOST" && (
          <>
            <strong>Kartu tercatat hilang / rusak</strong> pada {dt(c.custodyReleasedAt)}. Ia tidak
            bisa dijual, dikirim, atau dipajang lagi oleh apa pun.
          </>
        )}
        {c.status === "CANCELLED" && (
          <>
            <strong>Kesepakatan dibatalkan</strong> sebelum serah terima. Tidak ada kartu yang
            pernah berpindah.
          </>
        )}
      </div>

      {/* ── SUMBU KEDUA: SIAPA PEMILIK AKUNNYA ──────────────────────────────────────────────
          Panel TERPISAH dari panel custody di atasnya, dan itu disengaja. Keduanya menjawab
          pertanyaan yang berbeda ("kartunya di mana" vs "uangnya nanti ke siapa"), keduanya bisa
          benar sekaligus, dan menggabungkannya jadi satu kalimat akan membuat salah satu dari dua
          kenyataan itu hilang dari layar. Warnanya pun sengaja lain dari biru custody. */}
      {awaitingClaim && (
        <div className="rounded-2xl border border-violet-400/30 bg-violet-400/[0.08] px-4 py-3.5 text-[13px] leading-relaxed text-violet-100">
          <strong>Belum ada akun yang mengklaim kartu ini.</strong> Pemiliknya —{" "}
          {c.consignorNameAtIntake} ({c.consignorPhoneAtIntake}) — belum memakai kode klaimnya.
          {c.custodyAcceptedAt && !c.custodyReleasedAt
            ? " Kartunya sendiri sudah ada di rak Hoshi; yang belum ada adalah akun tujuan hasil penjualannya."
            : ""}{" "}
          Selama itu belum terjadi, kartu ini belum bisa dipajang — bukan karena custody, melainkan
          karena tidak ada siapa pun yang bisa dibayar kalau ia terjual.
          <div className="mt-3">
            {/* Alasannya diminta SEBELUM kodenya terbit, bukan sesudah. Penerbitan mematikan kode
                yang mungkin sedang dipegang seseorang; "kenapa" harus sudah tertulis pada saat itu
                terjadi, bukan diingat-ingat nanti. */}
            <textarea
              value={claimNote}
              onChange={(e) => setClaimNote(e.target.value)}
              rows={2}
              placeholder="Kenapa kodenya diterbitkan sekarang — mis. “tanda terima hilang, dikonfirmasi lewat telepon ke nomor saat serah terima”."
              className={`${INPUT} resize-y leading-relaxed`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void issueClaimCode()}
                disabled={busy || claimNote.trim().length < NOTE_MIN}
                className="rounded-xl border border-violet-300/40 bg-violet-400/10 px-4 py-2 text-[13px] font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:opacity-50"
              >
                {busy ? "Memproses…" : "Terbitkan kode klaim baru"}
              </button>
              <p className="text-[11.5px] leading-relaxed text-violet-200/70">
                Kode lama langsung berhenti berlaku, dan alasan di atas tersimpan permanen. Pakai
                ini kalau pemiliknya kehilangan kodenya, kodenya kedaluwarsa, atau ia perlu ditegur
                lagi.
              </p>
            </div>
          </div>

          {/* ── JALAN KEDUA: tautkan akunnya langsung ──────────────────────────────────────
              Untuk keadaan yang benar-benar terjadi: pemiliknya akhirnya membuat akun, tapi
              kertas kodenya sudah hilang — atau ia datang ke kantor membawa tanda terima
              bertanda tangannya. Tanpa jalan ini, satu-satunya pilihan operator adalah terus
              menerbitkan kode untuk orang yang sudah ada di depannya.

              Yang membuatnya bukan pintu belakang adalah `note`-nya: ia menjawab "DARI MANA KAMU
              TAHU INI ORANGNYA", disimpan permanen, dan itulah satu-satunya hal yang tersisa
              kalau penautan ini dipersoalkan berbulan-bulan kemudian. */}
          <div className="mt-4 border-t border-violet-300/20 pt-4">
            {!linkOpen ? (
              <button
                type="button"
                onClick={() => setLinkOpen(true)}
                className="text-[12.5px] font-semibold text-violet-200 underline-offset-2 hover:underline"
              >
                Pemiliknya sudah punya akun dan ada di depanmu? Tautkan langsung →
              </button>
            ) : (
              <div>
                <p className="text-[12.5px] font-semibold text-violet-100">
                  Tautkan akun pemilik ke titipan ini
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-violet-200/75">
                  Lakukan ini HANYA kalau kamu sudah memastikan orangnya — cocokkan alamat
                  wallet di layarnya, atau tanda terima bertanda tangan yang ia bawa. Sesudah
                  tertaut, hasil penjualan kartu ini masuk ke akun tersebut.
                </p>

                <div className="mt-3">
                  {linkPick ? (
                    <PickedConsignor
                      user={linkPick}
                      onClear={() => setLinkPick(null)}
                      lead="Kartu ini akan tertaut ke akun"
                    />
                  ) : (
                    <ConsignorPicker token={token} onPick={setLinkPick} autoFocus />
                  )}
                </div>

                <textarea
                  value={linkNote}
                  onChange={(e) => setLinkNote(e.target.value)}
                  rows={2}
                  placeholder="Bagaimana identitasnya kamu pastikan — mis. “pemilik datang ke kantor membawa tanda terima bertanda tangan; wallet dicocokkan di layarnya”."
                  className={`${INPUT} mt-3 resize-y leading-relaxed`}
                />

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        const row = await linkAdminConsignor(
                          c.id,
                          { consignorId: linkPick!.id, note: linkNote.trim() },
                          token ?? "",
                        );
                        setLinkOpen(false);
                        setLinkPick(null);
                        setLinkNote("");
                        return row;
                      }, "Akun pemilik tertaut. Kartu ini sekarang punya tujuan pembayaran.")
                    }
                    disabled={busy || !linkPick || linkNote.trim().length < NOTE_MIN}
                    className="rounded-xl border border-violet-300/40 bg-violet-400/10 px-4 py-2 text-[13px] font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:opacity-50"
                  >
                    {busy ? "Memproses…" : "Tautkan akun ini"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkOpen(false);
                      setLinkPick(null);
                      setLinkNote("");
                    }}
                    className="px-2 py-2 text-[12.5px] text-violet-200/70 transition hover:text-violet-100"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PENGEMBALIAN YANG SEDANG BERJALAN ────────────────────────────────────────────────
          Kalimat pertamanya menyebut fakta yang paling mudah hilang dari kepala orang:
          kartunya MASIH DI RAK KITA. "Ditarik" bukan "sudah pulang" — selama ia ada di sini, ia
          masih tanggung jawab Hoshi, masih bisa hilang, dan masih harus terhitung di stok opname. */}
      {returnPending && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3.5 text-[13px] leading-relaxed text-amber-100">
          <strong>Pemilik minta kartunya kembali</strong> ({dt(c.withdrawRequestedAt)}) — dan
          kartunya <strong>masih di rak Hoshi</strong> sampai serah terimanya dicatat.
          {c.returnMethod == null ? (
            <>
              {" "}
              Ke mana kartunya dikembalikan <strong>belum ditentukan</strong>: tanyakan ke
              pemiliknya — diambil sendiri, atau dikirim kurir? Catat di bagian “Kartu keluar dari
              Hoshi” di bawah.
            </>
          ) : c.returnPlanReady === false ? (
            <>
              {" "}
              Alamat pengembaliannya <strong>belum lengkap</strong>, jadi kartu ini belum bisa
              ditandai terkirim. Lengkapi dulu di bawah.
            </>
          ) : (
            <>
              {" "}
              Tujuannya sudah tercatat: <strong>{returnMethodLabel(c.returnMethod)}</strong>
              {storedReturnAddress ? ` — ${storedReturnAddress}` : ""}
              {c.returnShippingFeeIdr != null
                ? `. Ongkir balik ${rp(c.returnShippingFeeIdr)}${
                    c.returnShippingPayer ? ` (${returnPayerLabel(c.returnShippingPayer)})` : ""
                  }`
                : ""}
              .
            </>
          )}{" "}
          Permintaan kembali tidak dipungut biaya apa pun dari pemiliknya.
        </div>
      )}

      {/* Sudah pulang: resi/penerimanya ditampilkan supaya pertanyaan "benar sampai?" punya
          jawaban yang bisa diperiksa pemiliknya sendiri, bukan sekadar "kata Hoshi". */}
      {c.custodyReleasedAt && c.releaseReason === "WITHDRAWN" && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-[13px] leading-relaxed text-zinc-300">
          <strong>Kartu sudah dikembalikan ke pemiliknya</strong> pada {dt(c.custodyReleasedAt)} —{" "}
          {returnMethodLabel(c.returnMethod) ?? "cara pengembalian tidak tercatat"}.
          {c.returnTrackingNo && (
            <>
              {" "}
              Resi <strong className="text-zinc-100">{c.returnTrackingNo}</strong>
              {c.returnCourier ? ` (${c.returnCourier})` : ""}.
            </>
          )}
          {c.returnPickedUpBy && <> Diambil oleh {c.returnPickedUpBy}.</>}
          {storedReturnAddress && <> Tujuan: {storedReturnAddress}.</>}
          {c.returnShippingFeeIdr != null && (
            <>
              {" "}
              Ongkir balik {rp(c.returnShippingFeeIdr)}
              {c.returnShippingPayer ? ` — ${returnPayerLabel(c.returnShippingPayer)}` : ""}.
            </>
          )}
        </div>
      )}

      {ok && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
          {ok}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {/* ── STRUK SERAH TERIMA ─────────────────────────────────────────────────────────────
          Diletakkan SEBELUM kartu "Bukti", karena itu urutan yang benar di lapangan: cetak →
          tanda tangani di depan pemiliknya → baru difoto sebagai bukti "Struk serah terima".
          Layar yang menaruh tombol cetaknya sesudah kamera akan membuat operator memotret
          sesuatu yang belum ada.

          TETAP ADA sesudah custody diterima, dan itu disengaja: pemilik yang kehilangan
          lembarnya berhak minta salinan, dan struk yang dicetak ulang memakai TANGGAL SERAH
          TERIMA yang asli (`custodyAcceptedAt`), bukan tanggal cetaknya — kalau tidak, kertas
          yang sama akan berbunyi dua hal yang berbeda. */}
      <Card
        title="Struk serah terima"
        sub="Dua lembar identik: satu untuk pemilik kartu, satu untuk Hoshi. Ditandatangani kedua pihak di tempat. Inilah satu-satunya bukti yang isinya tidak bisa Hoshi ubah sendiri — salinan pemiliknya ada di tangan dia."
      >
        <HandoverReceiptButton
          data={receiptDataFrom(c)}
          tone={c.custodyAcceptedAt ? "biasa" : "utama"}
          label={
            c.custodyAcceptedAt
              ? "Cetak ulang struk (2 lembar)"
              : "Cetak struk serah terima (2 lembar)"
          }
          hint={
            c.custodyAcceptedAt
              ? `Salinan dengan tanggal serah terima aslinya (${dt(c.custodyAcceptedAt)}). Kode klaim tidak ikut tercetak — ia hanya bisa ditampilkan sekali, saat diterbitkan.`
              : "Setelah ditandatangani kedua pihak, foto lembarnya sebagai bukti “Struk serah terima” di bawah. Tanpa foto itu, kartu ini belum bisa dinyatakan diterima."
          }
        />
      </Card>

      {/* ── BUKTI ── */}
      <Card
        title="Bukti"
        sub="Diambil di tempat, di depan pemiliknya. Foto tidak bisa dihapus setelah tersimpan — itu yang membuatnya berlaku sebagai bukti untuk kedua pihak."
      >
        <ConsignmentPhotos
          consignmentId={c.id}
          photos={photos}
          token={token ?? ""}
          required={c.custodyAcceptedAt ? [] : requiredKinds}
          onUpdated={setC}
        />
      </Card>

      {/* ── TERIMA KARTU (hanya sebelum custody ada) ── */}
      {can("ACCEPT") && (
        <Card
          title="Terima kartu"
          sub="Tekan hanya kalau kartunya benar-benar sudah ada di tanganmu. Tanggal terima ditulis sekali dan tidak bisa dibatalkan."
        >
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="text-[12px] text-zinc-500">Catatan kondisi (dari pencatatan awal)</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{c.conditionNote}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Tidak bisa diedit di sini. Kalau ada yang perlu diluruskan, tulis koreksi di bawah —
              koreksi disimpan sebagai catatan baru, jadi terlihat sebagai koreksi.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Lokasi penyimpanan
              </span>
              <input
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="mis. Rak A-3, Jakarta"
                className={INPUT}
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Kartu orang lain yang tidak tercatat ada di rak mana adalah kartu yang belum
                benar-benar kita pegang.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Nomor / arsip tanda terima
              </span>
              <input
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="opsional"
                className={INPUT}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Catatan serah terima
              </span>
              <input
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                placeholder="opsional — mis. “diserahkan langsung oleh pemilik, disaksikan kakaknya”"
                className={INPUT}
              />
            </label>
          </div>

          {/* DIKATAKAN SEBELUM TOMBOLNYA DITEKAN, bukan cuma di dialog konfirmasi: inilah kalimat
              yang menentukan apa yang operator janjikan ke pemilik kartu sambil berpamitan. */}
          {afterAcceptBlockers.length > 0 && (
            <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-100">
              Menerima kartu ini <strong>tidak</strong> membuatnya bisa dipajang:{" "}
              {afterAcceptBlockers.join(" dan ")}. Custody-nya tetap tercatat dan kartunya tetap
              bisa ditarik kembali kapan saja — tapi jangan menjanjikan “nanti kami pajangkan”
              sebelum itu beres.{afterAcceptFix}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirm({ kind: "ACCEPT" })}
              disabled={busy || acceptBlockers.length > 0}
              className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
            >
              Terima kartu
            </button>
            <p className="text-[12px] text-zinc-500">
              {acceptBlockers.length === 0
                ? "Bukti lengkap."
                : `Belum bisa: ${acceptBlockers.join(", ")}.`}
            </p>
          </div>
        </Card>
      )}

      {/* ── PAJANG ── */}
      {can("LIST") && (
        <Card
          title="Pajang di marketplace"
          sub="Baru mungkin karena kartunya sudah ada di Hoshi. Listing-nya terikat ke titipan ini, jadi tidak bisa ada listing tanpa kartunya."
        >
          {/* Dua penghalang yang BERBEDA, dan keduanya ditampilkan kalau keduanya berlaku — bukan
              yang satu menutupi yang lain. Operator yang memperbaiki satu hal lalu menemukan
              penghalang berikutnya muncul dari balik layar akan mengira layar ini mengulur. */}
          {awaitingClaim && (
            <p className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-4 py-3 text-[13px] leading-relaxed text-violet-100">
              Kartu ini belum diklaim pemiliknya, jadi belum ada akun yang akan menerima hasil
              penjualannya — memajangnya sekarang berarti menawarkan kartu yang uangnya tidak punya
              tujuan. Kirim ulang kode klaimnya lewat panel di atas, lalu pajang setelah ia
              mengklaimnya. Custody-nya sendiri tidak terpengaruh: kartunya tetap tercatat ada di
              Hoshi dan tetap bisa ditarik kembali kapan saja.
            </p>
          )}
          {rawUnlistable && (
            <p
              className={`rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-100 ${
                awaitingClaim ? "mt-3" : ""
              }`}
            >
              Kartu ini tidak punya grading, dan kartu tanpa grading belum bisa dipajang di fase
              ini: kolom grader pada listing hanya mengenal PSA/TAG/CGC/BGS, dan mengisinya berarti
              memberi label palsu pada kartu orang lain. Titipannya tetap tercatat dan tetap bisa
              ditarik kembali kapan saja.
            </p>
          )}
          {!awaitingClaim && !rawUnlistable && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    Harga (Rp)
                  </span>
                  <input
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className={INPUT}
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    Pemilik menerima ± {rp(estimatedPayout(Number(listPrice) || 0, c.commissionBps))}{" "}
                    setelah komisi {commissionPct(c.commissionBps)}%.
                    {c.reservePriceIdr != null && c.reservePriceIdr > 0 && (
                      <>
                        {" "}
                        Harga terendah yang disepakati: {rp(c.reservePriceIdr)}.
                      </>
                    )}
                  </span>
                  {/* Lantai harga dipasang DI SINI, di detik harga pajang pertama ditentukan —
                      bukan hanya di layar ubah harga. Melanggarnya untuk pertama kali sama
                      mudahnya pada saat memajang seperti pada saat menurunkan. */}
                  {reserveWarning(Number(listPrice) || 0, c.reservePriceIdr) && (
                    <span className="mt-1.5 block rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11.5px] leading-relaxed text-amber-100">
                      {reserveWarning(Number(listPrice) || 0, c.reservePriceIdr)}
                    </span>
                  )}
                </label>
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    Gambar listing
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setListImage(p.url)}
                        className={`overflow-hidden rounded-lg border-2 transition ${
                          listImage === p.url
                            ? "border-yellow-400"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="h-16 w-12 object-cover" />
                      </button>
                    ))}
                  </div>
                  {photos.length === 0 && (
                    <p className="text-[12px] text-zinc-500">Belum ada foto untuk dipakai.</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void run(
                    () =>
                      listAdminConsignment(
                        c.id,
                        {
                          image: listImage,
                          ...(listPrice ? { priceIdrx: Number(listPrice) } : {}),
                        },
                        token ?? "",
                      ),
                    "Kartu dipajang.",
                  )
                }
                disabled={busy || !listImage || !listPrice}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
              >
                {busy ? "Memproses…" : "Pajang sekarang"}
              </button>
            </>
          )}
        </Card>
      )}

      {/* ── LISTING & HARGA ── */}
      {(c.listing || can("PRICE")) && (
        <Card
          title="Harga & listing"
          sub="Harga di perjanjian dan harga di marketplace ditulis dalam satu transaksi, jadi keduanya tidak bisa berbeda."
        >
          {c.listing ? (
            <>
              <Row
                label="Listing"
                value={
                  <Link
                    href={`/marketplace/${c.listing.id}`}
                    className="text-yellow-300 hover:underline"
                  >
                    {c.listing.id}
                  </Link>
                }
              />
              <Row label="Status listing" value={c.listing.status} />
              <Row label="Harga listing" value={rp(c.listing.priceIdrx)} />
              <Row label="Dipajang" value={dt(c.listing.listedAt)} />
              {c.listing.soldAt && <Row label="Terjual" value={dt(c.listing.soldAt)} />}
            </>
          ) : (
            <Row label="Harga yang disepakati" value={rp(c.askPriceIdr)} />
          )}

          {/* Lantai harga yang disepakati di depan pemiliknya. Ditampilkan sebagai FAKTA di kartu
              harga — bukan hanya sebagai peringatan yang muncul saat sudah dilanggar — supaya
              operator membacanya sebelum mengetik angka, bukan sesudah. */}
          {c.reservePriceIdr != null && c.reservePriceIdr > 0 && (
            <Row
              label="Harga terendah yang disepakati"
              value={<span className="text-amber-200">{rp(c.reservePriceIdr)}</span>}
            />
          )}

          {/* Keadaan SEKARANG, dijawab server (`belowReserve` di `custodyFlags`) dan bukan
              dihitung ulang di sini: server membaca harga listing yang benar-benar tayang, yaitu
              angka yang dilihat pembeli. Ini bukan peringatan tentang sesuatu yang akan terjadi —
              ini pemberitahuan bahwa kartu orang SEDANG dipajang di bawah lantai yang dijanjikan
              kepadanya. */}
          {c.belowReserve && (
            <p className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-100">
              Harga yang berlaku sekarang{" "}
              {c.effectivePriceIdr != null ? `(${rp(c.effectivePriceIdr)}) ` : ""}ada DI BAWAH
              harga terendah yang disepakati dengan pemiliknya
              {c.reservePriceIdr != null ? ` (${rp(c.reservePriceIdr)})` : ""}. Pastikan dia memang
              menyetujuinya — kalau belum, naikkan lagi atau hubungi dia hari ini.
            </p>
          )}

          {can("PRICE") && (
            <div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                  Harga baru (Rp)
                </span>
                <input
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className={INPUT}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                  Alasan perubahan
                </span>
                <input
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="mis. “pemilik setuju turun harga lewat WA, 19 Sep”"
                  className={INPUT}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  void run(
                    () =>
                      setAdminConsignmentPrice(
                        c.id,
                        { askPriceIdr: Number(newPrice), note: priceNote.trim() },
                        token ?? "",
                      ),
                    "Harga diperbarui.",
                  )
                }
                disabled={busy || !newPrice || priceNote.trim().length < NOTE_MIN}
                className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Simpan harga
              </button>
              {reserveWarning(Number(newPrice) || 0, c.reservePriceIdr) && (
                <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[12.5px] leading-relaxed text-amber-100 sm:col-span-3">
                  {reserveWarning(Number(newPrice) || 0, c.reservePriceIdr)}
                </p>
              )}
              <p className="text-[11px] text-zinc-500 sm:col-span-3">
                Harga adalah bagian dari perjanjian yang ditandatangani pemilik kartu — beri tahu
                dia sebelum mengubahnya. Alasannya disimpan permanen.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ── FAKTA ── */}
      <Card title="Catatan serah terima">
        {/* Baris ini tidak boleh berbunyi "—" untuk kartu yang belum diklaim: tanda hubung
            terbaca seperti data yang lupa diisi, padahal ini keadaan yang punya nama, punya
            sebab, dan punya jalan keluarnya sendiri. */}
        <Row
          label="Pemilik (akun)"
          value={
            c.consignorId ? (
              `${c.consignor?.displayName ?? "—"} · ${c.consignor?.walletAddress ?? c.consignorId}`
            ) : (
              <span className="text-violet-200">
                Belum diklaim — kartu ini belum tersambung ke akun Hoshi mana pun
                {c.claimCodeExpiresAt
                  ? `. Kode klaim berlaku sampai ${dt(c.claimCodeExpiresAt)}`
                  : ""}
              </span>
            )
          }
        />
        <Row label="Nama di tanda terima" value={c.consignorNameAtIntake} />
        <Row label="HP" value={c.consignorPhoneAtIntake} />
        <Row
          label="Identitas"
          value={c.consignorIdKind ? `${c.consignorIdKind} ··· ${c.consignorIdLast4 ?? "????"}` : "—"}
        />
        <Row label="Diterima oleh" value={receiverLabel ?? "—"} />
        <Row label="Tempat serah terima" value={c.receivedAtPlace} />
        <Row label="Set / nomor" value={[c.cardSet, c.cardNumber].filter(Boolean).join(" · ") || "—"} />
        <Row
          label="Sertifikat"
          value={
            c.certNumber ? (
              certUrl ? (
                <a
                  href={certUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-yellow-300 hover:underline"
                >
                  {c.grader} {c.certNumber} ↗
                </a>
              ) : (
                `${c.grader ?? ""} ${c.certNumber}`
              )
            ) : (
              "— (kartu mentah)"
            )
          }
        />
        <Row label="Kondisi saat diterima" value={c.conditionNote} />
        {c.rawCondition && <Row label="Kondisi (kode)" value={c.rawCondition} />}
        <Row label="Penyimpanan" value={c.storageLocation ?? "—"} />
        <Row label="Tanda terima" value={c.intakeReceiptRef ?? "—"} />
        <Row label="Perjanjian" value={c.agreementRef ?? "—"} />
        <Row label="Dicatat" value={dt(c.createdAt)} />
        <Row label="Diterima" value={dt(c.custodyAcceptedAt)} />
        {/* KAPAN dan LEWAT MANA pemiliknya tertaut. Ditampilkan hanya kalau memang sudah terjadi:
            baris "—" di sini akan terbaca seolah ada langkah yang terlewat, padahal titipan yang
            sejak awal dicatat atas sebuah akun tidak pernah melewati penukaran kode.

            "Lewat mana" ikut ditampilkan karena itulah yang menjawab "dari mana kalian tahu ini
            orangnya" berbulan-bulan kemudian — dan jawabannya berbeda untuk tiap cara. */}
        {c.consignorLinkedAt && (
          <Row
            label="Pemilik tertaut"
            value={`${dt(c.consignorLinkedAt)}${
              consignorLinkMethodLabel(c.consignorLinkMethod)
                ? ` · ${consignorLinkMethodLabel(c.consignorLinkMethod)}`
                : ""
            }`}
          />
        )}
        <Row label="Keluar" value={dt(c.custodyReleasedAt)} />
        {c.soldOrderId && <Row label="Order penjualan" value={c.soldOrderId} />}
        {c.payoutIdrx != null && <Row label="Dibayar ke pemilik" value={rp(c.payoutIdrx)} />}
        {c.commissionIdrx != null && <Row label="Komisi Hoshi" value={rp(c.commissionIdrx)} />}

        {can("CORRECTION") && (
          <div className="mt-4 border-t border-white/[0.05] pt-4">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
              Tulis koreksi
            </span>
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={2}
              placeholder="Apa yang keliru dan apa yang benar. Catatan lama tetap tersimpan apa adanya."
              className={`${INPUT} resize-y leading-relaxed`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const row = await addAdminConsignmentCorrection(
                      c.id,
                      correction.trim(),
                      token ?? "",
                    );
                    setCorrection("");
                    return row;
                  }, "Koreksi tercatat.")
                }
                disabled={busy || correction.trim().length < NOTE_MIN}
                className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Simpan koreksi
              </button>
              <p className="text-[11px] text-zinc-500">
                Tidak menimpa apa pun — ditulis sebagai catatan baru di riwayat. Untuk keterangan
                kartu yang salah ketik (nama, set, nomor, sertifikat, grader), pakai panel di
                bawah: yang itu memang membetulkan kolomnya.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── KOREKSI KETERANGAN KARTU ───────────────────────────────────────────────────────
          Panel TERPISAH dari "Tulis koreksi" di atasnya, dan pemisahan itu adalah isinya:
          `addCorrection` sengaja TIDAK menimpa apa pun (koreksi naratif atas BUKTI), sedangkan
          panel ini satu-satunya yang MENIMPA kolom identitas kartu — dan judul publiknya.

          Diletakkan tepat SESUDAH kartu "Catatan serah terima" karena di sanalah operator baru
          saja membaca nilai yang salah. Rutenya sendiri boleh dipakai di status apa pun (nama
          kartu yang salah tetap salah sesudah kartunya pindah tangan), jadi panel ini tidak
          disembunyikan oleh status — yang membatasi tetap gerbang di server, dicerminkan di dalam
          panelnya sebagai penghalang yang terbaca SEBELUM tombolnya ditekan. */}
      {can("CORRECTION") && (
        <Card
          title="Koreksi keterangan kartu"
          sub="Untuk yang memang SALAH, bukan untuk yang berubah pikiran: nama, set, nomor, sertifikat, grader, grade. Kolomnya ditimpa dan judul publiknya ikut diperbaiki — nilai lamanya pindah ke jejak audit yang pemilik kartu bisa baca sendiri. Catatan kondisi dan foto tidak bisa ditimpa dari sini."
        >
          <LabelCorrectionPanel
            /* Disemai ulang setiap kali barisnya dibaca ulang dari server — bukan setiap kali
               `c` berubah: penyimpanan yang berhasil sudah menyemai formulirnya sendiri dari
               respons, dan remount di situ akan menghapus pesan berhasilnya. */
            key={rowEpoch}
            c={c}
            token={token ?? ""}
            onUpdated={setC}
            onReload={() => void load()}
          />
        </Card>
      )}

      {/* ── RIWAYAT ── */}
      {c.events && c.events.length > 0 && (
        <Card
          title="Riwayat"
          sub="Siapa melakukan apa, dan kapan. Tidak ada baris yang bisa diubah atau dihapus."
        >
          <ol className="space-y-3">
            {[...c.events].reverse().map((e) => (
              <li key={e.id} className="border-l-2 border-white/10 pl-3">
                <p className="text-[13px] font-semibold text-zinc-200">
                  {eventTitle(e.kind)}
                  {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
                    <span className="ml-2 text-[11px] font-normal text-zinc-500">
                      {e.fromStatus} → {e.toStatus}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {dt(e.createdAt)}
                  {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                </p>
                {e.note && <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{e.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ── JALAN KELUAR ── */}
      {(can("RETURN") || can("RELEASE") || can("LOST") || can("COMPENSATE")) && (
        <Card
          title="Kartu keluar dari Hoshi"
          sub="Semua yang di bawah ini mencatat FAKTA baru. Tidak ada yang menghapus catatan bahwa kartunya pernah diterima."
        >
          <div className="space-y-5">
            {can("RETURN") && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="text-[13px] font-semibold text-zinc-200">
                  {c.status === "INTAKE"
                    ? "Pemilik batal menitipkan"
                    : "Pemilik minta kartunya kembali"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  {c.status === "INTAKE"
                    ? "Kesepakatan dibatalkan. Tidak ada kartu yang pernah berpindah, jadi tidak ada yang perlu diserahkan."
                    : "Menurunkan listing-nya (kalau sedang dipajang) dan mengembalikan kartu ke keadaan “di Hoshi, tidak dijual”. Gratis. Kalau kartunya kebetulan terjual pada detik yang sama, server menolak permintaan ini — penjualannya yang menang, dan hasilnya masuk ke saldo pemilik."}
                </p>
                <input
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="Catatan (opsional) — mis. “diminta langsung saat kunjungan”"
                  className={`${INPUT} mt-3`}
                />

                {/* ── KE MANA KARTUNYA PULANG ─────────────────────────────────────────────────
                    TIDAK ditampilkan untuk baris INTAKE: di sana kartunya tidak pernah berpindah
                    tangan, jadi tidak ada yang perlu dikembalikan — dan server memang menolak
                    alamat untuk baris seperti itu, alih-alih menyimpannya diam-diam. */}
                {c.status !== "INTAKE" && (
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                    <p className="text-[12.5px] font-semibold text-zinc-200">
                      Ke mana kartunya dikembalikan?
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                      Tanyakan <strong>sekarang</strong>, selagi pemiliknya masih bicara dengan
                      Anda. Nanti berarti menelepon lagi — dan begitulah kartu berakhir tercatat
                      “ditarik” berminggu-minggu tanpa pernah dikirim ke mana pun. Boleh dilewati
                      sekarang dan dilengkapi nanti lewat tombol yang sama, tapi kartunya tidak
                      akan bisa ditandai keluar sebelum ini terisi.
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["COURIER", "PICKUP"] as ConsignmentReturnMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRetMethod(m)}
                          className={`rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition ${
                            retMethod === m
                              ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-100"
                              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {m === "COURIER" ? "Dikirim kurir" : "Diambil sendiri"}
                        </button>
                      ))}
                    </div>

                    {retMethod === "COURIER" ? (
                      <>
                        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                          <input
                            value={retName}
                            onChange={(e) => setRetName(e.target.value)}
                            placeholder="Nama penerima"
                            className={INPUT}
                          />
                          <input
                            value={retPhone}
                            onChange={(e) => setRetPhone(e.target.value)}
                            placeholder="Nomor telepon penerima"
                            className={INPUT}
                          />
                          <input
                            value={retStreet}
                            onChange={(e) => setRetStreet(e.target.value)}
                            placeholder="Alamat jalan lengkap"
                            className={`${INPUT} sm:col-span-2`}
                          />
                          <input
                            value={retApt}
                            onChange={(e) => setRetApt(e.target.value)}
                            placeholder="Unit / blok / patokan (opsional)"
                            className={`${INPUT} sm:col-span-2`}
                          />
                          <input
                            value={retCity}
                            onChange={(e) => setRetCity(e.target.value)}
                            placeholder="Kota / kabupaten"
                            className={INPUT}
                          />
                          <input
                            value={retState}
                            onChange={(e) => setRetState(e.target.value)}
                            placeholder="Provinsi"
                            className={INPUT}
                          />
                          <input
                            value={retZip}
                            onChange={(e) => setRetZip(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                            placeholder="Kode pos"
                            className={INPUT}
                          />
                        </div>
                        <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-600">
                          Provinsi menentukan tarif ongkir balik — tarif yang sama yang dipakai
                          pengiriman kartu biasa. Provinsi yang tidak dikenali jatuh ke tarif
                          penampung yang lebih mahal, tidak pernah gratis.
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 rounded-lg bg-black/25 px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
                        Diambil sendiri tidak butuh alamat. Yang dicatat nanti, saat kartunya
                        benar-benar diserahkan, adalah <strong>siapa</strong> yang datang
                        mengambil — dan itu ditanyakan di panel “Kartu fisik sudah keluar”.
                      </p>
                    )}

                    {/* ── SIAPA YANG MENANGGUNG ONGKIR BALIK ──────────────────────────────────
                        DICATAT, BUKAN DITAGIHKAN. Tidak ada tagihan yang terbit dari sini dan
                        tidak ada saldo yang dipotong: menarik kartu tetap gratis bagi pemiliknya.
                        Yang ditutup kolom ini adalah kebocoran diam-diam — ongkos yang ditanggung
                        Hoshi yang tidak pernah muncul di laporan mana pun. */}
                    <div className="mt-4 border-t border-white/[0.06] pt-3.5">
                      <p className="text-[12.5px] font-semibold text-zinc-200">
                        Siapa yang menanggung ongkir baliknya?
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["OWNER", "HOSHI"] as ConsignmentReturnPayer[]).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setRetPayer(retPayer === p ? "" : p)}
                            className={`rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition ${
                              retPayer === p
                                ? "border-sky-400/40 bg-sky-400/10 text-sky-100"
                                : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            {p === "OWNER" ? "Pemilik kartu" : "Hoshi"}
                          </button>
                        ))}
                        <input
                          value={retFee}
                          onChange={(e) => setRetFee(e.target.value.replace(/[^\d]/g, ""))}
                          inputMode="numeric"
                          placeholder="Ongkir (Rp) — kosongkan untuk ditaksir"
                          className={`${INPUT} sm:max-w-[16rem]`}
                        />
                      </div>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-600">
                        Ini <strong>catatan</strong>, bukan tagihan: tidak ada uang yang berpindah
                        dari sini, dan pemilik kartu tidak ditagih apa pun. Dicatat supaya ongkos
                        yang ditanggung Hoshi punya angka yang bisa dibaca di laporan — kalau
                        dikosongkan, server menaksirnya dari tarif wilayah, dan taksirannya boleh
                        Anda timpa dengan angka di struk kurir.
                      </p>
                    </div>

                    {retMethod === "COURIER" && !typedPlan && (
                      <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[12px] leading-relaxed text-amber-100">
                        Alamatnya belum lengkap, jadi <strong>alamat tidak akan ikut tersimpan</strong>{" "}
                        — permintaan kembalinya tetap dicatat (dan itu yang penting sekarang).
                        Lengkapi nanti lewat tombol yang sama; kartunya tidak bisa ditandai terkirim
                        sebelum itu.
                      </p>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "RETURN" })}
                  disabled={busy}
                  className="mt-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {c.status === "INTAKE"
                    ? "Batalkan kesepakatan"
                    : c.withdrawRequestedAt
                      ? "Perbarui tujuan pengembalian"
                      : "Catat permintaan kembali"}
                </button>
              </div>
            )}

            {can("RELEASE") && release && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="text-[13px] font-semibold text-zinc-200">Kartu fisik sudah keluar</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  Dicatat saat kartunya benar-benar berpindah tangan. Untuk kartu yang sudah
                  terjual, pengirimannya biasanya sudah tercatat otomatis dari layar “Kirim Kartu” —
                  pakai ini kalau serah terimanya dilakukan langsung.
                </p>
                <p className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-[12px] text-zinc-300">
                  Yang akan dicatat: <strong>{release.label}</strong>
                  {release.value === "WITHDRAWN" && effectiveReturnMethod && (
                    <> · {returnMethodLabel(effectiveReturnMethod)}</>
                  )}
                </p>

                {/* ── BUKTI SERAH TERIMA PENGEMBALIAN ─────────────────────────────────────────
                    Hanya untuk pengembalian ke PEMILIK. Pengiriman ke pembeli punya jalurnya
                    sendiri (layar “Kirim Kartu”), dan menaruh resinya juga di sini akan membuat
                    satu kiriman punya dua nomor resi yang bisa berbeda. */}
                {release.value === "WITHDRAWN" && (
                  <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
                    {effectiveReturnMethod == null ? (
                      <p className="text-[12px] leading-relaxed text-amber-100">
                        Tujuan pengembaliannya belum dicatat, jadi kartu ini belum bisa dinyatakan
                        keluar. Isi dulu <strong>“Ke mana kartunya dikembalikan?”</strong> di panel
                        di atas — server menolak selama itu kosong, dan itu memang yang benar:
                        kartu yang masih di rak tidak boleh bisa tercatat selesai.
                      </p>
                    ) : effectiveReturnMethod === "COURIER" ? (
                      <>
                        <p className="text-[12.5px] font-semibold text-zinc-200">Nomor resi</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                          Tanpa resi, “sudah dikirim” adalah pernyataan yang tidak bisa diperiksa
                          oleh pemilik kartunya sendiri — padahal dialah satu-satunya orang yang
                          berhak memeriksanya.
                          {storedReturnAddress && (
                            <>
                              {" "}
                              Tujuan tercatat: <span className="text-zinc-300">{storedReturnAddress}</span>.
                            </>
                          )}
                        </p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <input
                            value={retCourier}
                            onChange={(e) => setRetCourier(e.target.value)}
                            placeholder="Kurir — mis. “JNE REG”"
                            className={INPUT}
                          />
                          <input
                            value={retTracking}
                            onChange={(e) => setRetTracking(e.target.value)}
                            placeholder="Nomor resi"
                            className={INPUT}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[12.5px] font-semibold text-zinc-200">
                          Siapa yang mengambil kartunya?
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                          Nama orang yang benar-benar berdiri di depan Anda, dan dasar Anda yakin ia
                          berhak menerimanya. Yang datang mengambil sering bukan pemegang akunnya.
                        </p>
                        <input
                          value={retPickedUpBy}
                          onChange={(e) => setRetPickedUpBy(e.target.value)}
                          placeholder="mis. “Budi Santoso (pemilik), KTP dicocokkan dengan catatan intake”"
                          className={`${INPUT} mt-3`}
                        />
                      </>
                    )}
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    value={releaseReceipt}
                    onChange={(e) => setReleaseReceipt(e.target.value)}
                    placeholder="Nomor / arsip tanda terima keluar (opsional)"
                    className={INPUT}
                  />
                  <input
                    value={releaseNote}
                    onChange={(e) => setReleaseNote(e.target.value)}
                    placeholder="Catatan serah terima (wajib)"
                    className={INPUT}
                  />
                </div>

                {/* Apa yang masih kurang — DITAMPILKAN, bukan disembunyikan di balik tombol mati.
                    Gerbang sebenarnya tetap di server; daftar ini supaya operator tahu SEBELUM
                    menekan, bukan sesudah ditolak sambil pemiliknya menunggu di depan meja. */}
                {returnReleaseBlockers.length > 0 && (
                  <p className="mt-3 text-[12px] leading-relaxed text-amber-200/90">
                    Belum bisa dicatat keluar — kurang: {returnReleaseBlockers.join(", ")}.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "RELEASE" })}
                  disabled={
                    busy ||
                    releaseNote.trim().length < NOTE_MIN ||
                    returnReleaseBlockers.length > 0
                  }
                  className="mt-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  Catat kartu keluar
                </button>
              </div>
            )}

            {can("LOST") && (
              <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3.5">
                <p className="text-[13px] font-semibold text-red-200">Kartu hilang atau rusak</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                  Jalan keluar yang jujur, dan ia harus ada — tanpa ini satu-satunya cara menutup
                  baris seperti ini adalah berpura-pura kartunya masih ada. Sesudah dicatat, kartu
                  tidak bisa dijual, dikirim, atau dipajang lagi. Ganti rugi TIDAK otomatis: tidak
                  ada uang yang berpindah dari tombol ini.
                </p>
                <textarea
                  value={lostNote}
                  onChange={(e) => setLostNote(e.target.value)}
                  rows={2}
                  placeholder="Apa yang terjadi, sejelas mungkin."
                  className={`${INPUT} mt-3 resize-y leading-relaxed`}
                />
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "LOST" })}
                  disabled={busy || lostNote.trim().length < NOTE_MIN}
                  className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-[13px] font-semibold text-red-200 transition hover:bg-red-400/20 disabled:opacity-50"
                >
                  Catat hilang / rusak
                </button>
              </div>
            )}

            {can("COMPENSATE") && (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
                <p className="text-[13px] font-semibold text-emerald-200">Ganti rugi ke pemilik</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                  Struk serah terima yang ditandatangani kedua pihak berbunyi:{" "}
                  <em>“Hoshi mengganti sesuai nilai yang tertulis di struk ini.”</em> Nominalnya
                  karena itu <strong>bukan keputusan operator</strong> — server membacanya sendiri
                  dari harga jual yang disepakati di baris titipan ini, dan menolak angka lain.
                </p>

                {/* ANGKA YANG DIJANJIKAN KERTASNYA, DITAMPILKAN — bukan kotak isian kosong.
                    Kotak kosong di sini dulu mengundang "kurang satu nol" pada satu-satunya aksi
                    di layar ini yang memindahkan uang sungguhan. */}
                <p className="mt-3 rounded-lg border border-emerald-400/20 bg-black/25 px-3.5 py-3 text-[13px] leading-relaxed text-zinc-200">
                  Struk menjanjikan{" "}
                  <strong className="text-[15px] text-emerald-200">{rp(c.askPriceIdr)}</strong>
                  <span className="mt-1 block text-[11.5px] text-zinc-500">
                    Harga jual yang disepakati di struk serah terima — bukan harga dasar
                    {c.reservePriceIdr != null ? ` (${rp(c.reservePriceIdr)})` : ""}, bukan taksiran
                    pasar hari ini. Inilah yang akan dikreditkan.
                  </span>
                </p>

                {/* ── DUA KEADAAN YANG MEMBUATNYA PASTI DITOLAK, DIKATAKAN LEBIH DULU ─────── */}
                {c.consignorId == null && (
                  <p className="mt-3 rounded-lg border border-violet-400/30 bg-violet-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-violet-100">
                    Belum ada akun pemilik yang tertaut ke titipan ini, jadi uangnya belum punya
                    tujuan — server menolak selama itu. Tautkan akunnya (atau minta pemiliknya
                    menukarkan kode klaim) lewat panel ungu di atas, baru bayar.
                  </p>
                )}
                {(c.status === "SOLD" || c.soldOrderId != null || c.listing?.buyerId != null) && (
                  <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100">
                    Kartu ini <strong>sudah terjual</strong> sebelum hilang. Pemiliknya sudah
                    menerima payout-nya di detik settlement; yang tidak menerima apa pun adalah{" "}
                    <strong>PEMBELI</strong>, dan dialah yang wajib dipulihkan — lewat{" "}
                    <Link href="/admin/transactions" className="text-amber-200 underline">
                      order pembayarannya (REFUND_DUE)
                    </Link>
                    , bukan dari sini. Server menolak ganti rugi ke pemilik di baris seperti ini;
                    penolakannya sekaligus memastikan utang ke pembelinya sudah tercatat.
                  </p>
                )}

                <input
                  value={compNote}
                  onChange={(e) => setCompNote(e.target.value)}
                  placeholder="Dasar kesepakatannya (wajib, min. 10 karakter) — mis. “disepakati lewat telepon 20 Sep, sesuai angka di struk”"
                  className={`${INPUT} mt-3`}
                />

                {/* HASILNYA — hijau HANYA kalau rupiahnya benar-benar bergerak. Bug lamanya persis
                    kebalikan itu: operator salah ketik, mengulang, server menolak, layar tetap
                    hijau, dan operator mengira pemiliknya sudah dibayar. */}
                {compResult && (
                  <div
                    className={`mt-3 rounded-lg border px-3.5 py-3 text-[12.5px] leading-relaxed ${
                      compResult.ok
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                        : "border-red-400/40 bg-red-400/10 text-red-200"
                    }`}
                  >
                    <p className="font-semibold">{compResult.title}</p>
                    <p className="mt-1">{compResult.detail}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "COMPENSATE" })}
                  disabled={
                    busy ||
                    compNote.trim().length < NOTE_MIN ||
                    c.consignorId == null ||
                    !(c.askPriceIdr > 0)
                  }
                  className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Memproses…" : `Bayar ${rp(c.askPriceIdr)} ke pemilik`}
                </button>
                <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
                  Satu ganti rugi per titipan: penekanan kedua DITOLAK (dan penolakannya menyebut
                  nominal, penerima, dan tanggal yang sudah tercatat), bukan diam-diam membayar dua
                  kali — dan bukan pula dilaporkan sebagai berhasil.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirm?.kind === "ACCEPT"}
        title="Kartunya sudah di tanganmu?"
        message={
          <>
            Ini mencatat bahwa Hoshi memegang kartu ini, sejak sekarang, dan mencatat kamu sebagai
            penerimanya. Catatan itu <strong>tidak bisa dibatalkan</strong> — kalau kartunya keluar
            lagi, itu dicatat sebagai kejadian terpisah.{" "}
            {afterAcceptBlockers.length === 0 ? (
              "Sesudah ini kartu boleh dipajang."
            ) : (
              <>
                Sesudah ini kartunya tercatat ada di rak Hoshi, tapi{" "}
                <strong>BELUM bisa dipajang</strong>: {afterAcceptBlockers.join(" dan ")}. Jangan
                menjanjikan “nanti kami pajangkan” ke pemiliknya sebelum itu beres.
              </>
            )}
          </>
        }
        confirmLabel="Ya, kartunya ada di saya"
        onConfirm={() =>
          void run(
            () =>
              acceptConsignmentCustody(
                c.id,
                {
                  storageLocation: storageLocation.trim(),
                  ...(receiptRef.trim() ? { intakeReceiptRef: receiptRef.trim() } : {}),
                  ...(acceptNote.trim() ? { note: acceptNote.trim() } : {}),
                },
                token ?? "",
              ),
            afterAcceptBlockers.length === 0
              ? "Kartu tercatat diterima. Sekarang boleh dipajang."
              : `Kartu tercatat diterima — tapi BELUM bisa dipajang: ${afterAcceptBlockers.join(
                  " dan ",
                )}.${afterAcceptFix}`,
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "RETURN"}
        title={c.status === "INTAKE" ? "Batalkan kesepakatan?" : "Catat permintaan kembali?"}
        message={
          c.status === "INTAKE"
            ? "Kesepakatan ditutup. Tidak ada kartu yang pernah berpindah tangan."
            : "Listing-nya diturunkan kalau sedang dipajang, dan kartu kembali ke keadaan tidak dijual. Tidak ada biaya apa pun untuk pemilik."
        }
        confirmLabel="Catat"
        onConfirm={() =>
          void run(
            () =>
              requestAdminConsignmentReturn(
                c.id,
                token ?? "",
                returnNote.trim() || undefined,
                // Rencana pengembalian TIDAK ikut untuk baris INTAKE: kartunya tidak pernah
                // berpindah tangan, dan server menolaknya (bukan mengabaikannya diam-diam).
                c.status === "INTAKE" ? undefined : typedPlan,
              ),
            c.status === "INTAKE"
              ? "Kesepakatan dibatalkan."
              : typedPlan
                ? "Permintaan kembali tercatat berikut tujuannya. Kartunya MASIH di rak Hoshi sampai serah terimanya dicatat."
                : "Permintaan kembali tercatat. Tujuannya belum ada — lengkapi sebelum kartunya bisa ditandai keluar.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "RELEASE"}
        title="Kartu fisik sudah keluar?"
        message={
          release?.value === "WITHDRAWN" ? (
            <>
              Ini menyatakan kartunya <strong>sudah berpindah tangan</strong> — bukan sekadar
              diminta kembali. Tekan hanya kalau paketnya benar-benar sudah diserahkan ke kurir
              (atau kartunya sudah di tangan orang yang mengambil). Sesudah ini kartu tidak bisa
              dipajang, dijual, atau dikirim lewat sistem lagi.
            </>
          ) : (
            "Sesudah ini kartu tidak bisa dipajang, dijual, atau dikirim lewat sistem lagi."
          )
        }
        confirmLabel="Catat keluar"
        onConfirm={() =>
          void run(
            () =>
              releaseAdminConsignment(
                c.id,
                {
                  releaseReason: release?.value ?? "WITHDRAWN",
                  note: releaseNote.trim(),
                  ...(releaseReceipt.trim() ? { releaseReceiptRef: releaseReceipt.trim() } : {}),
                  // Bukti serah terima PENGEMBALIAN — hanya untuk kartu yang pulang ke pemiliknya.
                  // Pengiriman ke pembeli menyimpan resinya di jalur kirim fisik, bukan di sini.
                  ...(release?.value === "WITHDRAWN"
                    ? {
                        // Rencana yang sedang diketik ikut dikirim: pemiliknya bisa saja datang
                        // tanpa pemberitahuan, jadi alamat dan serah terimanya tercatat pada detik
                        // yang sama. Server menuliskannya lebih dulu, di transaksi yang sama.
                        ...(typedPlan ? { returnPlan: typedPlan } : {}),
                        ...(retCourier.trim() ? { returnCourier: retCourier.trim() } : {}),
                        ...(retTracking.trim() ? { returnTrackingNo: retTracking.trim() } : {}),
                        ...(retPickedUpBy.trim()
                          ? { returnPickedUpBy: retPickedUpBy.trim() }
                          : {}),
                      }
                    : {}),
                },
                token ?? "",
              ),
            "Tercatat: kartu sudah keluar dari Hoshi.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "LOST"}
        title="Catat kartu hilang / rusak?"
        danger
        message="Ini catatan permanen bahwa barang orang lain hilang atau rusak saat ada di tangan Hoshi. Hubungi pemiliknya langsung — jangan biarkan dia mengetahuinya dari layar."
        confirmLabel="Catat"
        onConfirm={() =>
          void run(
            () => markAdminConsignmentLost(c.id, lostNote.trim(), token ?? ""),
            "Tercatat. Hubungi pemilik kartunya.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "COMPENSATE"}
        title={`Bayar ${rp(c.askPriceIdr)} ke pemilik?`}
        message={
          <>
            Angka ini <strong>dibaca dari struk serah terima</strong> (harga jual yang disepakati),
            bukan diketik di sini — dan ia langsung masuk ke saldo pemiliknya. Kalau struknya
            berbunyi lain, yang harus diperbaiki adalah catatan titipannya, bukan pembayarannya.
            Satu kali per titipan: penekanan berikutnya akan ditolak.
          </>
        }
        confirmLabel="Bayar"
        onConfirm={() => void payCompensation()}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
