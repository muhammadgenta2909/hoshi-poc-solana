"use client";

// Privy provider — Google/email login + an auto-created embedded SOLANA wallet.
// ENV-GATED: without NEXT_PUBLIC_PRIVY_APP_ID it renders children untouched, so
// the existing Phantom/wallet-adapter flow is byte-for-byte unchanged. We do NOT
// register external-wallet connectors (Phantom is handled by wallet-adapter) —
// Privy is only for the embedded Google-login wallet.
//
// `solana.rpcs` IS required for Privy to CREATE the embedded wallet (not just to
// sign) — omitting it hangs "Creating your wallet". We point it at PUBLIC MAINNET
// endpoints on purpose: they're reliable (the public devnet WebSocket often never
// establishes, which was the original hang), and a Solana keypair is
// cluster-agnostic — the same address is valid on devnet, where the treasury
// mints the pulled cards to it. This wallet only ever signMessage()s (login); it
// never sends a transaction, so its configured cluster is immaterial.

import { PrivyProvider } from "@privy-io/react-auth";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ReactNode } from "react";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/** True when Privy login should be offered (App ID configured). */
export const PRIVY_ENABLED = !!APP_ID;

export default function PrivyProviders({ children }: { children: ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        // showWalletUIs:false → create + sign the embedded wallet HEADLESSLY, with
        // no Privy modal. The "Creating your wallet" modal (a cross-origin iframe)
        // was hanging opaquely; headless creation surfaces a real error instead,
        // and login only needs a silent signMessage anyway.
        embeddedWallets: { showWalletUIs: false, solana: { createOnLogin: "all-users" } },
        solana: {
          rpcs: {
            "solana:mainnet": {
              rpc: createSolanaRpc("https://api.mainnet-beta.solana.com"),
              rpcSubscriptions: createSolanaRpcSubscriptions("wss://api.mainnet-beta.solana.com"),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
