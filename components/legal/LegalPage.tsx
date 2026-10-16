import type { ReactNode } from "react";
import Link from "next/link";
import TopNav from "@/components/packs/TopNav";
import { ACCOUNT_BG } from "@/lib/theme";

/**
 * Kerangka bersama halaman informasi resmi: Kontak, Syarat & Ketentuan, Kebijakan Privasi, dan
 * Kebijakan Pengembalian Dana.
 *
 * Halaman-halaman ini ada karena payment gateway (Duitku) memverifikasi website saat pendaftaran:
 * info kontak wajib terlihat, dan pemeriksa biasanya mencari ketiga kebijakan itu. Isinya HARUS
 * menggambarkan cara Hoshi benar-benar bekerja — janji yang tidak dijalankan sistem (mis. refund
 * otomatis) lebih buruk daripada tidak berjanji, karena itulah yang akan dikutip pembeli.
 */

import { LEGAL_LINKS } from "./business";

export { BUSINESS, LEGAL_LINKS } from "./business";

export function LegalPage({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  /** Tanggal terakhir diperbarui, mis. "16 Oktober 2026". */
  updated: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen text-zinc-100"
      style={{ background: ACCOUNT_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav />
      <main className="mx-auto max-w-[760px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
          <p className="mt-1.5 text-[12.5px] text-zinc-500">Terakhir diperbarui: {updated}</p>
          {intro && <div className="mt-4 text-[14px] leading-relaxed text-zinc-300">{intro}</div>}
        </header>
        <div className="space-y-8">{children}</div>
        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/[0.08] pt-6 text-[13px]">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-zinc-400 transition hover:text-yellow-200">
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-zinc-300">{children}</div>
    </section>
  );
}

export function Points({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-zinc-600">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
