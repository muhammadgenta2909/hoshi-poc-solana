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
import { TIER_COLOR } from "@/lib/packs";
import { CC_RARITY_COLOR, type GachaRarity } from "@/lib/gacha";
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
const STAGE_MS = 1_200;

/** Cyan halo behind the mystery card silhouette (matches the reveal art). */
const GLOW = "#38E5D0";

/** Narrow a free-form CC rarity label (may be "Unknown") to a CC_RARITY_COLOR key. */
const isGachaRarity = (label: string): label is GachaRarity =>
  label === "Common" || label === "Uncommon" || label === "Rare" || label === "Epic";

/** Shorten a Solana address for the "sent to your wallet" line. */
const shortWallet = (w: string): string =>
  w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;

const formatUsd6 = (baseUnits: number): string =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(baseUnits / 1_000_000)}`;

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

  const onVideoEnd = useCallback(() => {
    setPhase((p) => {
      if (p !== "video") return p;
      if (error) return "error";
      return result ? "reveal" : "waiting"; // hand off to the staged reveal
    });
  }, [result, error]);

  // Kick playback imperatively too: `autoPlay` alone rejects silently on some
  // mobile browsers, and a rejected play promise is a NotAllowedError — NOT a
  // media `error` event — so onError never fires. If it rejects, don't sit on a
  // black frame; advance immediately (the watchdog is the backstop for stalls).
  useEffect(() => {
    if (phase !== "video") return;
    const el = videoRef.current;
    if (!el) return;
    const p = el.play?.();
    if (p && typeof p.catch === "function") p.catch(() => onVideoEnd());
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
  const color = result
    ? result.real && isGachaRarity(result.real.rarityLabel)
      ? CC_RARITY_COLOR[result.real.rarityLabel]
      : TIER_COLOR[result.rarity]
    : "#ffffff";
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
          autoPlay
          muted
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
        // key={stage} remounts on each beat so hoshi-fade-in re-fires → smooth
        // hand-off between slides. Centered (pt clears the sticky navbar).
        <div
          key={stage}
          className="hoshi-fade-in absolute inset-0 flex flex-col items-center justify-center gap-9 px-4 pt-24 text-center"
        >
          <MysteryCard />
          <GradientText
            className="text-4xl leading-none sm:text-5xl"
            style={JERSEY}
          >
            {teasers[stage]}
          </GradientText>
        </div>
      )}

      {phase === "reveal" && result && atFinal && (
        // Scrollable + vertically centered with a top floor (pt-24) so the card
        // is never clipped by the navbar and never mepet to the top edge.
        <div className="absolute inset-0 overflow-y-auto">
          <div className="flex min-h-full flex-col items-center justify-center gap-5 px-4 pb-14 pt-24 text-center">
            {/* Headline (Outfit) */}
            <p className="text-sm font-medium text-zinc-300">
              You pulled {article}{" "}
              <span style={{ color }}>{rarityText}</span> card
            </p>

            {/* Real card RISES in, halo tinted by rarity. */}
            <div className={`relative ${reduced ? "" : "hoshi-card-rise"}`}>
              <div
                className="absolute -inset-8 -z-10 rounded-full blur-2xl"
                style={{ background: `radial-gradient(circle, ${color}55, transparent 72%)` }}
              />
              <div
                className="relative overflow-hidden rounded-2xl border-2"
                style={{ borderColor: color, boxShadow: `0 0 44px -8px ${color}` }}
              >
                <Img
                  src={result.card.imageUrl}
                  alt={result.card.name}
                  className="h-[min(23rem,44vh)] w-[min(17rem,33vh)] object-cover"
                />
              </div>
            </div>

            {/* Title (Jersey, gold) */}
            <GradientText
              className="max-w-[22rem] text-2xl leading-tight sm:text-3xl"
              style={JERSEY}
            >
              {result.card.name}
            </GradientText>

            {/* Delivery + price (Outfit) */}
            {result.real && (
              <div className="flex flex-col items-center gap-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-400">
                  {result.real.sent ? "Sent to your wallet" : "Minted on devnet"}
                  {result.real.wallet && (
                    <span className="font-mono text-xs text-emerald-300/90">
                      {shortWallet(result.real.wallet)}
                    </span>
                  )}
                </p>
                {result.real.priceUsdc != null && (
                  <p className="max-w-sm text-xs text-zinc-500">
                    Pack price {formatUsd6(result.real.priceUsdc)} — paid by the Hoshi treasury
                    (devnet demo), not your wallet.
                  </p>
                )}
              </div>
            )}

            {/* View on Solana (Outfit link) */}
            {result.real?.explorerUrl && (
              <a
                href={result.real.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-yellow-300 underline-offset-4 transition hover:text-yellow-200 hover:underline"
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
