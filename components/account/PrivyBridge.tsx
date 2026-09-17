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
import { usePrivy } from "@privy-io/react-auth";
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
import { registerCcEmbeddedSigner, clearCcSiwsToken } from "@/lib/ccShippingAuth";

export default function PrivyBridge() {
  const { ready, authenticated, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();
  const { token, loginWith } = useAuth();
  // One run at a time (the effect re-fires as `wallets`/auth settle).
  const busyRef = useRef(false);

  // The embedded wallet CC has to sign with, and its address.
  const ccWallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
  const ccAddress = ccWallet?.address ?? null;

  // Latest wallet + signMessage via refs so the CC registration effect below can key on the
  // ADDRESS ALONE (same reason as <CcShippingBridge>): `wallets` and `signMessage` get new
  // identities on renders where nothing actually changed, and re-running that effect on the
  // churn would clear the cached `cca_…` token and force the user to sign a fresh SIWS
  // message every time.
  const ccWalletRef = useRef(ccWallet);
  const ccSignMessageRef = useRef(signMessage);
  useEffect(() => {
    ccWalletRef.current = ccWallet;
    ccSignMessageRef.current = signMessage;
  }, [ccWallet, signMessage]);

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

  // Publish this embedded wallet as a CollectorCrypt SIWS signer. CC accepts ONE
  // credential for a Solana redemption — a `cca_…` token minted by signing a SIWS
  // message with the wallet that OWNS the card (their API key is EVM-only, and a
  // Privy identity token is not a CC credential at all: that was our 401). A
  // Google user's cards are minted to this embedded wallet, so this is the wallet
  // that has to sign — and it is the same address our own JWT is issued for,
  // which is what lib/ccShippingAuth keys the handshake on. Registered only while
  // authenticated; keyed on the ADDRESS alone (the signer is read through refs), so
  // the cleanup — and the token wipe it does — only runs when the address actually
  // changes or the user logs out, never on signMessage/wallets identity churn.
  useEffect(() => {
    if (!authenticated || !ccAddress) return;
    const unregister = registerCcEmbeddedSigner({
      address: ccAddress,
      signMessage: async (message) => {
        const wallet = ccWalletRef.current;
        if (!wallet) throw new Error("Dompet Privy belum siap untuk menandatangani.");
        const { signature } = await ccSignMessageRef.current({ message, wallet });
        return signature;
      },
    });
    return () => {
      unregister();
      // Address changed / logged out → drop THIS wallet's CC token so it can't be
      // attached to a request for a different identity.
      clearCcSiwsToken(ccAddress);
    };
  }, [authenticated, ccAddress]);

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
