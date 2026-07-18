"use client";

// Settings page — the user's own account preferences. Main Info is wired to
// the backend: profile fields read/write /users/me and shipment addresses
// persist via /users/me/addresses; Account Balance reads live SOL/USDC over
// the wallet's RPC connection. Notifications, discoverable and blocked users
// remain local-only POC UI.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import {
  addAddress,
  deleteAddress,
  getMyAddresses,
  getProfile,
  updateProfile,
  type Profile,
  type ShippingAddress,
  type UpdateProfileInput,
} from "@/lib/api";
import { DEVNET_USDC_MINT, fetchSolBalance, fetchSplBalance, formatSol, formatUsdc } from "@/lib/tokens";
import RenameModal from "@/components/account/RenameModal";
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

// The rail reads in the designer's sentence case; the VALUES stay uppercase so
// every `tab === "MAIN INFO"` branch below is untouched (mirrors the profile).
const TAB_LABELS: Record<Tab, string> = {
  "MAIN INFO": "Main Info",
  "ACCOUNT BALANCE": "Account Balance",
  ACTIVITY: "Activity",
};

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

const emptyForm = {
  fullName: "",
  country: COUNTRIES[0],
  street: "",
  apt: "",
  state: "",
  city: "",
  phoneCode: "+62", // matches the default country
  phone: "",
  zip: "",
  isDefault: false,
};

/** The six editable profile fields as strings (server nulls seeded to ""). Save
 *  diffs the live form against a seeded baseline of this shape. */
type ProfileForm = {
  displayName: string;
  bio: string;
  twitter: string;
  website: string;
  phoneCountryCode: string;
  phoneNumber: string;
};

