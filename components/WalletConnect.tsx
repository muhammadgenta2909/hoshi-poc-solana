"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function WalletConnect() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  // WalletMultiButton renders client-only wallet state; gate it behind `mounted`
  // to avoid a hydration mismatch between server and client markup.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      setBalanceError(false);
      return;
    }
    let active = true;
    // Clear the previous account's balance so a "…" placeholder shows while the
    // newly selected account loads (rather than the old account's stale number).
    setBalance(null);
    setBalanceError(false);
    connection
      .getBalance(publicKey, "confirmed")
      .then((lamports) => {
        if (active) setBalance(lamports / LAMPORTS_PER_SOL);
      })
      .catch(() => {
        // devnet RPC is rate-limited; surface the failure instead of a stuck "…".
        if (active) setBalanceError(true);
      });
    return () => {
      active = false;
    };
  }, [publicKey, connection, refresh]);

  return (
    <div className="flex flex-col gap-3">
      {mounted ? <WalletMultiButton /> : <div className="h-12" aria-hidden />}
      {connected && publicKey && (
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          <p className="font-mono break-all">{publicKey.toBase58()}</p>
          <p>
            Balance:{" "}
            {balanceError ? (
              <>
                <span className="text-red-500">unavailable</span>{" "}
                <button
                  onClick={() => setRefresh((n) => n + 1)}
                  className="underline"
                >
                  retry
                </button>
              </>
            ) : balance === null ? (
              "…"
            ) : (
              `${balance.toFixed(4)} SOL`
            )}{" "}
            <span className="text-zinc-400">(devnet)</span>
          </p>
        </div>
      )}
    </div>
  );
}
