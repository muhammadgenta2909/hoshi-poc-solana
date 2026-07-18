"use client";

// Bridges a Privy (Google/email) login into our own JWT session. When a Privy
// user is authenticated and their embedded Solana wallet is ready, this runs the
// standard nonce→sign→JWT (useAuth.loginWith) using the embedded wallet — so a
// Google user ends up with exactly the same session a Phantom user has, and the
// backend needs no change. Renders nothing.
//
// ONLY mount this when PRIVY_ENABLED (it calls Privy hooks, which require a
// <PrivyProvider> ancestor). It sits inside <AuthProvider> so it can call loginWith.

import { useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets, useSignMessage } from "@privy-io/react-auth/solana";
import {
  useAuth,
  registerPrivyLogout,
  isAutoLoginSuppressed,
  clearAutoLoginSuppression,
} from "@/lib/useAuth";

export default function PrivyBridge() {
  const { ready, authenticated, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { token, loginWith } = useAuth();
  // Guards against firing loginWith twice while the sign UI is up / a render settles.
  const signingRef = useRef(false);

  // Let our logout() end the Privy session too.
  useEffect(() => registerPrivyLogout(privyLogout), [privyLogout]);

  useEffect(() => {
    if (!authenticated) {
      // Signed out of Privy → a manual logout is fully done; re-arm auto-login.
      clearAutoLoginSuppression();
      signingRef.current = false;
      return;
    }
    if (!ready || token || isAutoLoginSuppressed()) return; // not a fresh Privy login
    // The embedded wallet ("Privy") is what we sign the nonce with.
    const wallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
    if (!wallet) return; // wallet still being created
    if (signingRef.current) return;
    signingRef.current = true;
    loginWith(wallet.address, async (message) => {
      const { signature } = await signMessage({ message, wallet });
      return signature;
    }).catch(() => {
      signingRef.current = false; // allow a retry (user re-clicks / re-signs)
    });
  }, [ready, authenticated, token, wallets, loginWith, signMessage]);

  return null;
}
