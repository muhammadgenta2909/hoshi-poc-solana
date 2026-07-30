"use client";

// Pack-opening takeover (NOT a popup): it mounts the moment the purchase starts
// and plays the rip video WHILE the treasury purchase runs, so there is no 30s
// spinner between click and motion. It sits UNDER the sticky TopNav (z-20 vs the
// nav's z-30) with no ✕ button, so it reads as a page state, not a dialog.
//
// After the video, a STAGED reveal builds suspense CollectorCrypt-style: a glowing
// card silhouette teases the year → grade → rarity, one per beat, then the FINAL
// slide flips to the real card + details. Teasers only show for facts we actually
// have (year/grade are parsed from the card name; rarity is always known).
//
// Phases: video → (waiting) → reveal[stages] | error. Escape / "Back to packs"
// leave only from the final reveal / error — mid-purchase there is nothing safe
// to cancel (the treasury call keeps running server-side anyway).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenResult } from "@/lib/openPack";
import { packVideoSrc } from "@/lib/packVideo";
import { GOLD_GRADIENT, GradientText, Img } from "./ui";

type Phase = "video" | "waiting" | "reveal" | "error";

/** Watchdog for the "video" phase. A muted-autoplay block (iOS Low Power Mode),
 *  a stalled stream, or a missing/undecodable file leaves the <video> firing
 *  neither `ended` nor `error`, which would strand the takeover on a black
 *  frame forever (there is no ✕ and Escape is gated). If the video hasn't
 *  finished by this cap we advance anyway — the reveal never depends on the
 *  video, only on the purchase outcome. Sized well above the clip's real length
 *  (~6s) so it only ever catches a genuine wedge. */
const VIDEO_WATCHDOG_MS = 14_000;

/** How long each teaser slide (year / grade / rarity) holds before the next. */
const STAGE_MS = 1_700;

/** Cyan halo behind the mystery card silhouette (matches the reveal art). */
const GLOW = "#38E5D0";


/** Shorten a Solana address for the "sent to your wallet" line. */
const shortWallet = (w: string): string =>
  w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;

/** First 4-digit year (19xx/20xx) in a CC card name, e.g. "2022 #074 …" → "2022". */
function parseYear(name: string): string | null {
  return /\b(?:19|20)\d{2}\b/.exec(name)?.[0] ?? null;
}

/** Grade off a CC slab name, e.g. "… PSA 10 GEM MINT" → "PSA 10". */
function parseGrade(name: string): string | null {
  const m = /\b(PSA|CGC|BGS|SGC|BECKETT)\s*(10|\d(?:\.\d)?)\b/i.exec(name);
  if (!m) return null;
  const grader = m[1].toUpperCase() === "BECKETT" ? "BGS" : m[1].toUpperCase();
  return `${grader} ${m[2]}`;
}

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;

