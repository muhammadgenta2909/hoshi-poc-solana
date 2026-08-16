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

// Soft by default (~25%): ambience, not foreground. User bisa atur sendiri lewat slider (persist).
const DEFAULT_VOLUME = 0.25;
const VOLUME_KEY = "hoshi_bgm_volume";

export default function BgmPlayer() {
  const ref = useRef<HTMLAudioElement>(null);
  // The button reflects the REAL playback state, not an intent flag — otherwise it
  // shows "playing" before any sound is possible and the first click reads as "mute",
  // forcing the confusing mute→unmute dance. `mutedByUser` is the only intent we keep:
  // it stays false (we WANT ambience) until the user explicitly pauses.
  const [playing, setPlaying] = useState(false);
  const mutedByUser = useRef(false);
  // The pack-reveal takeover swaps the soundtrack for its duration (see RipReveal,
  // which dispatches hoshi:reveal-start / hoshi:reveal-end).
  const [revealing, setRevealing] = useState(false);
  // Volume (0..1) + panel kontrol yang muncul saat button musik diklik.
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [panelOpen, setPanelOpen] = useState(false);
  // Cermin volume di ref supaya effect track/kick (yang tak punya `volume` di deps) bisa
  // menerapkannya di SETIAP el.play() — kalau tidak, elemen baru/ganti-track bisa main di volume
  // default 1.0 walau slider di 0.
  const volumeRef = useRef(volume);
  const pathname = usePathname();
  const hide = pathname?.startsWith("/admin");
  const onOpenPacks = pathname?.startsWith("/open-packs");

  const track = revealing
    ? TRACKS.reveal
    : onOpenPacks
      ? TRACKS.openpack
      : TRACKS.main;

  // Mirror the element's real state onto the button icon.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("playing", onPlaying);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("pause", onPause);
    };
  }, []);

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

  // Muat volume tersimpan (client-only agar tak mismatch SSR).
  useEffect(() => {
    const raw = localStorage.getItem(VOLUME_KEY);
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 1) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setVolume(v);
    }
  }, []);

  // Terapkan volume ke elemen audio + simpan. `muted` di-set eksplisit saat 0 → BENAR-BENAR senyap
  // (volume=0 saja kadang masih terdengar bila elemen di-play ulang sebelum volume ter-apply).
  useEffect(() => {
    volumeRef.current = volume;
    const el = ref.current;
    if (el) {
      el.volume = volume;
      el.muted = volume <= 0;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(volume));
    } catch {
      /* abaikan */
    }
  }, [volume]);

  // Keep the element on the context's track; try to play unless hidden or the user
  // explicitly muted. Swap the source ONLY when the track actually changes.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.currentSrc.endsWith(track)) {
      el.src = track;
      el.load();
    }
    // Terapkan volume/mute SETIAP kali (elemen baru / ganti track bisa reset ke default 1.0).
    el.volume = volumeRef.current;
    el.muted = volumeRef.current <= 0;
    if (hide || mutedByUser.current) {
      el.pause();
      return;
    }
    el.play().catch(() => {
      /* blocked until a gesture — the listener below starts it on the FIRST one */
    });
  }, [hide, track]);

  // Autoplay policy: the first play() before any user gesture is rejected. Start on
  // the VERY FIRST interaction of any kind (pointer / touch / key), then stop
  // listening once playback actually begins. Re-armed if the track changes.
  useEffect(() => {
    if (hide) return;
    const el = ref.current;
    if (!el) return;
    const kick = () => {
      if (!mutedByUser.current) {
        el.volume = volumeRef.current;
        el.muted = volumeRef.current <= 0;
        el.play().catch(() => {});
      }
    };
    const events = ["pointerdown", "touchstart", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, kick));
    const stop = () => events.forEach((e) => window.removeEventListener(e, kick));
    el.addEventListener("playing", stop, { once: true });
    return () => {
      stop();
      el.removeEventListener("playing", stop);
    };
  }, [hide, track]);

  // The button is honest: ♩ while silent (tap to start), ♫ while playing (tap to
  // pause). One tap does the obvious thing — no mute→unmute dance.
  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      mutedByUser.current = false;
      el.play().catch(() => {});
    } else {
      mutedByUser.current = true;
      el.pause();
    }
  }, []);

  if (hide) return null;

  return (
    <>
      <audio ref={ref} loop preload="auto" />
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
        {/* Panel kontrol muncul saat button musik diklik: play/pause + slider volume. */}
        {panelOpen && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-[#141206]/95 px-3 py-2.5 shadow-xl backdrop-blur-sm">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause music" : "Play music"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume musik"
              className="h-1.5 w-28 cursor-pointer accent-yellow-400"
            />
            <span className="w-7 text-right text-[11px] tabular-nums text-zinc-400">
              {Math.round(volume * 100)}
            </span>
          </div>
        )}
        <button
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Kontrol musik & volume"
          aria-expanded={panelOpen}
          className="grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-white/5 text-lg text-white/70 shadow-lg backdrop-blur-sm transition hover:bg-white/10 hover:text-white"
          title="Musik & volume"
        >
          {playing ? "♫" : "♩"}
        </button>
      </div>
    </>
  );
}
