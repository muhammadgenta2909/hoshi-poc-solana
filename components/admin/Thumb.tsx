// Thumbnail kartu untuk sel tabel admin — konsisten di semua halaman.
// Fallback ke kotak kosong bila tidak ada gambar / gambar gagal load.

type Props = {
  src?: string | null;
  alt?: string;
  /** Ukuran preset. Default "md" (kartu 8x11). */
  size?: "sm" | "md";
};

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-9 w-6",
  md: "h-11 w-8",
};

export default function Thumb({ src, alt = "", size = "md" }: Props) {
  const box = SIZES[size];
  if (!src) {
    return <div className={`${box} shrink-0 rounded-md bg-white/[0.04] ring-1 ring-white/10`} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={`${box} shrink-0 rounded-md object-cover ring-1 ring-white/10`}
      onError={(e) => {
        const el = e.currentTarget;
        el.style.visibility = "hidden";
      }}
    />
  );
}
