"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { type LiveCard, type Pack } from "@/lib/packs";
import type { OpenResult } from "@/lib/openPack";
import { ALL_PACK_VIDEOS } from "@/lib/packVideo";
import { PAGE_BG } from "@/lib/theme";
import {
  ApiError,
  getGachaMachines,
  getGachaWinners,
  getMyPacks,
  openPackByMemo,
  purchaseGachaPack,
  PAYMENTS_ENABLED,
} from "@/lib/api";
import {
  isMachineAvailable,
  machineToPack,
  pullToOpenResult,
  winnersToLiveCards,
  type GachaMachine,
  type GachaPull,
} from "@/lib/gacha";
import { Img, GOLD_GRADIENT } from "@/components/packs/ui";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import SelectPackPanel from "@/components/packs/SelectPackPanel";
import PackShowcase from "@/components/packs/PackShowcase";
import PackDetailsPanel from "@/components/packs/PackDetailsPanel";
import RipReveal from "@/components/packs/RipReveal";
import { PayModal } from "@/components/packs/PayWithRupiah";
import TermsGate from "@/components/packs/TermsGate";
import CollectorCryptBadge from "@/components/packs/CollectorCryptBadge";
import { hasAcceptedCcTerms, acceptCcTerms } from "@/lib/ccTerms";

