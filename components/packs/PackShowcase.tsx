"use client";

import { useEffect, useRef } from "react";
import type { Pack } from "@/lib/packs";
import Pack3D from "./Pack3D";
import { GOLD_GRADIENT, GradientText, Idrx, Img } from "./ui";

export default function PackShowcase({ pack, onRip }: { pack: Pack; onRip?: () => void }) {
  // Float the PERSISTENT wrapper, not the pack image. Pack3D swaps its <img>
  // elements internally to crossfade on pack change, so a ref captured on the
  // image goes stale the moment you pick another pack (the animated node gets
  // unmounted → the float visibly freezes). This div never remounts, so the
  // bob keeps running across pack switches. Rotation (drag) lives inside Pack3D
  // on its own element, so translateY here composes cleanly with it.
  const floatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = floatRef.current;
    if (!el) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let start: number | null = null;
    let id: number;
    function tick(ts: number) {
      if (start === null) start = ts;
      const t = (ts - start) / 1000;
      const y = Math.sin(t * (2 * Math.PI / 3)) * 6;
      el!.style.transform = `translateY(${y}px)`;
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <section className="flex flex-col items-center justify-center gap-7 py-6">
      <div className="relative">
        <div
          className="absolute -inset-10 -z-10 rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.45), transparent 70%)" }}
        />
        {/* Persistent float wrapper: Pack3D crossfades the art internally on pack change. */}
        <div ref={floatRef} className="will-change-transform">
          <Pack3D pack={pack} className="h-[340px] w-[260px] sm:h-[380px] sm:w-[290px]" />
        </div>
      </div>

      <div className="flex w-full max-w-[340px] flex-col items-center gap-4">
        <button
          type="button"
          onClick={onRip}
          className="relative w-full rounded-2xl px-6 py-4 text-center transition hover:brightness-105 active:scale-[0.99]"
          style={{
            backgroundImage: GOLD_GRADIENT,
            border: "1px solid #F2C101",
            boxShadow: "0 10px 12.9px 0 rgba(255,246,0,0.25)",
          }}
        >
          <span
            className="text-3xl leading-none"
            style={{ fontFamily: "var(--font-jersey)", color: "#171717" }}
          >
            Rip Pack
          </span>
          {/* Price pill pokes above the top edge, right edge flush with the button. */}
          <span className="absolute -top-3 right-0 inline-flex items-center rounded-lg bg-[#171717] px-2.5 py-1 text-xs font-semibold text-white shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)]">
            <Idrx amount={pack.price} size={12} />
          </span>
        </button>

        <div className="flex w-full gap-3">
          <LinkButton icon="/icon-help.png" label="How it Works" />
          <LinkButton icon="/icon-percent.png" label="Odds" />
        </div>
      </div>
    </section>
  );
}

function LinkButton({ icon, label }: { icon: string; label: string }) {
  return (
    <button className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5 transition hover:bg-white/[0.07]">
      <Img src={icon} alt="" className="h-4 w-4" />
      <GradientText className="text-sm font-semibold">{label}</GradientText>
      <Img src="/icon-right-default.png" alt="" className="h-3 w-3" />
    </button>
  );
}
