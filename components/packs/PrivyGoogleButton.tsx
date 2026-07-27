"use client";

// "Continue with Google" for the connect modal. Uses Privy's batteries-included
// login() (opens Privy's own OAuth flow) — NOT the headless initOAuth, which
// could hang. The app session (our JWT) is minted by <PrivyBridge> once Privy is
// authenticated + the embedded wallet is ready. If that stalls (e.g. wallet
// creation hangs), an escape appears so the user can reset the Privy session
// instead of being trapped on "Menghubungkan…". ONLY render when PRIVY_ENABLED.

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";

/** How long "Menghubungkan…" may hang before we offer a reset. */
const STUCK_MS = 10_000;

export default function PrivyGoogleButton() {
  const { ready, authenticated, login, logout: privyLogout } = usePrivy();
  const { isAuthed } = useAuth();
  const { close } = useWalletConnect();
  const [stuck, setStuck] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Privy is authenticated but our JWT isn't minted yet → the bridge is working.
  const connecting = authenticated && !isAuthed;

  // Session minted → close the modal.
  useEffect(() => {
    if (isAuthed) close();
  }, [isAuthed, close]);

  // If we sit in "connecting" too long, the embedded wallet likely failed to
  // create — surface a reset instead of an endless spinner.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the stuck flag as the external Privy connecting state changes */
    if (!connecting) {
      setStuck(false);
      return;
    }
    const t = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(t);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [connecting]);

  const onGoogle = () => {
    if (!ready || authenticated) return;
    login({ loginMethods: ["google"] });
  };

  // Full client-state wipe so a half-created embedded wallet can't wedge the next
  // attempt. The old reset only called privyLogout(), which leaves stale Privy
  // keys behind in localStorage AND IndexedDB — the exact residue that keeps the
  // retry stuck on "Menghubungkan…". A surgical clear kept missing a key, so we
  // nuke everything and hard-reload: Privy then re-initialises from a clean slate
  // and the user can log in with Google again fresh.
  const onReset = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      // 1. Graceful Privy logout (also invalidates its httpOnly session cookies).
      try {
        await privyLogout();
      } catch {
        /* logout may reject on an already-broken session — keep wiping regardless */
      }
      // 2. Wipe web storage. A full clear is intentional (see note above): the
      //    stale wallet/Privy/JWT keys all live here and half-measures kept failing.
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* storage access can throw in locked-down contexts — ignore */
      }
      // 3. Delete IndexedDB databases — Privy caches embedded-wallet state here and
      //    it survives a logout. Wait for each delete (or a blocked/error) so the
      //    reload doesn't race an in-flight deletion.
      try {
        const dbs = (await window.indexedDB?.databases?.()) ?? [];
        await Promise.all(
          dbs.map((d) => {
            const name = d.name;
            if (!name) return Promise.resolve();
            return new Promise<void>((resolve) => {
              const req = window.indexedDB.deleteDatabase(name);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            });
          }),
        );
      } catch {
        /* databases() is unsupported on some browsers — best-effort only */
      }
      // 4. Expire JS-readable cookies (httpOnly Privy cookies are cleared by logout).
      try {
        for (const c of document.cookie.split(";")) {
          const name = c.split("=")[0].trim();
          if (name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
          }
        }
      } catch {
        /* ignore */
      }
    } finally {
      // 5. Hard reload → clean Privy init. User reopens connect and logs in fresh.
      window.location.reload();
    }
  };

  if (stuck) {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-center text-[13px] text-amber-300/90">
          Pembuatan wallet lama sekali. Reset lalu coba lagi.
        </p>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting}
          className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-60"
        >
          {resetting ? "Membersihkan…" : "Reset & coba lagi"}
        </button>
        <p className="text-center text-[11px] text-zinc-500">
          Ini menghapus sesi & cache wallet di browser, lalu memuat ulang halaman.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onGoogle}
      disabled={!ready || connecting}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white px-3.5 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-95 disabled:opacity-60"
    >
      <GoogleGlyph />
      {connecting ? "Menghubungkan…" : "Continue with Google"}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
