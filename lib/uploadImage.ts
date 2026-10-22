/* ══════════════════════════════════════════════════════════════════════════════════════════════
   UNGGAH GAMBAR ADMIN — satu salinan, dipakai uploader listing DAN foto bukti titipan.

   Kenapa dipisah dari <ImageUploader>: alur titipan memotret DI TEMPAT, banyak foto sekaligus,
   dari kamera ponsel — bukan satu gambar per kotak seperti form listing. Dua pemanggil, satu
   perilaku: kompres di klien dulu, baru kirim ke `/admin/upload`.

   KOMPRESI ITU BUKAN KOSMETIK. Tanpa Cloudinary, server menyimpan gambar sebagai DATA URL base64;
   foto kamera ponsel (3–8 MB) akan menembus batas body → 413, dan operator kehilangan bukti yang
   baru saja ia ambil di depan pemilik kartu.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Sisi terpanjang maksimum setelah resize. Cukup untuk membaca nomor sertifikat di slab. */
const MAX_DIM = 1200;
/** Target ukuran file per gambar (~180KB) — body-limit backend 12MB, jadi puluhan foto tetap muat. */
const TARGET_BYTES = 180 * 1024;

/**
 * Resize ≤1200px + JPEG adaptif sampai ≤~180KB. Kalau apa pun gagal (format aneh, canvas
 * diblokir), file ASLINYA dikembalikan — lebih baik unggahan besar daripada bukti yang hilang.
 */
export async function compressForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
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
    let q = 0.86;
    let blob = await toBlob(q);
    while (blob && blob.size > TARGET_BYTES && q > 0.35) {
      q -= 0.12;
      blob = await toBlob(q);
    }
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "card";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // kompresi gagal → kirim aslinya
  }
}

/** Unggah satu gambar (sudah dikompres) ke `/admin/upload`; balikannya URL yang bisa disimpan. */
export async function uploadAdminImage(file: File, token: string): Promise<string> {
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
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : String(body.message);
    } catch {
      /* body bukan JSON */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
