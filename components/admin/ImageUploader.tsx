"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (url: string) => void;
  token: string;
};

export default function ImageUploader({ value, onChange, token }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api"}/admin/upload`,
        { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form },
      );
      if (!res.ok) {
        // Tampilkan pesan backend yang sebenarnya (mis. "Hanya file gambar…",
        // atau limit ukuran) alih-alih gagal diam-diam.
        let msg = `Upload gagal (HTTP ${res.status})`;
        try {
          const body = await res.json();
          if (body?.message) msg = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
        } catch { /* body bukan JSON */ }
        throw new Error(msg);
      }
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal");
    } finally {
      setUploading(false);
    }
  }, [onChange, token]);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
              placeholder="Image URL or upload file…"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Browse"}
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      </div>

      {error && <p className="text-[12px] text-red-400">{error}</p>}

      {value && (
        <div className="relative flex items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Preview"
            className="max-h-40 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
    </div>
  );
}