export default function RipReveal({
  result,
  error,
  onClose,
  onRipAgain,
}: {
  /** Null while the purchase is still in flight. */
  result: OpenResult | null;
  /** Purchase failure message; switches the takeover to the error state. */
  error: string | null;
  onClose: () => void;
  onRipAgain: () => void;
}) {
  // Read once at mount (the parent remounts this component per pull).
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [phase, setPhase] = useState<Phase>(() => {
    if (error) return "error";
    // Reduced motion: skip the mp4 entirely.
    if (reduced) return result ? "reveal" : "waiting";
    // The clip is rarity-specific, so we can't pick it until the pull result
    // lands. If it's already here, play straight away; otherwise hold in
    // "waiting" and start the video the moment the result arrives.
    return result ? "video" : "waiting";
  });
  // Reveal step: 0..teasers.length-1 are the teaser slides, teasers.length is the
  // final card. Reduced motion jumps straight to the final slide (99 ≥ any count).
  const [stage, setStage] = useState(() => (reduced ? 99 : 0));
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lock the page scroll while the full-screen takeover is mounted, so the page's
  // own scrollbar doesn't sit next to the reveal's overflow scrollbar (double bar).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Duck the page background music for the whole takeover so the rip clip's OWN
  // audio is heard cleanly — the BGM toggle button never competes with or mutes
  // the reveal sound. BgmPlayer restores its prior state when we dispatch restore.
  useEffect(() => {
    window.dispatchEvent(new Event("hoshi:bgm-duck"));
    return () => {
      window.dispatchEvent(new Event("hoshi:bgm-restore"));
    };
  }, []);

  const onVideoEnd = useCallback(() => {
    setPhase((p) => {
      if (p !== "video") return p;
      if (error) return "error";
      return result ? "reveal" : "waiting"; // hand off to the staged reveal
    });
  }, [result, error]);

  // Kick playback imperatively (no `autoPlay`/`muted` attrs — we drive muted state
  // here). The clips carry an AUDIO track and the user wants to hear them, so try
  // WITH sound first: reaching the reveal always follows a user gesture (opening /
  // paying for the pack), which satisfies the browser autoplay policy in the common
  // flows. If unmuted playback is still blocked (e.g. a fresh page after the payment
  // redirect, no gesture yet), fall back to MUTED playback rather than skipping the
  // reveal — never strand the takeover on a black frame. A rejected play promise is
  // a NotAllowedError, not a media `error` event, so onError never fires; the final
  // fallback advances manually, and the watchdog backstops genuine stalls.
  useEffect(() => {
    if (phase !== "video") return;
    const el = videoRef.current;
    if (!el) return;
    let cancelled = false;
    const start = async () => {
      el.muted = false;
      el.volume = 1;
      try {
        await el.play();
      } catch {
        if (cancelled) return;
        el.muted = true; // sound blocked → retry silently
        try {
          await el.play();
        } catch {
          if (!cancelled) onVideoEnd(); // truly can't play → don't wedge
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [phase, onVideoEnd]);

  // Never let the "video" phase wedge (see VIDEO_WATCHDOG_MS).
  useEffect(() => {
    if (phase !== "video") return;
    const t = setTimeout(() => onVideoEnd(), VIDEO_WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [phase, onVideoEnd]);

  // Purchase settles while we're waiting → START the rarity-specific video (its
  // src reads `result`, which is now known). Reduced motion skips straight to the
  // reveal. Failures cut in immediately (even mid-video): making the user watch
  // the whole rip before telling them it failed would be worse than the jump-cut.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync phase to the purchase outcome */
    if (error) {
      setPhase((p) => (p === "reveal" ? p : "error"));
    } else if (result) {
      setPhase((p) => (p === "waiting" ? (reduced ? "reveal" : "video") : p));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [result, error, reduced]);

  const rarityText = result ? result.real?.rarityLabel ?? result.rarity : "";
  const article = /^[aeiou]/i.test(rarityText) ? "an" : "a";

  // Teaser labels, in reveal order — only the facts we actually have.
  const teasers = useMemo(() => {
    if (!result) return [] as string[];
    const out: string[] = [];
    const year = parseYear(result.card.name);
    if (year) out.push(year);
    const grade = parseGrade(result.card.name);
    if (grade) out.push(grade);
    if (rarityText) out.push(rarityText.toUpperCase());
    return out;
  }, [result, rarityText]);

  const atFinal = stage >= teasers.length;

  // Advance the teaser slides on a beat until we reach the final card.
  useEffect(() => {
    if (phase !== "reveal" || reduced) return;
    if (stage >= teasers.length) return;
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_MS);
    return () => clearTimeout(t);
  }, [phase, reduced, stage, teasers.length]);

  // Escape leaves the takeover — but only once there's a settled outcome shown.
  useEffect(() => {
    if (!(phase === "error" || (phase === "reveal" && atFinal))) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [phase, atFinal, onClose]);

  return (
    <div
      aria-label="Pack opening"
      className={`fixed inset-0 z-20 ${reduced ? "" : "hoshi-fade-in"}`}
      style={{ background: "#000" }}
    >
      {/* Video layer — plays only once the pull result is known, so the rarity
          can pick the clip (epic vs rare). Hands off to the staged reveal. */}
      {phase === "video" && (
        <video
          ref={videoRef}
          playsInline
          preload="auto"
          onEnded={onVideoEnd}
          onError={onVideoEnd}
          className="block h-full w-full object-cover"
          src={packVideoSrc(result)}
        />
      )}

      {phase === "waiting" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-3 text-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
          <p className="text-sm font-medium text-white/80">Revealing your card…</p>
          <p className="max-w-xs text-xs text-white/50">
            The treasury purchase is finishing on devnet.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="flex h-full w-full items-center justify-center p-4">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-red-500/15">
              <span className="text-2xl">!</span>
            </div>
            <p className="text-lg font-semibold text-zinc-50">Couldn’t open the pack</p>
            <p className="text-sm text-zinc-400">{error ?? "Something went wrong."}</p>
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={onRipAgain}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[#171717] transition hover:brightness-105"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                Back to packs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Staged reveal ─────────────────────────────────────────────────── */}
      {phase === "reveal" && result && !atFinal && (
        // The card silhouette holds steady across beats (fades in once); only the
        // teaser label crossfades — old drifts down + fades, new rises up + fades.
        <div className="hoshi-fade-in absolute inset-0 flex flex-col items-center justify-center gap-9 px-4 pt-24 text-center">
          <MysteryCard />
          <TeaserText text={teasers[stage] ?? ""} />
        </div>
      )}

      {phase === "reveal" && result && atFinal && (
        // Scrollable + vertically centered with a top floor (pt-24) so the card
        // is never clipped by the navbar and never mepet to the top edge.
        <div className="absolute inset-0 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 pb-14 pt-24 text-center">
            {/* Headline — smaller than the card title below it */}
            <p className="text-base font-semibold text-white sm:text-lg">
              You Pulled {article} {rarityText} Card
            </p>

            {/* Rarity badge — always green #2EC500, no icon */}
            <span
              className="inline-flex items-center rounded-full px-3.5 py-1 text-sm font-bold text-white"
              style={{ background: "#2EC500" }}
            >
              {rarityText}
            </span>

            {/* Real card — full slab, RISES in. No glow/shadow (per design). */}
            <div className={reduced ? "" : "hoshi-card-rise"}>
              <Img
                src={result.card.imageUrl}
                alt={result.card.name}
                className="max-h-[min(23rem,46vh)] w-auto rounded-xl object-contain"
              />
            </div>

            {/* Title (Jersey, gold) — bigger than the headline; wide so it never wraps */}
            <GradientText
              className="max-w-[min(92vw,48rem)] text-3xl leading-tight sm:text-4xl"
              style={JERSEY}
            >
              {result.card.name}
            </GradientText>

            {/* Delivery (Outfit) — white */}
            {result.real && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
                {result.real.sent ? "Sent to your wallet" : "Minted on-chain"}
                {result.real.wallet && (
                  <span className="font-mono text-xs text-white/70">
                    {shortWallet(result.real.wallet)}
                  </span>
                )}
              </p>
            )}

            {/* View on Solana — #FEF003 */}
            {result.real?.explorerUrl && (
              <a
                href={result.real.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold underline underline-offset-4 transition hover:brightness-110"
                style={{ color: "#FEF003" }}
              >
                View on Solana ↗
              </a>
            )}

            {/* Actions — both Jersey (title + buttons only). */}
            <div className="mt-1 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-lg leading-none text-zinc-100 transition hover:bg-white/10"
                style={JERSEY}
              >
                Back to Packs
              </button>
              <button
                type="button"
                onClick={onRipAgain}
                className="rounded-xl px-6 py-3 text-lg leading-none transition hover:brightness-105 active:scale-[0.99]"
                style={{
                  backgroundImage: GOLD_GRADIENT,
                  border: "1px solid #F2C101",
                  color: "#171717",
                  ...JERSEY,
                }}
              >
                Open Another
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Glowing white card silhouette shown during the teaser beats — the real card
 *  isn't revealed yet, so this stands in with a cyan halo + gentle float. */
function MysteryCard() {
  return (
    <div className="relative animate-float">
      <div
        className="absolute -inset-10 -z-10 rounded-[3rem] blur-2xl"
        style={{ background: `radial-gradient(circle, ${GLOW}88, transparent 68%)` }}
      />
      <div
        className="h-[min(19rem,40vh)] w-[min(13.5rem,28vh)] rounded-2xl bg-white"
        style={{ boxShadow: `0 0 46px 2px ${GLOW}, inset 0 0 0 1px rgba(255,255,255,0.9)` }}
      />
    </div>
  );
}

/** Crossfades the teaser label in a fixed-height slot: when `text` changes, the
 *  outgoing word drifts DOWN + fades out while the incoming word rises UP from
 *  below + fades in — both absolutely positioned so neither shifts the layout. */
function TeaserText({ text }: { text: string }) {
  const [current, setCurrent] = useState(text);
  const [leaving, setLeaving] = useState<string | null>(null);

  useEffect(() => {
    if (text === current) return;
    /* eslint-disable react-hooks/set-state-in-effect -- swap slides when the beat's text prop changes */
    setLeaving(current); // old word begins its exit (down + fade)
    setCurrent(text); // new word enters (up + fade)
    /* eslint-enable react-hooks/set-state-in-effect */
    const t = setTimeout(() => setLeaving(null), 820);
    return () => clearTimeout(t);
  }, [text, current]);

  return (
    <div className="relative h-[1.2em] w-full text-4xl leading-none sm:text-5xl">
      {leaving && (
        <div
          key={`out-${leaving}`}
          className="hoshi-teaser-out absolute inset-0 grid place-items-center"
        >
          <GradientText style={JERSEY}>{leaving}</GradientText>
        </div>
      )}
      <div
        key={`in-${current}`}
        className="hoshi-teaser-in absolute inset-0 grid place-items-center"
      >
        <GradientText style={JERSEY}>{current}</GradientText>
      </div>
    </div>
  );
}
