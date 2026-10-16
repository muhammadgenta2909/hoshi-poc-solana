/**
 * Identitas usaha dan tautan halaman resmi. Satu sumber untuk footer dan halaman-halaman kebijakan,
 * supaya tidak pernah ada dua versi alamat atau nomor telepon di situs yang sama.
 */
export const BUSINESS = {
  brand: "Hoshimarket",
  company: "PT Portal Integrasi Nusantara",
  address:
    "Jl. Cipinang Jaya JJ/3, Kel. Cipinang Besar Selatan, Kec. Jatinegara, Kota Adm. Jakarta Timur, DKI Jakarta 13410",
  email: "hoshimarketxyz@gmail.com",
  phoneDisplay: "+62 822-1738-4308",
  /** Untuk tautan wa.me — angka saja, tanpa + dan tanpa spasi. */
  phoneWa: "6282217384308",
  hours: "Senin – Jumat, 09.00 – 17.00 WIB",
} as const;

export const LEGAL_LINKS = [
  { href: "/kontak", label: "Kontak" },
  { href: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { href: "/kebijakan-pengembalian", label: "Kebijakan Pengembalian Dana" },
] as const;
