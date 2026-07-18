"use client";

// "Continue with Google" for the connect modal. Uses Privy's batteries-included
// login() (which opens Privy's own OAuth flow/modal) — NOT the headless
// initOAuth, which could hang with no popup/redirect. We close our own modal
// first so Privy's UI isn't stacked behind it. The actual app session (our JWT)
// is minted by <PrivyBridge> once Privy reports authenticated + the embedded
// wallet is ready. ONLY render when PRIVY_ENABLED (needs PrivyProvider).

import { usePrivy } from "@privy-io/react-auth";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";

export default function PrivyGoogleButton() {
  const { ready, authenticated, login } = usePrivy();
  const { isAuthed } = useAuth();
  const { close } = useWalletConnect();

  // Privy is authenticated but our JWT isn't minted yet → the bridge is signing.
  const connecting = authenticated && !isAuthed;

  const onClick = () => {
    if (!ready || authenticated) return;
    close(); // avoid stacking Privy's modal behind ours
    login({ loginMethods: ["google"] });
  };

  return (
    <button
      type="button"
      onClick={onClick}
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
