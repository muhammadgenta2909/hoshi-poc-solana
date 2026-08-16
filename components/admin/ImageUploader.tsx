"use client";

// Uploader gambar admin: drag-and-drop ATAU klik pilih file ATAU tempel URL. Dipakai ulang untuk
// gambar DEPAN & BELAKANG kartu. Upload ke /admin/upload (Cloudinary) → balik URL.

import { useCallback, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  token: string;
  /** Judul di dalam dropzone saat kosong (mis. "Gambar depan"). */
  label?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// Kompres di klien SEBELUM upload: resize ke maks 900px + JPEG adaptif sampai ≤~55KB. Tanpa
// Cloudinary, server menyimpan gambar sebagai DATA URL base64 di body JSON create-listing — kalau
// gambar besar, body tembus limit → 413. Kompresi bikin body kecil (2 gambar tetap muat) + hemat DB.
async function compressForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return file;
    }
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const toBlob = (q: number) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    // ≤180KB/gambar → kualitas bagus; backend body-limit sudah 12mb jadi 2 gambar (~480KB base64)
    // muat lega. Cloudinary (kalau di-set) = kualitas penuh tanpa kompresi.
    const TARGET = 180 * 1024;
    let q = 0.86;
    let blob = await toBlob(q);
    while (blob && blob.size > TARGET && q > 0.35) {
      q -= 0.12;
      blob = await toBlob(q);
    }
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "card";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // kalau kompresi gagal, kirim aslinya
  }
}

export default function ImageUploader({ value, onChange, token, label }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setError("Harus berupa file gambar (PNG/JPG/WebP).");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const compressed = await compressForUpload(file);
        const form = new FormData();
        form.append("file", compressed);
        const res = await fetch(`${API_BASE}/admin/upload`, {
          method: "POST",
          headers: { authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          let msg = `Upload gagal (HTTP ${res.status})`;
          try {
            const body = await res.json();
            if (body?.message)
              msg = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
          } catch {
            /* body bukan JSON */
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as { url: string };
        onChange(data.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload gagal");
      } finally {
        setUploading(false);
      }
    },
    [onChange, token],
  );

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className={`relative flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-3 text-center transition ${
          drag
            ? "border-yellow-400/70 bg-yellow-400/[0.08]"
            : "border-white/15 bg-white/[0.02] hover:border-white/30 hover:bg-white/[0.03]"
        }`}
      >
        {uploading ? (
          <>
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
            <span className="text-[12px] text-zinc-400">Mengunggah…</span>
          </>
        ) : value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Preview"
              className="max-h-[128px] rounded-lg object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.2";
              }}
            />
            <span className="text-[11px] text-zinc-500">Klik / seret untuk ganti</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              aria-label="Hapus gambar"
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white/80 transition hover:bg-red-500/70 hover:text-white"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" className="text-zinc-500">
              <path
                d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-[13px] font-semibold text-zinc-300">
              {label ?? "Seret gambar ke sini"}
            </span>
            <span className="text-[11px] text-zinc-500">atau klik untuk pilih file · PNG / JPG / WebP</span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ""; // reset supaya file yg sama bisa dipilih lagi
        }}
      />

      {/* Fallback: tempel URL langsung (mis. dari CollectorCrypt). */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="…atau tempel URL gambar"
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] text-zinc-300 placeholder-zinc-600 outline-none focus:border-yellow-400/40"
      />

      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
}
