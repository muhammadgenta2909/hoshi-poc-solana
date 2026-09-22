"use client";

// Shared "Add New Address" modal — ONE source of truth for both the Settings
// Main-Info shipment-address list and the Withdraw shipping flow's address step,
// so the two can never drift apart again. It owns the whole form: the geo cascade
// (country → state → city, each level fetched from lib/geo → our CSC proxy) and
// the phone dial-code picker. Every geo call is wrapped so a 503 (CSC_API_KEY
// unset) degrades that level to a plain free-text input — the form is never left
// unusable.
//
// `PhoneField` is exported too: Settings' Main-Info profile phone reuses it (not
// just the address modal), so it lives here as the single shared implementation.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addAddress, type ShippingAddress } from "@/lib/api";
import {
  getCities,
  getCountries,
  getStates,
  type GeoCity,
  type GeoCountry,
  type GeoState,
} from "@/lib/geo";
import {
  ModalShell,
  TextInput,
  Select,
  Toggle,
  PrimaryButton,
  ChevronDownIcon,
  useOutsideClose,
} from "@/components/account/ui";

// The address form's blank slate. Country/state/city are driven by the geo
// cascade (lib/geo.ts → our CSC proxy), so they start empty and the user picks
// from the searchable comboboxes; phoneCode keeps Indonesia's dial code as the
// home-market default (independent of the chosen country).
const emptyForm = {
  fullName: "",
  street: "",
  apt: "",
  phoneCode: "+62",
  phone: "",
  zip: "",
  isDefault: false,
};

/** Country dial codes shipped as a curated FALLBACK for the phone picker when the
 *  geo backend is unreachable (CSC_API_KEY unset → 503). `— none —` (value "")
 *  lets a user clear the code. Indonesia leads as the home market. */
const PHONE_CODES: readonly { value: string; label: string }[] = [
  { value: "", label: "— none —" },
  { value: "+62", label: "+62 Indonesia" },
  { value: "+1", label: "+1 US/Canada" },
  { value: "+65", label: "+65 Singapore" },
  { value: "+60", label: "+60 Malaysia" },
  { value: "+81", label: "+81 Japan" },
  { value: "+44", label: "+44 UK" },
  { value: "+61", label: "+61 Australia" },
  { value: "+91", label: "+91 India" },
];

/* ----------------------------- geo comboboxes ----------------------------- */

/** One row of a {@link SearchCombobox}. `value` is what gets stored in the form
 *  (a free-form NAME, or the `+phonecode` for the dial picker); `label` is what
 *  the user sees; `keywords` folds extra searchable text (e.g. a dial code) into
 *  the filter without cluttering the label. */
type ComboItem = { value: string; label: string; keywords?: string };

/** A searchable dropdown: a themed trigger + a popup with a text filter over a
 *  scrollable list. Built for the ~250-item country list where a plain <select>
 *  is unusable. Styled to match the account Dropdown (same dark palette + gold
 *  focus). With `allowCustom` the typed text can be committed as the value
 *  (Enter or the "Use …" row) so a city that isn't in the list is never blocked.
 *
 *  Selection is by object: `onSelect` hands back the chosen {@link ComboItem} so
 *  the caller can look the picked NAME's iso2 back up for the next cascade level. */
