"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BUKTI FOTO SATU TITIPAN — diambil di tempat, di depan pemiliknya.

   Ini bukan formalitas dan bukan "lampiran". Kalau kartu kembali tergores berbulan-bulan
   kemudian, foto-foto inilah satu-satunya hal yang bisa menjawab "apakah sudah begitu sejak
   awal?" — untuk KEDUA belah pihak. Karena itu:

     • APPEND-ONLY. Tidak ada tombol hapus, tidak ada tombol ganti. Backend pun tidak punya
       rutenya. Bukti yang bisa direvisi diam-diam oleh pihak yang menyimpan barang bukan bukti.
     • Foto DEPAN + BELAKANG + STRUK SERAH TERIMA wajib sebelum kartu boleh dinyatakan diterima;
       SERTIFIKAT wajib kalau nomor sertifikatnya diisi. Gerbangnya ada di server — di sini
       kekurangannya DITAMPILKAN supaya operator tahu sebelum menekan tombol, bukan sesudah
       ditolak. (Daftar wajibnya hidup di satu tempat: `requiredPhotoKinds` di lib/consignment.)
     • STRUK SERAH TERIMA adalah jenis bukti yang BERBEDA dari tiga yang lain, dan itu bukan
       urusan penamaan. Foto kartu membuktikan KEADAAN BARANGNYA; foto struk bertanda tangan
       membuktikan ADANYA KESEPAKATAN — bahwa orangnya memang setuju menitipkan kartu itu, dengan
       harga dan komisi itu, pada hari itu. Slab difoto sebagus apa pun tidak menjawab itu.
       Struknya dicetak dari kartu "Struk serah terima" di halaman yang sama.
     • Tombolnya memanggil KAMERA (capture="environment") di ponsel, karena itu memang alat yang
       ada di tangan operator saat serah terima.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PHOTO_KIND_HINT,
  PHOTO_KIND_LABEL,
  PHOTO_KINDS,
  type ConsignmentPhoto,
  type ConsignmentPhotoKind,
} from "@/lib/consignment";
import { addAdminConsignmentPhotos, type AdminConsignment } from "@/lib/admin-api";
import { uploadAdminImage } from "@/lib/uploadImage";

