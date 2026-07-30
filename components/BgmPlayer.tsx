"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// Background music — three context-specific tracks, all SOFT (BGM sits under the UI,
// never fights it). The player keeps ONE track playing for the current context:
//   • pack-reveal takeover → bgm-reveal (the rip clip's own mp4 audio plays over it)
//   • the /open-packs page → bgm-openpack (bgm-main is muted while you're here)
//   • everywhere else      → bgm-main
const TRACKS = {
  main: "/sound/bgm-main.mpeg",
  openpack: "/sound/bgm-openpack.mpeg",
  reveal: "/sound/bgm-reveal.mpeg",
} as const;

// Soft by design (~20–30%): ambience, not foreground.
const VOLUME = 0.25;

export default function BgmPlayer() {
  const ref = useRef<HTMLAudioElement>(null);
  // On by default (the app wants ambience everywhere). Browsers block sound until the
  // first user gesture, so a one-time interaction listener actually starts it.
  const [on, setOn] = useState(true);
  // The pack-reveal takeover swaps the soundtrack for its duration (see RipReveal,
  // which dispatches hoshi:reveal-start / hoshi:reveal-end).
  const [revealing, setRevealing] = useState(false);
  const pathname = usePathname();
  const hide = pathname?.startsWith("/admin");
  const onOpenPacks = pathname?.startsWith("/open-packs");

  const track = revealing
    ? TRACKS.reveal
    : onOpenPacks
      ? TRACKS.openpack
      : TRACKS.main;

  useEffect(() => {
    const start = () => setRevealing(true);
    const end = () => setRevealing(false);
    window.addEventListener("hoshi:reveal-start", start);
    window.addEventListener("hoshi:reveal-end", end);
    return () => {
      window.removeEventListener("hoshi:reveal-start", start);
      window.removeEventListener("hoshi:reveal-end", end);
    };
  }, []);

  // Keep the element on the context's track + play/pause per `on`. Swap the source
  // ONLY when the track actually changes, so unrelated re-renders don't restart it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = VOLUME;
    if (!el.currentSrc.endsWith(track)) {
      el.src = track;
    }
    if (hide || !on) {
      el.pause();
      return;
    }
    el.play().catch(() => {
      /* blocked until a gesture — the interaction listener below starts it */
    });
  }, [on, hide, track]);

  // Autoplay policy: the first play() before any gesture is rejected. Start on the
  // first interaction anywhere on the page, once.
  useEffect(() => {
    if (hide) return;
    const kick = () => {
      if (on && ref.current) ref.current.play().catch(() => {});
    };
    window.addEventListener("pointerdown", kick, { once: true });
    return () => window.removeEventListener("pointerdown", kick);
  }, [on, hide]);

  const toggle = useCallback(() => setOn((p) => !p), []);

  if (hide) return null;

  return (
    <>
      <audio ref={ref} loop preload="auto" />
      <button
        onClick={toggle}
        aria-label={on ? "Pause music" : "Play music"}
        className="fixed bottom-6 right-6 z-40 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-lg text-white/70 shadow-lg backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
        title={on ? "Pause BGM" : "Play BGM"}
      >
        {on ? "♫" : "♩"}
      </button>
    </>
  );
}
