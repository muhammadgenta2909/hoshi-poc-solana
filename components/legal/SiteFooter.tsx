"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BUSINESS, LEGAL_LINKS } from "./business";

/**
 * Footer seluruh situs: identitas usaha, kontak, dan tautan ke tiga kebijakan.
 *
 * Ada karena payment gateway memverifikasi website saat pendaftaran merchant, dan syaratnya info
 * kontak "harus aktif" dan terlihat. Halaman-halamannya saja tidak cukup kalau tidak ada yang
 * menautkannya — pemeriksa membuka beranda, bukan menebak URL.
 *
 * Disembunyikan di /admin dengan alasan yang sama dengan BackgroundLayer: back-office punya
 * kerangkanya sendiri.
 */
export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <footer
      className="border-t border-white/[0.06] bg-black/40 px-4 py-8 text-[12.5px] text-zinc-500 sm:px-6"
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[460px] space-y-1">
          <p className="font-semibold text-zinc-300">
            {BUSINESS.brand} · {BUSINESS.company}
          </p>
          <p className="leading-relaxed">{BUSINESS.address}</p>
          <p>
            <a href={`mailto:${BUSINESS.email}`} className="hover:text-zinc-300">
              {BUSINESS.email}
            </a>
            {" · "}
            <a
              href={`https://wa.me/${BUSINESS.phoneWa}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-300"
            >
              {BUSINESS.phoneDisplay}
            </a>
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-yellow-200">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
