"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { type LiveCard, type Pack } from "@/lib/packs";
import type { OpenResult } from "@/lib/openPack";
import { ALL_PACK_VIDEOS } from "@/lib/packVideo";
import { PAGE_BG } from "@/lib/theme";
import { ApiError, getGachaMachines, getGachaWinners, purchaseGachaPack } from "@/lib/api";
import {
  isMachineAvailable,
  machineToPack,
  pullToOpenResult,
  winnersToLiveCards,
  type GachaMachine,
} from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import TopNav from "@/components/packs/TopNav";
import LiveTicker from "@/components/packs/LiveTicker";
import SelectPackPanel from "@/components/packs/SelectPackPanel";
import PackShowcase from "@/components/packs/PackShowcase";
import PackDetailsPanel from "@/components/packs/PackDetailsPanel";
import RipReveal from "@/components/packs/RipReveal";

// CC machine prices are whole USD (devnet). The locked pack panels render numbers
// with an IDRX glyph, so the authoritative USD price is shown here in the center
// column instead. e.g. 250 -> "$250", 1000 -> "$1,000".
const usdFmt = new Intl.NumberFormat("en-US");
const formatUsd = (dollars: number) => `$${usdFmt.format(dollars)}`;

export default function OpenPacksPage() {
  const { token, login, user } = useAuth();
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
  // needing a wallet/login/admin — the locked Rip button label can't say this.
  const gateHint = useMemo(() => {
    if (!selectedAvailable) return null;
    if (!publicKey || !token) return "Connect wallet & login untuk membuka pack.";
    if (user?.role === "USER") return "Butuh akses admin (devnet).";
    return null;
  }, [selectedAvailable, publicKey, token, user]);

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

    // No wallet yet -> open the select modal; the user clicks Rip again after.
    if (!publicKey) {
      setVisible(true);
      setOpenMsg("Connect wallet & login untuk membuka — lalu klik Rip Pack lagi.");
      return;
    }

    // Known non-admin (role reported by the backend) -> the pull is admin-only, so
    // don't spend. When the role is unknown we still attempt and let a 403 report it.
    if (token && user?.role === "USER") {
      setOpenMsg("Butuh akses admin (devnet).");
      return;
    }

    setOpenMsg(null);

    // Resolve a USABLE jwt BEFORE the takeover mounts. login() pops a wallet
    // signature request; behind a playing full-screen video it's confusing and
    // easy to miss. So every path that needs a signature runs here, up front:
    //   - no token yet -> login()
    //   - stale/expired token -> a probe pull 401s -> login() + reuse the fresh
    //     token for the real pull (all before the video)
    //   - connected wallet != the JWT's wallet (Phantom account switch without
    //     logout) -> re-login as the connected wallet, so the card is actually
    //     minted to the wallet the user sees (and the reveal names it correctly)
    const connected = publicKey.toBase58();
    let t: string;
    try {
      if (!token) {
        t = await login();
      } else if (user?.walletAddress && user.walletAddress !== connected) {
        t = await login(); // JWT belongs to a different wallet than is connected
      } else {
        t = token;
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
      // Non-admin callers get 403 from the treasury endpoint.
      const msg =
        e instanceof ApiError && e.status === 403
          ? "Butuh akses admin (devnet)."
          : e instanceof Error
            ? e.message
            : String(e);
      setRip({ result: null, error: msg });
    }
  }, [selectedMachine, opening, publicKey, setVisible, token, user, login]);

  // "Open Another": end the session and immediately start a fresh pull on the
  // same machine — the takeover remounts and the video plays again while the new
  // purchase runs. Quick sync refusals (machine now empty, etc.) land under the
  // showcase since the takeover is gone by then.
  const handleOpenAnother = useCallback(() => {
    setRip(null);
    void handleRip();
  }, [handleRip]);

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

        <div className="px-4 sm:px-6">
          {selected ? (
            <>
              {/* No spinner overlay anymore: the RipReveal takeover mounts the
                  moment the pull starts and the video carries the wait. */}
              <PackShowcase pack={selected} onRip={handleRip} />

              {/* Authoritative USD price + note (the panels show IDRX-styled numbers). */}
              <div className="mt-3 flex flex-col items-center gap-0.5 text-center">
                <p className="text-2xl font-semibold text-zinc-50">
                  {selectedMachine ? formatUsd(selectedMachine.priceUsdcDollars) : ""}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500">
                  harga USD · devnet
                </p>
              </div>

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

      {rip && (
        <RipReveal
          key={ripSeq}
          result={rip.result}
          error={rip.error}
          onClose={() => setRip(null)}
          onRipAgain={handleOpenAnother}
        />
      )}
    </div>
  );
}
