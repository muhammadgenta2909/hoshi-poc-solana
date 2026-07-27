"use client";

// Withdraw wizard (POC). Four steps: choose shipping address, pick items,
// review, confirm. Everything is local React state — no network. The final
// "Submit withdrawal" flashes a success message and resets to step 1.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AccountShell,
  Panel,
  SectionTitle,
  StepBar,
  TextInput,
  Select,
  PrimaryButton,
  GhostButton,
  ModalShell,
  PlusIcon,
  SearchIcon,
} from "@/components/account/ui";

type Address = {
  id: string;
  name: string;
  line: string;
  isDefault?: boolean;
};

const TOTAL = 4;

const STEP_TITLE: Record<number, string> = {
  1: "Where should we ship your items?",
  2: "Pick your items",
  3: "Review your withdrawal",
  4: "Confirm & submit",
};

export default function WithdrawPage() {
  const [step, setStep] = useState(1);
  const [flash, setFlash] = useState("");

  // --- step 1: addresses ---
  const [addresses, setAddresses] = useState<Address[]>([
    {
      id: "addr-1",
      name: "Genta",
      line: "Indonesia, Jawa Barat, Tasikmalaya",
      isDefault: true,
    },
  ]);
  const [selectedAddr, setSelectedAddr] = useState("addr-1");
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLine, setNewLine] = useState("");

  // --- step 2: filters (POC — no data behind them) ---
  const [cardType, setCardType] = useState("Cards");
  const [search, setSearch] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [category, setCategory] = useState("Categories");

  const back = () => setStep((s) => Math.max(1, s - 1));
  const next = () => setStep((s) => Math.min(TOTAL, s + 1));

  const addAddress = () => {
    const name = newName.trim();
    const line = newLine.trim();
    if (!name || !line) return;
    const id = `addr-${Date.now()}`;
    setAddresses((list) => [...list, { id, name, line }]);
    setSelectedAddr(id);
    setNewName("");
    setNewLine("");
    setAddOpen(false);
  };

  const submit = () => {
    setStep(1);
    setFlash("Withdrawal submitted");
    window.setTimeout(() => setFlash(""), 2600);
  };

  return (
    <AccountShell active="Vault" wide>
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-[28px]">Withdraw</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            Ship graded cards from your vault to your door.
          </p>
        </div>
        <Link
          href="/vault"
          className="text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200"
        >
          ← Back to vault
        </Link>
      </div>

      <div className="mt-5 max-w-[520px]">
        <StepBar step={step} total={TOTAL} />
        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Step {step} of {TOTAL}
        </p>
      </div>

      {flash && (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-emerald-300">
          <span
            aria-hidden
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20"
          >
            ✓
          </span>
          {flash}
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-white sm:text-xl">{STEP_TITLE[step]}</h2>

        {/* --------------------------- STEP 1 --------------------------- */}
        {step === 1 && (
          <>
            <SectionTitle>Shipping address</SectionTitle>
            <Panel className="mt-3 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => {
                  const on = a.id === selectedAddr;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAddr(a.id)}
                      className={`group flex flex-col gap-1.5 rounded-2xl border p-4 text-left transition ${
                        on
                          ? "border-emerald-500/50 bg-emerald-500/[0.06]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-zinc-100">{a.name}</span>
                        {a.isDefault && (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            Default
                          </span>
                        )}
                      </div>
                      <span className="text-[13px] leading-relaxed text-zinc-400">{a.line}</span>
                      <span
                        className={`mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium ${
                          on ? "text-emerald-300" : "text-zinc-500"
                        }`}
                      >
                        <span
                          className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${
                            on
                              ? "border-emerald-400 bg-emerald-400 text-[#0a0907]"
                              : "border-white/25 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        {on ? "Selected" : "Ship here"}
                      </span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.01] p-4 text-zinc-400 transition hover:border-yellow-400/40 hover:text-yellow-300"
                >
                  <PlusIcon className="h-5 w-5" />
                  <span className="text-[13px] font-semibold">Add new address</span>
                </button>
              </div>
            </Panel>

            <BottomBar right={<PrimaryButton onClick={next}>Pick items →</PrimaryButton>} />
          </>
        )}

        {/* --------------------------- STEP 2 --------------------------- */}
        {step === 2 && (
          <>
            {/* filter row */}
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <Select
                value={cardType}
                onChange={setCardType}
                options={["Cards", "Sealed", "Slabs"]}
                ariaLabel="Item type"
                className="lg:w-40"
              />

              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items…"
                  className="pl-10"
                />
              </div>

              <TextInput
                value={min}
                onChange={(e) => setMin(e.target.value)}
                inputMode="numeric"
                placeholder="$ Min"
                className="lg:w-28"
              />
              <TextInput
                value={max}
                onChange={(e) => setMax(e.target.value)}
                inputMode="numeric"
                placeholder="$ Max"
                className="lg:w-28"
              />

              <Select
                value={category}
                onChange={setCategory}
                options={["Categories", "Pokémon", "Sports", "One Piece"]}
                ariaLabel="Category"
                className="lg:w-44"
              />
            </div>

            {/* two-column: items (left) + summary (right) */}
            <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02] px-6 py-16 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-600">
                  <SearchIcon className="h-6 w-6" />
                </div>
                <p className="text-[15px] font-semibold text-zinc-300">
                  No items match these filters.
                </p>
                <p className="mt-1 max-w-sm text-[13px] text-zinc-500">
                  Adjust the search or price range above to find cards in your vault.
                </p>
              </div>

              <Panel className="p-5">
                <SectionTitle>Your withdrawal</SectionTitle>
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                  Tap items on the left to add them to your withdrawal.
                </p>
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-zinc-500">Items</span>
                    <span className="font-semibold text-zinc-300">0</span>
                  </div>
                </div>
              </Panel>
            </div>

            <BottomBar
              left={<GhostButton onClick={back}>Back</GhostButton>}
              right={
                <PrimaryButton onClick={next} disabled>
                  Review →
                </PrimaryButton>
              }
            />
          </>
        )}

        {/* --------------------------- STEP 3 --------------------------- */}
        {step === 3 && (
          <>
            <Panel className="mt-4 p-6">
              <SectionTitle>Review your withdrawal</SectionTitle>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                A summary of the items and the shipping address will appear here before you submit.
              </p>
            </Panel>
            <BottomBar
              left={<GhostButton onClick={back}>Back</GhostButton>}
              right={<PrimaryButton onClick={next}>Next →</PrimaryButton>}
            />
          </>
        )}

        {/* --------------------------- STEP 4 --------------------------- */}
        {step === 4 && (
          <>
            <Panel className="mt-4 p-6">
              <SectionTitle>Confirm &amp; submit</SectionTitle>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                Confirm the details are correct. Submitting queues your items for shipment — this is
                a demo, so nothing is sent.
              </p>
            </Panel>
            <BottomBar
              left={<GhostButton onClick={back}>Back</GhostButton>}
              right={<PrimaryButton onClick={submit}>Submit withdrawal</PrimaryButton>}
            />
          </>
        )}
      </div>

      {/* add-address modal */}
      <ModalShell
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add shipping address"
        subtitle="Where should we ship your items?"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Full name</label>
            <TextInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Genta Pratama"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Address</label>
            <TextInput
              value={newLine}
              onChange={(e) => setNewLine(e.target.value)}
              placeholder="Country, Province, City"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <GhostButton onClick={() => setAddOpen(false)}>Cancel</GhostButton>
            <PrimaryButton onClick={addAddress} disabled={!newName.trim() || !newLine.trim()}>
              Add address
            </PrimaryButton>
          </div>
        </div>
      </ModalShell>
    </AccountShell>
  );
}

/** Sticky-feeling action row anchored to the bottom of each step. */
function BottomBar({ left, right }: { left?: ReactNode; right: ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}
