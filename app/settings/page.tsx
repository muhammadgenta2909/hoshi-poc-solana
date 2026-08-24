"use client";

// Settings page — the user's own account preferences. Main Info is wired to
// the backend: profile fields (incl. email + notification prefs) read/write
// /users/me and shipment addresses persist via /users/me/addresses; Account
// Balance reads live SOL/USDC over the wallet's RPC connection. Discoverable
// and blocked users remain local-only POC UI.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useTabParam } from "@/lib/useTabParam";
import { useFavoriteCards } from "@/lib/favorites";
import {
  addAddress,
  deleteAddress,
  getBalance,
  getMyAddresses,
  getProfile,
  updateProfile,
  type Balance,
  type Profile,
  type ShippingAddress,
  type UpdateProfileInput,
} from "@/lib/api";
import {
  getCities,
  getCountries,
  getStates,
  type GeoCountry,
  type GeoState,
} from "@/lib/geo";
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
  useOutsideClose,
  ChevronDownIcon,
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

// The address form's blank slate. Country/state/city are now driven by the geo
// cascade (lib/geo.ts → our CSC proxy), so they start empty and the user picks
// from the searchable comboboxes; phoneCode keeps Indonesia's dial code as the
// home-market default (independent of the chosen country).
const emptyForm = {
  fullName: "",
  country: "",
  street: "",
  apt: "",
  state: "",
  city: "",
  phoneCode: "+62",
  phone: "",
  zip: "",
  isDefault: false,
};

/** The editable profile fields (server nulls seeded to ""). Save diffs the live
 *  form against a seeded baseline of this shape. */
type ProfileForm = {
  displayName: string;
  email: string;
  bio: string;
  twitter: string;
  website: string;
  phoneCountryCode: string;
  phoneNumber: string;
  notifyOffers: boolean;
  notifyOfferThreshold: number;
  notifyMessages: boolean;
  discoverable: boolean;
};

