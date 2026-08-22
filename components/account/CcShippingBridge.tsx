"use client";

// Publishes the connected wallet's SIWS signer for CollectorCrypt shipping
// (Track B, see lib/ccShippingAuth.ts). Renders nothing.
//
// Unlike <PrivyBridge> this is ALWAYS mounted: it uses wallet-adapter's
// useWallet(), which is available to every user (no Privy dependency). It stays
// dormant for Google/Privy users — they have no wallet-adapter publicKey, so
// nothing is registered and they keep using Track A (the Privy identity token).
// It only comes alive for raw-wallet users (Phantom etc.), whose SIWS signature
// mints a CC token when they enter the shipping flow.

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
    if (!address) {
      // No wallet-adapter wallet (disconnected, or a Google/Privy user) → nothing
      // to register, and any cached CC token belongs to a wallet that's gone.
      clearCcSiwsToken();
      return;
    }
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
      // Wallet changed/disconnected → drop the previous wallet's CC token so it
      // can't be attached to a request for a different identity.
      clearCcSiwsToken();
    };
  }, [address]);

  return null;
}
