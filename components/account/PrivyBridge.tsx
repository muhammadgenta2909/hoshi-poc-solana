"use client";

// Bridges a Privy (Google/email) login into our own JWT session. Steps, once
// Privy reports authenticated:
//   1. ensure a Solana embedded wallet exists — if createOnLogin didn't produce
//      one, create it EXPLICITLY (with a real error surfaced, not a silent hang);
//   2. run the standard nonce→sign→JWT (useAuth.loginWith) with that wallet.
// So a Google user ends up with the same session a Phantom user has, and the
// backend needs no change. Renders nothing. ONLY mount when PRIVY_ENABLED (it
// calls Privy hooks, which require a <PrivyProvider> ancestor).

import { useEffect, useRef } from "react";
import { usePrivy, getIdentityToken } from "@privy-io/react-auth";
import {
  useWallets,
  useSignMessage,
  useCreateWallet,
  useSignTransaction,
} from "@privy-io/react-auth/solana";
import {
  useAuth,
  registerPrivyLogout,
  isAutoLoginSuppressed,
  clearAutoLoginSuppression,
} from "@/lib/useAuth";
import { registerPrivySigner } from "@/lib/txSigner";
import { registerPrivyIdentityToken } from "@/lib/privyIdentity";

export default function PrivyBridge() {
  const { ready, authenticated, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();
  const { token, loginWith } = useAuth();
  // One run at a time (the effect re-fires as `wallets`/auth settle).
  const busyRef = useRef(false);

  // Let our logout() end the Privy session too.
  useEffect(() => registerPrivyLogout(privyLogout), [privyLogout]);

  // Publish this wallet's transaction signer so non-Privy code (the buyback flow)
  // can use it without importing Privy hooks — those would crash wherever Privy
  // is disabled. Re-registers whenever the wallet changes, and unregisters on
  // logout so a stale signer can't fail mid-buyback.
  useEffect(() => {
    const wallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
    if (!wallet) return;
    return registerPrivySigner(async (tx) => {
      const { signedTransaction } = await signTransaction({ transaction: tx, wallet });
      return signedTransaction;
    });
  }, [wallets, signTransaction]);

  // Publish Privy's identity-token getter for the CC-shipping API calls: those
  // endpoints need an X-Privy-Identity-Token header (proving WHICH Google user is
  // calling) on top of our JWT. Registered only while authenticated, and the
  // cleanup unregisters it on logout so a stale token can't be attached after
  // sign-out. `getIdentityToken` reads Privy's freshest stored token each call.
  useEffect(() => {
    if (!authenticated) return;
    return registerPrivyIdentityToken(getIdentityToken);
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated) {
      // Signed out of Privy → a manual logout is fully done; re-arm.
      clearAutoLoginSuppression();
      busyRef.current = false;
      return;
    }
    if (!ready || token || isAutoLoginSuppressed() || busyRef.current) return;

    const wallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
    busyRef.current = true;

    (async () => {
      // 1) No embedded wallet yet → create it explicitly. createOnLogin can fail
      //    or hang; doing it here surfaces the actual error in the console.
      if (!wallet) {
        try {
          console.debug("[privy-bridge] creating embedded Solana wallet…");
          const created = await createWallet();
          console.debug("[privy-bridge] wallet created ✓", created?.wallet?.address);
        } catch (e) {
          // "already has an embedded wallet" is benign — it'll appear in `wallets`.
          console.warn("[privy-bridge] createWallet returned:", e);
        }
        // Let the effect re-run once useWallets() reflects the new wallet.
        busyRef.current = false;
        return;
      }

      // 2) Have a wallet → nonce→sign→JWT, retried for a cold backend.
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          console.debug(`[privy-bridge] sign-in attempt ${attempt} for ${wallet.address}`);
          await loginWith(wallet.address, async (message) => {
            console.debug("[privy-bridge] signing login nonce…");
            const { signature } = await signMessage({ message, wallet });
            console.debug("[privy-bridge] nonce signed ✓");
            return signature;
          });
          console.debug("[privy-bridge] signed in ✓ (JWT stored)");
          return;
        } catch (e) {
          console.error(`[privy-bridge] sign-in attempt ${attempt} failed:`, e);
          if (attempt === 4) {
            busyRef.current = false;
            return;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();
  }, [ready, authenticated, token, wallets, createWallet, loginWith, signMessage]);

  return null;
}
