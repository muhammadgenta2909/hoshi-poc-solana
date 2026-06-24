"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

export function SignMessage() {
  const { publicKey, signMessage } = useWallet();
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSign() {
    setError(null);
    setSignature(null);
    setBusy(true);
    try {
      if (!publicKey) throw new Error("Connect a wallet first.");
      // `signMessage` is optional on the wallet context — guard it before use.
      if (!signMessage)
        throw new Error("This wallet does not support message signing.");

      const message = new TextEncoder().encode(
        `Login ke Hoshi\nWallet: ${publicKey.toBase58()}\nNonce: ${Date.now()}`,
      );
      const sig = await signMessage(message);
      const encoded = bs58.encode(sig);
      setSignature(encoded);
      console.log("signature:", encoded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSign}
        disabled={!publicKey || busy}
        className="h-11 w-fit rounded-full bg-foreground px-5 text-background transition-opacity disabled:opacity-40"
      >
        {busy ? "Signing…" : "Sign login message"}
      </button>
      {signature && (
        <p className="text-xs font-mono break-all text-green-600 dark:text-green-400">
          ✓ signature: {signature}
        </p>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
