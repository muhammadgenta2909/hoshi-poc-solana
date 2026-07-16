"use client";

import Link from "next/link";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import { Img, GradientText } from "@/components/packs/ui";

// Placeholder: Open Bid Crack belum dibangun. Dibuat agar link dari /games tidak
// jatuh ke 404 mentah — begitu game-nya jadi, halaman ini yang dikembangkan.
export default function OpenBidCrackPage() {
  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background: PAGE_BG,
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav active="Games" />

      <main className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
        <Img
          src="/banner-openbidcrack.png"
          alt="Open Bid Crack"
          className="w-full max-w-xl rounded-2xl border border-white/10 opacity-90"
        />
        <div className="flex flex-col items-center gap-2">
          <GradientText
            className="text-2xl leading-none sm:text-3xl"
            style={{ fontFamily: "var(--font-jersey)" }}
          >
            Segera Hadir
          </GradientText>
          <p className="max-w-md text-sm text-zinc-400">
            Open Bid Crack masih dalam pengembangan. Untuk sekarang, coba{" "}
            <Link
              href="/open-packs"
              className="font-semibold text-yellow-400 hover:brightness-110"
            >
              Open Packs
            </Link>
            .
          </p>
        </div>

        <Link
          href="/games"
          className="mt-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.08]"
        >
          ← Kembali ke Games
        </Link>
      </main>
    </div>
  );
}
