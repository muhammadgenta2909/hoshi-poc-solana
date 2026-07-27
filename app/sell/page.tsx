"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";
import type { Listing, ListingStatus, NewListingInput } from "@/lib/market";
import {
  CARD_ART,
  CARD_CATEGORIES,
  ELEMENTS,
  ERAS,
  GRADERS,
  LANGUAGES,
  MARKET_SETS,
} from "@/lib/market";
import { TIER_ORDER } from "@/lib/packs";
import { ApiError, cancelListing, createListing, getMyListings } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import Select from "@/components/packs/Dropdown";
import { GOLD_GRADIENT, Idrx, Img } from "@/components/packs/ui";

// Sell = the seller side of the marketplace (backend: POST /marketplace,
// GET /marketplace/me/listings, POST /marketplace/:id/cancel). A user lists a
// graded card, it shows up in the public market + in "Your Listings" here, and
// they can withdraw it while it is still ACTIVE.

// Form KOSONG, disengaja. Sebelumnya field-field ini terisi "PSA 10" / "Classic" /
// "Fire" sebagai default — dan default pada form itu diam-diam menjadi KLAIM:
// penjual yang menekan submit tanpa menyentuhnya menerbitkan atribut kartu yang
// tidak pernah ia nyatakan. Grade wajib diisi sendiri (divalidasi sebelum kirim);
// atribut deskriptif yang dibiarkan kosong dikirim kosong, bukan ditebak.
const DEFAULT_FORM: NewListingInput = {
  name: "",
  image: CARD_ART[0],
  price: 10_000_000,
  expectedValue: 12_000_000,
  buyback: 0,
};

