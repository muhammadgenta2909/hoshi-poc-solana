"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { type LiveCard, type Pack } from "@/lib/packs";
import type { OpenResult } from "@/lib/openPack";
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
  const [result, setResult] = useState<OpenResult | null>(null);
  // A real treasury pull takes ~15-30s; `opening` drives the showcase overlay.
  const [opening, setOpening] = useState(false);
  // Action feedback (prompts / backend errors) surfaced under the showcase.
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  // Live "Card Won" ticker feed — REAL recent winners only. Starts empty (the
  // ticker shows a subtle "loading" line, not fabricated wins): seeding it with
  // the mock LIVE_CARDS would show made-up cards with fake IDRX prices under the
  // "Live Card Won" banner. Real winners land within a second or two.
  const [liveCards, setLiveCards] = useState<LiveCard[]>([]);

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
    setOpening(true);
    const doPull = (t: string) => purchaseGachaPack(selectedMachine.code, t);
    try {
      // Needs a JWT: use the stored token, or trigger wallet login (nonce -> sign).
      let t = token ?? (await login());
      let pull: Awaited<ReturnType<typeof purchaseGachaPack>> | null = null;
      try {
        pull = await doPull(t);
      } catch (e) {
        // Stale token -> log in again once and retry.
        if (e instanceof ApiError && e.status === 401) {
          t = await login();
          pull = await doPull(t);
        } else throw e;
      }
      if (pull) {
        if (pull.status !== "OPENED") {
          setOpenMsg(pull.error ?? "Gagal membuka pack.");
        } else {
          // Real card — map into OpenResult and play the mp4 -> reveal.
          setResult(pullToOpenResult(pull, selectedMachine.code));
        }
      }
    } catch (e) {
      // Non-admin callers get 403 from the treasury endpoint.
      if (e instanceof ApiError && e.status === 403) {
        setOpenMsg("Butuh akses admin (devnet).");
      } else {
        setOpenMsg(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setOpening(false);
    }
  }, [selectedMachine, opening, publicKey, setVisible, token, user, login]);

  // "Open Another": close the reveal and immediately start a fresh pull on the same
  // machine, so the ~30s opening state is visible on the showcase (not frozen in the
  // modal). A now-empty machine surfaces its error under the showcase — honestly.
  const handleOpenAnother = useCallback(() => {
    setResult(null);
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
              <div className="relative">
                <PackShowcase pack={selected} onRip={handleRip} />
                {opening && (
                  <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-black/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3 px-4 text-center">
                      <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
                      <p className="text-sm font-semibold text-zinc-50">
                        Opening pack… (treasury paying, ~30s)
                      </p>
                      <p className="text-xs text-zinc-400">
                        Kartu dikirim ke wallet admin. Jangan tutup halaman.
                      </p>
                    </div>
                  </div>
                )}
              </div>

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

      {result && selected && (
        <RipReveal
          pack={selected}
          result={result}
          onClose={() => setResult(null)}
          onRipAgain={handleOpenAnother}
        />
      )}
    </div>
  );
}
