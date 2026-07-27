"use client";

import type { ReactNode } from "react";
import type { Era, Element, GradeTier, Grader, VaultSource } from "@/lib/market";
import {
  ELEMENTS,
  ERAS,
  GRADE_TIERS,
  GRADERS,
  VAULT_FILTER_LABEL,
  VAULT_SOURCES,
} from "@/lib/market";
import { formatIdr, GOLD_GRADIENT, Img } from "./ui";

/** Section heading in the tall pixel display font (Figma: Jersey 10). */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-3 text-[17px] uppercase leading-none tracking-wide text-zinc-200"
      style={{ fontFamily: "var(--font-jersey)" }}
    >
      {children}
    </p>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="#171717" strokeWidth="3.5">
      <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A labelled checkbox row with a right-aligned count (Era / Grader / Element). */
function CheckRow({
  label,
  count,
  checked,
  onToggle,
}: {
  label: string;
  count: number;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="group flex w-full items-center justify-between py-[5px] text-left"
    >
      <span className="flex items-center gap-2.5">
        <span
          className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition ${
            checked
              ? "border-yellow-400 bg-yellow-400"
              : "border-white/20 bg-white/[0.03] group-hover:border-white/40"
          }`}
        >
          {checked && <CheckIcon />}
        </span>
        <span className="text-[13px] text-zinc-300 group-hover:text-white">{label}</span>
      </span>
      <span className="text-[12px] tabular-nums text-zinc-500">{count}</span>
    </button>
  );
}

/** Dual-handle price range slider with a gold filled segment (Figma). */
function RangeSlider({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="relative h-6">
      {/* base track */}
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[9px] -translate-y-1/2 rounded-full bg-white/25" />
      {/* filled segment between the two handles */}
      <div
        className="pointer-events-none absolute top-1/2 h-[9px] -translate-y-1/2 rounded-full"
        style={{
          left: `${pct(valueMin)}%`,
          right: `${100 - pct(valueMax)}%`,
          backgroundImage: "linear-gradient(90deg, #FFEB5B 0%, #F59E0B 100%)",
        }}
      />
      <input
        type="range"
        className="hoshi-range"
        min={min}
        max={max}
        step={step}
        value={valueMin}
        aria-label="Minimum price"
        onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax - step), valueMax)}
      />
      <input
        type="range"
        className="hoshi-range"
        min={min}
        max={max}
        step={step}
        value={valueMax}
        aria-label="Maximum price"
        onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin + step))}
      />
    </div>
  );
}

export default function MarketFilterPanel({
  onCollapse,
  onClear,
  priceBounds,
  priceMin,
  priceMax,
  onPrice,
  eras,
  onToggleEra,
  eraCounts,
  gradeTier,
  onGradeTier,
  graders,
  onToggleGrader,
  graderCounts,
  elements,
  onToggleElement,
  elementCounts,
  vaultSources,
  onToggleVaultSource,
  vaultSourceCounts,
}: {
  onCollapse: () => void;
  onClear: () => void;
  priceBounds: [number, number];
  priceMin: number;
  priceMax: number;
  onPrice: (lo: number, hi: number) => void;
  eras: Set<Era>;
  onToggleEra: (e: Era) => void;
  eraCounts: Record<Era, number>;
  gradeTier: GradeTier;
  onGradeTier: (t: GradeTier) => void;
  graders: Set<Grader>;
  onToggleGrader: (g: Grader) => void;
  graderCounts: Record<Grader, number>;
  elements: Set<Element>;
  onToggleElement: (e: Element) => void;
  elementCounts: Record<Element, number>;
  vaultSources: Set<VaultSource>;
  onToggleVaultSource: (s: VaultSource) => void;
  vaultSourceCounts: Record<VaultSource, number>;
}) {
  return (
    <aside className="self-start rounded-2xl bg-[#181507] p-4">
      {/* Header: icon + title + Clear All, with the collapse toggle at the far right */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-white">
          <Img src="/icon-select.png" alt="" className="h-4 w-4" />
          <span className="text-[20px] leading-none" style={{ fontFamily: "var(--font-jersey)" }}>
            Filters
          </span>
          <button
            type="button"
            onClick={onClear}
            className="ml-1 text-[15px] uppercase leading-none tracking-wide text-zinc-500 transition hover:text-yellow-400"
            style={{ fontFamily: "var(--font-jersey)" }}
          >
            Clear All
          </button>
        </h2>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide filters"
          className="opacity-80 transition hover:opacity-100"
        >
          <Img src="/icon-left.png" alt="" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 border-t border-white/10 pt-4">
        <div className="flex flex-col gap-6">
          {/* Vault — Hoshi vs CollectorCrypt provenance (PM requirement) */}
          <div>
            <SectionTitle>Vault</SectionTitle>
            <div className="flex flex-col">
              {VAULT_SOURCES.map((s) => (
                <CheckRow
                  key={s}
                  label={VAULT_FILTER_LABEL[s]}
                  count={vaultSourceCounts[s]}
                  checked={vaultSources.has(s)}
                  onToggle={() => onToggleVaultSource(s)}
                />
              ))}
            </div>
          </div>

          {/* Price Range */}
          <div>
            <SectionTitle>Price Range</SectionTitle>
            <div className="mb-2 flex items-center justify-between text-[11px] tabular-nums text-zinc-400">
              <span>IDR {formatIdr(priceMin)}</span>
              <span>IDR {formatIdr(priceMax)}</span>
            </div>
            <RangeSlider
              min={priceBounds[0]}
              max={priceBounds[1]}
              step={1_000_000}
              valueMin={priceMin}
              valueMax={priceMax}
              onChange={onPrice}
            />
          </div>

          {/* Era / Generation */}
          <div>
            <SectionTitle>Era / Generation</SectionTitle>
            <div className="flex flex-col">
              {ERAS.map((e) => (
                <CheckRow
                  key={e}
                  label={e}
                  count={eraCounts[e]}
                  checked={eras.has(e)}
                  onToggle={() => onToggleEra(e)}
                />
              ))}
            </div>
          </div>

          {/* Grade & Grader */}
          <div>
            <SectionTitle>Grade &amp; Grader</SectionTitle>
            <div className="mb-3 flex items-center gap-1 rounded-full bg-white/[0.04] p-1">
              {GRADE_TIERS.map((t) => {
                const active = gradeTier === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onGradeTier(t)}
                    aria-pressed={active}
                    className={`flex-1 rounded-full px-2 py-1 text-[12px] transition ${
                      active ? "font-semibold text-[#171717]" : "text-zinc-400 hover:text-white"
                    }`}
                    style={active ? { backgroundImage: GOLD_GRADIENT } : undefined}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col">
              {GRADERS.map((g) => (
                <CheckRow
                  key={g}
                  label={g}
                  count={graderCounts[g]}
                  checked={graders.has(g)}
                  onToggle={() => onToggleGrader(g)}
                />
              ))}
            </div>
          </div>

          {/* Element */}
          <div>
            <SectionTitle>Element</SectionTitle>
            <div className="flex flex-col">
              {ELEMENTS.map((el) => (
                <CheckRow
                  key={el}
                  label={el}
                  count={elementCounts[el]}
                  checked={elements.has(el)}
                  onToggle={() => onToggleElement(el)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
