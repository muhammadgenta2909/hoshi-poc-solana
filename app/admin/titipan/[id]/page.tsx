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

   SUSUNAN LAYAR: empat tab. Informasi Kartu (struk, bukti, harga, gambar pajangan) · Legalitas
   Kartu (catatan serah terima, koreksi, riwayat) · Pengambilan Kartu (pengembalian ke pemilik &
   serah terima fisiknya) · Kartu Hilang (laporan hilang/rusak & ganti rugi). Keadaan yang
   menentukan apa yang boleh dilakukan (custody, belum diklaim, sedang diminta kembali) tetap
   di ATAS tab, supaya terbaca dari tab mana pun.

   Gerbang sebenarnya ada di server; tombol di sini hanya disusun supaya operator tahu SEBELUM
   menekan, bukan sesudah ditolak. Nol USDC, nol SOL, nol escrow bergerak dari halaman ini.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  setAdminConsignmentListingImages,
  setAdminConsignmentPrice,
  type AdminConsignment,
  type ConsignmentAction,
  type ConsignorCandidate,
} from "@/lib/admin-api";
import {
  certLookupUrl,
  chargeablePriceRange,
  commissionPct,
  consignorLinkMethodLabel,
  estimatedPayout,
  eventTitle,
  isAwaitingClaim,
  isChargeablePrice,
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
import { PhotoStrip, PhotoUploader } from "@/components/admin/ConsignmentPhotos";
import ClaimCodeHandover from "@/components/admin/ClaimCodeHandover";
import LabelCorrectionPanel from "@/components/admin/LabelCorrectionPanel";
import HandoverReceiptButton, { receiptDataFrom } from "@/components/admin/HandoverReceipt";
import ConsignorPicker, { PickedConsignor } from "@/components/admin/ConsignorPicker";
import { ConfirmDialog } from "@/components/account/ui";
import { getStates } from "@/lib/geo";

const INPUT =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12.5px] text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-yellow-400/50";

/** Gradasi emas Hoshi — kuning di kiri, jingga di kanan, sesuai desain. */
const GOLD = "linear-gradient(90deg, #FFF600 0%, #FBB222 100%)";

/** Huruf pixel untuk chip, sama dengan chip di halaman kartu marketplace. */
const JERSEY = { fontFamily: "var(--font-jersey)" } as const;

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

/** Catatan riwayat dari server menulis rupiah tanpa titik ("Rp 1300000"); tampilkan berformat. */
const prettyRupiah = (s: string) =>
  s.replace(/Rp (\d{4,})/g, (_, n: string) => `Rp ${Number(n).toLocaleString("id-ID")}`);

/** Kotak harga menampilkan titik ribuan supaya "kurang satu nol" kelihatan; state tetap digit polos. */
const groupDigits = (digits: string) => (digits ? Number(digits).toLocaleString("id-ID") : "");
const onlyDigits = (v: string) => v.replace(/[^\d]/g, "");

/**
 * Foto TERBARU dengan jenis tertentu (FRONT / BACK).
 *
 * Server mengirim `photos` terurut `createdAt: 'asc'` — yang PALING LAMA duluan. Jadi `.find()`
 * akan mengambil foto yang paling awal diunggah, dan setiap unggahan perbaikan (mis. operator
 * salah foto, lalu memotret ulang) tidak akan pernah terpakai. Karena foto titipan sengaja
 * append-only — tidak bisa dihapus, supaya tetap sah sebagai bukti untuk kedua pihak — satu-
 * satunya cara "mengoreksi" adalah mengunggah yang baru. Maka yang dipilih harus yang TERAKHIR.
 */
const lastPhotoUrl = (
  photos: { kind: string; url: string }[] | undefined,
  kind: string,
): string | undefined => {
  const list = photos ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].kind === kind) return list[i].url;
  }
  return undefined;
};

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

/** Alasan keluar dalam bahasa operator — bukan WITHDRAWN/SHIPPED_TO_BUYER. */
const releaseReasonLabel = (r: string | null): string | null =>
  r === "WITHDRAWN"
    ? "dikembalikan ke pemiliknya"
    : r === "SHIPPED_TO_BUYER"
      ? "diserahkan ke pembeli"
      : r;

/* ═══════════════════════════════════════ TAB ═══════════════════════════════════════ */

type Tab = "INFO" | "LEGAL" | "PICKUP" | "LOST";

/** Tiga tab utama di grup kiri; "Kartu Hilang" berdiri sendiri di ujung kanan. */
const MAIN_TABS: Tab[] = ["INFO", "LEGAL", "PICKUP"];

const TAB_LABEL: Record<Tab, string> = {
  INFO: "Informasi Kartu",
  LEGAL: "Legalitas Kartu",
  PICKUP: "Pengambilan Kartu",
  LOST: "Kartu Hilang",
};

/** Tab yang terbuka disimpan di hash URL, supaya memuat ulang halaman tidak melempar ke tab awal. */
const TAB_HASH: Record<Tab, string> = {
  INFO: "informasi",
  LEGAL: "legalitas",
  PICKUP: "pengambilan",
  LOST: "kartu-hilang",
};

const tabFromHash = (hash: string): Tab =>
  (Object.keys(TAB_HASH) as Tab[]).find((t) => hash === `#${TAB_HASH[t]}`) ?? "INFO";

/* ═══════════════════════════════════ POTONGAN TAMPILAN ═══════════════════════════════════ */

function Section({
  title,
  sub,
  right,
  danger,
  children,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`rounded-xl p-4 sm:p-5 ${
        danger ? "border border-red-500/60 bg-red-950/20" : "bg-white/[0.035]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Di ponsel judulnya selebar penuh, jadi tombol di kanan turun ke baris berikutnya
            alih-alih menghimpit keterangannya jadi kolom sempit. */}
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <h2
            className={`text-[16px] font-bold leading-tight sm:text-[18px] ${
              danger ? "text-red-500" : "text-white"
            }`}
          >
            {title}
          </h2>
          {sub && <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">{sub}</p>}
        </div>
        {right && <div className="flex shrink-0 flex-wrap items-center gap-3">{right}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}

/** Kotak bergaris di dalam satu Section. */
function SubBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 p-3.5 sm:p-4">
      <p className="text-[13.5px] font-bold text-white">{title}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/** Satu baris label ↔ nilai. `plain` = tanpa garis pemisah (dipakai di kartu harga). */
function KV({ label, value, plain }: { label: string; value: ReactNode; plain?: boolean }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 py-2.5 ${
        plain ? "" : "border-b border-white/[0.08]"
      }`}
    >
      <span className="shrink-0 text-[12px] text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-right text-[12px] font-medium text-white">
        {value}
      </span>
    </div>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="mb-1.5 block text-[12px] font-semibold text-white">
      {children}
      {required && <span className="text-red-500">*</span>}
    </span>
  );
}

/**
 * Tombol aksi. MATI = abu-abu (seperti desain), HIDUP = warna sesuai akibatnya: emas untuk aksi
 * biasa, merah untuk laporan hilang, hijau untuk satu-satunya aksi yang memindahkan uang.
 */
function ActionButton({
  enabled,
  onClick,
  children,
  full,
  tone = "gold",
  title,
}: {
  enabled: boolean;
  onClick: () => void;
  children: ReactNode;
  full?: boolean;
  tone?: "gold" | "red" | "green";
  title?: string;
}) {
  const toneCls =
    tone === "red"
      ? "bg-red-600 text-white hover:bg-red-500"
      : tone === "green"
        ? "bg-emerald-500 text-[#06200f] hover:bg-emerald-400"
        : "text-[#171717] hover:brightness-105";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      title={title}
      className={`rounded-lg px-5 text-[12.5px] font-semibold transition ${
        full ? "w-full py-2.5" : "py-2"
      } ${enabled ? toneCls : "cursor-not-allowed bg-white/[0.12] text-zinc-400"}`}
      style={enabled && tone === "gold" ? { backgroundImage: GOLD } : undefined}
    >
      {children}
    </button>
  );
}

/** Kalimat kecil di samping tombol: apa yang masih kurang, atau bahwa semuanya siap. */
function Hint({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] leading-relaxed text-zinc-500">{children}</span>;
}

