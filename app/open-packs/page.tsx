"use client";

import { useState } from "react";
import { LIVE_CARDS, PACKS } from "@/lib/packs";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import SelectPackPanel from "@/components/packs/SelectPackPanel";
import PackShowcase from "@/components/packs/PackShowcase";
import PackDetailsPanel from "@/components/packs/PackDetailsPanel";

export default function OpenPacksPage() {
  const [selectedId, setSelectedId] = useState("sr");
  const selected = PACKS.find((p) => p.id === selectedId) ?? PACKS[0];

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background:
          "radial-gradient(120% 75% at 72% 8%, #2a210c 0%, #16130c 38%, #0a0a0a 78%)",
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
