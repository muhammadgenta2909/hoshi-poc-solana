"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function BgmPlayer() {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const pathname = usePathname();
  const hide = pathname?.startsWith("/admin");

  useEffect(() => {
    if (ref.current) ref.current.volume = 0.4;
  }, []);

  useEffect(() => {
    if (hide) {
      ref.current?.pause();
      return;
    }
    if (on && ref.current) ref.current.play().catch(() => {});
    else ref.current?.pause();
  }, [on, hide]);

  const toggle = useCallback(() => {
    setOn((p) => !p);
  }, []);

  if (hide) return null;

  return (
    <>
      <audio ref={ref} loop preload="auto" src="/bgm.mpeg" />
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
