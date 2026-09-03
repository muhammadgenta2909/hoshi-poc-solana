"use client";

// Settings page — the user's own account preferences. Main Info is wired to
// the backend: profile fields (incl. email + notification prefs) read/write
// /users/me and shipment addresses persist via /users/me/addresses; Account
// Balance reads live SOL/USDC over the wallet's RPC connection. Discoverable
// and blocked users remain local-only POC UI.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useTabParam } from "@/lib/useTabParam";
import { useFavoriteCards } from "@/lib/favorites";
import {
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
import { DEVNET_USDC_MINT, fetchSolBalance, fetchSplBalance, formatSol, formatUsdc } from "@/lib/tokens";
import RenameModal from "@/components/account/RenameModal";
import AddAddressModal, { PhoneField, ModalField } from "@/components/account/AddAddressModal";
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

      {/* Add New Address — the SHARED component (also used by the Withdraw flow) so
          the geo cascade (country → state → city) + phone dial-code picker keep
          their state self-contained. Its inner form mounts only while open, so
          every open starts from a clean form. */}
      <AddAddressModal
        open={addrOpen}
        onClose={closeAddr}
        onAdded={onAddressCreated}
        token={token}
      />

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
