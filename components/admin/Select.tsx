"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Option = { label: string; value: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  /** Ukuran padding. Default "md". "sm" untuk edit inline dalam tabel. */
  size?: "sm" | "md";
};

export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  size = "md",
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  const pad = size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-sm";

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white/[0.04] ${pad} text-zinc-200 outline-none transition ${
          open ? "border-yellow-400/50 bg-white/[0.06]" : "border-white/10 hover:border-white/20"
        }`}
      >
        <span className={`truncate ${selected ? "text-zinc-100" : "text-zinc-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-auto rounded-xl border border-white/10 bg-[#16161c] p-1 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.7)] ring-1 ring-black/40">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                  on
                    ? "bg-yellow-400/10 text-yellow-200"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {on && (
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
