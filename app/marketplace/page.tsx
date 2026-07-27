"use client";

import { useEffect, useMemo, useState } from "react";
import { TIER_ORDER } from "@/lib/packs";
import type {
  CardCategory,
  Currency,
  Element as CardElement,
  Era,
  GradeTier,
  Grader,
  Listing,
  SortKey,
  VaultSource,
} from "@/lib/market";
import { ELEMENTS, ERAS, GRADE_FLOOR, GRADERS, VAULT_SOURCES, valueDeltaPct } from "@/lib/market";
import { getListings } from "@/lib/api";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import MarketFilterPanel from "@/components/packs/MarketFilterPanel";
import MarketGrid from "@/components/packs/MarketGrid";

type Category = CardCategory | "All";

// Price slider step, and a fallback ceiling used only before the catalog loads
// (or if it's empty). The real upper bound is derived from the live catalog below.
const PRICE_STEP = 1_000_000;
const PRICE_MAX_FALLBACK = 100_000_000;

// Toggle membership in a Set immutably (era / grader / element filters).
function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function MarketplacePage() {
  const [filtersOpen, setFiltersOpen] = useState(true);

  // Catalog from the backend (GET /api/marketplace). Data source: mock → API.
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getListings()
      .then((data) => alive && setListings(data))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Facet counts are computed over the full catalog (not the active filters) so
  // each row shows how many of that facet exist — mirrors the "123" counts in Figma.
  const eraCounts = useMemo(
    () =>
      ERAS.reduce(
        (acc, e) => ({ ...acc, [e]: listings.filter((l) => l.era === e).length }),
        {} as Record<Era, number>,
      ),
    [listings],
  );
  const graderCounts = useMemo(
    () =>
      GRADERS.reduce(
        (acc, g) => ({ ...acc, [g]: listings.filter((l) => l.grader === g).length }),
        {} as Record<Grader, number>,
      ),
    [listings],
  );
  const elementCounts = useMemo(
    () =>
      ELEMENTS.reduce(
        (acc, el) => ({ ...acc, [el]: listings.filter((l) => l.element === el).length }),
        {} as Record<CardElement, number>,
      ),
    [listings],
  );
  // Legacy/mock rows without a source count as HOSHI (the historical default).
  const vaultSourceCounts = useMemo(
    () =>
      VAULT_SOURCES.reduce(
        (acc, s) => ({
          ...acc,
          [s]: listings.filter((l) => (l.source ?? "HOSHI") === s).length,
        }),
        {} as Record<VaultSource, number>,
      ),
    [listings],
  );

  // Price slider bounds derived from the live catalog: [0, most expensive listing]
  // (rounded up to the slider step). Falls back to a default ceiling while loading.
  const priceBounds = useMemo<[number, number]>(() => {
    const maxPrice = listings.reduce((m, l) => Math.max(m, l.price), 0);
    const upper =
      maxPrice > 0 ? Math.ceil(maxPrice / PRICE_STEP) * PRICE_STEP : PRICE_MAX_FALLBACK;
    return [0, upper];
  }, [listings]);

  // null = pinned to the current catalog bound (full range) — so the slider tracks
  // the live max until the user drags it. Clamped so it stays within bounds.
  const [priceMin, setPriceMin] = useState<number | null>(null);
  const [priceMax, setPriceMax] = useState<number | null>(null);
  const effMin = Math.max(priceMin ?? priceBounds[0], priceBounds[0]);
  const effMax = Math.min(priceMax ?? priceBounds[1], priceBounds[1]);

  const [eras, setEras] = useState<Set<Era>>(new Set());
  const [gradeTier, setGradeTier] = useState<GradeTier>("All");
  const [graders, setGraders] = useState<Set<Grader>>(new Set());
  const [elements, setElements] = useState<Set<CardElement>>(new Set());
  const [vaultSources, setVaultSources] = useState<Set<VaultSource>>(new Set());

  const [category, setCategory] = useState<Category>("All");
  const [currency, setCurrency] = useState<Currency>("IDR");
  const [sort, setSort] = useState<SortKey>("newest");

  const results = useMemo(() => {
    const floor = GRADE_FLOOR[gradeTier];

    const filtered = listings.filter((l) => {
      if (l.price < effMin || l.price > effMax) return false;
      if (vaultSources.size > 0 && !vaultSources.has(l.source ?? "HOSHI")) return false;
      if (eras.size > 0 && !eras.has(l.era)) return false;
      if (graders.size > 0 && !graders.has(l.grader)) return false;
      if (l.gradeScore < floor) return false;
      if (elements.size > 0 && !elements.has(l.element)) return false;
      if (category !== "All" && l.category !== category) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (sort) {
      case "newest":
        sorted.sort((a, b) => b.listedAt.localeCompare(a.listedAt));
        break;
      case "price-asc":
        sorted.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.price - a.price);
        break;
      case "rarity":
        sorted.sort((a, b) => TIER_ORDER.indexOf(b.rarity) - TIER_ORDER.indexOf(a.rarity));
        break;
      case "value":
        sorted.sort((a, b) => valueDeltaPct(b) - valueDeltaPct(a));
        break;
    }
    return sorted;
  }, [listings, effMin, effMax, vaultSources, eras, graders, gradeTier, elements, category, sort]);

  const onClear = () => {
    setPriceMin(null);
    setPriceMax(null);
    setVaultSources(new Set());
    setEras(new Set());
    setGradeTier("All");
    setGraders(new Set());
    setElements(new Set());
    setCategory("All");
  };

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Marketplace" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Page header */}
        <header className="mb-9">
          <p className="max-w-2xl text-[13px] text-zinc-500">
            {loading
              ? "Syncing live marketplace catalog..."
              : `${listings.length.toLocaleString("en-US")} vault-backed cards loaded from the Hoshi backend.`}
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The Hoshi Market
          </h1>
          {loading && <p className="mt-2 text-[13px] text-zinc-500">Loading listings…</p>}
          {error && (
            <p className="mt-2 text-[13px] text-red-400">
              Failed to load listings: {error}. Make sure the backend is running at {" "}
              <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL}</span>.
            </p>
          )}
        </header>

        <div className={filtersOpen ? "grid items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]" : ""}>
          {filtersOpen && (
            <MarketFilterPanel
              onCollapse={() => setFiltersOpen(false)}
              onClear={onClear}
              priceBounds={priceBounds}
              priceMin={effMin}
              priceMax={effMax}
              onPrice={(lo, hi) => {
                setPriceMin(lo);
                setPriceMax(hi);
              }}
              eras={eras}
              onToggleEra={(e) => setEras((s) => toggle(s, e))}
              eraCounts={eraCounts}
              gradeTier={gradeTier}
              onGradeTier={setGradeTier}
              graders={graders}
              onToggleGrader={(g) => setGraders((s) => toggle(s, g))}
              graderCounts={graderCounts}
              elements={elements}
              onToggleElement={(el) => setElements((s) => toggle(s, el))}
              elementCounts={elementCounts}
              vaultSources={vaultSources}
              onToggleVaultSource={(s) => setVaultSources((prev) => toggle(prev, s))}
              vaultSourceCounts={vaultSourceCounts}
            />
          )}

          <MarketGrid
            results={results}
            filtersOpen={filtersOpen}
            onOpenFilters={() => setFiltersOpen(true)}
            category={category}
            onCategory={setCategory}
            currency={currency}
            onCurrency={setCurrency}
            sort={sort}
            onSort={setSort}
          />
        </div>
      </main>
    </div>
  );
}