function SearchCombobox({
  value,
  onSelect,
  items,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  loading = false,
  disabled = false,
  allowCustom = false,
  ariaLabel,
  className = "",
  menuClassName = "",
  align = "stretch",
  triggerContent,
}: {
  value: string;
  onSelect: (item: ComboItem) => void;
  items: ComboItem[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  disabled?: boolean;
  /** Let the typed text become the value (Enter / the "Use …" row) — used by City. */
  allowCustom?: boolean;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  align?: "stretch" | "right";
  /** Override what the closed trigger shows (the dial picker keeps it compact). */
  triggerContent?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the filter as the popup opens (DOM side-effect only — the query is
  // cleared in the toggle handler, so no setState fires synchronously here).
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) setQ("");
  };

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? items.filter(
        (it) =>
          it.label.toLowerCase().includes(needle) ||
          (it.keywords ?? "").toLowerCase().includes(needle),
      )
    : items;
  const custom = q.trim();
  const showCustom =
    allowCustom &&
    custom.length > 0 &&
    !items.some((it) => it.label.toLowerCase() === needle || it.value.toLowerCase() === needle);

  const selected = items.find((it) => it.value === value);
  const commit = (item: ComboItem) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white/[0.04] px-4 py-2.5 text-left text-[14px] transition hover:border-white/25 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? "border-yellow-400/50" : "border-white/10"
        }`}
      >
        {triggerContent ?? (
          <span className={`truncate ${selected || value ? "text-zinc-100" : "text-zinc-500"}`}>
            {selected ? selected.label : value || placeholder}
          </span>
        )}
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 text-zinc-400 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-2 rounded-xl border border-white/10 bg-[#1b1810] p-1 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.75)] ${
            align === "right" ? "right-0 min-w-[260px]" : "left-0 right-0"
          } ${menuClassName}`}
        >
          <div className="p-1">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (filtered.length) commit(filtered[0]);
                  else if (showCustom) commit({ value: custom, label: custom });
                }
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-zinc-100 placeholder-zinc-500 outline-none focus:border-yellow-400/50"
            />
          </div>
          <div role="listbox" className="no-scrollbar max-h-52 overflow-auto">
            {loading ? (
              <p className="px-3 py-2 text-[13px] text-zinc-500">Loading…</p>
            ) : (
              <>
                {showCustom && (
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => commit({ value: custom, label: custom })}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-zinc-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    Use “{custom}”
                  </button>
                )}
                {filtered.map((it, i) => {
                  const active = it.value === value;
                  return (
                    <button
                      key={`${it.value}-${i}`}
                      type="button"
                      role="option"
                      aria-selected={active}
                      title={it.label}
                      onClick={() => commit(it)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] transition ${
                        active
                          ? "bg-yellow-400/10 text-yellow-400"
                          : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span className="truncate">{it.label}</span>
                    </button>
                  );
                })}
                {!filtered.length && !showCustom && (
                  <p className="px-3 py-2 text-[13px] text-zinc-500">{emptyText}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KASKADE WILAYAH (negara → provinsi → kota) — SATU IMPLEMENTASI, DIPAKAI BERSAMA.

   Dulu kaskade ini hidup di dalam `AddAddressForm` dan tidak bisa dipakai layar lain. Layar kedua
   yang membutuhkan alamat — "ke mana kartu titipanku dikembalikan?" di `/titipan` — karenanya
   berdiri di persimpangan yang dua-duanya buruk: menyalin ~120 baris kaskade (lalu punya DUA
   jawaban untuk "provinsi apa saja yang ada di Indonesia", yang suatu hari akan berbeda), atau
   tidak punya pemilih wilayah sama sekali.

   Jadi kaskadenya dikeluarkan apa adanya menjadi satu hook + tiga kontrol. `AddAddressForm` di
   bawah memakainya PERSIS seperti sebelumnya — perilakunya tidak berubah — dan layar titipan
   memakai yang sama dengan label berbahasa Indonesia.

   ┌──── SETIAP TINGKAT WAJIB PUNYA JALAN KETIK-MANUAL ─────────────────────────────────────────┐
   │ Sumber datanya adalah layanan luar (countrystatecity.in lewat proxy backend), dan ia MEMANG │
   │ bisa mati: tanpa `CSC_API_KEY` backend menjawab 503. Kalau sebuah dropdown yang gagal       │
   │ memuat berarti formulirnya tidak bisa dikirim, maka orang yang ingin barangnya sendiri      │
   │ kembali terjebak oleh kegagalan infrastruktur KAMI. Setiap tingkat karena itu merosot ke    │
   │ input teks biasa, dan bahkan saat daftarnya hidup, teks yang diketik tetap bisa dipakai     │
   │ (`allowCustom`) — daftar provinsi/kota pihak ketiga tidak pernah lengkap untuk Indonesia.   │
   └────────────────────────────────────────────────────────────────────────────────────────────┘
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Apa yang dipegang kaskade + cara mengubahnya. Dikembalikan {@link useGeoCascade}. */
export type GeoCascade = {
  /** NAMA (bukan iso2) — itu yang dikirim ke backend di semua rute alamat. */
  country: string;
  state: string;
  city: string;
  /** MEMILIH dari daftar: mengubah satu tingkat SEKALIGUS mengosongkan tingkat di bawahnya. */
  setCountry: (name: string) => void;
  setState: (name: string) => void;
  setCity: (name: string) => void;
  /* ── MENGETIK ≠ MEMILIH, dan menyamakannya menghapus isian orang ──────────────────────────
     Pada tingkat yang merosot jadi input teks, `onChange` menyala SETIAP KETUKAN. Kalau ketukan
     itu memakai `setCountry`/`setState` di atas, memperbaiki satu huruf typo di kolom negara
     menghapus provinsi DAN kota yang sudah susah payah diketik — di formulir yang seluruh
     alasannya ada adalah karena layanan wilayahnya sedang mati. Jadi mengetik hanya mengubah
     nilainya sendiri. Yang mengosongkan tingkat bawah tetap PILIHAN dari daftar, karena di
     sanalah "provinsi ini milik negara yang lain" benar-benar terjadi. */
  typeCountry: (name: string) => void;
  typeState: (name: string) => void;
  /** Daftar negaranya sendiri gagal dimuat → SELURUH kaskade jadi teks bebas. */
  offline: boolean;
  /* ── dibaca kontrol di bawah; bukan untuk dipakai pemanggil ── */
  countries: GeoCountry[] | null;
  countryIso: string;
  states: GeoState[] | null;
  statesFail: boolean;
  stateIso: string;
  cities: GeoCity[] | null;
  citiesFail: boolean;
};

/**
 * Kaskade wilayah: memegang nama negara/provinsi/kota + daftar untuk tiap tingkat.
 *
 * `initial.country` dipakai layar yang negaranya SUDAH pasti (pengembalian kartu titipan selalu
 * kurir domestik), supaya daftar provinsinya langsung termuat tanpa satu dropdown yang jawabannya
 * cuma satu.
 *
 * iso2 tiap tingkat DITURUNKAN dari nama + daftarnya, bukan disimpan sebagai state tersendiri:
 * dengan begitu nama yang dipasang di awal ikut menemukan iso2-nya begitu daftarnya tiba, dan
 * tidak ada sepasang state yang bisa saling bertentangan.
 */
export function useGeoCascade(initial?: { country?: string }): GeoCascade {
  const [country, setCountryName] = useState(initial?.country ?? "");
  const [state, setStateName] = useState("");
  const [city, setCityName] = useState("");

  const [countries, setCountries] = useState<GeoCountry[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [states, setStates] = useState<GeoState[] | null>(null);
  const [statesFail, setStatesFail] = useState(false);
  const [cities, setCities] = useState<GeoCity[] | null>(null);
  const [citiesFail, setCitiesFail] = useState(false);

  // Countries — fetched once (getCountries memoises the promise module-wide).
  useEffect(() => {
    let alive = true;
    getCountries()
      .then((cs) => alive && setCountries(cs))
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, []);

  const countryIso = useMemo(
    () => (countries ?? []).find((c) => c.name === country)?.iso2 ?? "",
    [countries, country],
  );
  const stateIso = useMemo(
    () => (states ?? []).find((s) => s.name === state)?.iso2 ?? "",
    [states, state],
  );

  // States — refetched whenever the resolved country iso changes. The downstream
  // reset lives in the setters, so this effect only ever setStates from an async
  // callback (never synchronously during the effect).
  useEffect(() => {
    if (!countryIso) return;
    let alive = true;
    getStates(countryIso)
      .then((s) => alive && setStates(s))
      .catch(() => alive && setStatesFail(true));
    return () => {
      alive = false;
    };
  }, [countryIso]);

  // Cities — refetched whenever the resolved state iso changes.
  useEffect(() => {
    if (!countryIso || !stateIso) return;
    let alive = true;
    getCities(countryIso, stateIso)
      .then((c) => alive && setCities(c))
      .catch(() => alive && setCitiesFail(true));
    return () => {
      alive = false;
    };
  }, [countryIso, stateIso]);

  // Picking a level resets everything BELOW it — value and list alike — so no
  // stale province from the previous country (or stale city from the previous
  // province) can survive into the submitted address.
  const setCountry = useCallback((name: string) => {
    setCountryName(name);
    setStates(null);
    setStatesFail(false);
    setStateName("");
    setCities(null);
    setCitiesFail(false);
    setCityName("");
  }, []);
  const setState = useCallback((name: string) => {
    setStateName(name);
    setCities(null);
    setCitiesFail(false);
    setCityName("");
  }, []);

  return {
    country,
    state,
    city,
    setCountry,
    setState,
    setCity: setCityName,
    typeCountry: setCountryName,
    typeState: setStateName,
    offline,
    countries,
    countryIso,
    states,
    statesFail,
    stateIso,
    cities,
    citiesFail,
  };
}

/** Teks yang bisa diganti per layar — file ini berbahasa Inggris, `/titipan` tidak. */
type GeoControlText = {
  placeholder?: string;
  /** Placeholder saat tingkat itu merosot jadi input teks. */
  textPlaceholder?: string;
  searchPlaceholder?: string;
  ariaLabel?: string;
};

/** Negara. Merosot jadi teks bebas kalau daftar negaranya sendiri tidak bisa dimuat. */
export function GeoCountryControl({
  geo,
  placeholder = "Select country",
  textPlaceholder = "Country / region",
  searchPlaceholder = "Search country…",
  ariaLabel = "Country or region",
}: { geo: GeoCascade } & GeoControlText) {
  const asText = geo.offline || (geo.countries !== null && geo.countries.length === 0);
  const items = useMemo<ComboItem[]>(
    () =>
      (geo.countries ?? []).map((c) => ({
        value: c.name,
        label: `${c.emoji} ${c.name}`,
        keywords: c.name,
      })),
    [geo.countries],
  );
  if (asText) {
    return (
      <TextInput
        value={geo.country}
        maxLength={56}
        onChange={(e) => geo.typeCountry(e.target.value)}
        placeholder={textPlaceholder}
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <SearchCombobox
      value={geo.country}
      onSelect={(it) => geo.setCountry(it.value)}
      items={items}
      loading={geo.countries === null}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
    />
  );
}

/** Provinsi/negara bagian. `allowCustom` menyala: daftar pihak ketiga tidak pernah lengkap. */
export function GeoStateControl({
  geo,
  placeholder = "Select state/province",
  textPlaceholder,
  searchPlaceholder = "Search or type state…",
  ariaLabel = "State or province",
}: { geo: GeoCascade } & GeoControlText) {
  const asText =
    geo.offline ||
    !geo.countryIso ||
    geo.statesFail ||
    (geo.states !== null && geo.states.length === 0);
  const loading = !geo.offline && !!geo.countryIso && !geo.statesFail && geo.states === null;
  const items = useMemo<ComboItem[]>(
    () => (geo.states ?? []).map((s) => ({ value: s.name, label: s.name })),
    [geo.states],
  );
  if (asText) {
    return (
      <TextInput
        value={geo.state}
        maxLength={80}
        onChange={(e) => geo.typeState(e.target.value)}
        placeholder={
          textPlaceholder ??
          (geo.offline || !geo.countryIso ? "State / province" : "Type your state/province")
        }
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <SearchCombobox
      value={geo.state}
      onSelect={(it) => geo.setState(it.value)}
      items={items}
      loading={loading}
      allowCustom
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
    />
  );
}

/** Kota/kabupaten. `allowCustom` menyala sejak awal — kota kecil sering tidak ada di daftar. */
export function GeoCityControl({
  geo,
  placeholder = "Select city",
  textPlaceholder = "City",
  searchPlaceholder = "Search or type city…",
  ariaLabel = "City",
}: { geo: GeoCascade } & GeoControlText) {
  const asText =
    geo.offline ||
    !geo.stateIso ||
    geo.citiesFail ||
    (geo.cities !== null && geo.cities.length === 0);
  const loading = !geo.offline && !!geo.stateIso && !geo.citiesFail && geo.cities === null;
  const items = useMemo<ComboItem[]>(
    () => (geo.cities ?? []).map((c) => ({ value: c.name, label: c.name })),
    [geo.cities],
  );
  if (asText) {
    return (
      <TextInput
        value={geo.city}
        maxLength={80}
        onChange={(e) => geo.setCity(e.target.value)}
        placeholder={textPlaceholder}
        aria-label={ariaLabel}
      />
    );
  }
  return (
    <SearchCombobox
      value={geo.city}
      onSelect={(it) => geo.setCity(it.value)}
      items={items}
      loading={loading}
      allowCustom
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      ariaLabel={ariaLabel}
    />
  );
}

/** A plain checkbox row (native input + label), gold-accented to match Toggle. */
function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-zinc-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-yellow-400"
      />
      {label}
    </label>
  );
}

/** A modal form field: a label above its control. Exported because the Settings
 *  Change-Email modal reuses it too. */
export function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

/** Phone: a searchable dial-code picker (built from the geo country list, showing
 *  `emoji name (+code)`) + the number input. Self-contained — it fetches the
 *  memoised country list itself, so both call sites (Settings Main Info + the
 *  address modal) just pass code/number. If the geo backend is down it falls back
 *  to the curated {@link PHONE_CODES} select so a code can still be chosen. */
export function PhoneField({
  code,
  onCodeChange,
  value,
  onChange,
}: {
  code: string;
  onCodeChange: (v: string) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  const [countries, setCountries] = useState<GeoCountry[] | null>(null);
  const [fail, setFail] = useState(false);

  useEffect(() => {
    let alive = true;
    getCountries()
      .then((cs) => alive && setCountries(cs))
      .catch(() => alive && setFail(true));
    return () => {
      alive = false;
    };
  }, []);

  const dialItems = useMemo<ComboItem[]>(() => {
    const items: ComboItem[] = [{ value: "", label: "— none —" }];
    for (const c of countries ?? []) {
      const raw = (c.phonecode ?? "").trim();
      const val = raw.startsWith("+") ? raw : `+${raw}`;
      // Only offer codes the backend accepts (phoneCountryCode @Matches /^\+\d{1,4}$/),
      // so a malformed/empty upstream phonecode can never round-trip a 400.
      if (!/^\+\d{1,4}$/.test(val)) continue;
      items.push({
        value: val,
        label: `${c.emoji} ${c.name} (${val})`,
        keywords: `${c.name} ${val} ${raw}`,
      });
    }
    return items;
  }, [countries]);

  return (
    <div className="flex items-stretch gap-2">
      {fail ? (
        <Select
          value={code}
          onChange={onCodeChange}
          options={PHONE_CODES}
          placeholder="Code"
          ariaLabel="Phone country code"
          className="w-[148px] shrink-0"
          align="right"
          menuClassName="min-w-[240px]"
        />
      ) : (
        <SearchCombobox
          value={code}
          onSelect={(it) => onCodeChange(it.value)}
          items={dialItems}
          loading={countries === null}
          ariaLabel="Phone country code"
          searchPlaceholder="Search country or code…"
          className="w-[148px] shrink-0"
          align="right"
          menuClassName="min-w-[280px]"
          triggerContent={
            <span className={`truncate ${code ? "text-zinc-100" : "text-zinc-500"}`}>
              {code || "Code"}
            </span>
          }
        />
      )}
      <div className="min-w-0 flex-1">
        <TextInput
          inputMode="tel"
          maxLength={20}
          value={value}
          // Backend accepts digits, spaces and hyphens only — strip the rest as
          // the user types so an illegal character never reaches the server.
          onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ""))}
          placeholder="Phone number"
        />
      </div>
    </div>
  );
}

/** The public "Add New Address" modal. Thin wrapper over the self-contained form
 *  body: gated on `open`/`token` so the inner form MOUNTS FRESH each time the
 *  modal opens (no stale country/state/city from a previous session). */
export default function AddAddressModal({
  open,
  onClose,
  onAdded,
  token,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly-created address after a successful POST. The parent
   *  owns closing the modal + refreshing its list. */
  onAdded: (address: ShippingAddress) => void;
  token: string | null;
}) {
  if (!open || !token) return null;
  return <AddAddressForm token={token} onClose={onClose} onAdded={onAdded} />;
}

/** The form itself. Owns the geo cascade + phone picker + submit. Mounted only
 *  while the modal is open (see the wrapper), so its state is fresh each time. */
function AddAddressForm({
  token,
  onClose,
  onAdded,
}: {
  token: string;
  onClose: () => void;
  onAdded: (a: ShippingAddress) => void;
}) {
  const [form, setForm] = useState({ ...emptyForm });
  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noZip, setNoZip] = useState(false);

  // Geo cascade — the SHARED implementation (see useGeoCascade above), so this
  // modal and /titipan's return-address form can never disagree about which
  // provinces exist. Country/state/city live in the hook, not in `form`.
  const geo = useGeoCascade();

  const toggleNoZip = (v: boolean) => {
    setNoZip(v);
    if (v) setField("zip", "");
  };

  const submit = useCallback(async () => {
    // Plain-English required-field guard, so one missing field doesn't surface a
    // raw multi-field class-validator error from the (atomic) CreateAddressDto.
    const missing: string[] = [];
    if (!form.fullName.trim()) missing.push("full name");
    if (!geo.country.trim()) missing.push("country");
    if (!form.street.trim()) missing.push("street address");
    if (!geo.city.trim()) missing.push("city");
    if (!noZip && !form.zip.trim()) missing.push("zip/postal code");
    if (missing.length) {
      setError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    if (form.phone && form.phone.length < 4) {
      setError("Enter a valid phone number.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await addAddress(
        {
          fullName: form.fullName,
          country: geo.country,
          street: form.street,
          apt: form.apt || undefined, // optional — omit rather than send ""
          state: geo.state || undefined,
          city: geo.city,
          phoneCountryCode: form.phoneCode || undefined,
          phoneNumber: form.phone || undefined,
          // CreateAddressDto requires a non-empty zip; "-" is the placeholder for
          // "no ZIP code" so the required check server-side still passes.
          zip: noZip ? "-" : form.zip,
          isDefault: form.isDefault,
        },
        token,
      );
      onAdded(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form, geo.country, geo.state, geo.city, noZip, token, onAdded]);

  return (
    <ModalShell open onClose={onClose} title="Add New Address" maxWidth={560}>
      <div className="space-y-4">
        {geo.offline && (
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
            Location lookup is unavailable right now — type your country, state and city manually.
          </p>
        )}

        <ModalField label="Full Name">
          <TextInput
            value={form.fullName}
            maxLength={80}
            onChange={(e) => setField("fullName", e.target.value)}
            placeholder="Full name"
          />
        </ModalField>

        <ModalField label="Country/Region">
          <GeoCountryControl geo={geo} />
        </ModalField>

        <ModalField label="Street Address">
          <TextInput
            value={form.street}
            maxLength={160}
            onChange={(e) => setField("street", e.target.value)}
            placeholder="Street address"
          />
        </ModalField>

        <ModalField label="Apartment/Suite/Unit">
          <TextInput
            value={form.apt}
            maxLength={80}
            onChange={(e) => setField("apt", e.target.value)}
            placeholder="Apt, suite, unit (optional)"
          />
        </ModalField>

        <div className="grid gap-4 sm:grid-cols-2">
          <ModalField label="State/Province">
            <GeoStateControl geo={geo} />
          </ModalField>

          <ModalField label="City/Department">
            <GeoCityControl geo={geo} />
          </ModalField>
        </div>

        {/* Phone gets its OWN full-width row: the dial picker already eats ~148px,
            so sharing a half-column left the number input painfully narrow. */}
        <ModalField label="Phone Number">
          <PhoneField
            code={form.phoneCode}
            onCodeChange={(v) => setField("phoneCode", v)}
            value={form.phone}
            onChange={(v) => setField("phone", v)}
          />
        </ModalField>

        <ModalField label="Zip/Postal code">
          <TextInput
            value={form.zip}
            maxLength={16}
            disabled={noZip}
            onChange={(e) => setField("zip", e.target.value)}
            placeholder={noZip ? "No ZIP code" : "Postal code"}
            className={noZip ? "opacity-50" : ""}
          />
          <div className="mt-2">
            <CheckRow
              checked={noZip}
              onChange={toggleNoZip}
              label="My address doesn't have a ZIP code"
            />
          </div>
        </ModalField>

        <Toggle
          checked={form.isDefault}
          onChange={(v) => setField("isDefault", v)}
          label="Use as default"
        />

        {error && (
          <p className="text-[12px] text-red-400" role="alert">
            {error}
          </p>
        )}

        <PrimaryButton type="button" onClick={submit} disabled={busy} className="w-full">
          {busy ? "Adding…" : "Add new address"}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}
