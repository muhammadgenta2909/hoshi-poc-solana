"use client";

// Hoshi-styled wallet connect modal (replaces the stock wallet-adapter-react-ui
// modal). Flow: pick a wallet → "Waiting for <wallet>" while it connects → a
// brief "connected" confirmation → auto-close. On rejection/failure it drops to
// an error card with retry.
//
// How connection is triggered: `<WalletProvider autoConnect>` is on, so calling
// `select(name)` after a USER click makes the provider call `adapter.connect()`
// itself (see WalletProviderBase's auto-connect effect). We therefore only
// `select()` here and then listen to the adapter's own `connect`/`disconnect`
// events for the outcome — except for NotDetected wallets, which never
// auto-connect, so we send those straight to their install page.
//
// The dialog body is mounted only while open, so its connection state resets
// cleanly on every open and there is no SSR/hydration surface (it never renders
// on the server or the first client paint, when `visible` is false).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWallet, type Wallet } from "@solana/wallet-adapter-react";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { onWalletError, useWalletConnect } from "@/lib/useWalletConnect";
import { useAuth } from "@/lib/useAuth";
import { warmBackend } from "@/lib/api";
import { PRIVY_ENABLED } from "@/app/PrivyProviders";
import PrivyGoogleButton from "./PrivyGoogleButton";
import { GOLD_GRADIENT } from "./ui";

type Phase = "select" | "connecting" | "signing" | "success" | "error";
// Which step failed — so "Try again" retries the right thing (a sign failure
// must NOT reconnect the wallet, and a connect failure must NOT try to sign).
type ErrorStage = "connect" | "sign";

// Watchdog for the "Waiting for <wallet>…" spinner. Phantom's connect() can
// wedge forever (a popup dismissed without answering leaves the request pending
// inside the extension), and the provider's `connecting` flag stays latched
// until a connect/disconnect EVENT clears it — so without this the spinner
// never ends. 15s is enough to unlock + approve; a late approval after the
// timeout is still caught by the error→signing rescue effect below.
const CONNECT_TIMEOUT_MS = 15_000;

const humanizeSignError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|declin|denied|cancel/i.test(message))
    return "You declined the signature request.";
  return message || "We couldn’t verify your wallet. Please try again.";
};

