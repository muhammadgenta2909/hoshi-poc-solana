"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { AuthProvider } from "@/lib/useAuth";
import { AdminAuthProvider } from "@/lib/adminAuth";
import { CartProvider } from "@/lib/useCart";
import { WalletConnectProvider, emitWalletError } from "@/lib/useWalletConnect";
import { warmBackend } from "@/lib/api";
import PrivyProviders, { PRIVY_ENABLED } from "./PrivyProviders";
import PrivyBridge from "@/components/account/PrivyBridge";
import CcShippingBridge from "@/components/account/CcShippingBridge";

// Required for the legacy wallet-adapter-react-ui modal (still used by the POC
// landing page `/`). Our own Hoshi modal lives in <WalletConnectProvider>.
import "@solana/wallet-adapter-react-ui/styles.css";

// RPC endpoint. Prefer an explicit (paid) RPC; otherwise fall back to the public
// endpoint for WHATEVER cluster is configured — NOT a hardcoded devnet. A hardcoded
// devnet fallback is a real-money footgun: set NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta
// but forget the RPC, and the wallet adapter would silently read balances / send
// transactions on devnet while every label says mainnet. Deriving from the cluster
// keeps the network coherent even when the RPC env is missed.
const KNOWN_CLUSTERS = ["devnet", "testnet", "mainnet-beta"] as const;
type KnownCluster = (typeof KNOWN_CLUSTERS)[number];
const CLUSTER: KnownCluster = KNOWN_CLUSTERS.includes(
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER as KnownCluster,
)
  ? (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as KnownCluster)
  : "devnet";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl(CLUSTER);

  // Wake the (free-tier, cold-starting) backend as soon as the app loads, so
  // it's already warm by the time the user connects a wallet and signs in.
  useEffect(() => {
    warmBackend();
  }, []);

  // Phantom (and other modern wallets) auto-register as Standard Wallets, so they
  // appear in the connect modal without an explicit adapter. We deliberately do
  // NOT pass `new PhantomWalletAdapter()`: it duplicates the injected Standard
  // Wallet ("can be removed" warning) and that duplicate pair made select/connect
  // target one instance while the modal watched another — hanging on "Waiting…".
  // When Phantom isn't installed the modal shows an "Install Phantom" prompt.
  const wallets = useMemo(() => [], []);

  return (
    // PrivyProviders is a no-op passthrough unless NEXT_PUBLIC_PRIVY_APP_ID is set.
    <PrivyProviders>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect onError={emitWalletError}>
          <WalletModalProvider>
            <AuthProvider>
              {/* WalletConnectProvider sits inside AuthProvider so the modal can run
                  login() (sign-to-verify) itself after the wallet connects. */}
              <WalletConnectProvider>
                {/* Turns a Privy (Google) login into our JWT session. Only mounted
                    when Privy is enabled, so it never calls Privy hooks otherwise. */}
                {PRIVY_ENABLED && <PrivyBridge />}
                {/* Publishes the connected wallet's SIWS signer for CC shipping
                    (Track B). Always mounted; dormant for Google/Privy users. */}
                <CcShippingBridge />
                <AdminAuthProvider>
                  <CartProvider>{children}</CartProvider>
                </AdminAuthProvider>
              </WalletConnectProvider>
            </AuthProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </PrivyProviders>
  );
}
