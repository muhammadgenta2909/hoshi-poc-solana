"use client";

// Settings page — the user's own account preferences. POC only: every control
// is local React state, "Save" flashes a local confirmation, and modals mutate
// in-memory lists. No backend is wired for any of these features yet.

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  AccountShell,
  ProfileBanner,
  Tabs,
  Panel,
  SectionTitle,
  EmptyState,
  FieldRow,
  TextInput,
  TextArea,
  Select,
  Toggle,
  PrimaryButton,
  GhostButton,
  ModalShell,
  copyText,
  CloseIcon,
  InboxIcon,
} from "@/components/account/ui";

const TABS = ["MAIN INFO", "ACCOUNT BALANCE", "ACTIVITY"] as const;
type Tab = (typeof TABS)[number];

const COUNTRIES = [
  "Indonesia",
  "United States of America",
  "Singapore",
  "Japan",
  "United Kingdom",
  "Australia",
];

const STATES = [
  "California",
  "New York",
  "Texas",
  "DKI Jakarta",
  "West Java",
  "Bali",
];

type Address = {
  id: string;
  fullName: string;
  country: string;
  street: string;
  apt: string;
  state: string;
  city: string;
  phone: string;
  zip: string;
  isDefault: boolean;
};

const emptyForm = {
  fullName: "",
  country: COUNTRIES[0],
  street: "",
  apt: "",
  state: "",
  city: "",
  phone: "",
  zip: "",
  isDefault: false,
};

