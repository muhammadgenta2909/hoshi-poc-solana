"use client";

import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";
import { AuthProvider } from "@/lib/useAuth";
import { AdminAuthProvider } from "@/lib/adminAuth";
import { CartProvider } from "@/lib/useCart";
import { WalletConnectProvider, emitWalletError } from "@/lib/useWalletConnect";

// Required for the legacy wallet-adapter-react-ui modal (still used by the POC
// landing page `/`). Our own Hoshi modal lives in <WalletConnectProvider>.
import "@solana/wallet-adapter-react-ui/styles.css";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");

  // Phantom (and other modern wallets) auto-register as Standard Wallets, so they
  // appear in the connect modal without an explicit adapter. We deliberately do
  // NOT pass `new PhantomWalletAdapter()`: it duplicates the injected Standard
  // Wallet ("can be removed" warning) and that duplicate pair made select/connect
  // target one instance while the modal watched another — hanging on "Waiting…".
  // When Phantom isn't installed the modal shows an "Install Phantom" prompt.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={emitWalletError}>
        <WalletModalProvider>
          <AuthProvider>
            {/* WalletConnectProvider sits inside AuthProvider so the modal can run
                login() (sign-to-verify) itself after the wallet connects. */}
            <WalletConnectProvider>
              <AdminAuthProvider>
                <CartProvider>{children}</CartProvider>
              </AdminAuthProvider>
            </WalletConnectProvider>
          </AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