export default function SellPage() {
  const { token, hydrated, login } = useAuth();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletConnect();

  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // No wallet yet → open the modal; wallet but not logged in → run login.
  const handleAuth = useCallback(async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (!publicKey) {
        setVisible(true);
        return;
      }
      await login();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }, [publicKey, login, setVisible]);

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Vault" />

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        <header className="mb-8">
          <p className="text-[13px] text-zinc-500">
            List a graded card on the Hoshi market. It appears in the marketplace instantly and
            stays yours to withdraw until someone buys it.
          </p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Sell a Card
          </h1>
        </header>

        {!hydrated ? (
          <p className="py-24 text-center text-sm text-zinc-500">Loading…</p>
        ) : !token ? (
          <GateCard busy={authBusy} onClick={handleAuth} connected={!!publicKey} error={authError} />
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <SellForm token={token} login={login} />
            <MyListings token={token} login={login} />
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------------- create form ---------------- */

function SellForm({ token, login }: { token: string; login: () => Promise<string> }) {
  const [form, setForm] = useState<NewListingInput>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listed, setListed] = useState<string | null>(null);

  const set = useCallback(
    <K extends keyof NewListingInput>(key: K, value: NewListingInput[K]) =>
      setForm((f) => ({ ...f, [key]: value })),
    [],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setListed(null);
    if (!form.name.trim()) return setError("Card name is required.");
    if (form.price <= 0) return setError("Price must be greater than 0.");
    if (form.expectedValue <= 0) return setError("Expected value must be greater than 0.");
    // Grade tidak boleh punya default: memajang kartu berarti mengklaim grade-nya,
    // dan klaim itu harus datang dari penjual, bukan dari nilai bawaan form.
    if (!form.grade?.trim() || !form.grader || !form.gradeScore) {
      return setError("Grade, grader, and grade score are required.");
    }

    const payload: NewListingInput = {
      ...form,
      name: form.name.trim(),
      price: Math.round(form.price),
      expectedValue: Math.round(form.expectedValue),
      buyback: Math.round(form.buyback ?? 0),
    };

    setSubmitting(true);
    try {
      // Re-login once on a 401 (expired JWT), mirroring the buy flow.
      let t = token;
      try {
        await createListing(payload, t);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          t = await login();
          await createListing(payload, t);
        } else {
          throw err;
        }
      }
      setListed(payload.name);
      setForm((f) => ({ ...f, name: "" }));
      // Tell the listings panel to refetch.
      window.dispatchEvent(new Event("hoshi:listings-changed"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const edge = form.price > 0 ? (form.expectedValue - form.price) / form.price : 0;

  return (
    <form onSubmit={submit} className="self-start rounded-2xl bg-[#181507] p-5">
      <h2
        className="text-[20px] leading-none text-white"
        style={{ fontFamily: "var(--font-jersey)" }}
      >
        List for Sale
      </h2>

      <div className="mt-5 flex flex-col gap-4">
        <Field label="Card name">
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Charizard VMAX"
            className={inputCls}
          />
        </Field>

        <Field label="Artwork">
          <div className="flex flex-wrap gap-2">
            {CARD_ART.map((src) => {
              const active = form.image === src;
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => set("image", src)}
                  aria-pressed={active}
                  className={`overflow-hidden rounded-lg border p-1 transition ${
                    active
                      ? "border-yellow-400 bg-yellow-400/10"
                      : "border-white/10 bg-white/[0.03] hover:border-white/30"
                  }`}
                >
                  <Img src={src} alt="" className="h-16 w-12 rounded object-cover" />
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Set">
            <Select value={form.set ?? ""} onChange={(v) => set("set", v)} options={MARKET_SETS} />
          </Field>
          <Field label="Rarity">
            <Select value={form.rarity ?? ""} onChange={(v) => set("rarity", v)} options={TIER_ORDER} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price (IDRX)">
            <NumberInput value={form.price} onChange={(v) => set("price", v)} step={100_000} />
          </Field>
          <Field label="Expected value (IDRX)">
            <NumberInput
              value={form.expectedValue}
              onChange={(v) => set("expectedValue", v)}
              step={100_000}
            />
          </Field>
        </div>

        <Field
          label="Buyback (IDRX)"
          hint="Optional. > 0 shows the HOSHI-backed badge."
        >
          <NumberInput value={form.buyback ?? 0} onChange={(v) => set("buyback", v)} step={100_000} />
        </Field>

        {/* live value-edge preview — same math the marketplace "Best Value" sort uses */}
        <p className="-mt-1 text-[12px] text-zinc-500">
          Value edge:{" "}
          <span className={edge >= 0 ? "text-emerald-400" : "text-red-400"}>
            {edge >= 0 ? "+" : ""}
            {(edge * 100).toFixed(1)}%
          </span>{" "}
          {edge >= 0 ? "(reads as a good deal)" : "(priced above expected value)"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grade">
            <input
              value={form.grade ?? ""}
              onChange={(e) => set("grade", e.target.value)}
              placeholder="PSA 10"
              className={inputCls}
            />
          </Field>
          <Field label="Grader">
            <Select value={form.grader ?? ""} onChange={(v) => set("grader", v)} options={GRADERS} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Grade score">
            <NumberInput
              value={form.gradeScore ?? 0}
              onChange={(v) => set("gradeScore", v)}
              step={0.5}
              max={10}
            />
          </Field>
          <Field label="Language">
            <Select value={form.language ?? ""} onChange={(v) => set("language", v)} options={LANGUAGES} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Era">
            <Select value={form.era ?? ""} onChange={(v) => set("era", v)} options={ERAS} />
          </Field>
          <Field label="Element">
            <Select value={form.element ?? ""} onChange={(v) => set("element", v)} options={ELEMENTS} />
          </Field>
        </div>

        <Field label="Category">
          <Select value={form.category ?? ""} onChange={(v) => set("category", v)} options={CARD_CATEGORIES} />
        </Field>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
        style={{ backgroundImage: GOLD_GRADIENT }}
      >
        {submitting ? "Listing…" : "List for Sale"}
      </button>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {listed && (
        <p className="mt-3 text-xs text-emerald-400">
          “{listed}” is now live on the marketplace.
        </p>
      )}
    </form>
  );
}

/* ---------------- my listings ---------------- */

function MyListings({ token, login }: { token: string; login: () => Promise<string> }) {
  const [items, setItems] = useState<Listing[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    getMyListings(token)
      .then((d) => alive && setItems(d))
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => alive && setLoadedFor(token));
    return () => {
      alive = false;
    };
  }, [token, reloadKey]);

  // Refetch when the form lists a new card.
  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    window.addEventListener("hoshi:listings-changed", onChanged);
    return () => window.removeEventListener("hoshi:listings-changed", onChanged);
  }, []);

  const onCancel = async (id: string) => {
    setError(null);
    setCancelling(id);
    try {
      let t = token;
      let updated: Listing;
      try {
        updated = await cancelListing(id, t);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          t = await login();
          updated = await cancelListing(id, t);
        } else {
          throw err;
        }
      }
      setItems((m) => m.map((l) => (l.id === id ? updated : l)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(null);
    }
  };

  const loading = loadedFor !== token;

  return (
    <section className="rounded-2xl bg-[#181507] p-5">
      <div className="flex items-center justify-between">
        <h2
          className="text-[20px] leading-none text-white"
          style={{ fontFamily: "var(--font-jersey)" }}
        >
          Your Listings
        </h2>
        <span className="text-[12px] tabular-nums text-zinc-500">{items.length}</span>
      </div>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading your listings…</p>
      ) : items.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          You haven&apos;t listed anything yet. Fill the form to put a card up for sale.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
            >
              <Img
                src={l.image}
                alt=""
                className="h-16 w-12 shrink-0 rounded-md object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-semibold text-white">{l.name}</span>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                  {l.grade} · {l.set} · {l.rarity}
                </p>
                <Idrx amount={l.price} size={14} className="mt-1.5 text-[14px] text-zinc-200" />
              </div>
              {(l.status ?? "ACTIVE") === "ACTIVE" ? (
                <button
                  type="button"
                  onClick={() => onCancel(l.id)}
                  disabled={cancelling === l.id}
                  className="shrink-0 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-[13px] font-semibold text-red-300 transition hover:bg-red-400/20 disabled:opacity-50"
                >
                  {cancelling === l.id ? "…" : "Cancel"}
                </button>
              ) : (
                <Link
                  href={`/marketplace/${l.id}`}
                  className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[13px] text-zinc-300 transition hover:bg-white/5"
                >
                  View
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- small form controls ---------------- */

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/60";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-wide text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <input
      type="number"
      value={Number.isNaN(value) ? "" : value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${inputCls} tabular-nums`}
    />
  );
}

function StatusBadge({ status }: { status?: ListingStatus }) {
  const s = status ?? "ACTIVE";
  const cls: Record<ListingStatus, string> = {
    ACTIVE: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    SOLD: "border-white/15 bg-white/5 text-zinc-300",
    CANCELLED: "border-red-400/30 bg-red-400/10 text-red-300",
  };
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls[s]}`}
    >
      {s}
    </span>
  );
}

/* ---------------- auth gate ---------------- */

function GateCard({
  busy,
  onClick,
  connected,
  error,
}: {
  busy: boolean;
  onClick: () => void;
  connected: boolean;
  error: string | null;
}) {
  const label = busy
    ? "Processing…"
    : connected
      ? "Sign in to sell"
      : "Connect wallet";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
      <Img src="/notes.png" alt="" className="h-12 opacity-40" />
      <p className="text-sm text-zinc-400">
        Connect your wallet and sign in to list a card for sale.
      </p>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-50"
      >
        {label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
