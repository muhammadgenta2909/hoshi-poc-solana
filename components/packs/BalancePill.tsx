"use client";

// Live balance chip for the connected wallet (replaces the old static
// "x023dsa..2931 IDRX" placeholder). Shows the wallet's IDRX SPL-token balance
// when NEXT_PUBLIC_IDRX_MINT is set; otherwise falls back to the real on-chain
// SOL balance (devnet), so the number is always live — never hardcoded.

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, type Connection } from "@solana/web3.js";
import { formatIdr, Img } from "./ui";

const IDRX_MINT = process.env.NEXT_PUBLIC_IDRX_MINT;
const UNIT = IDRX_MINT ? "IDRX" : "SOL";

async function fetchBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number> {
  if (IDRX_MINT) {
    const res = await connection.getParsedTokenAccountsByOwner(owner, {
      mint: new PublicKey(IDRX_MINT),
    });
    return res.value.reduce(
      (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0,
    );
  }
  const lamports = await connection.getBalance(owner, "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

function format(balance: number): string {
  return UNIT === "SOL" ? balance.toFixed(3) : formatIdr(Math.round(balance));
}

/** `className` carries the layout (and therefore the visibility): the top bar
 *  shows it from `lg` up, while below that the drawer renders it full-width —
 *  the bar has no room for it next to the labelled cart pill without shoving the
 *  centred logo aside. `shrink-0` is load-bearing: without it flexbox squeezes
 *  the pill under its own content and the refresh icon spills past the border. */
export default function BalancePill({
  className = "hidden shrink-0 sm:inline-flex",
}: {
  className?: string;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  // All setState lives in async callbacks (never synchronously in the effect body),
  // so there's no cascading-render lint issue and no hydration mismatch.
  useEffect(() => {
    let alive = true;
    if (!publicKey) {
      Promise.resolve().then(() => {
        if (alive) setBalance(null);
      });
      return () => {
        alive = false;
      };
    }
    fetchBalance(connection, publicKey)
      .then((b) => alive && setBalance(b))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [publicKey, connection, refresh]);

  const value = !publicKey ? null : balance === null ? "…" : format(balance);

  return (
    <button
      type="button"
      onClick={() => setRefresh((n) => n + 1)}
      disabled={!publicKey}
      title={publicKey ? "Refresh balance" : "Connect a wallet to see your balance"}
      className={`items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-60 ${className}`}
    >
      <Img src="/idrx.png" alt="" className="h-5 w-5" />
      {value !== null && <span className="tabular-nums">{value}</span>}
      <span className="text-zinc-400">{UNIT}</span>
      <Img src="/cached.png" alt="" className="h-[18px] w-[18px]" />
    </button>
  );
}
