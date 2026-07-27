"use client";

// Real wallet button (Figma pill style). Not connected → opens the wallet-select
// modal; connected → shows a short address, click = disconnect. Replaces the old
// static text-only button that wasn't wired to the wallet adapter.
//
// No mount-gate: useWallet() starts null on the server and on the client's first
// render (autoConnect is async, publicKey is set later via the adapter's effect),
// so both initial renders show "Connect Wallet" → no hydration mismatch.

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletConnect } from "@/lib/useWalletConnect";

const short = (addr: string) => `${addr.slice(0, 4)}..${addr.slice(-4)}`;

export default function WalletPill() {
  const { publicKey, connecting, disconnect } = useWallet();
  const { open } = useWalletConnect();

  const label = publicKey
    ? short(publicKey.toBase58())
    : connecting
      ? "Connecting…"
      : "Connect Wallet";

  const onClick = () => {
    if (publicKey) disconnect().catch(() => {});
    else open();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={publicKey ? "Click to disconnect" : "Connect wallet"}
      className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
    >
      <span className="tracking-wide">{label}</span>
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: publicKey ? "#3DDC84" : "#71717a" }}
      />
    </button>
  );
}