/** Waktu foto. Daftar ringkas (rute admin list) tidak membawanya → jangan tampilkan apa-apa. */
const dt = (s: string | undefined) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Grid foto read-only — dipakai layar admin (dan aman dipakai ulang di mana pun). */
export function PhotoGrid({ photos }: { photos: ConsignmentPhoto[] }) {
  if (photos.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-zinc-500">
        Belum ada foto. Kartu tidak boleh dinyatakan diterima tanpa foto depan, belakang, dan
        struk serah terima yang sudah ditandatangani.
      </p>
    );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((p) => (
        <figure
          key={p.id}
          className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]"
        >
          <a href={p.url} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`${PHOTO_KIND_LABEL[p.kind as ConsignmentPhotoKind] ?? p.kind}`}
              className="aspect-square w-full bg-black/30 object-contain"
            />
          </a>
          <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
              {PHOTO_KIND_LABEL[p.kind as ConsignmentPhotoKind] ?? p.kind}
            </span>
            <span className="text-[10px] text-zinc-500">{dt(p.takenAt ?? p.createdAt)}</span>
          </figcaption>
          {p.note && <p className="px-2.5 pb-2 text-[11px] leading-snug text-zinc-400">{p.note}</p>}
        </figure>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   STRIP FOTO BUKTI — digeser ke samping, dengan saringan per jenis.

   Dipakai halaman detail titipan. Read-only, sama seperti PhotoGrid: tidak ada tombol hapus atau
   ganti, karena memang tidak ada rutenya. Ketuk foto = buka ukuran penuh di tab baru.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Kelompok saringan. "Lainnya" menampung cacat/catatan, foto tambahan, DAN jenis apa pun yang
    kelak ditambahkan server — supaya foto berjenis baru tidak pernah hilang dari layar. */
type StripFilter = "FRONT" | "BACK" | "CERT" | "HANDOVER" | "MORE";

const STRIP_FILTERS: { key: StripFilter; label: string }[] = [
  { key: "FRONT", label: "Depan" },
  { key: "BACK", label: "Belakang" },
  { key: "CERT", label: "Sertifikasi" },
  { key: "HANDOVER", label: "Struk" },
  { key: "MORE", label: "Lainnya" },
];

const MAIN_KINDS = ["FRONT", "BACK", "CERT", "HANDOVER"];

const filterOf = (kind: string): StripFilter =>
  MAIN_KINDS.includes(kind) ? (kind as StripFilter) : "MORE";

/** Label di bawah tiap foto. */
const stripLabel = (kind: string): string =>
  kind === "FRONT"
    ? "Depan"
    : kind === "BACK"
      ? "Belakang"
      : kind === "CERT"
        ? "Sertifikasi"
        : kind === "HANDOVER"
          ? "Struk"
          : kind === "DAMAGE"
            ? "Catatan"
            : kind === "OTHER"
              ? "Lainnya"
              : kind;

const dtFull = (s: string | undefined) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

export function PhotoStrip({ photos }: { photos: ConsignmentPhoto[] }) {
  const [filter, setFilter] = useState<StripFilter | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  /** Posisi & lebar penanda geser, dalam persen lebar jalurnya. null = tidak perlu digeser. */
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  const shown = filter ? photos.filter((p) => filterOf(String(p.kind)) === filter) : photos;
  const countOf = (f: StripFilter) => photos.filter((p) => filterOf(String(p.kind)) === f).length;

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) {
      setThumb(null);
      return;
    }
    setThumb({
      left: (el.scrollLeft / el.scrollWidth) * 100,
      width: (el.clientWidth / el.scrollWidth) * 100,
    });
  }, []);

  // Diukur ulang saat jumlah foto / saringan berubah, dan saat lebar layarnya berubah.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = 0;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, shown.length, filter]);

  if (photos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-[13px] text-zinc-500">
        Belum ada foto. Kartu tidak boleh dinyatakan diterima tanpa foto depan, belakang, dan struk
        serah terima yang sudah ditandatangani.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {STRIP_FILTERS.map((f) => {
          const n = countOf(f.key);
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              disabled={n === 0}
              onClick={() => setFilter(on ? null : f.key)}
              aria-pressed={on}
              className={`rounded-full border px-4 py-2 text-[13px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                on
                  ? "border-yellow-400 bg-yellow-400 text-[#171717]"
                  : "border-yellow-400/70 text-white hover:bg-yellow-400/10"
              }`}
            >
              {f.label}
              <span className={`ml-2 ${on ? "text-[#171717]" : "text-yellow-400"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div
        ref={scroller}
        onScroll={measure}
        className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-1"
      >
        {shown.map((p) => (
          <figure
            key={p.id}
            className="w-[200px] shrink-0 snap-start overflow-hidden rounded-xl bg-white/[0.04] sm:w-[220px]"
            title={p.note ?? undefined}
          >
            <a href={p.url} target="_blank" rel="noreferrer" className="block p-2 pb-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={stripLabel(String(p.kind))}
                className="aspect-[3/4] w-full rounded-lg bg-black/40 object-cover"
              />
            </a>
            <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
                {stripLabel(String(p.kind))}
              </span>
              <span className="text-[10.5px] text-zinc-300">{dtFull(p.takenAt ?? p.createdAt)}</span>
            </figcaption>
            {p.note && (
              <p className="line-clamp-2 px-2.5 pb-2.5 text-[11px] leading-snug text-zinc-400">
                {p.note}
              </p>
            )}
          </figure>
        ))}
      </div>

      {/* Penanda geser — pengganti scrollbar bawaan yang disembunyikan. */}
      {thumb && (
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <span
            className="absolute top-0 h-full rounded-full bg-[#F2B705] transition-[left] duration-75"
            style={{ left: `${thumb.left}%`, width: `${thumb.width}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Tombol kamera per jenis + status unggahan — tanpa daftar fotonya.
 *
 * Dipisah dari tampilan foto supaya halaman detail bisa memasangnya di atas strip, sementara
 * layar intake tetap memakai susunan lamanya (lihat `ConsignmentPhotos` di bawah).
 */
export function PhotoUploader({
  consignmentId,
  photos,
  token,
  required,
  onUpdated,
}: {
  /** null = baris titipannya belum dibuat → kamera dimatikan (foto butuh baris untuk ditempel). */
  consignmentId: string | null;
  photos: ConsignmentPhoto[];
  token: string;
  /** Jenis yang WAJIB ada sebelum custody boleh diterima. */
  required: ConsignmentPhotoKind[];
  /** Server menjawab dengan BARIS TITIPAN terbaru (bukan barisan foto) — pakai apa adanya. */
  onUpdated: (row: AdminConsignment) => void;
}) {
  const [busyKind, setBusyKind] = useState<ConsignmentPhotoKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const countOf = (k: ConsignmentPhotoKind) => photos.filter((p) => p.kind === k).length;

  const handleFiles = async (kind: ConsignmentPhotoKind, files: FileList) => {
    if (!consignmentId || busyKind) return;
    setBusyKind(kind);
    setError(null);
    const list = Array.from(files);
    try {
      // Diunggah satu per satu, lalu DISIMPAN satu per satu — bukan dikumpulkan dulu lalu dikirim
      // sekaligus. Kalau ponsel operator mati di tengah serah terima, foto yang sudah terkirim
      // sudah jadi baris permanen; tidak ada draft yang bisa lenyap bersama tab-nya.
      for (let i = 0; i < list.length; i += 1) {
        setProgress(list.length > 1 ? `Mengunggah ${i + 1}/${list.length}…` : "Mengunggah…");
        const url = await uploadAdminImage(list[i], token);
        onUpdated(await addAdminConsignmentPhotos(consignmentId, [{ url, kind }], token));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah foto.");
    } finally {
      setBusyKind(null);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PHOTO_KINDS.map((k) => {
          const n = countOf(k);
          const missing = required.includes(k) && n === 0;
          return (
            <div key={k} className="flex flex-col">
              <button
                type="button"
                disabled={!consignmentId || busyKind !== null}
                onClick={() => inputs.current[k]?.click()}
                title={PHOTO_KIND_HINT[k]}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  missing
                    ? "border-red-400/40 bg-red-400/10 text-red-200 hover:bg-red-400/15"
                    : n > 0
                      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                      : "border-white/12 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07]"
                }`}
              >
                {/* ══ UNGGAHAN YANG SEDANG BERJALAN HARUS TERLIHAT DI TOMBOL YANG BARU DITEKAN ══
                    Dulu satu-satunya tandanya adalah baris abu-abu 12px di bawah daftar tombol —
                    jauh dari jari operator, dan mudah terlewat sama sekali. Yang terjadi
                    berikutnya bisa ditebak: dia mengira tekanannya tidak masuk, menekan lagi,
                    dan foto yang sama masuk dua kali ke arsip bukti yang tidak bisa dihapus. */}
                {busyKind === k ? (
                  <span
                    aria-hidden
                    className="h-[15px] w-[15px] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
                  />
                ) : (
                  <span className="text-[15px] leading-none">📷</span>
                )}
                {busyKind === k ? (progress ?? "Mengunggah…") : PHOTO_KIND_LABEL[k]}
                {busyKind !== k && n > 0 && <span className="text-[11px] opacity-80">×{n}</span>}
                {busyKind !== k && missing && (
                  <span className="text-[11px] font-bold uppercase">wajib</span>
                )}
              </button>
              <input
                ref={(el) => {
                  inputs.current[k] = el;
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files;
                  if (f && f.length > 0) void handleFiles(k, f);
                  e.target.value = ""; // reset supaya foto yang sama bisa diambil lagi
                }}
              />
            </div>
          );
        })}
      </div>

      {!consignmentId && (
        <p className="text-[12px] text-zinc-500">
          Simpan catatan kesepakatan dulu, baru foto bisa ditempelkan ke baris titipannya.
        </p>
      )}
      {progress && (
        <p className="flex items-center gap-2 rounded-xl border border-yellow-400/25 bg-yellow-400/10 px-3.5 py-2.5 text-[12.5px] font-medium text-yellow-100">
          <span
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70"
          />
          {progress} Jangan tutup halamannya dulu.
        </p>
      )}
      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}

/** Susunan lengkap untuk layar intake: tombol kamera, grid foto, dan catatan permanennya. */
export default function ConsignmentPhotos(props: {
  consignmentId: string | null;
  photos: ConsignmentPhoto[];
  token: string;
  required: ConsignmentPhotoKind[];
  onUpdated: (row: AdminConsignment) => void;
}) {
  return (
    <div className="space-y-4">
      <PhotoUploader {...props} />
      <PhotoGrid photos={props.photos} />
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Foto tersimpan permanen dan tidak bisa dihapus — termasuk oleh admin. Itu yang membuatnya
        berlaku sebagai bukti untuk pemilik kartu, bukan cuma catatan internal Hoshi.
      </p>
    </div>
  );
}