export default function SettingsPage() {
  const { token, isAuthed, user } = useAuth();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  const [tab, setTab] = useState<Tab>("MAIN INFO");

  // The last server snapshot of /users/me — the banner reads it and Cancel
  // resets the form to it.
  const [profile, setProfile] = useState<Profile | null>(null);
  // The seeded snapshot of the six editable fields. Save diffs the live form
  // against it and sends only what changed. Stays `null` until getProfile
  // SUCCEEDS, which also gates the Save button — you can't wipe an unseeded
  // form by saving "" over fields that never loaded.
  const [baseline, setBaseline] = useState<ProfileForm | null>(null);
  const [renaming, setRenaming] = useState(false);

  // MAIN INFO — profile fields (username maps to displayName, site to website)
  const [username, setUsername] = useState("");
  const [discoverable, setDiscoverable] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [site, setSite] = useState("");

  // Notifications
  const [notifyOffers, setNotifyOffers] = useState(true);
  const [offerThreshold, setOfferThreshold] = useState(50);
  const [notifyMessages, setNotifyMessages] = useState(true);

  // Shipment addresses
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrBusy, setAddrBusy] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Save flash / progress / failure
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ACCOUNT BALANCE — live wallet balances, stored WITH the wallet they belong
  // to so switching wallets derives back to "…" instead of flashing the
  // previous wallet's numbers (no synchronous setState in the effect body).
  const [balances, setBalances] = useState<{ owner: string; sol: number; usdc: number } | null>(
    null,
  );

  const onCopy = useCallback(() => {
    if (address) void copyText(address);
  }, [address]);

  /** The ONE place the form is (re)seeded from a server snapshot — the fetch
   *  effect and Cancel both go through it, so they can't drift apart. */
  const seedForm = useCallback((p: Profile) => {
    setUsername(p.displayName ?? "");
    setBio(p.bio ?? "");
    setTwitter(p.twitter ?? "");
    setSite(p.website ?? "");
    setPhoneCode(p.phoneCountryCode ?? "");
    setPhone(p.phoneNumber ?? "");
    setBaseline({
      displayName: p.displayName ?? "",
      bio: p.bio ?? "",
      twitter: p.twitter ?? "",
      website: p.website ?? "",
      phoneCountryCode: p.phoneCountryCode ?? "",
      phoneNumber: p.phoneNumber ?? "",
    });
  }, []);

  // Same effect pattern as the profile page: pull /users/me once per token so
  // the banner shows the real name + join year and the form starts filled in.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getProfile(token)
      .then((p) => {
        if (!alive) return;
        setProfile(p);
        seedForm(p);
      })
      .catch(() => {
        /* banner falls back to the wallet address */
      });
    return () => {
      alive = false;
    };
  }, [token, seedForm]);

  // Saved shipping addresses live on the backend now.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getMyAddresses(token)
      .then((rows) => {
        if (alive) setAddresses(rows);
      })
      .catch(() => {
        /* a failed load is not fatal — the panel just shows the add button */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Live SOL + devnet-USDC balances for the Account Balance tab.
  useEffect(() => {
    if (!publicKey) return;
    let alive = true;
    const owner = publicKey.toBase58();
    Promise.all([
      fetchSolBalance(connection, publicKey),
      fetchSplBalance(connection, publicKey, DEVNET_USDC_MINT),
    ])
      .then(([sol, usdc]) => {
        if (alive) setBalances({ owner, sol, usdc });
      })
      .catch(() => {
        // RPC hiccup — a zero reads better than an eternal spinner
        if (alive) setBalances({ owner, sol: 0, usdc: 0 });
      });
    return () => {
      alive = false;
    };
  }, [connection, publicKey]);

  /** PATCH only the fields that changed vs the seeded baseline — never re-send
   *  "" for a field the user didn't touch. The whole patch is atomic server-side,
   *  so bio/twitter/website/phone may send "" to clear themselves, but displayName
   *  is mandatory (@Length 1,32): an empty rename is caught here, not 400'd. */
  const onSave = useCallback(async () => {
    if (!token || !baseline) return;

    const payload: UpdateProfileInput = {};
    if (username !== baseline.displayName) payload.displayName = username;
    if (bio !== baseline.bio) payload.bio = bio;
    if (twitter !== baseline.twitter) payload.twitter = twitter;
    if (site !== baseline.website) payload.website = site;
    if (phoneCode !== baseline.phoneCountryCode) payload.phoneCountryCode = phoneCode;
    if (phone !== baseline.phoneNumber) payload.phoneNumber = phone;

    // Client-side guards so a predictable bad value never round-trips a 400.
    if (payload.displayName !== undefined && !payload.displayName.trim()) {
      setSaveError("Display name can't be empty");
      return;
    }
    if (payload.phoneNumber && payload.phoneNumber.length < 4) {
      setSaveError("Enter a valid phone number");
      return;
    }
    setSaveError(null);

    // Nothing changed — flash "Saved" without hitting the server.
    if (Object.keys(payload).length === 0) {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      return;
    }

    setSaving(true);
    try {
      const p = await updateProfile(payload, token);
      setProfile(p); // banner name updates
      seedForm(p); // reseed the Cancel + diff baseline from the server truth
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [token, baseline, username, bio, twitter, site, phoneCode, phone, seedForm]);

  /** Cancel = discard edits: back to the last server snapshot (blank pre-login). */
  const onCancel = useCallback(() => {
    setSaveError(null);
    if (profile) {
      seedForm(profile);
      return;
    }
    setUsername("");
    setBio("");
    setTwitter("");
    setSite("");
    setPhoneCode("");
    setPhone("");
  }, [profile, seedForm]);

  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const closeAddr = useCallback(() => {
    setAddrOpen(false);
    setAddrError(null);
    setForm({ ...emptyForm });
  }, []);

  const submitAddress = useCallback(async () => {
    if (!token) return;

    // Plain-English required-field guard, so one missing field doesn't surface
    // a raw multi-field class-validator error from the (atomic) CreateAddressDto.
    const missing: string[] = [];
    if (!form.fullName.trim()) missing.push("full name");
    if (!form.country.trim()) missing.push("country");
    if (!form.street.trim()) missing.push("street address");
    if (!form.city.trim()) missing.push("city");
    if (!form.zip.trim()) missing.push("zip/postal code");
    if (missing.length) {
      setAddrError(`Please fill in: ${missing.join(", ")}.`);
      return;
    }
    if (form.phone && form.phone.length < 4) {
      setAddrError("Enter a valid phone number.");
      return;
    }

    setAddrBusy(true);
    setAddrError(null);
    try {
      const created = await addAddress(
        {
          fullName: form.fullName,
          country: form.country,
          street: form.street,
          apt: form.apt || undefined, // optional — omit rather than send ""
          state: form.state || undefined,
          city: form.city,
          phoneCountryCode: form.phoneCode || undefined,
          phoneNumber: form.phone || undefined,
          zip: form.zip,
          isDefault: form.isDefault,
        },
        token,
      );
      setAddresses((prev) => {
        // the server keeps a single default — mirror that locally
        const cleaned = created.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
        return [...cleaned, created];
      });
      closeAddr();
    } catch (e) {
      setAddrError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddrBusy(false);
    }
  }, [token, form, closeAddr]);

  /** Optimistic remove. On failure, re-pull the authoritative list rather than
   *  restoring a captured snapshot — a stale snapshot could resurrect a row a
   *  concurrent successful delete already removed. */
  const removeAddress = useCallback(
    (id: string) => {
      if (!token) return;
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      deleteAddress(id, token).catch(() => {
        getMyAddresses(token)
          .then(setAddresses)
          .catch(() => {});
      });
    },
    [token],
  );

  // Same fallback chain as the profile page banner.
  const bannerName =
    profile?.displayName?.trim() || user?.displayName?.trim() || (address ? "Unnamed" : "Guest");
  const joined = profile ? new Date(profile.createdAt).getFullYear().toString() : undefined;

  const balanceFor = (kind: "sol" | "usdc") => {
    if (!address) return kind === "sol" ? "0.000" : "0.00"; // no wallet — nothing to read
    if (!balances || balances.owner !== address) return "…"; // fetch in flight
    return kind === "sol" ? formatSol(balances.sol) : formatUsdc(balances.usdc);
  };

  return (
    <AccountShell active="Vault">
      {/* Rail on the left, banner on the right — mirrors the profile page. Below
          `md` there is no room for the 168px rail beside the banner, so the tabs
          fall back to the scrolling strip underneath it. */}
      <div className="flex gap-5">
        <Tabs
          vertical
          jersey
          className="hidden md:flex"
          tabs={TABS}
          labels={TAB_LABELS}
          active={tab}
          onChange={setTab}
        />

        <div className="min-w-0 flex-1">
          <ProfileBanner
            name={bannerName}
            address={address}
            joined={joined}
            onRename={isAuthed ? () => setRenaming(true) : undefined}
            onCopy={onCopy}
          />
        </div>
      </div>

      <div className="mt-6 md:hidden">
        <Tabs jersey tabs={TABS} labels={TAB_LABELS} active={tab} onChange={setTab} />
      </div>

      <div className="mt-5">
        {tab === "MAIN INFO" ? (
          <>
            <Panel className="p-5 sm:p-6">
              <FieldRow label="Username">
                <TextInput
                  value={username}
                  maxLength={32}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                />
              </FieldRow>

              <FieldRow label="Email">
                <div className="space-y-3">
                  <TextInput readOnly value={profile?.email ?? ""} placeholder="No email set" />
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
                <PhoneField
                  code={phoneCode}
                  onCodeChange={setPhoneCode}
                  value={phone}
                  onChange={setPhone}
                />
              </FieldRow>

              <FieldRow label="Bio">
                <TextArea
                  value={bio}
                  maxLength={280}
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
                    maxLength={50}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="Enter your Twitter handle"
                    className="pl-8"
                  />
                </div>
              </FieldRow>

              <FieldRow label="Personal site">
                <TextInput
                  value={site}
                  maxLength={200}
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

                  {isAuthed ? (
                    <button
                      type="button"
                      onClick={() => setAddrOpen(true)}
                      className="w-full rounded-xl border border-dashed border-white/20 bg-white/[0.02] px-4 py-3 text-[13px] font-medium text-zinc-400 transition hover:border-yellow-400/40 hover:text-zinc-200"
                    >
                      + Add new address
                    </button>
                  ) : (
                    <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-center text-[13px] text-zinc-500">
                      Sign in with your wallet to manage addresses
                    </p>
                  )}
                </div>
              </FieldRow>
            </Panel>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
              {saveError && (
                <span className="text-[13px] text-red-400" role="alert">
                  {saveError}
                </span>
              )}
              {saved && (
                <span className="text-[13px] font-medium text-emerald-400" role="status">
                  Saved
                </span>
              )}
              <GhostButton type="button" onClick={onCancel}>
                Cancel
              </GhostButton>
              <PrimaryButton
                type="button"
                onClick={onSave}
                disabled={saving || !isAuthed || !baseline}
              >
                {saving ? "Saving…" : "Save"}
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
              <BalanceTile dot="#9945FF" label="Solana" amount={balanceFor("sol")} unit="SOL" />
              <BalanceTile dot="#2775CA" label="USDC" amount={balanceFor("usdc")} unit="USDC" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
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
              maxLength={80}
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
                maxLength={80}
                onChange={(e) => setField("city", e.target.value)}
                placeholder="City"
              />
            </ModalField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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

          {addrError && (
            <p className="text-[12px] text-red-400" role="alert">
              {addrError}
            </p>
          )}

          <PrimaryButton
            type="button"
            onClick={submitAddress}
            disabled={addrBusy}
            className="w-full"
          >
            {addrBusy ? "Adding…" : "Add new address"}
          </PrimaryButton>
        </div>
      </ModalShell>

      {renaming && token && (
        // key on the loaded name so the modal reseeds if it opened before the
        // profile fetch resolved (the pencil is gated only on isAuthed).
        <RenameModal
          key={profile?.displayName ?? ""}
          current={profile?.displayName ?? ""}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            const p = await updateProfile({ displayName: name }, token);
            setProfile(p); // banner picks the new name up immediately
            setUsername(p.displayName ?? ""); // the Username field maps to displayName too
            // keep the diff baseline's displayName in sync WITHOUT touching the
            // other fields (they may hold unsaved edits in the Main Info form).
            setBaseline((prev) => (prev ? { ...prev, displayName: p.displayName ?? "" } : prev));
          }}
        />
      )}
    </AccountShell>
  );
}

/* ------------------------------ local pieces ------------------------------ */

/** Country dial codes the POC ships to. `— none —` (value "") lets a user clear
 *  a chosen code, which the backend accepts to null the field. Indonesia leads
 *  the real codes as the home market. */
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

function PhoneField({
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
  return (
    <div className="flex items-stretch gap-2">
      <Select
        value={code}
        onChange={onCodeChange}
        options={PHONE_CODES}
        placeholder="Code"
        ariaLabel="Phone country code"
        className="w-[148px] shrink-0"
      />
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

function AddressCard({ address, onRemove }: { address: ShippingAddress; onRemove: () => void }) {
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
        {address.phoneNumber && (
          <p className="mt-0.5 text-zinc-500">
            {[address.phoneCountryCode, address.phoneNumber].filter(Boolean).join(" ")}
          </p>
        )}
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
