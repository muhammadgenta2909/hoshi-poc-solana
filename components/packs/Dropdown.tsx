"use client";

// Themed select. The native <select> popup is rendered by the OS and can't be
// styled (white list, blue highlight), so we render our own menu using the same
// dark palette as the marketplace sort dropdown in MarketGrid.tsx.
//
// Deliberately a leaf module (imports nothing but React) so it can be shared by
// components/account/ui.tsx and the pages without creating an import cycle.

import { useEffect, useRef, useState } from "react";

type OptionObject<T extends string> = { value: T; label: string };

export default function Dropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  menuClassName = "",
  align = "stretch",
  ariaLabel,
}: {
  /** Current value. Anything not present in `options` renders the placeholder. */
  value: string;
  onChange: (value: T) => void;
  /** Plain strings (label = value) or `{ value, label }` objects. Union lives at
   *  the ELEMENT level: a `readonly T[] | readonly OptionObject<T>[]` prop makes
   *  TS try the `T[]` arm first, fail T's `extends string` constraint, and widen
   *  T to `string` — which loses the caller's literal union. */
  options: readonly (T | OptionObject<T>)[];
  placeholder?: string;
  className?: string;
  /** Extra classes on the popup itself — for options whose labels are longer than
   *  the trigger (mis. nama set katalog CC), pakai `align="right"` + `max-w-…`. */
  menuClassName?: string;
  /** `stretch` matches the trigger width; `right` right-aligns a wider menu. */
  align?: "stretch" | "right";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const selected = items.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white/[0.04] px-4 py-2.5 text-left text-[14px] transition hover:border-white/25 focus:outline-none ${
          open ? "border-yellow-400/50" : "border-white/10"
        }`}
      >
        <span className={`truncate ${selected ? "text-zinc-100" : "text-zinc-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronIcon
          className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`no-scrollbar absolute top-full z-50 mt-2 max-h-52 overflow-auto rounded-xl border border-white/10 bg-[#1b1810] p-1 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.75)] ${
            align === "right" ? "right-0 min-w-[200px]" : "left-0 right-0"
          } ${menuClassName}`}
        >
          {items.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                title={o.label}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
                  active
                    ? "bg-yellow-400/10 text-yellow-400"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && <CheckIcon className="h-4 w-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12l5 5L20 6" />
    </svg>
  );
}