export default function OpenPacksPage() {
  const { token, login, user, activeAddress } = useAuth();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletConnect();

  const [machines, setMachines] = useState<GachaMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState("");
  // One pull = one session. The takeover (video) mounts the moment the session
  // starts, so the ~15-30s treasury purchase runs BEHIND the rip video instead
  // of behind a spinner; RipReveal holds on the white card if the purchase
  // outlives the video. `result`/`error` settle the session.
  const [rip, setRip] = useState<{ result: OpenResult | null; error: string | null } | null>(
    null,
  );
  // Remount key for the takeover: "Open Another" ends one session and starts the
  // next inside a single React batch, so without a changing key RipReveal would
  // never unmount and the video wouldn't replay.
  const [ripSeq, setRipSeq] = useState(0);
  const opening = rip !== null && rip.result === null && rip.error === null;
  // Action feedback (prompts / quick sync refusals) surfaced under the showcase.
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  // Rupiah pay modal + terms gate. Declared up here (not next to the render) so the
  // pull/reveal callbacks below can drive them — open the modal on "Rip Again", and
  // close it when the paid reveal takes over.
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  // Sealed (paid-but-unopened) packs the user owns — the "pack inventory". A rupiah
  // purchase lands here at SUBMITTED (bought, not yet opened); the user opens each one
  // manually below, and only THEN is the card drawn (real suspense, not theatre).
  const [unopened, setUnopened] = useState<GachaPull[]>([]);
  const [openingMemo, setOpeningMemo] = useState<string | null>(null);

  const loadUnopened = useCallback(async () => {
    if (!token) return; // not signed in → nothing to load (no synchronous setState here)
    try {
      const packs = await getMyPacks(token);
      setUnopened(packs.filter((p) => p.status === "SUBMITTED"));
    } catch {
      /* best-effort — the inventory section just keeps its current contents */
    }
  }, [token]);

  // Load the sealed-pack inventory on sign-in. Uses the .then() form (setState runs in
  // the async callback, not synchronously in the effect body) to match the machines/
  // winners effects below; the handlers reuse loadUnopened() for post-action refreshes.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getMyPacks(token)
      .then((packs) => {
        if (alive) setUnopened(packs.filter((p) => p.status === "SUBMITTED"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  // Live "Card Won" ticker feed — REAL recent winners only. Starts empty (the
  // ticker shows a subtle "loading" line, not fabricated wins): seeding it with
  // the mock LIVE_CARDS would show made-up cards with fake IDRX prices under the
  // "Live Card Won" banner. Real winners land within a second or two.
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);

  // Warm the rip videos into the HTTP cache so the takeover starts instantly on
  // the first pull (each is ~5MB; streaming cold delays the first frame). Both
  // rarity clips are prefetched since the pull's rarity isn't known yet.
  useEffect(() => {
    for (const src of ALL_PACK_VIDEOS) {
      void fetch(src, { cache: "force-cache" }).catch(() => {});
    }
  }, []);

  // Fetch the real CC machines once on mount, then default-select the first
  // AVAILABLE one (pokemon_250 on devnet). Public endpoint — no auth needed.
  useEffect(() => {
    let alive = true;
    // `loading` starts true; the effect runs once on mount, so no synchronous
    // setState here (only the async resolve/reject callbacks touch state).
    getGachaMachines()
      .then((ms) => {
        if (!alive) return;
        setMachines(ms);
        setLoadError(null);
        const firstAvailable = ms.find(isMachineAvailable) ?? ms[0];
        if (firstAvailable) setSelectedId(firstAvailable.code);
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Feed the ticker with REAL recent winners: load on mount, then refresh every
  // ~25s. On any failure OR an empty response, keep the current cards so a loaded
  // marquee is never blanked mid-session (it just isn't replaced by nothing).
  useEffect(() => {
    let alive = true;
    const loadWinners = () => {
      getGachaWinners()
        .then((ws) => {
          if (!alive || ws.length === 0) return;
          setLiveCards(winnersToLiveCards(ws));
        })
        .catch(() => {
          /* keep previous cards — never empty the ticker on a fetch error */
        });
    };
    loadWinners();
    const id = setInterval(loadWinners, 25_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Map machines -> the existing Pack shape the panels already consume. Unavailable
  // machines get a name suffix so the Select Pack grid flags them (the panels can't
  // be given a new "disabled" prop without breaking their other callers).
  const packs = useMemo<Pack[]>(
    () =>
      machines.map((m) => {
        const pack = machineToPack(m);
        return isMachineAvailable(m) ? pack : { ...pack, name: `${pack.name} · tidak tersedia` };
      }),
    [machines],
  );

  const selected = useMemo(() => packs.find((p) => p.id === selectedId), [packs, selectedId]);
  const selectedMachine = useMemo(
    () => machines.find((m) => m.code === selectedId),
    [machines, selectedId],
  );
  const selectedAvailable = !!selectedMachine && isMachineAvailable(selectedMachine);

  // Proactive gate hint (shown before the user clicks) so the flow is honest about
  // needing to sign in. Open to ANY signed-in user (Phantom or Google) — no admin
  // gate; the treasury funds the demo pull on devnet.
  const gateHint = useMemo(() => {
    if (!selectedAvailable) return null;
    if (!activeAddress) return "Connect wallet atau login Google untuk membuka pack.";
    return null;
  }, [selectedAvailable, activeAddress]);

  // Block switching machines mid-pull; clear stale feedback on a fresh selection.
  const onSelect = useCallback(
    (id: string) => {
      if (opening) return;
      setSelectedId(id);
      setOpenMsg(null);
    },
    [opening],
  );

  // The real pull. Mirrors the marketplace buy flow: connect gate -> token-or-login
  // -> 401 retry-once. The recipient wallet is derived server-side from the JWT, so
  // the client only sends the machine code (never an address).
  const handleRip = useCallback(async () => {
    if (!selectedMachine || opening) return;

    // Never spend on an empty/off machine.
    if (!isMachineAvailable(selectedMachine)) {
      setOpenMsg("Mesin ini sedang tidak tersedia (devnet).");
      return;
    }

    // Nobody signed in (no Phantom key AND no Google/JWT wallet) -> open the
    // connect modal; the user clicks Rip again after. Open to ANY user.
    if (!activeAddress) {
      setVisible(true);
      setOpenMsg("Connect wallet atau login Google untuk membuka — lalu klik Rip Pack lagi.");
      return;
    }

    setOpenMsg(null);

    // Resolve a USABLE jwt BEFORE the takeover mounts. login() pops a wallet
    // signature request (Phantom); behind a playing full-screen video that's
    // confusing, so any signing happens up front.
    //   - Google/Privy user: the JWT is already minted by <PrivyBridge> -> use it.
    //   - Phantom, not yet signed (no token): login() to sign in.
    //   - Phantom account switched under an old JWT: re-login as the connected key.
    const connected = publicKey?.toBase58() ?? null;
    let t: string;
    try {
      const jwtMatchesConnected =
        !connected || !user?.walletAddress || user.walletAddress === connected;
      if (token && jwtMatchesConnected) {
        t = token; // reuse the existing session (Google, or same-wallet Phantom)
      } else {
        t = await login(); // no token yet, or JWT belongs to a different wallet
      }
    } catch (e) {
      setOpenMsg(e instanceof Error ? e.message : String(e));
      return;
    }

    // Session starts -> RipReveal mounts and the video plays while the treasury
    // purchase runs. The outcome lands into the same session object.
    setRipSeq((s) => s + 1);
    setRip({ result: null, error: null });
    const doPull = (tok: string) => purchaseGachaPack(selectedMachine.code, tok);
    try {
      let pull: Awaited<ReturnType<typeof purchaseGachaPack>>;
      try {
        pull = await doPull(t);
      } catch (e) {
        // A stale token slipped through (e.g. it expired between the pre-flight
        // check and now). Re-login WITHOUT the takeover covering the signature
        // prompt: tear it down, sign, then remount and retry so the video isn't
        // hiding the wallet popup.
        if (e instanceof ApiError && e.status === 401) {
          setRip(null);
          t = await login();
          setRipSeq((s) => s + 1);
          setRip({ result: null, error: null });
          pull = await doPull(t);
        } else throw e;
      }
      if (pull.status !== "OPENED") {
        setRip({ result: null, error: pull.error ?? "Gagal membuka pack." });
      } else {
        // Old backend rows may lack nftImage — try the winners feed (same NFT,
        // image resolved server-side) before falling back to the card back.
        let image = pull.nftImage ?? null;
        if (!image && pull.nftAddress) {
          try {
            const ws = await getGachaWinners();
            image = ws.find((w) => w.nftAddress === pull.nftAddress)?.image ?? null;
          } catch {
            /* fallback stays null -> card-back placeholder */
          }
        }
        setRip({
          // Recipient = the JWT's wallet (what the backend actually mints to),
          // NOT the connected publicKey — the pre-flight guard keeps them equal,
          // but the JWT is the source of truth for where the card went.
          result: pullToOpenResult(pull, selectedMachine.code, {
            image,
            recipient: user?.walletAddress ?? connected,
          }),
          error: null,
        });
      }
    } catch (e) {
      // 403 shouldn't happen anymore (any signed-in user may pull), but keep a
      // clear message if the backend still refuses.
      const msg =
        e instanceof ApiError && e.status === 403
          ? "Pull ditolak server (butuh akses)."
          : e instanceof Error
            ? e.message
            : String(e);
      setRip({ result: null, error: msg });
    }
  }, [selectedMachine, opening, publicKey, activeAddress, setVisible, token, user, login]);

  // "Open Another": end the session and immediately start a fresh pull on the
  // same machine — the takeover remounts and the video plays again while the new
  // purchase runs. Quick sync refusals (machine now empty, etc.) land under the
  // showcase since the takeover is gone by then.
  const handleOpenAnother = useCallback(() => {
    setRip(null);
    // On mainnet the direct treasury pull is fenced (demo-only), so "Rip Again"
    // must start a fresh PAID order via the pay modal — not call the disabled pull.
    if (PAYMENTS_ENABLED && selectedMachine) {
      setPayModalOpen(true);
      return;
    }
    void handleRip();
  }, [handleRip, selectedMachine]);

  // Rupiah path (IDRX): once IDRX confirms the payment, the backend settles from the
  // treasury and leaves the pack SEALED (SUBMITTED) — bought but NOT opened. So we do
  // NOT reveal here; the pack lands in the "Pack Belum Dibuka" inventory below, and the
  // user opens it themselves (handleOpenSealedPack) whenever they want. Buy now, open
  // later — like a real booster pack.
  const handlePaidOrder = useCallback(
    () => {
      setPayModalOpen(false);
      setOpenMsg(
        'Pembayaran berhasil! Pack-mu masuk ke inventory di bawah — pencet "Buka Pack" kapan pun kamu siap.',
      );
      void loadUnopened();
      getGachaWinners()
        .then((ws) => {
          if (ws.length > 0) setLiveCards(winnersToLiveCards(ws));
        })
        .catch(() => {});
    },
    [loadUnopened],
  );

  // Open ONE sealed pack the user owns. This is where the card is actually drawn (CC
  // VRF runs on open), so the RipReveal video carries the suspense and the outcome is
  // genuine — not decided at purchase. On success the pack leaves the inventory.
  const handleOpenSealedPack = useCallback(
    async (memo: string) => {
      if (!token || openingMemo) return;
      setOpeningMemo(memo);
      // Mount the takeover so the video plays while CC runs the VRF reveal.
      setRipSeq((s) => s + 1);
      setRip({ result: null, error: null });
      try {
        const pull = await openPackByMemo(memo, token);
        if (pull.status !== "OPENED") {
          throw new Error(pull.error ?? "Gagal membuka pack. Coba lagi sebentar.");
        }
        // Resolve the card art: pull's own image → winners-feed lookup by nftAddress →
        // card-back placeholder (same order as the direct flow).
        let image = pull.nftImage ?? null;
        if (!image && pull.nftAddress) {
          try {
            const ws = await getGachaWinners();
            image = ws.find((w) => w.nftAddress === pull.nftAddress)?.image ?? null;
          } catch {
            /* fallback stays null -> card-back */
          }
        }
        setRip({
          result: pullToOpenResult(pull, pull.packType, {
            image,
            recipient: user?.walletAddress ?? publicKey?.toBase58() ?? null,
          }),
          error: null,
        });
      } catch (e) {
        setRip({
          result: null,
          error: e instanceof Error ? e.message : "Gagal membuka pack.",
        });
      } finally {
        setOpeningMemo(null);
        void loadUnopened(); // the just-opened pack drops out of SUBMITTED
      }
    },
    [token, openingMemo, user, publicKey, loadUnopened],
  );

  // The actual open. With rupiah payments live, "Rip Pack" goes STRAIGHT to real
  // QRIS payment — the free "buka langsung (demo)" option is gone now that this is
  // real money. The handleRip fallback only runs when payments are off (devnet).
  const proceedRip = useCallback(() => {
    if (PAYMENTS_ENABLED && selectedAvailable) setPayModalOpen(true);
    else void handleRip();
  }, [selectedAvailable, handleRip]);

  // "Rip Pack" click. The Collaboration Agreement requires the user to accept CC's
  // disclaimer BEFORE interacting with the Gacha Product, so the terms gate comes
  // first — once, then remembered. Checked on click (not render) to avoid a
  // localStorage hydration mismatch.
  const handleRipClick = useCallback(() => {
    if (opening) return;
    if (!hasAcceptedCcTerms()) {
      setTermsOpen(true);
      return;
    }
    proceedRip();
  }, [opening, proceedRip]);

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{
        background: PAGE_BG,
        fontFamily: "var(--font-outfit), system-ui, sans-serif",
      }}
    >
      <TopNav active="Games" />
      <LiveTicker cards={liveCards} />

      {/* Full-bleed grid: the side panels (bg #181507) run flush to the left and
          right viewport edges, per the Figma; only the center column is padded. */}
      <main className="grid w-full items-start gap-4 py-5 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <SelectPackPanel packs={packs} selectedId={selectedId} onSelect={onSelect} />

        {/* Center column pinned below the nav: picking a pack far down the Select
            Pack list no longer scrolls the preview + Rip button out of view. */}
        <div className="px-4 sm:px-6 lg:sticky lg:top-[72px] lg:self-start">
          {selected ? (
            <>
              {/* No spinner overlay anymore: the RipReveal takeover mounts the
                  moment the pull starts and the video carries the wait. */}
              <PackShowcase pack={selected} onRip={handleRipClick} />

              {!selectedAvailable && (
                <p className="mt-3 text-center text-sm font-medium text-amber-300/90">
                  Mesin ini sedang tidak tersedia (devnet).
                </p>
              )}

              {opening ? null : openMsg ? (
                <p className="mt-3 text-center text-sm text-zinc-300">{openMsg}</p>
              ) : gateHint ? (
                <p className="mt-3 text-center text-xs text-zinc-500">{gateHint}</p>
              ) : null}
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 text-center">
              {loadError && !loading ? (
                <>
                  <p className="text-sm font-medium text-amber-300">Gagal memuat mesin.</p>
                  <p className="text-xs text-zinc-500">{loadError}</p>
                </>
              ) : (
                <>
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-yellow-400" />
                  <p className="text-sm text-zinc-400">Memuat mesin…</p>
                </>
              )}
            </div>
          )}
        </div>

        {selected ? (
          <PackDetailsPanel pack={selected} />
        ) : (
          <div className="min-h-[200px]" aria-hidden />
        )}
      </main>

      {/* Pack inventory: sealed (paid-but-unopened) packs. Bought via rupiah, opened
          here manually — the card is drawn only when the user clicks Buka Pack. */}
      {unopened.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 pb-2 pt-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Pack Belum Dibuka ({unopened.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {unopened.map((p) => (
              <div
                key={p.memo}
                className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <Img
                  src="/card-back.svg"
                  alt="Pack tersegel"
                  className="h-28 w-auto rounded-lg"
                />
                <span className="text-xs text-zinc-400">{p.packType}</span>
                <button
                  type="button"
                  onClick={() => void handleOpenSealedPack(p.memo)}
                  disabled={openingMemo === p.memo}
                  className="w-full rounded-xl px-3 py-2 text-sm font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                  style={{ backgroundImage: GOLD_GRADIENT }}
                >
                  {openingMemo === p.memo ? "Membuka…" : "Buka Pack"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Schedule 1 branding — moved to the page foot so it never overlaps the pack. */}
      <footer className="flex justify-center px-4 pb-8 pt-4">
        <CollectorCryptBadge />
      </footer>

      {rip && (
        <RipReveal
          key={ripSeq}
          result={rip.result}
          error={rip.error}
          onClose={() => setRip(null)}
          onRipAgain={handleOpenAnother}
        />
      )}

      {/* IDRX rupiah pay modal — mounting it creates the order (see PayModal). */}
      {payModalOpen && selectedMachine && (
        <PayModal
          packType={selectedMachine.code}
          onFulfilled={() => handlePaidOrder()}
          onClose={() => setPayModalOpen(false)}
        />
      )}

      {/* Contract-required consent gate — shown once before the first pack open. */}
      {termsOpen && (
        <TermsGate
          onClose={() => setTermsOpen(false)}
          onAccept={() => {
            acceptCcTerms();
            setTermsOpen(false);
            proceedRip();
          }}
        />
      )}
    </div>
  );
}
