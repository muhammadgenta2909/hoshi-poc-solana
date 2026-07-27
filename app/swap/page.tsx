"use client";

// Swap page — peer-to-peer card swap (POC shell). No backend yet: the page is a
// centered empty state that opens a local "Create Swap" modal. Submitting the
// modal closes it and flashes a brief success message. All state is local React.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AccountShell,
  EmptyState,
  ModalShell,
  PrimaryButton,
  TextInput,
  SwapArrowsIcon,
} from "@/components/account/ui";

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

export default function SwapPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear a pending flash timer if the page unmounts (no setState in body).
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const handleCreated = () => {
    setModalOpen(false);
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1500);
  };

  return (
    <AccountShell active="Vault">
      {flash && (
        <div
          role="status"
          className="fixed left-1/2 top-6 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-[13px] font-semibold text-emerald-300 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Swap request created
        </div>
      )}

      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-yellow-300"
          style={{ boxShadow: "0 0 0 1px rgba(245,182,52,0.12)" }}
        >
          <SwapArrowsIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-white sm:text-2xl">Swap</h1>
          <p className="mt-0.5 text-[13px] text-zinc-400">
            Trade cards directly with another collector — wallet to wallet.
          </p>
        </div>
      </div>

      {/* Centered empty state */}
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={<SwapArrowsIcon className="h-9 w-9" />}
          title="No swaps yet"
          sub="You can create your swap by clicking the button below."
          action={
            <PrimaryButton onClick={() => setModalOpen(true)}>Create Swap</PrimaryButton>
          }
        />

        <p className="mt-5 text-center text-[13px] text-zinc-500">
          Looking for a specific card instead?{" "}
          <Link href="/marketplace" className="text-yellow-300 transition hover:text-yellow-200">
            Browse the marketplace
          </Link>
        </p>
      </div>

      {/* Create Swap modal — child mounts only while open, so its form state
          resets cleanly every time the modal is reopened. */}
      <ModalShell
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Swap"
        subtitle="Choose how you want to reach the other collector."
        maxWidth={480}
      >
        <CreateSwapForm onCreate={handleCreated} />
      </ModalShell>
    </AccountShell>
  );
}

function CreateSwapForm({ onCreate }: { onCreate: () => void }) {
  const [mode, setMode] = useState<Mode>("wallet");
  const [values, setValues] = useState<Record<Mode, string>>({
    wallet: "",
    email: "",
    sns: "",
  });

  const current = MODES.find((m) => m.key === mode) ?? MODES[0];
  const value = values[mode];
  const canSubmit = value.trim().length > 0;

  return (
    <div className="space-y-4">
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
        <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
          {current.label}
        </label>
        <TextInput
          type={current.type}
          value={value}
          onChange={(e) => setValues((prev) => ({ ...prev, [mode]: e.target.value }))}
          placeholder={current.placeholder}
          autoFocus
        />
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">{current.hint}</p>
      </div>

      <PrimaryButton
        type="button"
        className="w-full"
        disabled={!canSubmit}
        onClick={() => {
          if (canSubmit) onCreate();
        }}
      >
        Create Swap
      </PrimaryButton>
    </div>
  );
}
