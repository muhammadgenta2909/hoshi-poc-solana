"use client";

import { useEffect, useRef, useState } from "react";
import type { CardCategory, Currency, Listing, SortKey } from "@/lib/market";
import { CATEGORY_TABS, CURRENCIES, SORT_LABEL } from "@/lib/market";
import MarketCard from "./MarketCard";
import { GradientText, Img } from "./ui";

const SORT_KEYS: SortKey[] = ["newest", "price-asc", "price-desc", "rarity", "value"];

type Category = CardCategory | "All";

/** "N CARDS AVAILABLE" in the tall pixel font (Figma: Jersey 10). */
function CountLabel({ count }: { count: number }) {
  return (
    <span
      className="text-[17px] uppercase leading-none tracking-wide text-zinc-200"
      style={{ fontFamily: "var(--font-jersey)" }}
    >
      {count.toLocaleString("en-US")} Cards Available
    </span>
  );
}

function CurrencyToggle({
  currency,
  onCurrency,
}: {
  currency: Currency;
  onCurrency: (c: Currency) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/[0.05] p-1">
      {CURRENCIES.map((c) => {
        const active = currency === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onCurrency(c)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
              active ? "bg-yellow-400 text-[#171717]" : "text-zinc-400 hover:text-white"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function SortLinesIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 6h16M6 12h12M9 18h6" />
    </svg>
  );
}

/** Custom sort dropdown — the native <select> popup can't be themed, so this
 *  renders a styled menu that matches the dark panel palette. */
function SortSelect({ sort, onSort }: { sort: SortKey; onSort: (s: SortKey) => void }) {
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Sort listings"
        className={`inline-flex items-center gap-2 rounded-xl border bg-white/[0.04] px-3.5 py-2 text-sm text-zinc-200 transition hover:border-white/25 ${
          open ? "border-white/25" : "border-white/10"
        }`}
      >
        <span
          className="whitespace-nowrap text-[16px] leading-none"
          style={{ fontFamily: "var(--font-jersey)" }}
        >
          {SORT_LABEL[sort]}
        </span>
        <SortLinesIcon className="h-4 w-4 text-zinc-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-40 mt-2 min-w-[200px] overflow-hidden rounded-xl border border-white/10 bg-[#1b1810] p-1 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.75)]"
        >
          {SORT_KEYS.map((k) => {
            const active = k === sort;
            return (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onSort(k);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? "bg-yellow-400/10 text-yellow-400"
                    : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span
                  className="whitespace-nowrap text-[15px] leading-none"
                  style={{ fontFamily: "var(--font-jersey)" }}
                >
                  {SORT_LABEL[k]}
                </span>
                {active && (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 6" />
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

export default function MarketGrid({
  results,
  filtersOpen,
  onOpenFilters,
  category,
  onCategory,
  currency,
  onCurrency,
  sort,
  onSort,
}: {
  results: Listing[];
  filtersOpen: boolean;
  onOpenFilters: () => void;
  category: Category;
  onCategory: (c: Category) => void;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
}) {
  return (
    <section>
      {/* Header — count stays pinned left (aligned with the grid's left edge) in
          both states; controls sit on the right. Collapsed state adds the tab
          row plus the re-open Filters button. */}
      {filtersOpen ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CountLabel count={results.length} />
          <div className="flex items-center gap-3">
            <CurrencyToggle currency={currency} onCurrency={onCurrency} />
            <SortSelect sort={sort} onSort={onSort} />
          </div>
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-4">
          {/* category tabs, revealed when the filter panel is hidden */}
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_TABS.map((t) => {
              const active = category === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onCategory(t)}
                  aria-pressed={active}
                  style={{ fontFamily: "var(--font-jersey)" }}
                  className={`rounded-full border px-3.5 py-1 text-[16px] leading-none tracking-wide transition ${
                    active
                      ? "border-yellow-400 text-yellow-400"
                      : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* left group — Filters button first (aligned with the grid's left
                edge), then the count, matching the Figma design. */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onOpenFilters}
                style={{ fontFamily: "var(--font-jersey)" }}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[16px] leading-none text-zinc-200 transition hover:border-white/25"
              >
                Filters
                <Img src="/filter.png" alt="" className="h-4 w-4" />
              </button>
              <CountLabel count={results.length} />
            </div>
            <div className="flex items-center gap-3">
              <CurrencyToggle currency={currency} onCurrency={onCurrency} />
              <SortSelect sort={sort} onSort={onSort} />
            </div>
          </div>
        </div>
      )}

      {results.length === 0 ? (
        <div className="py-16 text-center">
          <Img src="/notes.png" alt="" className="mx-auto h-12 opacity-40" />
          <GradientText
            style={{ fontFamily: "var(--font-jersey)" }}
            className="mt-3 block text-2xl"
          >
            No cards found
          </GradientText>
          <p className="mt-1 text-sm text-zinc-500">Try clearing a filter or widening the price range.</p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
            filtersOpen ? "2xl:grid-cols-4" : "xl:grid-cols-4"
          }`}
        >
          {results.map((l) => (
            <MarketCard key={l.id} listing={l} currency={currency} />
          ))}
        </div>
      )}
    </section>
  );
}
