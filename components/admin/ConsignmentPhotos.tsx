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

import { useRef, useState } from "react";
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

export default function ConsignmentPhotos({
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
                <span className="text-[15px] leading-none">📷</span>
                {PHOTO_KIND_LABEL[k]}
                {n > 0 && <span className="text-[11px] opacity-80">×{n}</span>}
                {missing && <span className="text-[11px] font-bold uppercase">wajib</span>}
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
      {progress && <p className="text-[12px] text-zinc-400">{progress}</p>}
      {error && <p className="text-[12px] text-red-400">{error}</p>}

      <PhotoGrid photos={photos} />

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Foto tersimpan permanen dan tidak bisa dihapus — termasuk oleh admin. Itu yang membuatnya
        berlaku sebagai bukti untuk pemilik kartu, bukan cuma catatan internal Hoshi.
      </p>
    </div>
  );
}
