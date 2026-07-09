"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Pack } from "@/lib/packs";
import { TIER_COLOR, TIER_ICON } from "@/lib/packs";
import type { OpenResult } from "@/lib/openPack";
import { GOLD_GRADIENT, Idrx, Img } from "./ui";

type Phase = "video" | "revealed";

export default function RipReveal({
  result,
  onClose,
  onRipAgain,
}: {
  pack: Pack;
  result: OpenResult;
  onClose: () => void;
  onRipAgain: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("video");
  const [sold, setSold] = useState(false);
  const [reduced, setReduced] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setSold(false);
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduce);
    if (reduce) {
      setPhase("revealed");
      return;
    }
    setPhase("video");
  }, [result]);

  const onVideoEnd = useCallback(() => {
    setPhase("revealed");
  }, []);

  const color = TIER_COLOR[result.rarity];

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      style={{ background: "#000" }}
    >
      {phase === "video" && (
        <>
          <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onEnded={onVideoEnd}
          className="block h-full w-full object-cover"
          src="/video/open-packs.mp4"
        />
        </>
      )}

      {phase === "revealed" && (
        <div className="flex h-full w-full items-center justify-center p-4">
          <div className={reduced ? "" : "hoshi-card-rise"}>
            {!reduced && (
              <div
                className="hoshi-duar pointer-events-none absolute left-1/2 top-[38%] h-72 w-72 -translate-x-1/2 rounded-full blur-2xl"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,246,0,0.3) 45%, transparent 70%)" }}
              />
            )}

            <div className="relative flex flex-col items-center gap-5 text-center">
              <div className="relative">
                <div
                  className="absolute -inset-6 -z-10 rounded-full blur-2xl"
                  style={{ background: `radial-gradient(circle, ${color}55, transparent 72%)` }}
                />
                <div
                  className="relative overflow-hidden rounded-2xl border-2"
                  style={{ borderColor: color, boxShadow: `0 0 36px -8px ${color}` }}
                >
                  <Img
                    src={result.card.imageUrl}
                    alt={result.card.name}
                    className="h-72 w-52 object-cover"
                  />
                  <span
                    className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black"
                    style={{ background: color }}
                  >
                    <Img src={TIER_ICON[result.rarity]} alt="" className="h-3 w-auto" />
                    {result.rarity}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-xl font-semibold text-zinc-50">{result.card.name}</p>
                <p className="text-sm font-medium" style={{ color }}>
                  You pulled a{result.rarity === "Epic" ? "n" : ""} {result.rarity} card!
                </p>
              </div>

              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400">Value</span>
                  <Idrx amount={result.card.valueIdr} size={16} className="text-base font-semibold text-white" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[11px] uppercase tracking-wider text-zinc-400">Buyback</span>
                  <Idrx amount={result.buybackQuoteIdr} size={16} className="text-base font-semibold text-white" />
                </div>
              </div>

              {sold ? (
                <p className="flex items-center gap-1 text-sm font-semibold text-emerald-400">
                  Sold back for
                  <Idrx amount={result.buybackQuoteIdr} size={13} className="text-emerald-400" /> ✓
                </p>
              ) : (
                <div className="flex w-full max-w-xs gap-3">
                  <button
                    type="button"
                    onClick={() => setSold(true)}
                    className="flex-1 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Sell back
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Keep card
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onRipAgain}
                className="mt-1 rounded-xl px-6 py-3 text-lg leading-none transition hover:brightness-105 active:scale-[0.99]"
                style={{
                  backgroundImage: GOLD_GRADIENT,
                  border: "1px solid #F2C101",
                  color: "#171717",
                  fontFamily: "var(--font-jersey)",
                }}
              >
                Open Another
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-30 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
      >
        ✕
      </button>
    </div>
  );
}
