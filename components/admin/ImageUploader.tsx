"use client";

// Uploader gambar admin: drag-and-drop ATAU klik pilih file ATAU tempel URL. Dipakai ulang untuk
// gambar DEPAN & BELAKANG kartu. Upload ke /admin/upload (Cloudinary) → balik URL.

import { useCallback, useRef, useState } from "react";
import { uploadAdminImage } from "@/lib/uploadImage";

type Props = {
  value: string;
  onChange: (url: string) => void;
  token: string;
  /** Judul di dalam dropzone saat kosong (mis. "Gambar depan"). */
  label?: string;
};

// Kompresi klien + POST /admin/upload hidup di lib/uploadImage.ts — SATU salinan, dipakai
// uploader ini dan kamera bukti titipan (components/admin/ConsignmentPhotos.tsx).

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
        onChange(await uploadAdminImage(file, token));
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