const shortAddr = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`;

// Prefer the most "ready" instance when a wallet appears twice (e.g. the
// injected Phantom standard-wallet plus our explicit adapter fallback).
const readyRank = (state: WalletReadyState): number => {
  switch (state) {
    case WalletReadyState.Installed:
      return 3;
    case WalletReadyState.Loadable:
      return 2;
    case WalletReadyState.NotDetected:
      return 1;
    default:
      return 0;
  }
};

export default function WalletConnectModal() {
  const { visible } = useWalletConnect();
  // Mount the dialog only while open: fresh connection state per open, and no
  // server/first-paint render (so no hydration mismatch, no portal SSR guard).
  return visible ? <WalletConnectDialog /> : null;
}

function WalletConnectDialog() {
  const { close } = useWalletConnect();
  const { wallets, wallet, select, connect, disconnect, connecting, connected, publicKey } =
    useWallet();
  const { login, isAuthed } = useAuth();

  // Wake the backend the moment the dialog opens: sign-to-verify needs two
  // round-trips (nonce + login) and the free-tier host cold-starts, so warming
  // it while the user is still picking/approving hides most of that latency.
  useEffect(() => {
    warmBackend();
  }, []);

  const [phase, setPhase] = useState<Phase>("select");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorStage, setErrorStage] = useState<ErrorStage>("connect");
  // Guards login() to a single call per signing attempt (the effect re-runs as
  // publicKey / login identity settle).
  const signStarted = useRef(false);

  // De-dupe by wallet name, then float Phantom to the top and order the rest by
  // readiness (Installed first, "Install" entries last).
  const list = useMemo(() => {
    const byName = new Map<string, Wallet>();
    for (const w of wallets) {
      const prev = byName.get(w.adapter.name);
      if (!prev || readyRank(w.readyState) > readyRank(prev.readyState)) {
        byName.set(w.adapter.name, w);
      }
    }
    return [...byName.values()].sort((a, b) => {
      if (a.adapter.name === "Phantom") return -1;
      if (b.adapter.name === "Phantom") return 1;
      return readyRank(b.readyState) - readyRank(a.readyState);
    });
  }, [wallets]);

  const pendingWallet = pendingName
    ? list.find((w) => w.adapter.name === pendingName) ?? null
    : null;

  // Outcome is read from the PROVIDER'S connection state, NOT from adapter events.
  // A listener attached to a memo-derived wallet object detaches at the exact tick
  // 'connect' fires (the wallets list re-computes mid-connect), which left the
  // modal stuck on "Waiting…". Reading connected/publicKey can't miss the moment
  // and reflects whichever adapter actually connected.
  const sawConnecting = useRef(false);
  useEffect(() => {
    if (phase === "connecting" && connecting) sawConnecting.current = true;
  }, [phase, connecting]);

  useEffect(() => {
    if (phase !== "connecting") return;
    /* eslint-disable react-hooks/set-state-in-effect -- sync modal phase to the wallet's external connection state */
    if (connected && publicKey) {
      setPhase("signing"); // connected → sign-to-verify (login effect below)
    } else if (sawConnecting.current && !connecting && !connected) {
      // Attempt started then ended with no connection (rejected / dismissed).
      setErrorStage("connect");
      setErrorMsg((m) => m ?? "The connection request was cancelled or failed.");
      setPhase("error");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [phase, connected, publicKey, connecting]);

  // Watchdog: never let "Waiting for <wallet>" spin forever (see
  // CONNECT_TIMEOUT_MS). Total time in the connecting phase is the measure —
  // the timer resets whenever the phase is re-entered (retry, new pick).
  useEffect(() => {
    if (phase !== "connecting") return;
    const t = setTimeout(() => {
      setErrorStage("connect");
      setErrorMsg(
        `${pendingName ?? "The wallet"} isn't responding. Check its extension for a pending request, then try again.`,
      );
      setPhase("error");
    }, CONNECT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, pendingName]);

  // Rescue a late approval: if the watchdog (or a spurious failure) dropped us
  // on the error card but the user then approves the still-open wallet popup,
  // carry on to sign-to-verify instead of leaving them stranded.
  useEffect(() => {
    if (phase !== "error" || errorStage !== "connect") return;
    if (connected && publicKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync modal phase to the wallet's external connection state
      setPhase("signing");
    }
  }, [phase, errorStage, connected, publicKey]);

  // Sign-to-verify: once connected, ask the wallet to sign the login message.
  // login() needs a live publicKey, so we wait for it (the 'connect' event and
  // the context publicKey settle a render apart). Calling login() from an effect
  // is a plain function call — its result routes phase via the async callbacks.
  useEffect(() => {
    if (phase !== "signing" || signStarted.current) return;
    if (!publicKey) return;
    signStarted.current = true;
    login()
      .then(() => setPhase("success"))
      .catch((e) => {
        setErrorStage("sign");
        setErrorMsg(humanizeSignError(e));
        setPhase("error");
      });
  }, [phase, publicKey, login]);

  // Drive the connection ourselves once the selected wallet is idle. We do NOT
  // lean on autoConnect firing: the provider's changeWallet() early-returns when
  // the wallet name is unchanged (returning user, retry, or mobile deep-link
  // round-trip), which would otherwise leave us stuck on "Waiting…" with no
  // connect ever attempted. Calling connect() here is idempotent — the provider
  // guards re-entrancy with isConnectingRef, and our own `connecting` check keeps
  // us from racing the auto-connect path.
  useEffect(() => {
    if (phase !== "connecting" || !pendingName) return;
    if (!wallet || wallet.adapter.name !== pendingName) {
      // Re-assert the selection. A hard-reset retry disconnect()s first and the
      // provider clears walletName on the disconnect event — without this the
      // retry would sit on "Waiting…" with no wallet selected. Safe from loops:
      // select() with an unchanged name is a no-op.
      select(pendingName as WalletName);
      return;
    }
    if (connected || connecting) return;
    connect().catch(() => {
      // Failure surfaces via the onError bus + the adapter's disconnect event.
    });
  }, [phase, pendingName, wallet, connected, connecting, connect, select]);

  // Humanised connect-time failure pushed up from `<WalletProvider onError>`.
  useEffect(() => {
    return onWalletError((message) => {
      setErrorStage("connect");
      setErrorMsg(message);
      setPhase((p) => (p === "connecting" ? "error" : p));
    });
  }, []);

  // Auto-close shortly after a successful connection.
  useEffect(() => {
    if (phase !== "success") return;
    const t = setTimeout(() => close(), 900);
    return () => clearTimeout(t);
  }, [phase, close]);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [close]);

  const startConnect = (w: Wallet) => {
    setErrorMsg(null);
    setPendingName(w.adapter.name);
    signStarted.current = false;
    // Fresh attempt: a stale `true` from a previous failed attempt makes the
    // outcome effect fire "cancelled or failed" INSTANTLY on retry (before the
    // new connect() even starts), bouncing the user straight back to the error
    // card while an orphaned wallet popup opens behind it.
    sawConnecting.current = false;

    // Already connected → skip straight to sign-to-verify (or done, if signed in).
    if (w.adapter.connected && w.adapter.publicKey) {
      setPhase(isAuthed ? "success" : "signing");
      return;
    }
    if (w.readyState === WalletReadyState.NotDetected) {
      // Not installed → auto-connect never fires; send them to the install page.
      if (typeof window !== "undefined") {
        window.open(w.adapter.url, "_blank", "noopener,noreferrer");
      }
      setErrorStage("connect");
      setErrorMsg(`${w.adapter.name} isn’t installed. We opened its download page in a new tab.`);
      setPhase("error");
      return;
    }
    setPhase("connecting");
    select(w.adapter.name); // provider auto-connects (autoConnect + user gesture)
  };

  const retry = () => {
    setErrorMsg(null);
    // A signature failure means the wallet is already connected — retry the
    // sign step only, don't tear down and reconnect.
    if (errorStage === "sign") {
      signStarted.current = false;
      setPhase("signing");
      return;
    }
    // Already connected (e.g. the approval landed right as the watchdog fired):
    // don't tear it down — startConnect routes straight to sign-to-verify.
    if (pendingWallet?.adapter.connected && pendingWallet.adapter.publicKey) {
      startConnect(pendingWallet);
      return;
    }
    // Hard reset before reconnecting: a wedged adapter.connect() latches the
    // provider's `connecting` flag until a disconnect EVENT clears it, so a
    // plain reconnect would early-return forever. disconnect() is a safe no-op
    // when nothing is selected; the drive-connect effect re-selects afterwards.
    disconnect().catch(() => {});
    if (pendingWallet) startConnect(pendingWallet);
    else setPhase("select");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a wallet"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        {/* warm gold glow hugging the top edge */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-44"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, rgba(245,182,52,0.28), rgba(245,182,52,0) 70%)",
          }}
        />

        <div className="relative">
          {phase === "select" && <SelectView list={list} onPick={startConnect} onClose={close} />}
          {phase === "connecting" && (
            <ConnectingView
              wallet={pendingWallet}
              name={pendingName}
              onBack={() => setPhase("select")}
              onClose={close}
            />
          )}
          {phase === "signing" && (
            <SigningView
              wallet={pendingWallet}
              name={pendingName}
              onBack={() => setPhase("select")}
              onClose={close}
            />
          )}
          {phase === "success" && (
            <SuccessView
              wallet={pendingWallet}
              address={publicKey ? shortAddr(publicKey.toBase58()) : null}
            />
          )}
          {phase === "error" && (
            <ErrorView
              message={errorMsg}
              onRetry={retry}
              onBack={() => setPhase("select")}
              onClose={close}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------- sub-views -------------------------------- */

function SelectView({
  list,
  onPick,
  onClose,
}: {
  list: Wallet[];
  onPick: (w: Wallet) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-white">Connect a wallet</h2>
        <CloseButton onClick={onClose} />
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">
        Choose a wallet to connect. You’ll approve the request inside the wallet.
      </p>

      {list.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-[13px] text-zinc-400">
          No wallets detected. Install{" "}
          <a
            href="https://phantom.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-yellow-300 hover:underline"
          >
            Phantom
          </a>{" "}
          to continue.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((w) => {
            const installed =
              w.readyState === WalletReadyState.Installed ||
              w.readyState === WalletReadyState.Loadable;
            return (
              <button
                key={w.adapter.name}
                type="button"
                onClick={() => onPick(w)}
                className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:border-yellow-400/50 hover:bg-white/[0.07]"
              >
                <WalletIcon wallet={w} className="h-9 w-9" />
                <span className="flex-1 text-[15px] font-semibold text-zinc-100">
                  {w.adapter.name}
                </span>
                {installed ? (
                  <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                    Detected
                  </span>
                ) : (
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-zinc-400">
                    Install
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Google login (embedded Solana wallet) — no Phantom needed. Only when
          Privy is configured; the button + its Privy hooks live in a child that
          isn't mounted otherwise. */}
      {PRIVY_ENABLED && (
        <>
          <div className="my-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
            <span className="h-px flex-1 bg-white/10" />
            atau
            <span className="h-px flex-1 bg-white/10" />
          </div>
          <PrivyGoogleButton />
          <p className="mt-2 text-center text-[12px] text-zinc-500">
            Belum punya wallet? Login Google — wallet Solana dibuat otomatis.
          </p>
        </>
      )}

      <ProtectedFooter />
    </>
  );
}

function ConnectingView({
  wallet,
  name,
  onBack,
  onClose,
}: {
  wallet: Wallet | null;
  name: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <BackButton onClick={onBack} />
        <CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-col items-center px-2 pb-4 pt-2 text-center">
        <div className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 rounded-full border-2 border-white/10" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-400 motion-safe:animate-spin" />
          {wallet ? (
            <WalletIcon wallet={wallet} className="h-11 w-11" />
          ) : (
            <div className="h-11 w-11 rounded-xl bg-white/10" />
          )}
        </div>
        <h2 className="mt-5 text-[17px] font-semibold text-white">
          Waiting for {name ?? "wallet"}
        </h2>
        <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-zinc-400">
          Approve the connection request in {name ?? "your wallet"} to continue.
        </p>
      </div>
      <ProtectedFooter />
    </>
  );
}

function SigningView({
  wallet,
  name,
  onBack,
  onClose,
}: {
  wallet: Wallet | null;
  name: string | null;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <BackButton onClick={onBack} />
        <CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-col items-center px-2 pb-4 pt-2 text-center">
        <div className="relative grid h-20 w-20 place-items-center">
          <span className="absolute inset-0 rounded-full border-2 border-white/10" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-yellow-400 motion-safe:animate-spin" />
          {wallet ? (
            <WalletIcon wallet={wallet} className="h-11 w-11" />
          ) : (
            <div className="h-11 w-11 rounded-xl bg-white/10" />
          )}
        </div>
        <h2 className="mt-5 text-[17px] font-semibold text-white">Sign to verify</h2>
        <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-zinc-400">
          Sign the message in {name ?? "your wallet"} to prove you own this wallet. This is free
          and never a transaction.
        </p>
        <p className="mt-3 text-[12px] text-zinc-500">
          Don’t see the request? Check your other browser windows.
        </p>
      </div>
      <ProtectedFooter />
    </>
  );
}

function SuccessView({
  wallet,
  address,
}: {
  wallet: Wallet | null;
  address: string | null;
}) {
  return (
    <div className="flex flex-col items-center px-2 py-6 text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-emerald-400/25" />
        {wallet ? (
          <WalletIcon wallet={wallet} className="h-11 w-11" />
        ) : (
          <div className="h-11 w-11 rounded-xl bg-white/10" />
        )}
        <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-emerald-500 ring-4 ring-[#141206]">
          <CheckIcon className="h-4 w-4 text-white" />
        </span>
      </div>
      <h2 className="mt-5 text-[17px] font-semibold text-white">You’re signed in</h2>
      {address && (
        <p className="mt-1.5 font-mono text-[13px] tracking-wide text-zinc-400">{address}</p>
      )}
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
  onBack,
  onClose,
}: {
  message: string | null;
  onRetry: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <BackButton onClick={onBack} />
        <CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-col items-center px-2 pb-2 pt-1 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-red-500/15">
          <AlertIcon className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="mt-4 text-[17px] font-semibold text-white">Couldn’t connect</h2>
        <p className="mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-zinc-400">
          {message ?? "Something went wrong while connecting."}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
        style={{ backgroundImage: GOLD_GRADIENT }}
      >
        Try again
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 w-full py-1 text-[13px] font-medium text-zinc-400 transition hover:text-white"
      >
        Choose another wallet
      </button>
    </>
  );
}

/* --------------------------------- bits ----------------------------------- */

function WalletIcon({ wallet, className = "" }: { wallet: Wallet; className?: string }) {
  const { icon, name } = wallet.adapter;
  if (!icon) {
    return (
      <div
        className={`grid place-items-center rounded-lg bg-white/10 text-xs font-bold text-white ${className}`}
      >
        {name.slice(0, 1)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={icon} alt="" className={`rounded-lg ${className}`} />;
}

function ProtectedFooter() {
  return (
    <p className="mt-5 border-t border-white/5 pt-3 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-600">
      Secured by Hoshi · Solana
    </p>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}

function AlertIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}
