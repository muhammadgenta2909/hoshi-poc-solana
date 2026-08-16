"use client";

import Link from "next/link";
import TopNav from "@/components/packs/TopNav";
import { Img } from "@/components/packs/ui";

// Halaman pilihan game Hoshi. Tiap banner (art + judul sudah menyatu di PNG)
// nge-link ke game-nya. Open Bid Crack belum ada — sementara ke halaman "segera".
const GAMES: { href: string; src: string; alt: string }[] = [
  { href: "/open-packs", src: "/banner-openpack.png", alt: "Open Packs Hoshi" },
  { href: "/open-bid-crack", src: "/banner-openbidcrack.png", alt: "Open Bid Crack" },
];

export default function GamesPage() {
  return (
    <div
      className="page-bg relative min-h-screen text-zinc-100"
      style={{
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav active="Games" />

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            aria-label={g.alt}
            className="group block aspect-[2/1] overflow-hidden rounded-2xl border border-white/10 shadow-lg outline-none transition duration-200 hover:border-yellow-400/50 hover:brightness-105 focus-visible:border-yellow-400/70 active:scale-[0.995] sm:aspect-auto"
          >
            {/* Di mobile kartunya dibikin lebih tinggi (2:1) daripada rasio asli
                PNG (686x275 ≈ 2.49:1), jadi sisi gambar HARUS ada yang terpotong.
                object-position 78% memotongnya dari KIRI: judul "Open Packs Hoshi"
                sudah ter-baked di sisi kanan PNG dan berakhir ~93% lebarnya, jadi
                crop tengah bawaan akan memenggal huruf terakhirnya. Yang hilang
                cuma tepi art kiri, yang memang cuma tumpahan pack. Di ≥sm kartu
                balik mengikuti tinggi natural gambar, tanpa crop sama sekali. */}
            <Img
              src={g.src}
              alt={g.alt}
              className="block h-full w-full object-cover object-[78%_center] transition duration-300 group-hover:scale-[1.015] sm:h-auto sm:object-center"
            />
          </Link>
        ))}
      </main>
    </div>
  );
}
