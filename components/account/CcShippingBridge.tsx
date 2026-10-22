"use client";

// Publishes the connected wallet-adapter wallet (Phantom etc.) as a CollectorCrypt
// SIWS signer (see lib/ccShippingAuth). Renders nothing.
//
// Unlike <PrivyBridge> this is ALWAYS mounted: it uses wallet-adapter's
// useWallet(), which is available to every user (no Privy dependency). It stays
// dormant for Google/Privy users — they have no wallet-adapter publicKey, so
// nothing is registered here and <PrivyBridge> registers their EMBEDDED wallet
// instead. Either way the signer is the wallet that owns the card, which is the
// only wallet CC will mint a `cca_…` shipping token for.

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { registerCcWalletSigner, clearCcSiwsToken } from "@/lib/ccShippingAuth";

export default function CcShippingBridge() {
  const { publicKey, signMessage } = useWallet();
  const address = publicKey?.toBase58() ?? null;

  // Latest signMessage via a ref so the registration effect can key on `address`
  // ALONE: signMessage's identity can churn between renders, and re-running the
  // effect on that would needlessly clear the cache and force a re-sign.
  const signRef = useRef(signMessage);
  useEffect(() => {
    signRef.current = signMessage;
  }, [signMessage]);

  useEffect(() => {
    // No wallet-adapter wallet (disconnected, or a Google/Privy user) → nothing to
    // register. Deliberately NOT clearing the cached token here: it may belong to
    // a Google user's embedded wallet, and wiping it would re-prompt them for
    // nothing. The cleanup below clears only the wallet this bridge registered.
    if (!address) return;
    const unregister = registerCcWalletSigner({
      address,
      signMessage: async (bytes) => {
        const fn = signRef.current;
        if (!fn) throw new Error("Wallet ini tidak mendukung tanda tangan pesan.");
        return fn(bytes);
      },
    });
    return () => {
      unregister();
      // Wallet changed/disconnected → drop THIS wallet's CC token so it can't be
      // attached to a request for a different identity.
      clearCcSiwsToken(address);
    };
  }, [address]);

  return null;
}