/** Sakelar pilihan berbentuk pil (cara pengembalian, penanggung ongkir). */
function PillToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex max-w-full flex-wrap rounded-full bg-white/[0.06] p-1">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition ${
              on ? "text-[#171717]" : "text-zinc-200 hover:text-white"
            }`}
            style={on ? { backgroundImage: GOLD } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function IconArrowLeft() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
    </svg>
  );
}

function IconSwap() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h14l-3-3M20 17H6l3 3" />
    </svg>
  );
}

/** Jenis foto dalam bahasa yang dibaca operator — bukan FRONT/BACK/CERT/HANDOVER. */
const kindLabel = (k: string): string =>
  k === "FRONT"
    ? "Bagian depan kartu"
    : k === "BACK"
      ? "Bagian belakang kartu"
      : k === "CERT"
        ? "Nomor sertifikat"
        : k === "HANDOVER"
          ? "Struk serah terima"
          : k === "DAMAGE"
            ? "Cacat / catatan"
            : "Foto lainnya";

/** Versi pendek untuk ditempel di atas petak kecil. */
const kindShort = (k: string): string =>
  k === "FRONT"
    ? "depan"
    : k === "BACK"
      ? "blkg"
      : k === "CERT"
        ? "sert"
        : k === "HANDOVER"
          ? "struk"
          : k === "DAMAGE"
            ? "cacat"
            : "lain";

function ListingStatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cls =
    s === "ACTIVE"
      ? "bg-yellow-400/15 text-yellow-300"
      : s === "SOLD"
        ? "bg-emerald-400/15 text-emerald-300"
        : "bg-white/[0.08] text-zinc-300";
  return (
    <span
      style={JERSEY}
      className={`inline-block rounded-full px-3 py-[3px] text-[14px] leading-none tracking-wide ${cls}`}
    >
      {s.charAt(0) + s.slice(1).toLowerCase()}
    </span>
  );
}

/** Satu petak gambar pajangan (depan / belakang). */
function SlotTile({
  label,
  url,
  active,
  onOpen,
  onClear,
}: {
  label: string;
  url: string;
  active: boolean;
  onOpen: () => void;
  /** Ada = sisi ini boleh dikosongkan (hanya belakang). */
  onClear?: () => void;
}) {
  return (
    <div
      className={`w-[128px] rounded-xl bg-white/[0.04] p-2 transition sm:w-[150px] ${
        active ? "ring-2 ring-yellow-400" : ""
      }`}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full"
          title={url ? `Ganti gambar ${label.toLowerCase()}` : `Pilih gambar ${label.toLowerCase()}`}
        >
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={`Gambar ${label.toLowerCase()}`}
              className="aspect-[3/4] w-full rounded-lg bg-black/40 object-contain"
            />
          ) : (
            <span className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-white/20 text-[11.5px] text-zinc-500">
              + Pilih foto
            </span>
          )}
        </button>
        {onClear && url ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Kosongkan gambar ${label.toLowerCase()}`}
            title="Kosongkan"
            className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-[#F2B705] text-[#171717] transition hover:brightness-110"
          >
            <IconTrash />
          </button>
        ) : url ? (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Ganti gambar ${label.toLowerCase()}`}
            title="Ganti"
            className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-[#F2B705] text-[#171717] transition hover:brightness-110"
          >
            <IconSwap />
          </button>
        ) : null}
      </div>
      <p className="mt-2.5 text-center text-[11.5px] font-semibold uppercase tracking-wide text-white">
        {label}
        {onClear && <span className="font-normal normal-case text-zinc-400"> (Opsional)</span>}
      </p>
    </div>
  );
}

/**
 * Gambar yang dilihat pembeli: dua petak (depan, belakang). Ketuk petaknya → pilih penggantinya
 * dari foto bukti yang SUDAH tersimpan di titipan ini.
 *
 * Dipakai di DUA tempat — saat memajang pertama kali, dan saat memperbaiki gambar kartu yang
 * sudah tayang. Satu komponen, bukan dua salinan, supaya "gambar belakang boleh dikosongkan"
 * tidak berlaku di satu layar dan diam-diam hilang di layar satunya.
 *
 * FOTO STRUK TIDAK DITAWARKAN: struk serah terima memuat nama dan nomor telepon pemilik kartu,
 * dan memajangnya sebagai "punggung kartu" berarti membagikan data itu ke setiap pengunjung.
 */
function BuyerImageSlots({
  photos,
  front,
  back,
  onFront,
  onBack,
}: {
  photos: { id: string; url: string; kind: string }[];
  front: string;
  back: string;
  onFront: (url: string) => void;
  onBack: (url: string) => void;
}) {
  const [slot, setSlot] = useState<"FRONT" | "BACK" | null>(null);
  const choices = photos.filter((p) => p.kind !== "HANDOVER");
  const current = slot === "FRONT" ? front : back;

  return (
    <div>
      <div className="flex flex-wrap gap-4">
        <SlotTile
          label="Depan"
          url={front}
          active={slot === "FRONT"}
          onOpen={() => setSlot((s) => (s === "FRONT" ? null : "FRONT"))}
        />
        <SlotTile
          label="Belakang"
          url={back}
          active={slot === "BACK"}
          onOpen={() => setSlot((s) => (s === "BACK" ? null : "BACK"))}
          onClear={() => onBack("")}
        />
      </div>

      {slot && (
        <div className="mt-4 rounded-xl bg-black/25 p-3.5">
          <p className="text-[12px] leading-relaxed text-zinc-300">
            Pilih foto untuk gambar <strong>{slot === "FRONT" ? "depan" : "belakang"}</strong>,
            diambil dari foto bukti. Foto struk tidak ditawarkan karena memuat nama dan nomor HP
            pemilik.
          </p>
          <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto pb-1">
            {choices.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (slot === "FRONT") onFront(p.url);
                  else onBack(p.url);
                  setSlot(null);
                }}
                title={kindLabel(p.kind)}
                className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  current === p.url ? "border-yellow-400" : "border-white/10 hover:border-white/30"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-24 w-[68px] object-cover" />
                {/* Jenis foto ditulis DI ATAS gambarnya — tanpa ini operator harus menebak mana
                    yang depan dan mana yang belakang dari petak sekecil ini. */}
                <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wide text-zinc-100">
                  {kindShort(p.kind)}
                </span>
              </button>
            ))}
            {choices.length === 0 && (
              <p className="text-[11.5px] text-zinc-500">Belum ada foto yang bisa dipakai.</p>
            )}
          </div>
        </div>
      )}
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

  /* Tab yang terbuka. Dibaca dari hash URL — aman untuk hidrasi, karena render pertama di server
     maupun di browser sama-sama "Memuat…" (baris titipannya belum ada). */
  const [tab, setTab] = useState<Tab>(() =>
    typeof window === "undefined" ? "INFO" : tabFromHash(window.location.hash),
  );

  /* form-form aksi */
  const [storageLocation, setStorageLocation] = useState("");
  const [acceptNote, setAcceptNote] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [listImage, setListImage] = useState("");
  const [listImageBack, setListImageBack] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [releaseReceipt, setReleaseReceipt] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  /** null = ikuti bawaan (terbuka selama kartunya belum diterima, karena bukti wajib masih kurang). */
  const [uploadOpen, setUploadOpen] = useState<boolean | null>(null);

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
  /** Kosong = belum diputuskan. Sengaja BUKAN default: menebaknya berarti menyembunyikan
      pertanyaannya, dan ongkos yang tidak pernah ditanyakan adalah ongkos yang tidak pernah
      terlihat di laporan mana pun. */
  const [retPayer, setRetPayer] = useState<ConsignmentReturnPayer | "">("");
  /** Kosong = biarkan server menaksir dari tarif wilayah yang sudah dipakai kirim domestik. */
  const [retFee, setRetFee] = useState("");

  /* Daftar provinsi untuk kolom "Provinsi" — DATA ASLI dari pemilih alamat yang sama dengan yang
     dipakai pembeli, supaya ejaannya cocok dengan tarif ongkir per wilayah. null = belum dimuat. */
  const [provinces, setProvinces] = useState<string[] | null>(null);
  const [provincesFailed, setProvincesFailed] = useState(false);

  /* ── BUKTI SERAH TERIMA PENGEMBALIAN: resi, atau nama yang mengambil ── */
  const [retCourier, setRetCourier] = useState("");
  const [retTracking, setRetTracking] = useState("");
  const [retPickedUpBy, setRetPickedUpBy] = useState("");
  const [lostNote, setLostNote] = useState("");
  /* TIDAK ADA `compAmount`, dan itu inti rancangannya: nominal ganti rugi bukan keputusan
     operator. Server membacanya dari `askPriceIdr` — angka yang TERCETAK di struk serah terima
     yang ditandatangani kedua pihak. */
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
      /* Kotak "Harga baru" sengaja KOSONG: harga yang berlaku sudah tertulis di sebelahnya, dan
         kotak yang terisi angka lama terlalu mudah tersimpan tanpa benar-benar diubah. */
      setNewPrice("");
      /* Gambar listing diambil dari foto yang SUDAH bertanda jenis saat serah terima. Operator
         tidak perlu memilih apa pun di jalur normal — jawabannya sudah ada sejak fotonya
         diunggah, dan menyuruhnya memilih ulang cuma menambah satu kesempatan salah.

         Urutan `listing?.image` dulu: kalau kartunya sudah pernah dipajang, yang dipakai adalah
         gambar yang MEMANG SEDANG TAYANG — memuat ulang layar tidak boleh diam-diam mengusulkan
         gambar lain. */
      setListImage(
        row.listing?.image ??
          lastPhotoUrl(row.photos, "FRONT") ??
          row.photos?.[row.photos.length - 1]?.url ??
          "",
      );
      /* Belakang TIDAK jatuh ke `photos[0]`: kalau tidak ada foto bertanda BACK, biarkan kosong.
         Menebak di sini berarti memajang sertifikat atau struk serah terima sebagai "punggung
         kartu" ke pembeli — dan struk itu memuat nama serta nomor telepon pemiliknya. */
      setListImageBack(row.listing?.imageBack ?? lastPhotoUrl(row.photos, "BACK") ?? "");
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

  /* Daftar provinsi baru dimuat saat tab Pengambilan Kartu dibuka — satu kali. Kalau gagal
     (mis. kunci geo belum dipasang), kolomnya merosot jadi isian teks biasa. */
  useEffect(() => {
    if (tab !== "PICKUP" || provinces !== null || provincesFailed) return;
    let alive = true;
    getStates("ID")
      .then((list) => {
        if (!alive) return;
        // Sumbernya memuat beberapa nama dobel (mis. "Papua" dua kali) — disatukan.
        const names = Array.from(new Set(list.map((s) => s.name.trim()).filter(Boolean)));
        names.sort((a, b) => a.localeCompare(b, "id"));
        setProvinces(names);
      })
      .catch(() => {
        if (alive) setProvincesFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [tab, provinces, provincesFailed]);

  /* Pesan hasil aksi muncul di bawah deretan tab. Kalau tombolnya ditekan jauh di bawah, layar
     digeser ke pesannya — "berhasil" atau "ditolak" yang tidak terlihat sama dengan tidak ada. */
  const msgRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ok && !error) return;
    msgRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ok, error]);

  const goTab = (t: Tab) => {
    setTab(t);
    setOk(null);
    setError(null);
    try {
      window.history.replaceState(null, "", `#${TAB_HASH[t]}`);
    } catch {
      /* hash hanya kenyamanan — tab tetap berpindah tanpanya */
    }
  };

  const photos = useMemo(() => c?.photos ?? [], [c]);

  /* Dua perbandingan TERPISAH, bukan satu boolean gabungan: yang satu menentukan apakah tombol
     boleh ditekan, yang satu lagi menentukan apakah `imageBack` ikut dikirim. Menggabungkannya
     akan membuat penekanan yang hanya mengganti gambar depan ikut menulis ulang gambar
     belakang — dan baris auditnya ikut berbohong tentang apa yang berubah.

     `|| null` di kedua sisi: state halaman memakai string kosong untuk "tidak ada", baris
     listing memakai null. Tanpa penyamaan ini, kartu yang memang tidak punya gambar belakang
     akan selalu terbaca "berubah". */
  const backChanged = (listImageBack || null) !== (c?.listing?.imageBack ?? null);
  const imagesChanged = listImage !== (c?.listing?.image ?? "") || backChanged;

  /* ══ FOTO BARU YANG BELUM TAYANG ══
     Foto BUKTI dan foto yang DIPAJANG itu dua hal terpisah, dengan sengaja: bukti append-only,
     pajangan dipilih. Selisihnya dihitung di sini dan diumumkan TEPAT di bawah tempat foto
     diunggah. Hanya untuk listing ACTIVE: listing yang sudah terjual adalah catatan apa yang
     dilihat pembelinya. */
  const liveListing = c?.listing?.status === "ACTIVE" ? c.listing : null;
  const newestFront = lastPhotoUrl(photos, "FRONT");
  const newestBack = lastPhotoUrl(photos, "BACK");
  const frontStale = !!liveListing && !!newestFront && newestFront !== liveListing.image;
  const backStale =
    !!liveListing && !!newestBack && newestBack !== (liveListing.imageBack ?? null);
  // Kunci penolakan = PASANGAN foto terbaru. Kalau operator menekan "biarkan", kotaknya diam
  // sampai ada foto yang LEBIH baru lagi — bukan muncul terus untuk keputusan yang sudah diambil.
  const staleKey = `${frontStale ? newestFront : ""}|${backStale ? newestBack : ""}`;
  const [staleDismissed, setStaleDismissed] = useState("");
  const showStale = (frontStale || backStale) && staleDismissed !== staleKey;

  /* Panel "Gambar yang dilihat pembeli" mengikuti apa yang BENAR-BENAR tayang setiap kali
     tayangannya berubah. Tanpa ini, sesudah tombol cepat di kotak bukti dipakai, panel pajangan
     masih memegang pilihan LAMA dan tombol "Simpan gambar"-nya menyala — satu tekanan iseng di
     sana akan mengembalikan foto yang barusan diganti. */
  const liveImage = liveListing?.image ?? null;
  const liveImageBack = liveListing?.imageBack ?? null;
  useEffect(() => {
    if (!liveImage) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setListImage(liveImage);
    setListImageBack(liveImageBack ?? "");
  }, [liveImage, liveImageBack]);

  /* Pilihan otomatis untuk kartu yang BELUM tayang, kalau fotonya diunggah SESUDAH halaman dibuka.
     `load()` hanya memilih dari foto yang ada saat itu — tanpa ini gambar depan tetap kosong dan
     tombol "Pajang sekarang" mati tanpa penjelasan. Gambar belakang hanya diisi selama operator
     belum menyentuhnya, supaya "Kosongkan" tetap berarti kosong. */
  const [backTouched, setBackTouched] = useState(false);
  useEffect(() => {
    if (liveListing) return;
    if (!listImage && newestFront) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setListImage(newestFront);
    }
    if (!listImageBack && !backTouched && newestBack) {
      setListImageBack(newestBack);
    }
  }, [liveListing, listImage, listImageBack, backTouched, newestFront, newestBack]);

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
   * ini — bukan dari kotak isian (tidak ada). Gunanya persis satu: kalau baris yang dimuat layar
   * sudah basi, yang terjadi adalah penolakan 400 yang menyebut KEDUA angka — bukan pembayaran
   * diam-diam sebesar angka yang tidak pernah dilihat siapa pun.
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
         409. Tapi backend LAMA menjawab 200 + `{ credited: false }` untuk pembayaran kedua. Kalau
         jawaban seperti itu pernah muncul lagi, ia dibaca sebagai KEGAGALAN. */
      if (credited !== true) {
        setCompResult({
          ok: false,
          title: "TIDAK DIBAYAR — server menjawab bahwa tidak ada kredit yang dibuat.",
          detail:
            "Kemungkinan besar ganti rugi untuk titipan ini sudah pernah tercatat sebelumnya. " +
            "Periksa saldo pemiliknya dan riwayat di tab Legalitas Kartu sebelum melakukan apa pun " +
            "lagi — jangan membayar ulang dari layar ini.",
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

  if (loading && !c) return <p className="py-16 text-center text-[12px] text-zinc-500">Memuat…</p>;

  if (!c)
    return (
      <div className="space-y-4">
        <Link
          href="/admin/titipan"
          className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-white/[0.1]"
        >
          <span className="text-yellow-400">
            <IconArrowLeft />
          </span>
          Kembali ke titipan
        </Link>
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3.5 py-2.5 text-[12px] text-red-300">
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
     aturan "alamat lengkap" di klien. */
  const typedPlan = returnPlanPayload();
  /** Sudah ada kolom alamat yang diisi (diketik sekarang, atau terisi dari rencana tersimpan). */
  const addressStarted = [retName, retPhone, retStreet, retApt, retCity, retState, retZip].some(
    (v) => v.trim() !== "",
  );
  /** Cara pengembalian yang BERLAKU untuk pelepasan ini: yang sedang diketik, kalau ada; kalau
      tidak, yang sudah tersimpan di baris. */
  const effectiveReturnMethod: string | null = typedPlan?.returnMethod ?? c.returnMethod;
  /** Alamat pengembalian yang sudah TERSIMPAN, satu baris — null berarti memang belum ada. */
  const storedReturnAddress = returnAddressLine(c);
  /** Kartunya sudah diminta kembali, dan ia MASIH di rak kita. */
  const returnPending = c.returnPending ?? (c.withdrawRequestedAt != null && !c.custodyReleasedAt);

  /**
   * Apa yang masih kurang sebelum kartu boleh dinyatakan KELUAR sebagai pengembalian.
   * Ditampilkan, bukan disembunyikan — sama seperti `acceptBlockers`.
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
     Kartu MENTAH dan titipan yang belum diklaim tetap BELUM bisa dipajang sesudah diterima.
     Operator membaca kalimat ini di teras rumah kolektor sebelum berpamitan — jadi ia harus
     jujur tentang kedua keadaan itu, bukan berbunyi "sekarang boleh dipajang" untuk semua. */
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
      ? " Kalau slab-nya sebenarnya ada, betulkan lewat “Koreksi data kartu” di tab Legalitas Kartu; kode klaimnya diterbitkan ulang lewat panel ungu di atas."
      : " Kalau slab-nya sebenarnya ada dan dropdown Grader cuma tertinggal kosong, betulkan lewat “Koreksi data kartu” di tab Legalitas Kartu — tanpa perlu mengarang pengembalian atau kehilangan."
    : awaitingClaim
      ? " Kode klaimnya bisa diterbitkan ulang lewat panel ungu di atas, atau akunnya ditautkan langsung dari sana."
      : "";

  /* Gambar kecil di kiri judul: yang SEDANG TAYANG, kalau tidak ada foto depan terbaru, kalau
     tidak ada juga foto apa pun SELAIN struk (struk memuat data pribadi pemiliknya). */
  const thumbUrl =
    c.listing?.image ??
    newestFront ??
    [...photos].reverse().find((p) => p.kind !== "HANDOVER")?.url ??
    null;
  /* Chip judul: hanya data yang memang tercatat di titipan ini. */
  const chips = [c.gradeLabel, c.language, c.tcg].filter(
    (v): v is string => typeof v === "string" && v.trim() !== "",
  );

  const currentPrice = c.listing?.priceIdrx ?? c.askPriceIdr;
  const newPriceNum = Number(newPrice) || 0;
  const priceSame = newPrice !== "" && newPriceNum === currentPrice;
  /* Rentang yang bisa ditagihkan ke pembeli — server menolak harga di luar ini, jadi operator
     diberi tahu SEBELUM menekan tombol, bukan sesudah ditolak. */
  const priceOutOfRange = newPrice !== "" && !isChargeablePrice(newPriceNum);
  const priceDelta = newPrice !== "" && !priceSame ? newPriceNum - currentPrice : 0;
  const priceNoteLen = priceNote.trim().length;
  const priceReady =
    !busy && newPrice !== "" && !priceOutOfRange && !priceSame && priceNoteLen >= NOTE_MIN;
  /* Perubahan harga terakhir, apa adanya dari riwayat: server menulisnya sebagai
     "Harga Rp X → Rp Y. <alasan>". */
  const lastPriceEvent = [...(c.events ?? [])].reverse().find((e) => e.kind === "PRICE");

  const lostEvent = [...(c.events ?? [])].reverse().find((e) => e.kind === "LOST");
  const showUploader = uploadOpen ?? !c.custodyAcceptedAt;

  /* ── Layar serah-terima kode: MENGGANTI halaman, bukan modal ──────────────────────────────
     Kodenya hanya hidup di memori halaman ini. Modal yang tertutup karena jari menyenggol latar
     akan membuangnya, dan operator harus menerbitkan kode ketiga di depan pemilik kartu. */
  if (handover) {
    return (
      <div className="space-y-5 pb-10">
        <header>
          <h1 className="text-[18px] font-bold text-zinc-100">Kode klaim diterbitkan</h1>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
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
            memuat kode lagi — server memang hanya menyimpan sidiknya. */}
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
          <p className="text-[12px] font-semibold text-zinc-200">
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
    <div className="pb-12">
      <Link
        href="/admin/titipan"
        className="inline-flex items-center gap-2 rounded-lg bg-white/[0.06] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-white/[0.1]"
      >
        <span className="text-yellow-400">
          <IconArrowLeft />
        </span>
        Kembali ke titipan
      </Link>

      <div className="mt-5 grid gap-5 lg:grid-cols-[128px_minmax(0,1fr)]">
        {/* ── GAMBAR KARTU ── */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          {thumbUrl ? (
            <a href={thumbUrl} target="_blank" rel="noreferrer" className="block w-24 lg:w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbUrl}
                alt={c.cardName}
                className="w-full rounded-lg bg-black/30 object-contain shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
              />
            </a>
          ) : (
            <div className="grid aspect-[3/4] w-24 place-items-center rounded-lg border border-dashed border-white/15 px-2 text-center text-[11px] text-zinc-500 lg:w-full">
              Belum ada foto
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-4">
          {/* ── JUDUL ── */}
          <header>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
              <h1 className="text-[21px] font-bold leading-tight text-white sm:text-[24px]">
                {c.cardName}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    style={JERSEY}
                    className="rounded-full bg-white/[0.21] px-3 py-[3px] text-[14px] uppercase leading-none tracking-wide text-white"
                  >
                    {chip}
                  </span>
                ))}
                <span
                  style={JERSEY}
                  className={`rounded-full border px-3 py-[3px] text-[14px] uppercase leading-none tracking-wide ${ui.cls}`}
                >
                  {ui.label}
                </span>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-white">
              <span className="text-zinc-500">Milik </span>
              <span className="font-semibold text-yellow-400">{c.consignorNameAtIntake}</span>
              <span className="mx-2 text-zinc-500">-</span>
              komisi <span className="font-semibold text-yellow-400">{commissionPct(c.commissionBps)}%</span>
              <span className="mx-2 text-zinc-500">-</span>
              harga <span className="font-semibold text-yellow-400">{rp(c.askPriceIdr)}</span>
            </p>
          </header>

          {/* ── Keadaan custody: satu kalimat, paling atas, tanpa jargon ── */}
          <div
            className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
              inCustody
                ? "border-[#04A1B8] bg-[#091928] text-white"
                : c.status === "INTAKE"
                  ? "border-amber-400/40 bg-amber-400/[0.07] text-amber-100"
                  : c.status === "LOST"
                    ? "border-red-500/50 bg-red-950/25 text-red-100"
                    : "border-[#04A1B8] bg-[#091928] text-zinc-100"
            }`}
          >
            {c.status === "INTAKE" && (
              <>
                <strong>Kartu belum diterima.</strong> Selama serah terimanya belum dicatat, kartu
                ini tidak bisa dipajang oleh siapa pun — dan memang begitu seharusnya: kartu yang
                masih di tangan pemiliknya masih bisa ia jual sendiri ke orang lain.
              </>
            )}
            {inCustody && (
              <span className="font-semibold">
                Kartu ada di Hoshi sejak {dt(c.custodyAcceptedAt)}
                {c.storageLocation ? ` · ${c.storageLocation}` : ""}. Diterima oleh{" "}
                {receiverLabel ?? "—"}
                {c.receivedAtPlace ? ` di ${c.receivedAtPlace}` : ""}.
              </span>
            )}
            {c.status === "SOLD" && (
              <>
                {" "}
                <strong>Sudah terjual.</strong> Kartunya{" "}
                {c.custodyReleasedAt ? "sudah keluar dari penyimpanan" : "masih di rak"} — pemiliknya
                sudah dibayar {rp(c.payoutIdrx)} (komisi Hoshi {rp(c.commissionIdrx)}).
              </>
            )}
            {c.status === "RELEASED" && (
              <>
                <strong>Kartu sudah keluar dari Hoshi</strong> pada {dt(c.custodyReleasedAt)}
                {c.releaseReason ? ` — ${releaseReasonLabel(c.releaseReason)}` : ""}.
              </>
            )}
            {c.status === "LOST" && (
              <>
                <strong>Kartu tercatat hilang / rusak</strong> pada {dt(c.custodyReleasedAt)}. Ia
                tidak bisa dijual, dikirim, atau dipajang lagi oleh apa pun.
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
              Panel TERPISAH dari panel custody, dan itu disengaja: keduanya menjawab pertanyaan
              yang berbeda ("kartunya di mana" vs "uangnya nanti ke siapa"), dan keduanya bisa
              benar sekaligus. Tetap di atas tab karena ia menghalangi pemajangan dan ganti rugi. */}
          {awaitingClaim && (
            <div className="rounded-xl border border-violet-400/30 bg-violet-400/[0.08] px-3.5 py-2.5 text-[12px] leading-relaxed text-violet-100">
              <strong>Belum ada akun yang mengklaim kartu ini.</strong> Pemiliknya —{" "}
              {c.consignorNameAtIntake} ({c.consignorPhoneAtIntake}) — belum memakai kode klaimnya.
              {c.custodyAcceptedAt && !c.custodyReleasedAt
                ? " Kartunya sendiri sudah ada di rak Hoshi; yang belum ada adalah akun tujuan hasil penjualannya."
                : ""}{" "}
              Selama itu belum terjadi, kartu ini belum bisa dipajang — bukan karena custody,
              melainkan karena tidak ada siapa pun yang bisa dibayar kalau ia terjual.
              <div className="mt-3">
                {/* Alasannya diminta SEBELUM kodenya terbit: penerbitan mematikan kode yang
                    mungkin sedang dipegang seseorang. */}
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
                    className="rounded-xl border border-violet-300/40 bg-violet-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:opacity-50"
                  >
                    {busy ? "Memproses…" : "Terbitkan kode klaim baru"}
                  </button>
                  <p className="text-[11px] leading-relaxed text-violet-200/70">
                    Kode lama langsung berhenti berlaku, dan alasan di atas tersimpan permanen.
                    Pakai ini kalau pemiliknya kehilangan kodenya, kodenya kedaluwarsa, atau ia
                    perlu ditegur lagi.
                  </p>
                </div>
              </div>

              {/* ── JALAN KEDUA: tautkan akunnya langsung ──────────────────────────────────────
                  Yang membuatnya bukan pintu belakang adalah `note`-nya: ia menjawab "DARI MANA
                  KAMU TAHU INI ORANGNYA", disimpan permanen. */}
              <div className="mt-4 border-t border-violet-300/20 pt-4">
                {!linkOpen ? (
                  <button
                    type="button"
                    onClick={() => setLinkOpen(true)}
                    className="text-[12px] font-semibold text-violet-200 underline-offset-2 hover:underline"
                  >
                    Pemiliknya sudah punya akun dan ada di depanmu? Tautkan langsung →
                  </button>
                ) : (
                  <div>
                    <p className="text-[12px] font-semibold text-violet-100">
                      Tautkan akun pemilik ke titipan ini
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-violet-200/75">
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
                        className="rounded-xl border border-violet-300/40 bg-violet-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-violet-100 transition hover:bg-violet-400/20 disabled:opacity-50"
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
                        className="px-2 py-2 text-[12px] text-violet-200/70 transition hover:text-violet-100"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PENGEMBALIAN YANG SEDANG BERJALAN ────────────────────────────────────────────
              Kalimat pertamanya menyebut fakta yang paling mudah hilang dari kepala orang:
              kartunya MASIH DI RAK KITA. "Ditarik" bukan "sudah pulang". */}
          {returnPending && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100">
              <strong>Pemilik minta kartunya kembali</strong> ({dt(c.withdrawRequestedAt)}) — dan
              kartunya <strong>masih di rak Hoshi</strong> sampai serah terimanya dicatat.
              {c.returnMethod == null ? (
                <> Ke mana kartunya dikembalikan <strong>belum ditentukan</strong>.</>
              ) : c.returnPlanReady === false ? (
                <>
                  {" "}
                  Alamat pengembaliannya <strong>belum lengkap</strong>, jadi kartu ini belum bisa
                  ditandai terkirim.
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
              {tab !== "PICKUP" && (
                <button
                  type="button"
                  onClick={() => goTab("PICKUP")}
                  className="ml-1 font-semibold text-amber-200 underline-offset-2 hover:underline"
                >
                  Buka Pengambilan Kartu →
                </button>
              )}
            </div>
          )}

          {/* ── TAB ── */}
          <div className="flex items-center gap-3">
            <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
              <div className="inline-flex rounded-full bg-white/[0.06] p-1">
                {MAIN_TABS.map((t) => {
                  const on = tab === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => goTab(t)}
                      aria-pressed={on}
                      className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition sm:px-4 sm:text-[13.5px] ${
                        on ? "font-semibold text-[#171717]" : "text-white hover:text-yellow-200"
                      }`}
                      style={on ? { backgroundImage: GOLD } : undefined}
                    >
                      {TAB_LABEL[t]}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              onClick={() => goTab("LOST")}
              aria-pressed={tab === "LOST"}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] transition sm:px-4 sm:text-[13.5px] ${
                tab === "LOST"
                  ? "bg-red-600 font-semibold text-white"
                  : "bg-red-950/70 text-white/90 hover:bg-red-900/70"
              }`}
            >
              {TAB_LABEL.LOST}
            </button>
          </div>

          <div ref={msgRef} className="space-y-3 empty:hidden">
            {ok && (
              <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2.5 text-[12px] text-emerald-200">
                {ok}
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3.5 py-2.5 text-[12px] text-red-300">
                {error}
              </p>
            )}
          </div>

          {/* ═════════════════════════════ TAB: INFORMASI KARTU ═════════════════════════════ */}
          {tab === "INFO" && (
            <div className="space-y-4">
              {/* ── STRUK SERAH TERIMA ─────────────────────────────────────────────────────────
                  SEBELUM kartu "Bukti", karena itu urutan yang benar di lapangan: cetak → tanda
                  tangani di depan pemiliknya → baru difoto sebagai bukti "Struk serah terima".
                  Struk yang dicetak ULANG memakai TANGGAL SERAH TERIMA yang asli, bukan tanggal
                  cetaknya — kalau tidak, kertas yang sama akan berbunyi dua hal yang berbeda. */}
              <Section
                title="Struk serah terima"
                sub="Dua lembar identik: satu untuk pemilik kartu, satu untuk Hoshi. Ditandatangani kedua pihak di tempat. Inilah satu-satunya bukti yang isinya tidak bisa Hoshi ubah sendiri — salinan pemiliknya ada di tangan dia."
              >
                <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/icon-paper.png"
                    alt=""
                    aria-hidden
                    className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16"
                  />
                  <HandoverReceiptButton
                    data={receiptDataFrom(c)}
                    tone={c.custodyAcceptedAt ? "panel" : "utama"}
                    label={
                      c.custodyAcceptedAt
                        ? "Cetak ulang struk (2 lembar)"
                        : "Cetak struk serah terima (2 lembar)"
                    }
                  />
                </div>
                <p className="mt-5 text-[12px] leading-relaxed text-zinc-500">
                  {c.custodyAcceptedAt ? (
                    <>
                      <strong className="font-semibold text-white">
                        Salinan dengan tanggal serah terima aslinya ({dt(c.custodyAcceptedAt)}).
                      </strong>{" "}
                      Kode klaim tidak ikut tercetak — ia hanya bisa ditampilkan sekali, saat
                      diterbitkan.
                    </>
                  ) : (
                    "Setelah ditandatangani kedua pihak, foto lembarnya sebagai bukti “Struk serah terima” di bawah. Tanpa foto itu, kartu ini belum bisa dinyatakan diterima."
                  )}
                </p>
              </Section>

              {/* ── BUKTI ── */}
              <Section
                title="Bukti"
                sub={
                  <>
                    Diambil di tempat, di depan pemiliknya. Foto tidak bisa dihapus setelah
                    tersimpan —{" "}
                    <strong className="font-semibold text-white">
                      itu yang membuatnya berlaku sebagai bukti untuk kedua pihak.
                    </strong>
                  </>
                }
                right={
                  can("PHOTO") && (
                    <button
                      type="button"
                      onClick={() => setUploadOpen(!showUploader)}
                      className="rounded-lg border border-white/15 px-3.5 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/[0.06]"
                    >
                      {showUploader ? "Tutup unggah foto" : "+ Tambah foto"}
                    </button>
                  )
                }
              >
                {showUploader && can("PHOTO") && (
                  <div className="mb-5 rounded-xl bg-black/25 p-4">
                    <PhotoUploader
                      consignmentId={c.id}
                      photos={photos}
                      token={token ?? ""}
                      required={c.custodyAcceptedAt ? [] : requiredKinds}
                      onUpdated={setC}
                    />
                    <p className="mt-3 text-[10.5px] leading-relaxed text-zinc-500">
                      Pilih jenis fotonya dulu, lalu ambil fotonya. Foto tersimpan permanen dan
                      tidak bisa dihapus — termasuk oleh admin.
                    </p>
                  </div>
                )}

                <PhotoStrip photos={photos} />

                {showStale && liveListing && (
                  <div className="mt-5 rounded-xl border border-yellow-400/35 bg-yellow-400/[0.08] p-4">
                    <p className="text-[12.5px] font-semibold text-yellow-100">
                      Foto baru ini belum tampil di halaman pembeli
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-400">
                      Foto bukti dan foto yang dipajang itu terpisah. Foto bukti tersimpan
                      selamanya, sedangkan yang dilihat pembeli baru berubah kalau kamu memakainya.
                    </p>

                    <div className="mt-3 flex flex-wrap gap-5">
                      {(
                        [
                          frontStale && { label: "Depan", now: liveListing.image ?? null, next: newestFront },
                          backStale && { label: "Belakang", now: liveListing.imageBack ?? null, next: newestBack },
                        ].filter(Boolean) as { label: string; now: string | null; next?: string }[]
                      ).map((s) => (
                        <div key={s.label}>
                          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">
                            {s.label}
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="text-center">
                              {s.now ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={s.now} alt="" className="h-20 w-14 rounded-md object-cover opacity-60" />
                              ) : (
                                <div className="grid h-20 w-14 place-items-center rounded-md border border-dashed border-white/15 text-[9.5px] text-zinc-500">
                                  kosong
                                </div>
                              )}
                              <p className="mt-1 text-[9.5px] text-zinc-500">sekarang</p>
                            </div>
                            <span className="text-zinc-500">→</span>
                            <div className="text-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={s.next}
                                alt=""
                                className="h-20 w-14 rounded-md object-cover ring-2 ring-yellow-400"
                              />
                              <p className="mt-1 text-[9.5px] text-yellow-200">baru</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <ActionButton
                        enabled={!busy}
                        onClick={() =>
                          void run(
                            () =>
                              setAdminConsignmentListingImages(
                                c.id,
                                {
                                  // Hanya sisi yang memang berubah — supaya baris audit di server
                                  // tidak mencatat "diganti" untuk sisi yang tidak disentuh.
                                  ...(frontStale && newestFront ? { image: newestFront } : {}),
                                  ...(backStale && newestBack ? { imageBack: newestBack } : {}),
                                },
                                token ?? "",
                              ),
                            "Halaman pembeli sekarang memakai foto terbaru.",
                          )
                        }
                      >
                        {busy ? "Memproses…" : "Pakai di halaman pembeli"}
                      </ActionButton>
                      <button
                        type="button"
                        onClick={() => setStaleDismissed(staleKey)}
                        className="rounded-lg border border-white/12 px-4 py-2.5 text-[12px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                      >
                        Biarkan yang sekarang
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              {/* ── TERIMA KARTU (hanya sebelum custody ada) ── */}
              {can("ACCEPT") && (
                <Section
                  title="Terima kartu"
                  sub="Tekan hanya kalau kartunya benar-benar sudah ada di tanganmu. Tanggal terima ditulis sekali dan tidak bisa dibatalkan."
                >
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[11.5px] text-zinc-500">Catatan kondisi (dari pencatatan awal)</p>
                    <p className="mt-1 text-[12px] leading-relaxed text-white">{c.conditionNote}</p>
                    <p className="mt-2 text-[10.5px] leading-relaxed text-zinc-500">
                      Tidak bisa diedit di sini. Kalau ada yang perlu diluruskan, tulis koreksi di
                      tab Legalitas Kartu — koreksi disimpan sebagai catatan baru, jadi terlihat
                      sebagai koreksi.
                    </p>
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <label className="block">
                      <FieldLabel required>Lokasi penyimpanan</FieldLabel>
                      <input
                        value={storageLocation}
                        onChange={(e) => setStorageLocation(e.target.value)}
                        placeholder="mis. Rak A-3, Jakarta"
                        className={INPUT}
                      />
                      <span className="mt-1 block text-[10.5px] text-zinc-500">
                        Kartu orang lain yang tidak tercatat ada di rak mana adalah kartu yang
                        belum benar-benar kita pegang.
                      </span>
                    </label>
                    <label className="block">
                      <FieldLabel>Nomor / arsip tanda terima</FieldLabel>
                      <input
                        value={receiptRef}
                        onChange={(e) => setReceiptRef(e.target.value)}
                        placeholder="opsional"
                        className={INPUT}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <FieldLabel>Catatan serah terima</FieldLabel>
                      <input
                        value={acceptNote}
                        onChange={(e) => setAcceptNote(e.target.value)}
                        placeholder="opsional — mis. “diserahkan langsung oleh pemilik, disaksikan kakaknya”"
                        className={INPUT}
                      />
                    </label>
                  </div>

                  {/* DIKATAKAN SEBELUM TOMBOLNYA DITEKAN, bukan cuma di dialog konfirmasi: inilah
                      kalimat yang menentukan apa yang operator janjikan ke pemilik kartu. */}
                  {afterAcceptBlockers.length > 0 && (
                    <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100">
                      Menerima kartu ini <strong>tidak</strong> membuatnya bisa dipajang:{" "}
                      {afterAcceptBlockers.join(" dan ")}. Custody-nya tetap tercatat dan kartunya
                      tetap bisa ditarik kembali kapan saja — tapi jangan menjanjikan “nanti kami
                      pajangkan” sebelum itu beres.{afterAcceptFix}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <ActionButton
                      enabled={!busy && acceptBlockers.length === 0}
                      onClick={() => setConfirm({ kind: "ACCEPT" })}
                    >
                      Terima kartu
                    </ActionButton>
                    <Hint>
                      {acceptBlockers.length === 0
                        ? "Bukti lengkap."
                        : `Belum bisa: ${acceptBlockers.join(", ")}.`}
                    </Hint>
                  </div>
                </Section>
              )}

              {/* ── HARGA & LISTING ── */}
              {(c.listing || can("PRICE")) && (
                <Section
                  title="Harga & Listing"
                  sub="Harga di perjanjian dan harga di marketplace ditulis dalam satu transaksi, jadi keduanya tidak bisa berbeda."
                >
                  <div className={`grid gap-5 ${can("PRICE") ? "lg:grid-cols-2" : ""}`}>
                    <div>
                      {c.listing ? (
                        <>
                          <KV
                            plain
                            label="Listing"
                            value={
                              <Link
                                href={`/marketplace/${c.listing.id}`}
                                className="font-semibold text-yellow-400 hover:underline"
                              >
                                {c.listing.id}
                              </Link>
                            }
                          />
                          <KV plain label="Status Listing" value={<ListingStatusPill status={c.listing.status} />} />
                          <KV
                            plain
                            label="Harga listing (Sekarang)"
                            value={<span className="font-semibold text-yellow-400">{rp(c.listing.priceIdrx)}</span>}
                          />
                          <KV
                            plain
                            label="Dipajang"
                            value={<span className="font-semibold text-yellow-400">{dt(c.listing.listedAt)}</span>}
                          />
                          {c.listing.soldAt && (
                            <KV
                              plain
                              label="Terjual"
                              value={<span className="font-semibold text-emerald-300">{dt(c.listing.soldAt)}</span>}
                            />
                          )}
                        </>
                      ) : (
                        <KV
                          plain
                          label="Harga yang disepakati"
                          value={<span className="font-semibold text-yellow-400">{rp(c.askPriceIdr)}</span>}
                        />
                      )}

                      {/* Perubahan harga terakhir beserta alasannya, langsung dari riwayat — supaya
                          "kenapa harganya segini" terjawab tanpa membuka tab Legalitas. */}
                      {lastPriceEvent && (
                        <div className="py-2.5">
                          <div className="flex items-start justify-between gap-4">
                            <span className="shrink-0 text-[12px] text-zinc-500">Perubahan harga terakhir</span>
                            <span className="text-right text-[12px] font-medium text-white">
                              {dt(lastPriceEvent.createdAt)}
                              {lastPriceEvent.actorLabel ? (
                                <span className="font-normal text-zinc-500"> · {lastPriceEvent.actorLabel}</span>
                              ) : null}
                            </span>
                          </div>
                          {lastPriceEvent.note && (
                            <p className="mt-1.5 rounded-lg bg-white/[0.04] px-3 py-2 text-[11.5px] leading-relaxed text-zinc-300">
                              {prettyRupiah(lastPriceEvent.note)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Lantai harga yang disepakati di depan pemiliknya — FAKTA di kartu harga,
                          bukan hanya peringatan yang muncul saat sudah dilanggar. */}
                      {c.reservePriceIdr != null && c.reservePriceIdr > 0 && (
                        <KV
                          plain
                          label="Harga terendah yang disepakati"
                          value={<span className="text-amber-200">{rp(c.reservePriceIdr)}</span>}
                        />
                      )}

                      {/* Keadaan SEKARANG, dijawab server: kartu orang SEDANG dipajang di bawah lantai
                          yang dijanjikan kepadanya. */}
                      {c.belowReserve && (
                        <p className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100">
                          Harga yang berlaku sekarang{" "}
                          {c.effectivePriceIdr != null ? `(${rp(c.effectivePriceIdr)}) ` : ""}ada DI
                          BAWAH harga terendah yang disepakati dengan pemiliknya
                          {c.reservePriceIdr != null ? ` (${rp(c.reservePriceIdr)})` : ""}. Pastikan
                          dia memang menyetujuinya — kalau belum, naikkan lagi atau hubungi dia hari
                          ini.
                        </p>
                      )}

                      <p className="mt-3 text-[11.5px] leading-relaxed text-zinc-500">
                        Harga adalah bagian dari perjanjian yang ditandatangani pemilik kartu — beri
                        tahu dia sebelum mengubahnya.
                      </p>
                    </div>

                    {can("PRICE") && (
                      <div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <FieldLabel>Harga baru (Rp)</FieldLabel>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-white">
                                Rp
                              </span>
                              <input
                                value={groupDigits(newPrice)}
                                onChange={(e) => setNewPrice(onlyDigits(e.target.value))}
                                inputMode="numeric"
                                placeholder="0"
                                aria-invalid={priceOutOfRange || undefined}
                                className={`${INPUT} pl-10 ${
                                  priceOutOfRange ? "border-red-400/60 focus:border-red-400/70" : ""
                                }`}
                              />
                            </div>
                            {/* Selisihnya langsung terbaca — salah ketik "kurang satu nol" ketahuan
                                di sini, bukan sesudah tersimpan. */}
                            {priceDelta !== 0 && !priceOutOfRange && (
                              <span
                                className={`mt-1.5 block text-[11px] font-medium ${
                                  priceDelta < 0 ? "text-amber-200" : "text-emerald-300"
                                }`}
                              >
                                {priceDelta < 0 ? "Turun" : "Naik"} {rp(Math.abs(priceDelta))}
                                {currentPrice > 0
                                  ? ` (${((Math.abs(priceDelta) / currentPrice) * 100).toLocaleString("id-ID", {
                                      maximumFractionDigits: 1,
                                    })}%)`
                                  : ""}{" "}
                                dari harga sekarang
                              </span>
                            )}
                          </label>
                          <label className="block">
                            <FieldLabel>Alasan perubahan</FieldLabel>
                            <textarea
                              value={priceNote}
                              onChange={(e) => setPriceNote(e.target.value)}
                              rows={3}
                              placeholder="tulis alasan perubahan"
                              title="mis. “pemilik setuju turun harga lewat WA, 19 Sep”"
                              className={`${INPUT} resize-y leading-relaxed`}
                            />
                            {priceNoteLen > 0 && priceNoteLen < NOTE_MIN && (
                              <span className="mt-1 block text-[10.5px] text-zinc-500">
                                {priceNoteLen}/{NOTE_MIN} karakter minimal
                              </span>
                            )}
                          </label>
                        </div>

                        {priceOutOfRange ? (
                          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-red-200">
                            Harga ini tidak bisa ditagihkan ke pembeli. Rentang yang bisa dibayar:{" "}
                            {chargeablePriceRange()}.
                          </p>
                        ) : (
                          reserveWarning(newPriceNum, c.reservePriceIdr) && (
                            <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-100">
                              {reserveWarning(newPriceNum, c.reservePriceIdr)}
                            </p>
                          )
                        )}

                        <div className="mt-3">
                          <ActionButton
                            full
                            enabled={priceReady}
                            onClick={() =>
                              void run(async () => {
                                const row = await setAdminConsignmentPrice(
                                  c.id,
                                  { askPriceIdr: newPriceNum, note: priceNote.trim() },
                                  token ?? "",
                                );
                                setNewPrice("");
                                setPriceNote("");
                                return row;
                              }, "Harga diperbarui.")
                            }
                          >
                            {busy ? "Memproses…" : "Simpan harga"}
                          </ActionButton>
                          {/* Kalimat status hanya muncul setelah operator mulai mengisi — tombol
                              abu-abu di form yang masih kosong sudah cukup jelas sendiri. */}
                          {(newPrice !== "" || priceNoteLen > 0) && (
                            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                              {newPrice === ""
                                ? "Isi harga barunya dulu."
                                : priceOutOfRange
                                  ? "Harga di luar rentang yang bisa ditagihkan."
                                  : priceSame
                                    ? "Harga baru sama dengan harga sekarang."
                                    : priceNoteLen < NOTE_MIN
                                      ? `Tulis alasannya dulu (minimal ${NOTE_MIN} karakter).`
                                      : `Pemilik menerima ± ${rp(estimatedPayout(newPriceNum, c.commissionBps))} setelah komisi ${commissionPct(c.commissionBps)}%. Alasannya tersimpan di riwayat.`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── PAJANG DI MARKETPLACE (kartu di Hoshi, belum tayang) ── */}
              {can("LIST") && (
                <Section
                  title="Pajang di marketplace"
                  sub="Baru mungkin karena kartunya sudah ada di Hoshi. Listing-nya terikat ke titipan ini, jadi tidak bisa ada listing tanpa kartunya."
                >
                  {/* Dua penghalang yang BERBEDA, dan keduanya ditampilkan kalau keduanya berlaku. */}
                  {awaitingClaim && (
                    <p className="rounded-xl border border-violet-400/30 bg-violet-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-violet-100">
                      Kartu ini belum diklaim pemiliknya, jadi belum ada akun yang akan menerima
                      hasil penjualannya — memajangnya sekarang berarti menawarkan kartu yang uangnya
                      tidak punya tujuan. Kirim ulang kode klaimnya lewat panel ungu di atas, lalu
                      pajang setelah ia mengklaimnya.
                    </p>
                  )}
                  {rawUnlistable && (
                    <p
                      className={`rounded-xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100 ${
                        awaitingClaim ? "mt-3" : ""
                      }`}
                    >
                      Kartu ini tidak punya grading, dan kartu tanpa grading belum bisa dipajang:
                      kolom grader pada listing hanya mengenal PSA/TAG/CGC/BGS, dan mengisinya
                      berarti memberi label palsu pada kartu orang lain. Kalau slab-nya sebenarnya
                      ada, betulkan lewat “Koreksi data kartu” di tab Legalitas Kartu.
                    </p>
                  )}
                  {!awaitingClaim && !rawUnlistable && (
                    <>
                      <label className="block max-w-sm">
                        <FieldLabel required>Harga (Rp)</FieldLabel>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-white">
                            Rp
                          </span>
                          <input
                            value={groupDigits(listPrice)}
                            onChange={(e) => setListPrice(onlyDigits(e.target.value))}
                            inputMode="numeric"
                            className={`${INPUT} pl-11`}
                          />
                        </div>
                        <span className="mt-1 block text-[10.5px] text-zinc-500">
                          Pemilik menerima ± {rp(estimatedPayout(Number(listPrice) || 0, c.commissionBps))}{" "}
                          setelah komisi {commissionPct(c.commissionBps)}%.
                          {c.reservePriceIdr != null && c.reservePriceIdr > 0 && (
                            <> Harga terendah yang disepakati: {rp(c.reservePriceIdr)}.</>
                          )}
                        </span>
                        {/* Lantai harga dipasang DI SINI juga, di detik harga pajang pertama
                            ditentukan — bukan hanya di layar ubah harga. */}
                        {reserveWarning(Number(listPrice) || 0, c.reservePriceIdr) && (
                          <span className="mt-1.5 block rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
                            {reserveWarning(Number(listPrice) || 0, c.reservePriceIdr)}
                          </span>
                        )}
                      </label>

                      <div className="mt-5">
                        <FieldLabel>Gambar yang dilihat pembeli</FieldLabel>
                        <p className="mb-3 text-[11.5px] leading-relaxed text-zinc-500">
                          Sudah dipilih otomatis dari foto depan & belakang terbaru. Ketuk gambarnya
                          kalau fotonya tertukar. Gambar belakang boleh dikosongkan.
                        </p>
                        <BuyerImageSlots
                          photos={photos}
                          front={listImage}
                          back={listImageBack}
                          onFront={setListImage}
                          onBack={(v) => {
                            setBackTouched(true);
                            setListImageBack(v);
                          }}
                        />
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <ActionButton
                          enabled={!busy && !!listImage && !!listPrice && isChargeablePrice(Number(listPrice))}
                          onClick={() =>
                            void run(
                              () =>
                                listAdminConsignment(
                                  c.id,
                                  {
                                    image: listImage,
                                    // Hanya dikirim kalau memang ada. String kosong ditolak validator
                                    // server, dan kartu yang belakangnya tidak dipotret itu wajar.
                                    ...(listImageBack ? { imageBack: listImageBack } : {}),
                                    ...(listPrice ? { priceIdrx: Number(listPrice) } : {}),
                                  },
                                  token ?? "",
                                ),
                              "Kartu dipajang.",
                            )
                          }
                        >
                          {busy ? "Memproses…" : "Pajang sekarang"}
                        </ActionButton>
                        <Hint>
                          {!listImage
                            ? "Pilih dulu gambar depan."
                            : !listPrice
                              ? "Isi harga dulu."
                              : !isChargeablePrice(Number(listPrice))
                                ? `Harga di luar rentang yang bisa ditagihkan (${chargeablePriceRange()}).`
                                : "Siap dipajang."}
                        </Hint>
                      </div>
                    </>
                  )}
                </Section>
              )}

              {/* ══ GAMBAR KARTU YANG SUDAH TAYANG MASIH BISA DIPERBAIKI ══
                  Hanya untuk listing ACTIVE. Baris yang sudah TERJUAL adalah catatan tentang apa
                  yang DILIHAT pembeli saat ia membayar — server menolaknya juga. */}
              {c.listing && c.listing.status === "ACTIVE" && (
                <Section
                  title="Gambar yang dilihat pembeli"
                  sub="Ini yang muncul di halaman kartu. Kalau ada gambar belakang, pembeli dapat tombol untuk membalik kartunya. Ketuk gambarnya untuk mengganti dengan foto bukti lain — foto buktinya sendiri tidak ikut berubah."
                  right={
                    <>
                      <Hint>{imagesChanged ? "Ada perubahan yang belum disimpan" : "Belum ada yang diubah"}</Hint>
                      <ActionButton
                        enabled={!busy && !!listImage && imagesChanged}
                        onClick={() =>
                          void run(
                            () =>
                              setAdminConsignmentListingImages(
                                c.id,
                                {
                                  // HANYA yang benar-benar berubah yang dikirim — supaya baris audit
                                  // tidak berbunyi "gambar diganti" untuk sisi yang tidak disentuh.
                                  ...(listImage !== c.listing?.image ? { image: listImage } : {}),
                                  // `null` (bukan string kosong) adalah perintah HAPUS yang dikenal
                                  // server; `@IsImageRef` menolak string kosong.
                                  ...(backChanged ? { imageBack: listImageBack || null } : {}),
                                },
                                token ?? "",
                              ),
                            "Gambar di halaman pembeli sudah diganti.",
                          )
                        }
                      >
                        {busy ? "Memproses…" : "Simpan Gambar"}
                      </ActionButton>
                    </>
                  }
                >
                  <BuyerImageSlots
                    photos={photos}
                    front={listImage}
                    back={listImageBack}
                    onFront={setListImage}
                    onBack={(v) => {
                      setBackTouched(true);
                      setListImageBack(v);
                    }}
                  />
                </Section>
              )}
            </div>
          )}

          {/* ═════════════════════════════ TAB: LEGALITAS KARTU ═════════════════════════════ */}
          {tab === "LEGAL" && (
            <div className="space-y-4">
              <Section title="Catatan serah terima">
                <div className="grid gap-x-10 lg:grid-cols-2">
                  <div>
                    {/* Baris ini tidak boleh berbunyi "—" untuk kartu yang belum diklaim: tanda
                        hubung terbaca seperti data yang lupa diisi. */}
                    <KV
                      label="Pemilik (akun)"
                      value={
                        c.consignorId ? (
                          <span className="break-all">
                            {`${c.consignor?.displayName ?? "—"} · ${c.consignor?.walletAddress ?? c.consignorId}`}
                          </span>
                        ) : (
                          <span className="text-violet-200">
                            Belum diklaim — belum tersambung ke akun Hoshi mana pun
                            {c.claimCodeExpiresAt
                              ? `. Kode klaim berlaku sampai ${dt(c.claimCodeExpiresAt)}`
                              : ""}
                          </span>
                        )
                      }
                    />
                    <KV label="Nama di tanda terima" value={c.consignorNameAtIntake} />
                    <KV label="No. Hp" value={c.consignorPhoneAtIntake} />
                    <KV
                      label="Identitas"
                      value={
                        c.consignorIdKind
                          ? `${c.consignorIdKind} ··· ${c.consignorIdLast4 ?? "????"}`
                          : "—"
                      }
                    />
                    <KV label="Diterima oleh" value={receiverLabel ?? "—"} />
                    <KV label="Tempat serah terima" value={c.receivedAtPlace || "—"} />
                    {/* KAPAN dan LEWAT MANA pemiliknya tertaut — hanya kalau memang sudah terjadi.
                        "Lewat mana" menjawab "dari mana kalian tahu ini orangnya" kelak. */}
                    {c.consignorLinkedAt && (
                      <KV
                        label="Pemilik tertaut"
                        value={`${dt(c.consignorLinkedAt)}${
                          consignorLinkMethodLabel(c.consignorLinkMethod)
                            ? ` · ${consignorLinkMethodLabel(c.consignorLinkMethod)}`
                            : ""
                        }`}
                      />
                    )}
                    <KV label="Dicatat" value={dt(c.createdAt)} />
                    <KV label="Diterima" value={dt(c.custodyAcceptedAt)} />
                  </div>
                  <div>
                    <KV
                      label="Set / nomor"
                      value={[c.cardSet, c.cardNumber].filter(Boolean).join(" · ") || "—"}
                    />
                    <KV
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
                    <KV label="Penyimpanan" value={c.storageLocation ?? "—"} />
                    <KV label="Tanda terima" value={c.intakeReceiptRef ?? "—"} />
                    <KV label="Perjanjian" value={c.agreementRef ?? "—"} />
                    <KV label="Kondisi saat diterima" value={c.conditionNote} />
                    {c.rawCondition && <KV label="Kondisi (kode)" value={c.rawCondition} />}
                    <KV label="Keluar" value={c.custodyReleasedAt ? dt(c.custodyReleasedAt) : "-"} />
                    {c.soldOrderId && <KV label="Order penjualan" value={c.soldOrderId} />}
                    {c.payoutIdrx != null && <KV label="Dibayar ke pemilik" value={rp(c.payoutIdrx)} />}
                    {c.commissionIdrx != null && <KV label="Komisi Hoshi" value={rp(c.commissionIdrx)} />}
                  </div>
                </div>

                {can("CORRECTION") && (
                  <div className="mt-6">
                    <p className="text-[12px] font-semibold text-white">
                      Bila ada koreksi, silakan isi kolom di bawah!
                    </p>
                    <label className="mt-4 block">
                      <FieldLabel>Tulis koreksi/catatan</FieldLabel>
                      <textarea
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        rows={3}
                        placeholder="Apa yang keliru dan apa yang benar. Catatan lama tetap tersimpan apa adanya."
                        className={`${INPUT} resize-y leading-relaxed`}
                      />
                    </label>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-500">
                      Tidak menimpa apa pun — ditulis sebagai catatan baru di riwayat. Untuk data
                      kartu yang salah ketik (nama, set, nomor, sertifikat, grader), pakai “Koreksi
                      data kartu” di bawah: yang itu memang membetulkan kolomnya.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <ActionButton
                        enabled={!busy && correction.trim().length >= NOTE_MIN}
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
                      >
                        Simpan koreksi
                      </ActionButton>
                      <Hint>
                        {correction.trim() === ""
                          ? "Belum ada yang diisi"
                          : correction.trim().length < NOTE_MIN
                            ? `Minimal ${NOTE_MIN} karakter`
                            : "Siap disimpan"}
                      </Hint>
                    </div>
                  </div>
                )}
              </Section>

              {/* ── KOREKSI DATA KARTU ───────────────────────────────────────────────────────────
                  TERPISAH dari "Tulis koreksi" di atasnya, dan pemisahan itu adalah isinya:
                  koreksi naratif TIDAK menimpa apa pun, sedangkan panel ini satu-satunya yang
                  MENIMPA kolom identitas kartu — dan judul publiknya. */}
              {can("CORRECTION") && (
                <Section
                  title="Koreksi data kartu"
                  sub="Untuk data yang memang SALAH ketik, bukan yang berubah pikiran. Kolomnya ditimpa dan judul publiknya ikut diperbaiki; nilai lamanya tersimpan di riwayat dan bisa dibaca pemilik kartu sendiri. Catatan kondisi dan foto tidak bisa diubah dari sini."
                >
                  <LabelCorrectionPanel
                    /* Disemai ulang setiap kali barisnya dibaca ulang dari server — bukan setiap
                       kali `c` berubah: penyimpanan yang berhasil sudah menyemai formulirnya
                       sendiri dari respons, dan remount di situ akan menghapus pesan berhasilnya. */
                    key={rowEpoch}
                    c={c}
                    token={token ?? ""}
                    onUpdated={setC}
                    onReload={() => void load()}
                  />
                </Section>
              )}

              {/* ── RIWAYAT ── */}
              {c.events && c.events.length > 0 && (
                <Section
                  title="Riwayat"
                  sub="Siapa melakukan apa, dan kapan. Tidak ada baris yang bisa diubah atau dihapus."
                >
                  <ol className="space-y-3.5">
                    {[...c.events].reverse().map((e) => (
                      <li key={e.id} className="border-l-2 border-white/10 pl-3.5">
                        <p className="text-[12px] font-semibold text-white">
                          {eventTitle(e.kind)}
                          {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
                            <span className="ml-2 text-[10.5px] font-normal text-zinc-500">
                              {e.fromStatus} → {e.toStatus}
                            </span>
                          )}
                        </p>
                        <p className="text-[10.5px] text-zinc-500">
                          {dt(e.createdAt)}
                          {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                        </p>
                        {e.note && (
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">{prettyRupiah(e.note)}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}
            </div>
          )}

          {/* ═════════════════════════════ TAB: PENGAMBILAN KARTU ═════════════════════════════ */}
          {tab === "PICKUP" && (
            <Section
              title="Kartu keluar dari Hoshi"
              sub="Bagian ini mencatat pengembalian kartu kepada pemiliknya dan serah terima fisiknya. Setiap tindakan tercatat di riwayat dan tidak menghapus data serah terima sebelumnya."
            >
              <div className="space-y-4">
                {/* Sudah pulang: resi/penerimanya ditampilkan supaya "benar sampai?" punya jawaban
                    yang bisa diperiksa pemiliknya sendiri, bukan sekadar "kata Hoshi". */}
                {c.custodyReleasedAt && c.releaseReason === "WITHDRAWN" && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12px] leading-relaxed text-zinc-200">
                    <strong className="text-white">Kartu sudah dikembalikan ke pemiliknya</strong>{" "}
                    pada {dt(c.custodyReleasedAt)} —{" "}
                    {returnMethodLabel(c.returnMethod) ?? "cara pengembalian tidak tercatat"}.
                    {c.returnTrackingNo && (
                      <>
                        {" "}
                        Resi <strong className="text-white">{c.returnTrackingNo}</strong>
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
                {c.custodyReleasedAt && c.releaseReason === "SHIPPED_TO_BUYER" && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12px] leading-relaxed text-zinc-200">
                    <strong className="text-white">Kartu sudah diserahkan ke pembeli</strong> pada{" "}
                    {dt(c.custodyReleasedAt)}.
                  </div>
                )}

                {can("RETURN") && (
                  <>
                    <SubBox
                      title={
                        c.status === "INTAKE"
                          ? "Pemilik batal menitipkan"
                          : "Pemilik minta kartunya kembali"
                      }
                    >
                      {c.status === "INTAKE" ? (
                        <p className="text-[12px] leading-relaxed text-zinc-500">
                          Kesepakatan dibatalkan. Tidak ada kartu yang pernah berpindah, jadi tidak
                          ada yang perlu diserahkan.
                        </p>
                      ) : (
                        <>
                          <p className="text-[12px] leading-relaxed text-zinc-500">
                            Catat permintaan pengembalian kartu dari pemilik. Jika kartu sedang
                            ditampilkan di marketplace, listing akan dinonaktifkan dan status kartu
                            diperbarui menjadi tidak dipajang. Tidak ada biaya administrasi untuk
                            pengajuan pengembalian.
                          </p>
                          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
                            Jika kartu telah terjual sebelum permintaan diproses, permintaan
                            pengembalian tidak dapat dilanjutkan. Transaksi penjualan tetap berlaku
                            dan hasil penjualan masuk ke saldo pemilik.
                          </p>
                        </>
                      )}
                      <label className="mt-4 block">
                        <FieldLabel>Catatan permintaan (opsional)</FieldLabel>
                        <input
                          value={returnNote}
                          onChange={(e) => setReturnNote(e.target.value)}
                          placeholder="Diminta langsung saat kunjungan"
                          className={INPUT}
                        />
                      </label>
                    </SubBox>

                    {/* ── KE MANA KARTUNYA PULANG ─────────────────────────────────────────────
                        TIDAK ditampilkan untuk baris INTAKE: di sana kartunya tidak pernah
                        berpindah tangan, dan server memang menolak alamat untuk baris seperti itu. */}
                    {c.status !== "INTAKE" && (
                      <SubBox title="Ke mana kartunya dikembalikan?">
                        <p className="text-[12px] leading-relaxed text-zinc-500">
                          Lengkapi informasi pengembalian untuk memastikan kartu dikirimkan atau
                          diserahkan kepada penerima yang tepat. Informasi alamat dapat dilengkapi
                          kemudian, tetapi harus tersedia sebelum kartu dapat ditandai telah dikirim.
                        </p>

                        <div className="mt-4">
                          <PillToggle<ConsignmentReturnMethod>
                            value={retMethod}
                            onChange={setRetMethod}
                            options={[
                              { value: "COURIER", label: "Dikirim ke alamat penerima" },
                              { value: "PICKUP", label: "Diambil langsung oleh penerima" },
                            ]}
                          />
                        </div>

                        {retMethod === "COURIER" ? (
                          <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="block">
                              <FieldLabel>Nama penerima</FieldLabel>
                              <input
                                value={retName}
                                onChange={(e) => setRetName(e.target.value)}
                                placeholder="Masukkan nama lengkap penerima."
                                className={INPUT}
                              />
                            </label>
                            <label className="block">
                              <FieldLabel>Nomor telepon penerima</FieldLabel>
                              <input
                                value={retPhone}
                                onChange={(e) => setRetPhone(e.target.value)}
                                inputMode="tel"
                                placeholder="Masukkan nomor telepon aktif penerima."
                                className={INPUT}
                              />
                            </label>
                            <label className="block sm:col-span-2">
                              <FieldLabel>Alamat jalan</FieldLabel>
                              <input
                                value={retStreet}
                                onChange={(e) => setRetStreet(e.target.value)}
                                placeholder="Masukkan nama jalan, nomor rumah, dan alamat lengkap."
                                className={INPUT}
                              />
                            </label>
                            <label className="block sm:col-span-2">
                              <FieldLabel>Detail alamat (opsional)</FieldLabel>
                              <input
                                value={retApt}
                                onChange={(e) => setRetApt(e.target.value)}
                                placeholder="Unit / blok / patokan"
                                className={INPUT}
                              />
                            </label>
                            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
                              <label className="block">
                                <FieldLabel>Kota / Kabupaten</FieldLabel>
                                <input
                                  value={retCity}
                                  onChange={(e) => setRetCity(e.target.value)}
                                  placeholder="Masukkan nama kota atau kabupaten."
                                  className={INPUT}
                                />
                              </label>
                              <label className="block">
                                <FieldLabel>Provinsi</FieldLabel>
                                {provinces && provinces.length > 0 ? (
                                  <div className="relative">
                                    <select
                                      value={retState}
                                      onChange={(e) => setRetState(e.target.value)}
                                      className={`${INPUT} appearance-none pr-10 ${retState ? "" : "text-zinc-500"}`}
                                      style={{ colorScheme: "dark" }}
                                    >
                                      <option value="">Pilih provinsi tujuan</option>
                                      {/* Nilai lama yang tidak ada di daftar (diketik bebas dulu)
                                          tetap ditampilkan, supaya tidak hilang diam-diam. */}
                                      {retState && !provinces.includes(retState) && (
                                        <option value={retState}>{retState}</option>
                                      )}
                                      {provinces.map((p) => (
                                        <option key={p} value={p}>
                                          {p}
                                        </option>
                                      ))}
                                    </select>
                                    <svg
                                      aria-hidden
                                      viewBox="0 0 24 24"
                                      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  </div>
                                ) : (
                                  <input
                                    value={retState}
                                    onChange={(e) => setRetState(e.target.value)}
                                    placeholder={
                                      provinces === null && !provincesFailed
                                        ? "Memuat daftar provinsi…"
                                        : "Tulis nama provinsi"
                                    }
                                    className={INPUT}
                                  />
                                )}
                              </label>
                              <label className="block">
                                <FieldLabel>Kode Pos</FieldLabel>
                                <input
                                  value={retZip}
                                  onChange={(e) => setRetZip(onlyDigits(e.target.value))}
                                  inputMode="numeric"
                                  placeholder="Masukkan kode pos tujuan."
                                  className={INPUT}
                                />
                              </label>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-4 rounded-lg bg-black/25 px-3.5 py-2.5 text-[12px] leading-relaxed text-zinc-400">
                            Diambil langsung tidak butuh alamat. Yang dicatat nanti, saat kartunya
                            benar-benar diserahkan, adalah <strong>siapa</strong> yang datang
                            mengambil — dan itu ditanyakan di bagian “Kartu fisik sudah keluar”.
                          </p>
                        )}

                        {/* ── SIAPA YANG MENANGGUNG ONGKIR BALIK ──────────────────────────────
                            DICATAT, BUKAN DITAGIHKAN. Tidak ada tagihan yang terbit dari sini dan
                            tidak ada saldo yang dipotong: menarik kartu tetap gratis bagi
                            pemiliknya. Sengaja TANPA pilihan bawaan. */}
                        <div className="mt-5">
                          <FieldLabel>Penanggung Biaya Pengiriman</FieldLabel>
                          <div className="flex flex-wrap items-center gap-3">
                            <PillToggle<ConsignmentReturnPayer>
                              value={retPayer}
                              onChange={(p) => setRetPayer(retPayer === p ? "" : p)}
                              options={[
                                { value: "OWNER", label: "Pemilik kartu" },
                                { value: "HOSHI", label: "Hoshi" },
                              ]}
                            />
                            <div className="relative w-full sm:w-60">
                              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-white">
                                Rp
                              </span>
                              <input
                                value={groupDigits(retFee)}
                                onChange={(e) => setRetFee(onlyDigits(e.target.value))}
                                inputMode="numeric"
                                placeholder="Biaya pengiriman (Rp)"
                                className={`${INPUT} pl-11`}
                              />
                            </div>
                          </div>
                          <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
                            Kosongkan biayanya untuk ditaksir otomatis dari tarif wilayah tujuan —
                            tarif yang sama dengan pengiriman kartu biasa; wilayah yang tidak
                            dikenali memakai tarif cadangan yang lebih mahal. Ini{" "}
                            <strong className="text-zinc-300">catatan, bukan tagihan</strong>: tidak
                            ada uang yang berpindah dan pemilik kartu tidak ditagih dari sini.
                          </p>
                        </div>

                        {/* Hanya kalau alamatnya SUDAH mulai diisi tapi belum lengkap. Formulir yang
                            masih kosong tidak perlu diperingatkan — kalimat di samping tombol sudah
                            bilang tujuannya boleh dilengkapi nanti. */}
                        {retMethod === "COURIER" && !typedPlan && addressStarted && (
                          <p className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-100">
                            Alamatnya belum lengkap, jadi <strong>alamat tidak akan ikut tersimpan</strong>{" "}
                            — permintaan kembalinya tetap dicatat. Lengkapi nanti lewat tombol yang
                            sama; kartunya tidak bisa ditandai terkirim sebelum itu.
                          </p>
                        )}
                      </SubBox>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <ActionButton enabled={!busy} onClick={() => setConfirm({ kind: "RETURN" })}>
                        {c.status === "INTAKE"
                          ? "Batalkan kesepakatan"
                          : c.withdrawRequestedAt
                            ? "Perbarui tujuan pengembalian"
                            : "Catat permintaan pengembalian"}
                      </ActionButton>
                      {c.status !== "INTAKE" && (
                        <Hint>
                          {typedPlan
                            ? "Siap dicatat bersama tujuannya."
                            : retMethod === "COURIER"
                              ? "Tujuan boleh dilengkapi nanti — permintaannya tetap dicatat."
                              : "Siap dicatat."}
                        </Hint>
                      )}
                    </div>
                  </>
                )}

                {can("RELEASE") && release && (
                  <SubBox title="Kartu fisik sudah keluar">
                    <p className="text-[12px] leading-relaxed text-zinc-500">
                      Dicatat saat kartunya benar-benar berpindah tangan. Untuk kartu yang sudah
                      terjual, pengirimannya biasanya sudah tercatat otomatis dari layar “Kirim
                      Kartu” — pakai ini kalau serah terimanya dilakukan langsung.
                    </p>
                    <p className="mt-3 rounded-lg bg-black/25 px-3.5 py-2.5 text-[12px] text-zinc-300">
                      Yang akan dicatat: <strong className="text-white">{release.label}</strong>
                      {release.value === "WITHDRAWN" && effectiveReturnMethod && (
                        <> · {returnMethodLabel(effectiveReturnMethod)}</>
                      )}
                    </p>

                    {/* ── BUKTI SERAH TERIMA PENGEMBALIAN ──────────────────────────────────────
                        Hanya untuk pengembalian ke PEMILIK. Pengiriman ke pembeli punya jalurnya
                        sendiri, dan satu kiriman tidak boleh punya dua nomor resi. */}
                    {release.value === "WITHDRAWN" && (
                      <div className="mt-4">
                        {effectiveReturnMethod == null ? (
                          <p className="rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-100">
                            Tujuan pengembaliannya belum dicatat, jadi kartu ini belum bisa
                            dinyatakan keluar. Isi dulu <strong>“Ke mana kartunya dikembalikan?”</strong>{" "}
                            di atas — server menolak selama itu kosong.
                          </p>
                        ) : effectiveReturnMethod === "COURIER" ? (
                          <>
                            <FieldLabel>Nomor resi</FieldLabel>
                            <p className="-mt-1 mb-3 text-[11.5px] leading-relaxed text-zinc-500">
                              Tanpa resi, “sudah dikirim” tidak bisa diperiksa oleh pemilik kartunya
                              sendiri.
                              {storedReturnAddress && (
                                <>
                                  {" "}
                                  Tujuan tercatat:{" "}
                                  <span className="text-zinc-300">{storedReturnAddress}</span>.
                                </>
                              )}
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
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
                            <FieldLabel>Siapa yang mengambil kartunya?</FieldLabel>
                            <p className="-mt-1 mb-3 text-[11.5px] leading-relaxed text-zinc-500">
                              Nama orang yang benar-benar berdiri di depanmu, dan dasar kamu yakin
                              ia berhak menerimanya.
                            </p>
                            <input
                              value={retPickedUpBy}
                              onChange={(e) => setRetPickedUpBy(e.target.value)}
                              placeholder="mis. “Budi Santoso (pemilik), KTP dicocokkan dengan catatan intake”"
                              className={INPUT}
                            />
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <FieldLabel>Nomor / arsip tanda terima keluar</FieldLabel>
                        <input
                          value={releaseReceipt}
                          onChange={(e) => setReleaseReceipt(e.target.value)}
                          placeholder="opsional"
                          className={INPUT}
                        />
                      </label>
                      <label className="block">
                        <FieldLabel required>Catatan serah terima</FieldLabel>
                        <input
                          value={releaseNote}
                          onChange={(e) => setReleaseNote(e.target.value)}
                          placeholder="mis. “diserahkan ke kurir JNE di loket Kemang”"
                          className={INPUT}
                        />
                      </label>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <ActionButton
                        enabled={
                          !busy &&
                          releaseNote.trim().length >= NOTE_MIN &&
                          returnReleaseBlockers.length === 0
                        }
                        onClick={() => setConfirm({ kind: "RELEASE" })}
                      >
                        Catat kartu keluar
                      </ActionButton>
                      <Hint>
                        {returnReleaseBlockers.length > 0
                          ? `Belum bisa — kurang: ${returnReleaseBlockers.join(", ")}.`
                          : releaseNote.trim().length < NOTE_MIN
                            ? `Tulis catatan serah terimanya (minimal ${NOTE_MIN} karakter).`
                            : "Siap dicatat."}
                      </Hint>
                    </div>
                  </SubBox>
                )}

                {!can("RETURN") && !(can("RELEASE") && release) && !c.custodyReleasedAt && (
                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12px] leading-relaxed text-zinc-400">
                    {c.status === "LOST"
                      ? "Kartu ini tercatat hilang / rusak, jadi tidak ada kartu yang bisa dikembalikan. Lanjutannya ada di tab Kartu Hilang."
                      : c.status === "CANCELLED"
                        ? "Kesepakatan dibatalkan sebelum serah terima — tidak ada kartu yang perlu dikembalikan."
                        : "Keadaan titipan ini tidak mengizinkan pengembalian dari layar ini."}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* ═════════════════════════════ TAB: KARTU HILANG ═════════════════════════════ */}
          {tab === "LOST" && (
            <div className="space-y-4">
              {c.status === "LOST" && (
                <Section
                  danger
                  title="Kartu tercatat hilang / rusak"
                  sub={`Dicatat pada ${dt(c.custodyReleasedAt)}. Kartu ini tidak bisa dijual, dikirim, atau dipajang lagi. Hubungi pemiliknya langsung — jangan biarkan dia mengetahuinya dari layar.`}
                >
                  {lostEvent?.note ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11.5px] text-zinc-500">
                        Deskripsi kejadian
                        {lostEvent.actorLabel ? ` · dicatat oleh ${lostEvent.actorLabel}` : ""}
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-white">{lostEvent.note}</p>
                    </div>
                  ) : null}
                </Section>
              )}

              {can("LOST") && (
                <Section
                  danger
                  title="Pelaporan Kartu Hilang atau Rusak"
                  sub="Gunakan bagian ini untuk melaporkan kartu yang hilang atau mengalami kerusakan selama berada dalam pengelolaan Hoshi. Pastikan laporan berisi kronologi kejadian, kondisi terakhir kartu, dan informasi pendukung yang tersedia."
                >
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[12px] leading-relaxed text-zinc-500">
                      Setelah laporan disimpan, kartu tidak dapat ditampilkan di marketplace atau
                      diproses untuk pengiriman melalui alur normal. Pencatatan laporan tidak secara
                      otomatis memproses penggantian kartu atau pembayaran kompensasi.
                    </p>
                    <label className="mt-4 block">
                      <FieldLabel>Deskripsi kejadian (wajib)</FieldLabel>
                      <textarea
                        value={lostNote}
                        onChange={(e) => setLostNote(e.target.value)}
                        rows={3}
                        placeholder="Jelaskan kronologi kejadian, waktu diketahui, kondisi terakhir kartu, dan tindakan yang telah dilakukan."
                        className={`${INPUT} resize-y leading-relaxed`}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <ActionButton
                      tone="red"
                      enabled={!busy && lostNote.trim().length >= NOTE_MIN}
                      onClick={() => setConfirm({ kind: "LOST" })}
                    >
                      Catat laporan kehilangan / kerusakan
                    </ActionButton>
                    <Hint>
                      {lostNote.trim() === ""
                        ? "Belum ada yang diisi"
                        : lostNote.trim().length < NOTE_MIN
                          ? `Minimal ${NOTE_MIN} karakter`
                          : "Siap dicatat"}
                    </Hint>
                  </div>
                </Section>
              )}

              {can("COMPENSATE") && (
                <Section
                  title="Ganti rugi ke pemilik"
                  sub="Struk serah terima yang ditandatangani kedua pihak berbunyi: “Hoshi mengganti sesuai nilai yang tertulis di struk ini.” Nominalnya karena itu bukan keputusan operator — server membacanya sendiri dari harga jual yang disepakati, dan menolak angka lain."
                >
                  {/* ANGKA YANG DIJANJIKAN KERTASNYA, DITAMPILKAN — bukan kotak isian kosong. */}
                  <p className="rounded-xl border border-emerald-400/20 bg-black/25 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-200">
                    Struk menjanjikan{" "}
                    <strong className="text-[13.5px] text-emerald-200">{rp(c.askPriceIdr)}</strong>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      Harga jual yang disepakati di struk serah terima — bukan harga dasar
                      {c.reservePriceIdr != null ? ` (${rp(c.reservePriceIdr)})` : ""}, bukan
                      taksiran pasar hari ini. Inilah yang akan dikreditkan.
                    </span>
                  </p>

                  {/* ── DUA KEADAAN YANG MEMBUATNYA PASTI DITOLAK, DIKATAKAN LEBIH DULU ── */}
                  {c.consignorId == null && (
                    <p className="mt-3 rounded-lg border border-violet-400/30 bg-violet-400/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-violet-100">
                      Belum ada akun pemilik yang tertaut ke titipan ini, jadi uangnya belum punya
                      tujuan — server menolak selama itu. Tautkan akunnya (atau minta pemiliknya
                      menukarkan kode klaim) lewat panel ungu di atas, baru bayar.
                    </p>
                  )}
                  {(c.status === "SOLD" || c.soldOrderId != null || c.listing?.buyerId != null) && (
                    <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-100">
                      Kartu ini <strong>sudah terjual</strong> sebelum hilang. Pemiliknya sudah
                      menerima payout-nya; yang tidak menerima apa pun adalah{" "}
                      <strong>PEMBELI</strong>, dan dialah yang wajib dipulihkan — lewat{" "}
                      <Link href="/admin/transactions" className="text-amber-200 underline">
                        order pembayarannya (REFUND_DUE)
                      </Link>
                      , bukan dari sini.
                    </p>
                  )}

                  <label className="mt-4 block">
                    <FieldLabel required>Dasar kesepakatannya</FieldLabel>
                    <input
                      value={compNote}
                      onChange={(e) => setCompNote(e.target.value)}
                      placeholder="mis. “disepakati lewat telepon 20 Sep, sesuai angka di struk”"
                      className={INPUT}
                    />
                  </label>

                  {/* HASILNYA — hijau HANYA kalau rupiahnya benar-benar bergerak. */}
                  {compResult && (
                    <div
                      className={`mt-3 rounded-lg border px-3.5 py-3 text-[12px] leading-relaxed ${
                        compResult.ok
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                          : "border-red-400/40 bg-red-400/10 text-red-200"
                      }`}
                    >
                      <p className="font-semibold">{compResult.title}</p>
                      <p className="mt-1">{compResult.detail}</p>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <ActionButton
                      tone="green"
                      enabled={
                        !busy &&
                        compNote.trim().length >= NOTE_MIN &&
                        c.consignorId != null &&
                        c.askPriceIdr > 0
                      }
                      onClick={() => setConfirm({ kind: "COMPENSATE" })}
                    >
                      {busy ? "Memproses…" : `Bayar ${rp(c.askPriceIdr)} ke pemilik`}
                    </ActionButton>
                    <Hint>
                      Satu ganti rugi per titipan: penekanan kedua DITOLAK, bukan diam-diam membayar
                      dua kali.
                    </Hint>
                  </div>
                </Section>
              )}

              {!can("LOST") && c.status !== "LOST" && (
                <Section
                  danger
                  title="Pelaporan Kartu Hilang atau Rusak"
                  sub="Gunakan bagian ini untuk melaporkan kartu yang hilang atau mengalami kerusakan selama berada dalam pengelolaan Hoshi."
                >
                  <p className="rounded-xl border border-white/10 bg-black/20 px-3.5 py-3 text-[12px] leading-relaxed text-zinc-300">
                    Belum bisa dilaporkan dari sini:{" "}
                    {c.status === "INTAKE"
                      ? "kartunya belum diterima Hoshi — selama serah terimanya belum dicatat, kartu masih di tangan pemiliknya."
                      : c.status === "RELEASED"
                        ? `kartunya sudah keluar dari Hoshi pada ${dt(c.custodyReleasedAt)}.`
                        : c.status === "CANCELLED"
                          ? "kesepakatannya dibatalkan sebelum serah terima."
                          : "keadaan titipan ini tidak mengizinkannya."}
                  </p>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>

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
