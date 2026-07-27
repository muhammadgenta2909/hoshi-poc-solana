"use client";

// Deposit — "Create a shipment". POC: no backend. A single centered card with a
// small controlled form; submitting flashes a local success note and resets the
// fields (no network). Mirrors app/account/page.tsx for tone and layout.

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AccountShell, Panel, TextInput, TextArea, PrimaryButton } from "@/components/account/ui";

export default function DepositPage() {
  const [count, setCount] = useState("");
  const [value, setValue] = useState("");
  const [desc, setDesc] = useState("");
  const [agree, setAgree] = useState(false);
  const [done, setDone] = useState(false);

  const canSubmit = count.trim() !== "" && value.trim() !== "" && agree;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setDone(true);
    setCount("");
    setValue("");
    setDesc("");
    setAgree(false);
    window.setTimeout(() => setDone(false), 4500);
  }

  return (
    <AccountShell active="Vault">
      <Panel className="mx-auto max-w-xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[20px] font-bold text-white sm:text-[22px]">Create a shipment</h1>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-[12px] font-medium text-sky-200">
            <InfoGlyph />
            Shipping tips
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-[13px] leading-relaxed text-sky-200">
          Hoshi accepts graded cards only. To deposit other items, contact our team.
        </div>

        {done && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 text-emerald-300">
            <CheckGlyph />
            <p className="text-[14px] font-medium leading-relaxed">
              Shipment created — we&apos;ll email you a prepaid label.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Number of cards</Label>
              <TextInput
                type="number"
                min={1}
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="Enter number of cards"
              />
            </div>
            <div className="grid gap-2">
              <Label>Total value</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-zinc-500">
                  $
                </span>
                <TextInput
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter value of box"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            <TextArea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Tell us what's in the box."
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-white/[0.04] accent-yellow-400"
            />
            <span className="text-[13px] text-zinc-300">
              I agree with the Hoshi{" "}
              <Link
                href="#"
                className="font-semibold text-yellow-300 underline-offset-2 transition hover:text-yellow-200 hover:underline"
              >
                Terms of Service
              </Link>
            </span>
          </label>

          <PrimaryButton type="submit" disabled={!canSubmit} className="w-full">
            Create &rarr;
          </PrimaryButton>
        </form>
      </Panel>
    </AccountShell>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <label className="text-[13px] font-medium text-zinc-300">{children}</label>;
}

function InfoGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-4 w-4 shrink-0"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  );
}