export default function SettingsPage() {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  const [tab, setTab] = useState<Tab>("MAIN INFO");

  // MAIN INFO — profile fields
  const [username, setUsername] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [site, setSite] = useState("");

  // Notifications
  const [notifyOffers, setNotifyOffers] = useState(true);
  const [offerThreshold, setOfferThreshold] = useState(50);
  const [notifyMessages, setNotifyMessages] = useState(true);

  // Shipment addresses
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // Save flash
  const [saved, setSaved] = useState(false);

  // Deposit modal
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const onCopy = useCallback(() => {
    if (address) void copyText(address);
  }, [address]);

  const onSave = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }, []);

  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const closeAddr = useCallback(() => {
    setAddrOpen(false);
    setForm({ ...emptyForm });
  }, []);

  const addAddress = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : String(Date.now());
    setAddresses((prev) => {
      const next: Address = { id, ...form };
      // if this one is default, unset the others
      const cleaned = next.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
      return [...cleaned, next];
    });
    closeAddr();
  }, [form, closeAddr]);

  const removeAddress = useCallback((id: string) => {
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const depositNum = Number(depositAmount);
  const depositValid = Number.isFinite(depositNum) && depositNum > 0;

  const closeDeposit = useCallback(() => {
    setDepositOpen(false);
    setDepositAmount("");
  }, []);

  return (
    <AccountShell active="Vault">
      <ProfileBanner name="Unnamed" address={address} joined="2026" onCopy={onCopy} />

      <div className="mt-5">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-5">
        {tab === "MAIN INFO" ? (
          <>
            <Panel className="p-5 sm:p-6">
              <FieldRow label="Username">
                <TextInput
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </FieldRow>

              <FieldRow label="Email">
                <div className="space-y-3">
                  <TextInput readOnly value="you@example.com" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <GhostButton className="px-3.5 py-1.5 text-[13px]">Change</GhostButton>
                    <Toggle
                      checked={discoverable}
                      onChange={setDiscoverable}
                      label="Discoverable"
                    />
                  </div>
                </div>
              </FieldRow>

              <FieldRow label="Phone Number">
                <PhoneField value={phone} onChange={setPhone} />
              </FieldRow>

              <FieldRow label="Bio">
                <TextArea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell the world your story!"
                />
              </FieldRow>

              <FieldRow label="Twitter">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-zinc-400">
                    @
                  </span>
                  <TextInput
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="Enter your Twitter handle"
                    className="pl-8"
                  />
                </div>
              </FieldRow>

              <FieldRow label="Personal site">
                <TextInput
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="https://"
                />
              </FieldRow>

              <FieldRow
                label="Notifications"
                hint="Choose what lands in your inbox."
              >
                <div className="space-y-4">
                  <Toggle
                    checked={notifyOffers}
                    onChange={setNotifyOffers}
                    label="Email me on offers above the threshold"
                  />
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={offerThreshold}
                      onChange={(e) => setOfferThreshold(Number(e.target.value))}
                      className="h-1.5 flex-1 cursor-pointer accent-yellow-400"
                      aria-label="Offer notification threshold"
                    />
                    <span className="w-11 text-right text-[13px] tabular-nums text-zinc-300">
                      {offerThreshold}%
                    </span>
                  </div>
                  <Toggle
                    checked={notifyMessages}
                    onChange={setNotifyMessages}
                    label="Email me when I receive a new message."
                  />
                </div>
              </FieldRow>

              <FieldRow label="Shipment address">
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Link
                      href="/withdraw/history"
                      className="text-[13px] font-medium text-yellow-300 transition hover:text-yellow-200"
                    >
                      View my shipments →
                    </Link>
                  </div>

                  {addresses.length > 0 && (
                    <div className="space-y-2">
                      {addresses.map((a) => (
                        <AddressCard key={a.id} address={a} onRemove={() => removeAddress(a.id)} />
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setAddrOpen(true)}
                    className="w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-3 text-[13px] font-medium text-zinc-400 transition hover:border-yellow-400/40 hover:text-zinc-200"
                  >
                    + Add new address
                  </button>
                </div>
              </FieldRow>
            </Panel>

            <div className="mt-5 flex items-center justify-end gap-3">
              {saved && (
                <span className="text-[13px] font-medium text-emerald-400" role="status">
                  Saved
                </span>
              )}
              <GhostButton type="button">Cancel</GhostButton>
              <PrimaryButton type="button" onClick={onSave}>
                Save
              </PrimaryButton>
            </div>

            <Panel className="mt-6 p-5 sm:p-6">
              <SectionTitle>Blocked Users (0)</SectionTitle>
              <p className="mt-3 text-[14px] text-zinc-400">You haven&apos;t blocked anyone.</p>
            </Panel>
          </>
        ) : tab === "ACCOUNT BALANCE" ? (
          <Panel className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Balance</SectionTitle>
              <GhostButton className="px-3.5 py-1.5 text-[13px]">View history</GhostButton>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <BalanceTile dot="#9945FF" label="Solana" amount="0.00" unit="SOL" />
              <BalanceTile dot="#2775CA" label="USDC" amount="0.00" unit="USDC" />
              <BalanceTile dot="#7C5CFF" label="Escrow Balance" amount="0.00" unit="USDC" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <PrimaryButton type="button" onClick={() => setDepositOpen(true)}>
                Deposit
              </PrimaryButton>
              <GhostButton type="button" disabled>
                Withdraw
              </GhostButton>
            </div>
          </Panel>
        ) : (
          <EmptyState
            icon={<InboxIcon className="h-9 w-9" />}
            title="No activity yet"
            sub="Your account activity will appear here."
          />
        )}
      </div>

      {/* Add New Address */}
      <ModalShell
        open={addrOpen}
        onClose={closeAddr}
        title="Add New Address"
        maxWidth={560}
      >
        <div className="space-y-4">
          <ModalField label="Full Name">
            <TextInput
              value={form.fullName}
              onChange={(e) => setField("fullName", e.target.value)}
              placeholder="Full name"
            />
          </ModalField>

          <ModalField label="Country/Region">
            <Select
              value={form.country}
              onChange={(v) => setField("country", v)}
              options={COUNTRIES}
              ariaLabel="Country or region"
            />
          </ModalField>

          <ModalField label="Street Address">
            <TextInput
              value={form.street}
              onChange={(e) => setField("street", e.target.value)}
              placeholder="Street address"
            />
          </ModalField>

          <ModalField label="Apartment/Suite/Unit">
            <TextInput
              value={form.apt}
              onChange={(e) => setField("apt", e.target.value)}
              placeholder="Apt, suite, unit (optional)"
            />
          </ModalField>

          <div className="grid gap-4 sm:grid-cols-2">
            <ModalField label="State/Province">
              <Select
                value={form.state}
                onChange={(v) => setField("state", v)}
                options={STATES}
                placeholder="Select…"
                ariaLabel="State or province"
              />
            </ModalField>

            <ModalField label="City/Department">
              <TextInput
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                placeholder="City"
              />
            </ModalField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ModalField label="Phone Number">
              <PhoneField
                value={form.phone}
                onChange={(v) => setField("phone", v)}
              />
            </ModalField>

            <ModalField label="Zip/Postal code">
              <TextInput
                value={form.zip}
                onChange={(e) => setField("zip", e.target.value)}
                placeholder="Postal code"
              />
            </ModalField>
          </div>

          <Toggle
            checked={form.isDefault}
            onChange={(v) => setField("isDefault", v)}
            label="Use as default"
          />

          <PrimaryButton type="button" onClick={addAddress} className="w-full">
            Add new address
          </PrimaryButton>
        </div>
      </ModalShell>

      {/* Deposit to Escrow */}
      <ModalShell
        open={depositOpen}
        onClose={closeDeposit}
        title="Deposit to Escrow"
        subtitle="Deposit USDC to your shared escrow. This lets you make multiple offers without depositing each time."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[13px]">
            <span className="text-zinc-400">Wallet Balance</span>
            <span className="font-medium tabular-nums text-zinc-200">0.00 USDC</span>
          </div>

          <ModalField label="Amount">
            <TextInput
              inputMode="decimal"
              type="number"
              min={0}
              step="any"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
            />
          </ModalField>

          <PrimaryButton
            type="button"
            onClick={closeDeposit}
            disabled={!depositValid}
            className="w-full"
          >
            Deposit
          </PrimaryButton>
        </div>
      </ModalShell>
    </AccountShell>
  );
}

/* ------------------------------ local pieces ------------------------------ */

function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-stretch gap-2">
      <span className="inline-flex shrink-0 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[14px] text-zinc-300">
        +1
      </span>
      <div className="min-w-0 flex-1">
        <TextInput
          inputMode="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Phone number"
        />
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

function BalanceTile({
  dot,
  label,
  amount,
  unit,
}: {
  dot: string;
  label: string;
  amount: string;
  unit: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-zinc-500">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="mt-2 text-[20px] font-semibold tabular-nums text-zinc-100">
        {amount}{" "}
        <span className="text-[13px] font-normal text-zinc-500">{unit}</span>
      </div>
    </div>
  );
}

function AddressCard({ address, onRemove }: { address: Address; onRemove: () => void }) {
  const line = [
    address.street,
    address.apt,
    address.city,
    address.state,
    address.zip,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
      <div className="min-w-0 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-100">{address.fullName || "Address"}</span>
          {address.isDefault && (
            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[11px] font-medium text-yellow-300">
              Default
            </span>
          )}
        </div>
        {line && <p className="mt-1 leading-relaxed text-zinc-400">{line}</p>}
        {address.phone && <p className="mt-0.5 text-zinc-500">+1 {address.phone}</p>}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove address"
        className="shrink-0 text-zinc-500 transition hover:text-red-400"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
