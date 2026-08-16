"use client";

// Swap — tukar kartu (barter) antar kolektor. MVP RECORD-ONLY: pilih kartumu buat ditawarkan +
// tujuan kontak kolektor lawan → tercatat sbg "swap request" (GET/POST /swaps). TIDAK transfer/
// burn kartu — akseptasi & perpindahan kartu belum ada di fase ini. Daftar ajakan tampil di sini.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  createSwap,
  getMyPacks,
  getMySwaps,
  type SwapRequest,
} from "@/lib/api";
import type { GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import {
  AccountShell,
  EmptyState,
  ModalShell,
  PrimaryButton,
  TextInput,
  SwapArrowsIcon,
} from "@/components/account/ui";
import { Img } from "@/components/packs/ui";

type Mode = "wallet" | "email" | "sns";

const MODES: {
  key: Mode;
  tab: string;
  label: string;
  type: "text" | "email";
  placeholder: string;
  hint: string;
}[] = [
  {
    key: "wallet",
    tab: "With Wallet",
    label: "Wallet address",
    type: "text",
    placeholder: "e.g. 4NVejcZGg8Aeg…",
    hint: "The recipient's Solana wallet address.",
  },
  {
    key: "email",
    tab: "With Email",
    label: "Email",
    type: "email",
    placeholder: "name@email.com",
    hint: "We'll send them an invite to accept the swap.",
  },
  {
    key: "sns",
    tab: "With SNS",
    label: "SNS domain",
    type: "text",
    placeholder: "yourname.sol",
    hint: "A Solana Name Service domain resolves to a wallet.",
  },
];

const METHOD_LABEL: Record<string, string> = {
  wallet: "Wallet",
  email: "Email",
  sns: "SNS",
};

export default function SwapPage() {
  const { token, login } = useAuth();
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setSwaps(await getMySwaps(token));
    } catch {
      /* biarkan list terakhir */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // setState terjadi di dalam async refresh (bukan sinkron di effect) — false-positive.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void refresh();
  }, [refresh]);

  return (
    <AccountShell active="Vault">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-yellow-300"
          style={{ boxShadow: "0 0 0 1px rgba(245,182,52,0.12)" }}
        >
          <SwapArrowsIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white sm:text-2xl">Swap</h1>
          <p className="mt-0.5 text-[13px] text-zinc-400">
            Tawarkan kartumu buat ditukar langsung dengan kolektor lain — wallet ke wallet.
          </p>
        </div>
        {swaps.length > 0 && (
          <PrimaryButton onClick={() => setModalOpen(true)} className="shrink-0">
            + Swap baru
          </PrimaryButton>
        )}
      </div>

      <div className="mx-auto max-w-2xl">
        {loading ? (
          <p className="py-16 text-center text-[14px] text-zinc-500">Memuat ajakan swap…</p>
        ) : swaps.length === 0 ? (
          <>
            <EmptyState
              icon={<SwapArrowsIcon className="h-9 w-9" />}
              title="Belum ada swap"
              sub="Buat ajakan tukar kartu dengan tombol di bawah."
              action={<PrimaryButton onClick={() => setModalOpen(true)}>Create Swap</PrimaryButton>}
            />
            <p className="mt-5 text-center text-[13px] text-zinc-500">
              Cari kartu tertentu?{" "}
              <Link href="/marketplace" className="text-yellow-300 transition hover:text-yellow-200">
                Jelajahi marketplace
              </Link>
            </p>
          </>
        ) : (
          <ul className="flex flex-col gap-3">
            {swaps.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3"
              >
                <Img
                  src={s.offeredCardImage ?? "/card-back.svg"}
                  alt={s.offeredCardName}
                  className="h-16 w-12 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-zinc-100">
                    {s.offeredCardName}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                    Ditawarkan ke {METHOD_LABEL[s.recipientMethod] ?? s.recipientMethod}:{" "}
                    <span className="text-zinc-400">{s.recipientValue}</span>
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                  {s.status === "REQUESTED" ? "Menunggu" : "Dibatalkan"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Swap"
        subtitle="Pilih kartumu, lalu cara menghubungi kolektor lawan."
        maxWidth={520}
      >
        <CreateSwapForm
          getToken={async () => token ?? (await login())}
          onCreated={() => {
            setModalOpen(false);
            void refresh();
          }}
        />
      </ModalShell>
    </AccountShell>
  );
}

function CreateSwapForm({
  getToken,
  onCreated,
}: {
  getToken: () => Promise<string>;
  onCreated: () => void;
}) {
  const [cards, setCards] = useState<GachaPull[] | null>(null);
  const [offered, setOffered] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("wallet");
  const [values, setValues] = useState<Record<Mode, string>>({
    wallet: "",
    email: "",
    sns: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await getToken();
        const pulls = await getMyPacks(t);
        if (!alive) return;
        const owned = pulls.filter((p) => p.status === "OPENED" && !!p.nftAddress);
        setCards(owned);
        if (owned[0]?.nftAddress) setOffered(owned[0].nftAddress);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Gagal memuat kartu.");
        setCards([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [getToken]);

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const value = values[mode];
  const canSubmit = !!offered && value.trim().length > 0 && !submitting;

  const submit = useCallback(async () => {
    if (!offered || !value.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const t = await getToken();
      await createSwap(
        { offeredNftAddress: offered, recipientMethod: mode, recipientValue: value.trim() },
        t,
      );
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat swap.");
    } finally {
      setSubmitting(false);
    }
  }, [offered, value, submitting, getToken, mode, onCreated]);

  return (
    <div className="space-y-4">
      {/* Pilih kartu yang ditawarkan */}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
          Kartu yang kamu tawarkan
        </label>
        {cards === null ? (
          <p className="py-3 text-[13px] text-zinc-500">Memuat kartu…</p>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
            Belum punya kartu buat ditukar. Buka pack dulu di{" "}
            <Link href="/open-packs" className="font-semibold underline underline-offset-2">
              Open Packs
            </Link>
            .
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cards.map((c) => {
              const on = c.nftAddress === offered;
              return (
                <button
                  key={c.nftAddress}
                  type="button"
                  onClick={() => setOffered(c.nftAddress)}
                  title={c.ccItemName ?? c.nftName ?? "Kartu"}
                  className={`shrink-0 overflow-hidden rounded-lg border-2 transition ${
                    on ? "border-yellow-400" : "border-transparent hover:border-white/20"
                  }`}
                >
                  <Img
                    src={c.nftImage ?? "/card-back.svg"}
                    alt={c.nftName ?? "Kartu"}
                    className="h-24 w-[68px] object-cover"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Segmented mode selector */}
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {MODES.map((m) => {
          const on = m.key === mode;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              aria-pressed={on}
              className={`rounded-lg px-2 py-2 text-[13px] font-semibold transition ${
                on
                  ? "bg-yellow-400/15 text-yellow-300 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.35)]"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
              }`}
            >
              {m.tab}
            </button>
          );
        })}
      </div>

      {/* Mode-dependent input */}
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">{current.label}</label>
        <TextInput
          type={current.type}
          value={value}
          onChange={(e) => setValues((prev) => ({ ...prev, [mode]: e.target.value }))}
          placeholder={current.placeholder}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{current.hint}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      <PrimaryButton type="button" className="w-full" disabled={!canSubmit} onClick={submit}>
        {submitting ? "Mengirim…" : "Create Swap"}
      </PrimaryButton>
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">
        Ini ajakan tukar — kartu belum berpindah. Kolektor lawan bakal diberi tahu buat menerima.
      </p>
    </div>
  );
}
