"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CARD_CATEGORIES, ELEMENTS, ERAS, GRADE_FLOOR, GRADERS, VAULT_SOURCES, valueDeltaPct } from "@/lib/market";
import { getListings } from "@/lib/api";
import TopNav from "@/components/packs/TopNav";
import MarketFilterPanel from "@/components/packs/MarketFilterPanel";
import MarketGrid from "@/components/packs/MarketGrid";

type Category = CardCategory | "All";

// Price slider step, and a fallback ceiling used only before the catalog loads
// (or if it's empty). The real upper bound is derived from the live catalog below.
const PRICE_STEP = 1_000_000;
const PRICE_MAX_FALLBACK = 100_000_000;

// Nama query pencarian DI URL. Sengaja BUKAN nama param backend (`search`): yang ini
// dibaca manusia di link yang dibagikan, `?q=` lebih pendek dan lazim. Pemetaan q → search
// terjadi satu tempat saja, di getListings().
const SEARCH_PARAM = "q";
// Jeda debounce. 300ms: masih terasa seketika saat mengetik, tapi pengetik cepat tidak
// menembakkan satu request per huruf — dua kata biasanya jadi 1-2 request, bukan 12.
const SEARCH_DEBOUNCE_MS = 300;

// Toggle membership in a Set immutably (era / grader / element filters).
function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function MarketplacePage() {
  // Default TERTUTUP → di mobile panel filter tersembunyi (offcanvas, sesuai Figma). Di desktop
  // (lg+) dibuka otomatis sekali mount supaya sidebar filter tetap kelihatan.
  const [filtersOpen, setFiltersOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setFiltersOpen(true);
    }
  }, []);

  // Katalog PENUH dari backend (GET /api/marketplace, tanpa ?search). Diambil sekali dan
  // TIDAK pernah diambil ulang saat mencari, karena dialah yang menyuplai hitungan facet,
  // batas slider harga, dan daftar tab kategori. Kalau ketiganya ikut menyempit mengikuti
  // hasil pencarian, dua hal rusak diam-diam: (1) slider harga yang sudah digeser user
  // ter-clamp ke batas yang menyempit dan TIDAK kembali saat pencarian dihapus, dan (2) tab
  // kategori yang sedang aktif bisa lenyap dari daftar, sehingga hasil selalu kosong tanpa
  // kontrol yang terlihat untuk membatalkannya.
  const [catalog, setCatalog] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getListings()
      .then((data) => alive && setCatalog(data))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------- pencarian nama kartu ------------------------- */

  // `query` = isi kotak, berubah tiap ketikan. `term` = yang BENAR-BENAR dikirim ke backend
  // setelah debounce; `term` juga yang ditulis ke URL dan yang dipakai semua copy di layar,
  // supaya teks "tidak ada yang cocok dengan X" tidak pernah menyebut kata yang belum dicari.
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  // null = tidak ada pencarian aktif → pakai katalog penuh. Array = hasil ?search= terakhir
  // yang sah. Sengaja TIDAK dikosongkan saat request baru terbang, supaya grid tidak berkedip
  // jadi kosong di sela dua ketikan.
  const [hits, setHits] = useState<Listing[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Dinaikkan oleh "Coba lagi". Jadi dependensi efek fetch supaya request untuk kata yang
  // SAMA bisa dijalankan ulang — `term` tidak berubah, jadi tanpa ini efeknya diam saja.
  const [retryNonce, setRetryNonce] = useState(0);
  // URL baru boleh DITULIS setelah dibaca. Tanpa gerbang ini, render pertama (term masih "")
  // akan menghapus ?q= dari link yang baru saja dibuka orang.
  const [urlRead, setUrlRead] = useState(false);
  // Nomor urut request. INI yang menjamin respons yang datang terlambat tidak menimpa hasil
  // yang lebih baru: hanya request bernomor terbaru yang boleh menulis state. Abort saja
  // tidak cukup — respons yang sudah telanjur diterima tetap bisa mendarat belakangan.
  const searchSeq = useRef(0);

  // Baca ?q= SEKALI, client-only lewat window — bukan useSearchParams, supaya halaman ini
  // tidak butuh Suspense boundary (konvensi yang sama dipakai app/messages & app/admin/login).
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get(SEARCH_PARAM)?.trim() ?? "";
      if (fromUrl) {
        /* eslint-disable react-hooks/set-state-in-effect */
        setQuery(fromUrl);
        setTerm(fromUrl);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* URL tak terbaca — halaman tetap jalan, cuma tanpa pencarian awal */
    }
    setUrlRead(true);
  }, []);

  // Debounce ketikan → `term`. Pengosongan TIDAK di-debounce: menghapus pencarian harus
  // terasa seketika, dan katalog penuh sudah ada di memori jadi tak perlu request apa pun.
  useEffect(() => {
    // Tunggu ?q= dibaca dulu. Tanpa gerbang ini, efek ini ikut jalan di commit mount yang
    // SAMA dengan efek pembaca URL — dengan `query` masih "" di render itu — jadi ia menimpa
    // `term` yang baru saja diisi dari URL, lalu efek penulis URL menghapus ?q= dari alamat.
    // Gejalanya: buka link pencarian yang dibagikan orang, alamatnya bersih sendiri sedetik
    // kemudian; siapa pun yang langsung menyalin/bookmark alamat itu kehilangan pencariannya.
    if (!urlRead) return;
    const next = query.trim();
    if (!next) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setTerm("");
      return;
    }
    const t = setTimeout(() => setTerm(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, urlRead]);

  // Ambil hasil untuk `term`. Request yang didahului di-abort DAN klaimnya dicabut lewat
  // nomor urut — dua-duanya, karena keduanya menutup lubang yang berbeda.
  useEffect(() => {
    if (!term) {
      searchSeq.current += 1; // cabut klaim request yang mungkin masih terbang
      /* eslint-disable react-hooks/set-state-in-effect */
      setHits(null);
      setSearching(false);
      setSearchError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const seq = (searchSeq.current += 1);
    const ac = new AbortController();
    setSearching(true);
    setSearchError(null);
    getListings(term, ac.signal)
      .then((rows) => {
        if (seq !== searchSeq.current) return; // sudah didahului ketikan berikutnya
        setHits(rows);
        setSearching(false);
      })
      .catch((e: unknown) => {
        if (seq !== searchSeq.current) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setSearchError(e instanceof Error ? e.message : String(e));
        setSearching(false);
      });
    return () => ac.abort();
    // `retryNonce` ikut jadi dependensi supaya "Coba lagi" bisa menjalankan ULANG request untuk
    // kata yang SAMA — tanpa itu, `term` tidak berubah dan efeknya tidak pernah jalan lagi.
  }, [term, retryNonce]);

  // Tulis balik ke URL supaya refresh dan link yang dibagikan membawa pencarian yang sama.
  // replaceState, BUKAN push: tiap kata yang diketik tidak boleh jadi satu entri history —
  // tombol Back harus membawa user keluar dari marketplace, bukan menyusuri ketikannya.
  useEffect(() => {
    if (!urlRead) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (term) sp.set(SEARCH_PARAM, term);
      else sp.delete(SEARCH_PARAM);
      const qs = sp.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    } catch {
      /* history tak bisa ditulis — pencarian tetap jalan, hanya tak bisa dibagikan */
    }
  }, [term, urlRead]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setTerm("");
  }, []);

  /** Jalankan ulang request untuk kata yang sedang aktif. Dipakai tombol "Coba lagi" di empty
   *  state saat request-nya gagal — jaringan HP putus sebentar tidak boleh memaksa user
   *  menghapus lalu mengetik ulang kata yang sama. */
  const retrySearch = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  // SUMBER baris yang ditampilkan. Pencarian MEMPERSEMPIT, bukan menggantikan: hasil ?search=
  // tetap melewati seluruh filter & sort yang aktif di bawah, persis seperti katalog penuh.
  // useMemo, bukan ternary telanjang: `?? []` melahirkan array BARU tiap render, dan array itu
  // masuk ke deps `results` di bawah — jadi seluruh filter + sort akan dijalankan ulang tiap
  // render sekalipun tidak ada yang berubah.
  const listings = useMemo(() => (term ? (hits ?? []) : catalog), [term, hits, catalog]);
  // Berapa kartu yang cocok dengan NAMA-nya saja, sebelum filter lain ikut memotong. Dipakai
  // empty state untuk membedakan "namanya memang tak ada" dari "ada, tapi habis difilter".
  const searchMatchCount = term ? (hits?.length ?? null) : null;

  // Hitungan facet dihitung di atas KATALOG PENUH — bukan filter aktif, dan bukan pula hasil
  // pencarian — supaya tiap baris menunjukkan berapa banyak yang ada (angka "123" di Figma).
  const eraCounts = useMemo(
    () =>
      ERAS.reduce(
        (acc, e) => ({ ...acc, [e]: catalog.filter((l) => l.era === e).length }),
        {} as Record<Era, number>,
      ),
    [catalog],
  );
  const graderCounts = useMemo(
    () =>
      GRADERS.reduce(
        (acc, g) => ({ ...acc, [g]: catalog.filter((l) => l.grader === g).length }),
        {} as Record<Grader, number>,
      ),
    [catalog],
  );
  const elementCounts = useMemo(
    () =>
      ELEMENTS.reduce(
        (acc, el) => ({ ...acc, [el]: catalog.filter((l) => l.element === el).length }),
        {} as Record<CardElement, number>,
      ),
    [catalog],
  );
  // Legacy/mock rows without a source count as HOSHI (the historical default).
  const vaultSourceCounts = useMemo(
    () =>
      VAULT_SOURCES.reduce(
        (acc, s) => ({
          ...acc,
          [s]: catalog.filter((l) => (l.source ?? "HOSHI") === s).length,
        }),
        {} as Record<VaultSource, number>,
      ),
    [catalog],
  );

  // Price slider bounds derived from the live catalog: [0, most expensive listing]
  // (rounded up to the slider step). Falls back to a default ceiling while loading.
  const priceBounds = useMemo<[number, number]>(() => {
    const maxPrice = catalog.reduce((m, l) => Math.max(m, l.price), 0);
    const upper =
      maxPrice > 0 ? Math.ceil(maxPrice / PRICE_STEP) * PRICE_STEP : PRICE_MAX_FALLBACK;
    return [0, upper];
  }, [catalog]);

  // Category tabs are DATA-DRIVEN: only illustration categories that actually
  // appear in the loaded catalog are offered (real CC data leaves most of the
  // static taxonomy empty). "All" is always first. Empty catalog ⇒ just ["All"].
  const categoryTabs = useMemo<Category[]>(() => {
    const present = CARD_CATEGORIES.filter((c) => catalog.some((l) => l.category === c));
    return ["All", ...present];
  }, [catalog]);

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

  // "Clear All" di panel filter. Pencarian IKUT dibersihkan: chip-nya duduk di baris chip yang
  // sama dengan chip filter, jadi tombol yang menyapu semua chip tapi menyisakan satu akan
  // terbaca sebagai bug — dan user akan mengira katalognya yang kosong.
  const onClear = () => {
    clearSearch();
    setPriceMin(null);
    setPriceMax(null);
    setVaultSources(new Set());
    setEras(new Set());
    setGradeTier("All");
    setGraders(new Set());
    setElements(new Set());
    setCategory("All");
  };

  // Chip filter aktif (sesuai Figma): tampil di bawah tombol Filters, tiap chip bisa dihapus (✕).
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    // Pencarian tampil sebagai chip PERTAMA, sejajar dengan filter — itulah cara UI menyatakan
    // bahwa ia mempersempit bersama filter lain, bukan menggantikannya. Label dikutip supaya
    // terbaca sebagai kata yang diketik, bukan nama facet.
    ...(term ? [{ key: "q", label: `“${term}”`, onRemove: clearSearch }] : []),
    ...(gradeTier !== "All"
      ? [{ key: "grade", label: String(gradeTier), onRemove: () => setGradeTier("All") }]
      : []),
    ...[...eras].map((e) => ({
      key: `era:${String(e)}`,
      label: String(e),
      onRemove: () => setEras((s) => toggle(s, e)),
    })),
    ...[...graders].map((g) => ({
      key: `grader:${String(g)}`,
      label: String(g),
      onRemove: () => setGraders((s) => toggle(s, g)),
    })),
    ...[...elements].map((el) => ({
      key: `el:${String(el)}`,
      label: String(el),
      onRemove: () => setElements((s) => toggle(s, el)),
    })),
    ...[...vaultSources].map((v) => ({
      key: `vault:${String(v)}`,
      label: String(v),
      onRemove: () => setVaultSources((s) => toggle(s, v)),
    })),
  ];

  return (
    <div
      className="page-bg relative min-h-screen text-zinc-100"
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Marketplace" />

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/* Page header — JUDUL dulu, baru deskripsi (sesuai Figma mobile). */}
        <header className="mb-7 sm:mb-9">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            The Hoshi Market
          </h1>
          {loading && <p className="mt-2 text-[13px] text-zinc-500">Loading listings…</p>}
          {error && (
            <p className="mt-2 text-[13px] text-red-400">
              Failed to load listings: {error}. Make sure the backend is running at {" "}
              <span className="font-mono">{process.env.NEXT_PUBLIC_API_URL}</span>.
            </p>
          )}

          {/* Kotak pencarian. Ditaruh di header — BUKAN di dalam MarketGrid — supaya ia tetap
              di tempat yang sama entah panel filter terbuka atau tertutup; MarketGrid punya
              dua susunan header yang berbeda untuk dua keadaan itu. */}
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setTerm(query.trim()); // Enter = cari SEKARANG, tanpa menunggu sisa debounce
            }}
            className="mt-4 max-w-xl"
          >
            <label htmlFor="market-search" className="sr-only">
              Cari kartu berdasarkan nama
            </label>
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.4-3.4" />
                </svg>
              </span>
              <input
                id="market-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Escape mengosongkan — refleks yang sudah dipunyai orang dari kotak cari
                  // lain. type="search" bawaan WebKit juga begitu, tapi hanya di WebKit.
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    clearSearch();
                  }
                }}
                placeholder="Cari nama kartu…"
                autoComplete="off"
                aria-describedby="market-search-hint"
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-10 pr-24 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40 focus-visible:ring-2 focus-visible:ring-yellow-400/30 [&::-webkit-search-cancel-button]:appearance-none"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                {/* Wadahnya SELALU ada di DOM (isinya yang kosong-terisi) — region live yang
                    baru muncul bersama teksnya sering tidak jadi diumumkan pembaca layar. */}
                <span aria-live="polite" className="text-[12px] text-zinc-500">
                  {searching ? "Mencari…" : ""}
                </span>
                {query !== "" && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    aria-label="Hapus pencarian"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400/60"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {/* Backend mencocokkan kolom `name` SAJA. Kedengarannya sempit, tapi nama kartu
                CollectorCrypt adalah judul panjang yang sudah memuat tahun, nomor, grader dan
                set ("2017 #56 Shining Rayquaza-Holo PSA 8 Sun & Moon Shining Legends"), jadi
                "shining legends" atau "psa 8" tetap ketemu. Copy-nya menyebut itu supaya user
                tidak menyangka hanya nama Pokémon-nya yang bisa diketik. */}
            <p id="market-search-hint" className="mt-1.5 text-[12px] text-zinc-500">
              Mencocokkan nama kartu — biasanya sudah memuat tahun, set, dan grade. Hasilnya
              menyempitkan filter yang sedang aktif, bukan menggantikannya.
            </p>
            {/* Hasil diumumkan ke pembaca layar; angkanya sama dengan "N Cards Available". */}
            <p aria-live="polite" className="sr-only">
              {term && !searching ? `${results.length} kartu cocok dengan ${term}` : ""}
            </p>
            {searchError && (
              /* Kalimatnya DULU menjanjikan "katalog di bawah masih menampilkan hasil terakhir
                 yang berhasil dimuat" — dan itu tidak benar: saat request gagal, `hits` tetap
                 null, halaman menurunkannya jadi array kosong, dan grid-nya justru kosong.
                 Jadi banner ini menjanjikan isi sementara layar di bawahnya menyatakan nol. */
              <p className="mt-1.5 text-[13px] text-amber-400">
                Pencarian “{term || query.trim()}” belum berhasil dimuat ({searchError}). Hasil di
                bawah belum bisa dipakai sebagai jawaban — kartunya bisa saja ada.
              </p>
            )}
          </form>
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
            chips={activeChips}
            filtersOpen={filtersOpen}
            onOpenFilters={() => setFiltersOpen(true)}
            categoryTabs={categoryTabs}
            category={category}
            onCategory={setCategory}
            currency={currency}
            onCurrency={setCurrency}
            sort={sort}
            onSort={setSort}
            searching={searching}
            searchTerm={term}
            searchMatchCount={searchMatchCount}
            /* Gagal ≠ nol. `hits` null + ada error = kita BELUM tahu, dan empty state harus
               mengatakan itu, bukan "kartunya tidak ada". */
            searchFailed={!!searchError && hits === null}
            onClearSearch={clearSearch}
            onRetrySearch={retrySearch}
          />
        </div>
      </main>
    </div>
  );
}
