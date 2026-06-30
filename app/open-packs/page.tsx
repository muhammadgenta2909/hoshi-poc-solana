"use client";

import { useState } from "react";
import { LIVE_CARDS, PACKS } from "@/lib/packs";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import SelectPackPanel from "@/components/packs/SelectPackPanel";
import PackShowcase from "@/components/packs/PackShowcase";
import PackDetailsPanel from "@/components/packs/PackDetailsPanel";

// Layered warm-glow background (matches Figma): a strong gold glow hugging the
// top-right corner that bleeds onto Pack Details, a softer top-left glow dropped
// a little from the top, plus a broad warm wash so the layers blend without banding.
const PAGE_BG = [
  // luminous hotspot pinned to the very top-right corner
  "radial-gradient(340px 300px at 100% 0px, rgba(255,230,150,0.45) 0%, rgba(255,230,150,0) 60%)",
  // top-right hero glow — bold gold hugging the corner, reaching toward Pack Details
  "radial-gradient(1300px 900px at 100% -40px, rgba(245,182,52,0.46) 0%, rgba(245,182,52,0.17) 28%, rgba(245,182,52,0) 58%)",
  "radial-gradient(660px 580px at 100% 0px, rgba(255,210,104,0.42) 0%, rgba(255,210,104,0) 55%)",
  // top-left glow — softer, dropped a little from the very top
  "radial-gradient(960px 720px at -90px 150px, rgba(226,168,66,0.28) 0%, rgba(226,168,66,0) 60%)",
  // warm wash across the whole top so the layers blend without banding
  "radial-gradient(1850px 740px at 60% -260px, rgba(82,62,28,0.62) 0%, rgba(82,62,28,0) 62%)",
  // dark warm base
  "#0a0907",
].join(", ");

export default function OpenPacksPage() {
  const [selectedId, setSelectedId] = useState("sr");
  const selected = PACKS.find((p) => p.id === selectedId) ?? PACKS[0];

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background: PAGE_BG,
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav />
      <LiveTicker cards={LIVE_CARDS} />

      <main className="mx-auto grid max-w-[1400px] gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[270px_minmax(0,1fr)_300px]">
        <SelectPackPanel packs={PACKS} selectedId={selectedId} onSelect={setSelectedId} />
        <PackShowcase pack={selected} />
        <PackDetailsPanel pack={selected} />
      </main>
    </div>
  );
}
