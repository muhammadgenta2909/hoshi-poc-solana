"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveCard } from "@/lib/packs";
import { GradientText, Idrx, Img } from "./ui";

// Real card art cycled across the ticker items (the dummy data has 6 cards).
const CARD_IMAGES = ["/card1.png", "/card2.png", "/card3.png"];

// Ticker geometry — kept in sync with the card markup below.
const CARD_W = 250; // px, matches w-[250px]
const GAP = 12; // px, spacing between cards (was gap-3)
const SPEED = 40; // px/second — constant scroll speed on every screen width

export default function LiveTicker({ cards }: { cards: LiveCard[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);

  // Width of one full set of cards (each card carries its own trailing gap).
  const setWidth = cards.length * (CARD_W + GAP);

  // How many copies of the set to render. The marquee shifts by exactly half the
  // track (-50% = copies/2 sets), so that half must be at least as wide as the
  // viewport or empty space appears on the right. Scaling `copies` to the actual
  // viewport is what makes it seamless on ANY monitor — 1080p, 1440p, ultrawide,
  // 4K — instead of only up to a fixed max-width.
  const [copies, setCopies] = useState(2);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => {
      // Even count so -50% always lands on a whole-set boundary (seamless loop).
      const needed = Math.max(2, 2 * Math.ceil(el.clientWidth / setWidth));
      setCopies((prev) => (prev === needed ? prev : needed));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [setWidth]);

  const items = Array.from({ length: copies }, () => cards).flat();

  // Fixed pixel speed: the animation travels copies/2 sets, so its duration has
  // to grow with the track — otherwise wide screens would scroll faster.
  const trackWidth = copies * setWidth;
  const duration = trackWidth / 2 / SPEED;

  return (
    <section>
      <div className="mx-auto max-w-[1400px] px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
          </span>
          <GradientText>Live Card Won</GradientText>
        </div>
      </div>

      {/* Full-bleed: the ticker runs flush to both viewport edges at every width
          (no max-width container). A soft edge mask fades cards in/out instead of
          hard-clipping them right at the screen border. */}
      <div
        ref={viewportRef}
        className="marquee-pause w-full overflow-hidden py-3"
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, #000 clamp(20px,3vw,64px), #000 calc(100% - clamp(20px,3vw,64px)), transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0, #000 clamp(20px,3vw,64px), #000 calc(100% - clamp(20px,3vw,64px)), transparent 100%)",
        }}
      >
        {/* Explicit px width so translateX(-50%) resolves to an exact set boundary. */}
        <div
          className="flex animate-marquee"
          style={{ width: trackWidth, animationDuration: `${duration}s` }}
        >
          {items.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className="flex w-[250px] shrink-0 items-center gap-3 rounded-tl-2xl bg-white/[0.03] px-3 py-2.5"
              style={{
                marginRight: GAP,
                // Left & right edges are clearly lined; top & bottom stay faint.
                borderLeft: "1px solid rgba(255,255,255,0.35)",
                borderRight: "1px solid rgba(255,255,255,0.35)",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <Img
                src={CARD_IMAGES[(c.id - 1) % CARD_IMAGES.length]}
                alt={c.name}
                className="h-14 w-10 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-zinc-100">{c.name}</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <p className="text-[10px] text-zinc-500">{c.set}</p>
                  <Idrx amount={c.price} size={12} className="shrink-0 text-[11px] text-zinc-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
