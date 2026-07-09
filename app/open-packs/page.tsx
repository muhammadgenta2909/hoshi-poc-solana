"use client";

import { useState } from "react";
import { LIVE_CARDS, PACKS } from "@/lib/packs";
import { openPackLocal, type OpenResult } from "@/lib/openPack";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import SelectPackPanel from "@/components/packs/SelectPackPanel";
import PackShowcase from "@/components/packs/PackShowcase";
import PackDetailsPanel from "@/components/packs/PackDetailsPanel";
import RipReveal from "@/components/packs/RipReveal";

export default function OpenPacksPage() {
  const [selectedId, setSelectedId] = useState("sr");
  const selected = PACKS.find((p) => p.id === selectedId) ?? PACKS[0];

  // Client-side pack opening for the live demo (swaps to the backend API later).
  const [result, setResult] = useState<OpenResult | null>(null);
  const rip = () => setResult(openPackLocal(selected));

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background: PAGE_BG,
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav active="Open Packs" />
      <LiveTicker cards={LIVE_CARDS} />

      {/* Full-bleed grid: the side panels (bg #181507) run flush to the left and
          right viewport edges, per the Figma; only the center column is padded. */}
      <main className="grid w-full items-start gap-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <SelectPackPanel packs={PACKS} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="px-4 sm:px-6">
          <PackShowcase pack={selected} onRip={rip} />
        </div>
        <PackDetailsPanel pack={selected} />
      </main>

      {result && (
        <RipReveal
          pack={selected}
          result={result}
          onClose={() => setResult(null)}
          onRipAgain={rip}
        />
      )}
    </div>
  );
}
