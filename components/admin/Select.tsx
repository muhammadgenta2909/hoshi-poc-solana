"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Option = { label: string; value: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
};

export default function Select({ value, onChange, options, placeholder = "Select…", className = "" }: Props) {
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

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 outline-none transition focus:border-yellow-400/40"
      >
        <span className={selected ? "text-zinc-200" : "text-zinc-500"}>{selected ? selected.label : placeholder}</span>
        <svg className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-auto rounded-xl border border-white/10 bg-[#222] p-1 shadow-xl">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition ${
                o.value === value
                  ? "bg-yellow-400/10 text-yellow-200"
                  : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