export default function SettingsPage() {
  const { token, isAuthed, user } = useAuth();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  const [tab, setTab] = useTabParam<Tab>("MAIN INFO", TABS);

  // Favorit (maks 3) untuk box "Your Favorite Card" di banner — sama seperti /account.
  // Settings belum memuat pulls/assets sendiri, jadi hook ini fetch-nya sendiri (JWT).
  // Sinkron via event/localStorage (useFavorites), jadi ♥ di Vault langsung tercermin.
  const { favoriteCards, clearFavorites } = useFavoriteCards(address);

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
  const [email, setEmail] = useState("");
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

  // Shipment addresses — the Add New Address form (with its geo cascade) lives in
  // its own AddAddressModal component; the page only owns the list + open flag.
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);

  // Save flash / progress / failure
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Change Email — readonly display + explicit modal (mirrors CollectorCrypt).
  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Riwayat saldo in-app (ledger IDRX) — modal "View history".
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ledger, setLedger] = useState<Balance | null>(null);
  const openHistory = useCallback(async () => {
    setHistoryOpen(true);
    if (!token || ledger) return; // reuse the balance already fetched for the tab
    try {
      setLedger(await getBalance(token));
    } catch {
      /* biarkan kosong — modal tampilkan "belum ada" */
    }
  }, [token, ledger]);

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
    setEmail(p.email ?? "");
    setBio(p.bio ?? "");
    setTwitter(p.twitter ?? "");
    setSite(p.website ?? "");
    setPhoneCode(p.phoneCountryCode ?? "");
    setPhone(p.phoneNumber ?? "");
    setNotifyOffers(p.notifyOffers);
    setOfferThreshold(p.notifyOfferThreshold);
    setNotifyMessages(p.notifyMessages);
    setDiscoverable(p.discoverable);
    setBaseline({
      displayName: p.displayName ?? "",
      email: p.email ?? "",
      bio: p.bio ?? "",
      twitter: p.twitter ?? "",
      website: p.website ?? "",
      phoneCountryCode: p.phoneCountryCode ?? "",
      phoneNumber: p.phoneNumber ?? "",
      notifyOffers: p.notifyOffers,
      notifyOfferThreshold: p.notifyOfferThreshold,
      notifyMessages: p.notifyMessages,
      discoverable: p.discoverable,
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

  // In-app IDRX balance (sale proceeds ledger) for the Account Balance tab —
  // the same snapshot the "View history" modal reuses.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getBalance(token)
      .then((b) => {
        if (alive) setLedger(b);
      })
      .catch(() => {
        /* a failed load just leaves the IDRX tile at "…" */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  /** PATCH only the fields that changed vs the seeded baseline — never re-send
   *  "" for a field the user didn't touch. The whole patch is atomic server-side,
   *  so bio/twitter/website/phone may send "" to clear themselves, but displayName
   *  is mandatory (@Length 1,32): an empty rename is caught here, not 400'd. */
  const onSave = useCallback(async () => {
    if (!token || !baseline) return;

    const payload: UpdateProfileInput = {};
    if (username !== baseline.displayName) payload.displayName = username;
    if (email !== baseline.email) payload.email = email; // "" clears it — backend allows
    if (bio !== baseline.bio) payload.bio = bio;
    if (twitter !== baseline.twitter) payload.twitter = twitter;
    if (site !== baseline.website) payload.website = site;
    if (phoneCode !== baseline.phoneCountryCode) payload.phoneCountryCode = phoneCode;
    if (phone !== baseline.phoneNumber) payload.phoneNumber = phone;
    if (notifyOffers !== baseline.notifyOffers) payload.notifyOffers = notifyOffers;
    if (offerThreshold !== baseline.notifyOfferThreshold)
      payload.notifyOfferThreshold = offerThreshold;
    if (notifyMessages !== baseline.notifyMessages) payload.notifyMessages = notifyMessages;
    if (discoverable !== baseline.discoverable) payload.discoverable = discoverable;

    // Client-side guards so a predictable bad value never round-trips a 400.
    if (payload.displayName !== undefined && !payload.displayName.trim()) {
      setSaveError("Display name can't be empty");
      return;
    }
    // A non-empty email must at least look like one ("" is a valid clear).
    if (payload.email && !payload.email.includes("@")) {
      setSaveError("Enter a valid email");
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
  }, [
    token,
    baseline,
    username,
    email,
    bio,
    twitter,
    site,
    phoneCode,
    phone,
    notifyOffers,
    offerThreshold,
    notifyMessages,
    discoverable,
    seedForm,
  ]);

  /** Cancel = discard edits: back to the last server snapshot (blank pre-login). */
  const onCancel = useCallback(() => {
    setSaveError(null);
    if (profile) {
      seedForm(profile);
      return;
    }
    setUsername("");
    setEmail("");
    setBio("");
    setTwitter("");
    setSite("");
    setPhoneCode("");
    setPhone("");
  }, [profile, seedForm]);

  /** Open the Change Email modal, seeded with the current email. */
  const openEmailModal = useCallback(() => {
    setNewEmail(profile?.email ?? "");
    setEmailError(null);
    setEmailOpen(true);
  }, [profile]);

  const closeEmailModal = useCallback(() => {
    setEmailOpen(false);
    setEmailError(null);
  }, []);

  /** Save the new email via updateProfile, then keep local state + baseline in
   *  sync (so the Main Info diff never re-sends it) and close the modal. */
  const submitEmail = useCallback(async () => {
    if (!token) return;
    const next = newEmail.trim();
    if (!next || !next.includes("@")) {
      setEmailError("Enter a valid email");
      return;
    }
    setEmailBusy(true);
    setEmailError(null);
    try {
      const p = await updateProfile({ email: next }, token);
      setProfile(p);
      setEmail(p.email ?? "");
      setBaseline((prev) => (prev ? { ...prev, email: p.email ?? "" } : prev));
      setEmailOpen(false);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : String(e));
    } finally {
      setEmailBusy(false);
    }
  }, [token, newEmail]);

  const closeAddr = useCallback(() => setAddrOpen(false), []);

  /** A newly-created address came back from AddAddressModal: mirror the server's
   *  single-default rule locally, append it, and close the modal. */
  const onAddressCreated = useCallback((created: ShippingAddress) => {
    setAddresses((prev) => {
      const cleaned = created.isDefault ? prev.map((a) => ({ ...a, isDefault: false })) : prev;
      return [...cleaned, created];
    });
    setAddrOpen(false);
  }, []);

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

  // In-app sale balance (IDRX, Rupiah) — token-gated, not on-chain.
  const idrFmt = new Intl.NumberFormat("id-ID");
  const balanceIdrx = () => {
    if (!isAuthed) return "Rp 0"; // signed out — no ledger to read
    if (!ledger) return "…"; // fetch in flight
    return `Rp ${idrFmt.format(ledger.balanceIdrx)}`;
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
            favorites={favoriteCards}
            onClearFavorites={clearFavorites}
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
                  {/* Readonly display + explicit "Change" (mirrors CollectorCrypt):
                      the address is never edited inline — it goes through the modal
                      so a typo can't be saved by the whole-form Save. */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1 truncate rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 text-[14px] text-zinc-500">
                      {email || "No email set"}
                    </div>
                    <GhostButton
                      type="button"
                      onClick={openEmailModal}
                      disabled={!isAuthed}
                      className="shrink-0 px-4 py-2.5 text-[13px]"
                    >
                      Change
                    </GhostButton>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Toggle
                      checked={discoverable}
                      onChange={setDiscoverable}
                      label="Discoverable"
                    />
                    <InfoHint text="Making your email discoverable lets other users find your account by email." />
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
              <GhostButton
                type="button"
                onClick={openHistory}
                className="px-3.5 py-1.5 text-[13px]"
              >
                View history
              </GhostButton>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <BalanceTile dot="#9945FF" label="Solana" amount={balanceFor("sol")} unit="SOL" />
              <BalanceTile dot="#2775CA" label="USDC" amount={balanceFor("usdc")} unit="USDC" />
              <BalanceTile dot="#F2C101" label="IDRX" amount={balanceIdrx()} unit="Saldo" gold />
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

      {/* Riwayat saldo (ledger IDRX in-app): top-up, hasil jual, penarikan. */}
      <ModalShell
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Riwayat saldo"
        maxWidth={480}
      >
        <BalanceHistory ledger={ledger} />
      </ModalShell>

      {/* Add New Address — its own component so the geo cascade (country → state →
          city) + phone dial-code picker keep their state self-contained. Mounted
          only while open so every open starts from a clean form. */}
      {addrOpen && token && (
        <AddAddressModal token={token} onClose={closeAddr} onCreated={onAddressCreated} />
      )}

      {/* Change Email */}
      <ModalShell open={emailOpen} onClose={closeEmailModal} title="Change Email" maxWidth={440}>
        <div className="space-y-4">
          <ModalField label="New Email">
            <TextInput
              type="email"
              value={newEmail}
              maxLength={254}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@email.com"
            />
          </ModalField>

          {emailError && (
            <p className="text-[12px] text-red-400" role="alert">
              {emailError}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <GhostButton type="button" onClick={closeEmailModal}>
              Cancel
            </GhostButton>
            <PrimaryButton type="button" onClick={submitEmail} disabled={emailBusy}>
              {emailBusy ? "Saving…" : "Change"}
            </PrimaryButton>
          </div>
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

/** The "Add New Address" modal. Self-contained: it owns the form + the geo
 *  cascade (country → state → city, each level fetched from lib/geo → our CSC
 *  proxy) and the phone dial-code picker. Every geo call is wrapped so a 503
 *  (CSC_API_KEY unset) degrades that level to a plain free-text input — the form
 *  is never left unusable. Mounted only while open, so state is fresh each time. */
function AddAddressModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (a: ShippingAddress) => void;
}) {
  const [form, setForm] = useState({ ...emptyForm });
  const setField = <K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noZip, setNoZip] = useState(false);

  // Geo cascade. `null` = not loaded yet; a *Fail flag = that fetch 503'd/errored
  // → free-text fallback for that level. The iso2 of the picked country/state is
  // kept alongside the stored NAME because the next level's fetch is keyed by it.
  const [countries, setCountries] = useState<GeoCountry[] | null>(null);
  const [geoFail, setGeoFail] = useState(false);
  const [countryIso, setCountryIso] = useState("");
  const [states, setStates] = useState<GeoState[] | null>(null);
  const [statesFail, setStatesFail] = useState(false);
  const [stateIso, setStateIso] = useState("");
  const [cities, setCities] = useState<{ name: string }[] | null>(null);
  const [citiesFail, setCitiesFail] = useState(false);

  // Countries — fetched once (getCountries memoises the promise module-wide).
  useEffect(() => {
    let alive = true;
    getCountries()
      .then((cs) => alive && setCountries(cs))
      .catch(() => alive && setGeoFail(true));
    return () => {
      alive = false;
    };
  }, []);

  // States — fetched whenever the chosen country changes. The downstream reset
  // (clearing the previous country's states to the loading state) happens in the
  // pick handler, so this effect only ever setStates from an async callback.
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

  // Cities — fetched whenever the chosen state changes (reset also in the handler).
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

  const countryItems = useMemo<ComboItem[]>(
    () =>
      (countries ?? []).map((c) => ({
        value: c.name,
        label: `${c.emoji} ${c.name}`,
        keywords: c.name,
      })),
    [countries],
  );
  const stateItems = useMemo<ComboItem[]>(
    () => (states ?? []).map((s) => ({ value: s.name, label: s.name })),
    [states],
  );
  const cityItems = useMemo<ComboItem[]>(
    () => (cities ?? []).map((c) => ({ value: c.name, label: c.name })),
    [cities],
  );

  // Picking a country/state stores the NAME (backend field) and resolves the iso2
  // for the next level, then resets everything downstream so no stale value (or
  // stale list) from the previous country/state lingers. Resetting the child
  // lists to `null` here (not in the fetch effect) puts the next level straight
  // into its loading state without a synchronous setState inside an effect.
  const pickCountry = (it: ComboItem) => {
    setField("country", it.value);
    setCountryIso((countries ?? []).find((c) => c.name === it.value)?.iso2 ?? "");
    setStates(null);
    setStatesFail(false);
    setField("state", "");
    setStateIso("");
    setCities(null);
    setCitiesFail(false);
    setField("city", "");
  };
  const pickState = (it: ComboItem) => {
    setField("state", it.value);
    setStateIso((states ?? []).find((s) => s.name === it.value)?.iso2 ?? "");
    setCities(null);
    setCitiesFail(false);
    setField("city", "");
  };

  // Per-level field modes. A level shows a combobox only when geo is up and there
  // is something to pick; otherwise it degrades to a free-text input.
  const stateAsText =
    geoFail || !countryIso || statesFail || (states !== null && states.length === 0);
  const stateLoading = !geoFail && !!countryIso && !statesFail && states === null;
  const cityAsText =
    geoFail || !stateIso || citiesFail || (cities !== null && cities.length === 0);
  const cityLoading = !geoFail && !!stateIso && !citiesFail && cities === null;

  const toggleNoZip = (v: boolean) => {
    setNoZip(v);
    if (v) setField("zip", "");
  };

  const submit = useCallback(async () => {
    // Plain-English required-field guard, so one missing field doesn't surface a
    // raw multi-field class-validator error from the (atomic) CreateAddressDto.
    const missing: string[] = [];
    if (!form.fullName.trim()) missing.push("full name");
    if (!form.country.trim()) missing.push("country");
    if (!form.street.trim()) missing.push("street address");
    if (!form.city.trim()) missing.push("city");
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
          country: form.country,
          street: form.street,
          apt: form.apt || undefined, // optional — omit rather than send ""
          state: form.state || undefined,
          city: form.city,
          phoneCountryCode: form.phoneCode || undefined,
          phoneNumber: form.phone || undefined,
          // CreateAddressDto requires a non-empty zip; "-" is the placeholder for
          // "no ZIP code" so the required check server-side still passes.
          zip: noZip ? "-" : form.zip,
          isDefault: form.isDefault,
        },
        token,
      );
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [form, noZip, token, onCreated]);

  return (
    <ModalShell open onClose={onClose} title="Add New Address" maxWidth={560}>
      <div className="space-y-4">
        {geoFail && (
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
          {geoFail || (countries !== null && countries.length === 0) ? (
            <TextInput
              value={form.country}
              maxLength={56}
              onChange={(e) => setField("country", e.target.value)}
              placeholder="Country / region"
              aria-label="Country or region"
            />
          ) : (
            <SearchCombobox
              value={form.country}
              onSelect={pickCountry}
              items={countryItems}
              loading={countries === null}
              placeholder="Select country"
              searchPlaceholder="Search country…"
              ariaLabel="Country or region"
            />
          )}
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
            {stateAsText ? (
              <TextInput
                value={form.state}
                maxLength={80}
                onChange={(e) => setField("state", e.target.value)}
                placeholder={geoFail || !countryIso ? "State / province" : "Type your state/province"}
                aria-label="State or province"
              />
            ) : (
              <SearchCombobox
                value={form.state}
                onSelect={pickState}
                items={stateItems}
                loading={stateLoading}
                placeholder="Select state/province"
                searchPlaceholder="Search state…"
                ariaLabel="State or province"
              />
            )}
          </ModalField>

          <ModalField label="City/Department">
            {cityAsText ? (
              <TextInput
                value={form.city}
                maxLength={80}
                onChange={(e) => setField("city", e.target.value)}
                placeholder="City"
                aria-label="City"
              />
            ) : (
              <SearchCombobox
                value={form.city}
                onSelect={(it) => setField("city", it.value)}
                items={cityItems}
                loading={cityLoading}
                allowCustom
                placeholder="Select city"
                searchPlaceholder="Search or type city…"
                ariaLabel="City"
              />
            )}
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

/** Phone: a searchable dial-code picker (built from the geo country list, showing
 *  `emoji name (+code)`) + the number input. Self-contained — it fetches the
 *  memoised country list itself, so both call sites (Main Info + the address
 *  modal) just pass code/number. If the geo backend is down it falls back to the
 *  curated {@link PHONE_CODES} select so a code can still be chosen. */
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

function ModalField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

/** Tiny "i" badge with a native hover tooltip — a restrained hint next to a
 *  control that needs one line of explanation. */
function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className="grid h-[18px] w-[18px] shrink-0 cursor-help place-items-center rounded-full border border-white/20 text-[11px] font-semibold leading-none text-zinc-400"
    >
      i
    </span>
  );
}

/** Riwayat mutasi saldo in-app (IDRX): top-up (+), hasil jual (+), penarikan (−), refund (+). */
function BalanceHistory({ ledger }: { ledger: Balance | null }) {
  const idr = new Intl.NumberFormat("id-ID");
  const reasonLabel = (r: string): string => {
    if (r === "TOPUP") return "Isi saldo";
    if (r === "WITHDRAWAL") return "Penarikan";
    if (r === "WITHDRAW_REFUND") return "Refund penarikan";
    if (r.includes("SALE")) return "Hasil penjualan";
    return r;
  };

  if (!ledger) {
    return <p className="py-6 text-center text-[13px] text-zinc-500">Memuat…</p>;
  }
  return (
    <div>
      <div className="mb-3 rounded-xl border border-yellow-400/25 bg-yellow-400/[0.06] px-4 py-2.5 text-center">
        <span className="text-[11px] uppercase tracking-wide text-yellow-200/70">
          Saldo saat ini
        </span>
        <p className="text-[16px] font-bold text-yellow-200">
          Rp {idr.format(ledger.balanceIdrx)}
        </p>
      </div>
      {ledger.entries.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-zinc-500">Belum ada mutasi saldo.</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col gap-1.5 overflow-auto">
          {ledger.entries.map((e) => {
            const positive = e.deltaIdrx >= 0;
            return (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-zinc-200">
                    {reasonLabel(e.reason)}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {new Date(e.createdAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[13px] font-semibold ${
                    positive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {positive ? "+" : "−"}Rp {idr.format(Math.abs(e.deltaIdrx))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function BalanceTile({
  dot,
  label,
  amount,
  unit,
  gold = false,
}: {
  dot: string;
  label: string;
  amount: string;
  unit: string;
  /** Gold accent — used by the IDRX (in-app sale) tile so it reads as "income",
   *  matching the gold IDRX row in the account menu. */
  gold?: boolean;
}) {
  return (
    <div
      className={`flex-1 rounded-xl border p-4 ${
        gold ? "border-yellow-400/25 bg-yellow-400/[0.06]" : "border-white/[0.07] bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide text-zinc-500">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div
        className={`mt-2 text-[20px] font-semibold tabular-nums ${
          gold ? "text-yellow-200" : "text-zinc-100"
        }`}
      >
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
