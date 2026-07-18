"use client";

// Privy provider — Google/email login + an auto-created embedded SOLANA wallet.
// ENV-GATED: without NEXT_PUBLIC_PRIVY_APP_ID it renders children untouched, so
// the existing Phantom/wallet-adapter flow is byte-for-byte unchanged. We do NOT
// register external-wallet connectors here (Phantom is already handled by
// wallet-adapter) — Privy is only for the embedded Google-login wallet.

import { PrivyProvider } from "@privy-io/react-auth";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ReactNode } from "react";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

/** True when Privy login should be offered (App ID configured). */
export const PRIVY_ENABLED = !!APP_ID;

// Public cluster endpoints for the embedded wallet. Public URLs keep the ws
// subscription valid regardless of NEXT_PUBLIC_RPC_URL; flips with the cluster.
const MAINNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta";
const CLUSTER = MAINNET ? "mainnet" : "devnet";
const HTTP = MAINNET ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com";
const WS = MAINNET ? "wss://api.mainnet-beta.solana.com" : "wss://api.devnet.solana.com";

export default function PrivyProviders({ children }: { children: ReactNode }) {
  if (!APP_ID) return <>{children}</>;
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        embeddedWallets: { solana: { createOnLogin: "all-users" } },
        solana: {
          rpcs: {
            [`solana:${CLUSTER}`]: {
              rpc: createSolanaRpc(HTTP),
              rpcSubscriptions: createSolanaRpcSubscriptions(WS),
            },
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
