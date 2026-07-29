"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { Pack } from "@/lib/packs";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Drag sensitivity: pixels dragged -> degrees rotated.
const SPEED = 0.6;
// Crossfade duration between pack arts.
const FADE_MS = 300;

const face: CSSProperties = {
  position: "absolute",
  inset: 0,
  height: "100%",
  width: "100%",
  objectFit: "contain",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  userSelect: "none",
  filter: "drop-shadow(0 22px 38px rgba(0,0,0,0.45))",
};

/**
 * A two-sided pack face. It fades in on mount; when deactivated it fades out
 * from its *current* opacity (CSS transition, no keyframe reset), so an
 * interrupted fade never flashes back to full — rapid swaps stay clean.
 */
function FadeLayer({
  src,
  alt,
  active,
  onExited,
}: {
  src: string;
  alt: string;
  active: boolean;
  onExited: () => void;
}) {
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (active) {
      const r = requestAnimationFrame(() => setOpacity(1));
      return () => cancelAnimationFrame(r);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset opacity so a re-activated layer fades from 0
    setOpacity(0);
  }, [active]);

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity,
        transition: `opacity ${FADE_MS}ms ease`,
        transformStyle: "preserve-3d",
      }}
      onTransitionEnd={() => {
        if (!active) onExited();
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} style={face} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        draggable={false}
        style={{ ...face, transform: "rotateY(180deg)" }}
      />
    </div>
  );
}

/** Center pack artwork you can grab and spin 360° in 3D; swaps crossfade cleanly. */
export default function Pack3D({ pack, className = "" }: { pack: Pack; className?: string }) {
  const src = pack.heroImage ?? pack.image ?? "";
  const keyRef = useRef(0);
  const [layers, setLayers] = useState<{ key: number; src: string }[]>(() =>
    src ? [{ key: 0, src }] : [],
  );
  const [rot, setRot] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(false);
  const last = useRef({ x: 0, y: 0 });

  // On pack change: push a fresh top layer to crossfade in, keeping only the
  // immediate predecessor so rapid clicks never pile up stale ghosts.
  useEffect(() => {
    if (!src) return;
    setLayers((ls) => {
      const top = ls[ls.length - 1];
      if (top && top.src === src) return ls;
      keyRef.current += 1;
      const next = { key: keyRef.current, src };
      return top ? [top, next] : [next];
    });
    setRot({ x: 0, y: 0 });
  }, [src]);

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    setDrag(true);
    last.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    setRot((r) => ({
      x: clamp(r.x - dy * SPEED, -35, 35),
      y: r.y + dx * SPEED,
    }));
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    setDrag(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer may already be released */
    }
  }

  if (!src) return null;

  const removeLayer = (key: number) =>
    setLayers((ls) => (ls.length <= 1 ? ls : ls.filter((l) => l.key !== key)));

  return (
    <div
      className={className}
      style={{ perspective: "1200px", touchAction: "none" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          transformStyle: "preserve-3d",
          transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
          transition: drag ? "none" : "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
          cursor: drag ? "grabbing" : "grab",
        }}
      >
        {layers.map((l, i) => (
          <FadeLayer
            key={l.key}
            src={l.src}
            alt={i === layers.length - 1 ? pack.name : ""}
            active={i === layers.length - 1}
            onExited={() => removeLayer(l.key)}
          />
        ))}
      </div>
    </div>
  );
}
