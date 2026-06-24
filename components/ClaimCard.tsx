"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type MintResult = {
  assetAddress: string;
  signature: string;
  explorerNft: string;
  explorerAddress: string;
  explorerTx: string;
};

export function ClaimCard() {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MintResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerAddress: publicKey.toBase58() }),
      });
      if (!res.ok) {
        // Prefer the server's { error }, but fall back cleanly if the body is
        // not JSON (e.g. a proxy/gateway HTML error page).
        let message = `Mint failed (HTTP ${res.status})`;
        try {
          const d = await res.json();
          if (d && typeof d.error === "string") message = d.error;
        } catch {
          /* non-JSON error body — keep the HTTP status message */
        }
        throw new Error(message);
      }
      const data = (await res.json()) as MintResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleClaim}
        disabled={!publicKey || loading}
        className="h-11 w-fit rounded-full bg-foreground px-5 text-background transition-opacity disabled:opacity-40"
      >
        {loading ? "Minting…" : "Claim Card NFT"}
      </button>

      {result && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-mono break-all text-zinc-600 dark:text-zinc-400">
            Asset: {result.assetAddress}
          </p>
          <a className="text-blue-500 underline" href={result.explorerNft} target="_blank" rel="noreferrer">
            View NFT on Metaplex Core Explorer ↗
          </a>
          <a className="text-blue-500 underline" href={result.explorerTx} target="_blank" rel="noreferrer">
            View mint transaction ↗
          </a>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
