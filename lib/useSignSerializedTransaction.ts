"use client";

// Signs a base64 Solana transaction with whichever wallet actually owns the card.
//
// Hoshi has two kinds of wallet and they sign through completely different APIs:
//   • Phantom (wallet-adapter) — wants a Transaction OBJECT, so the bytes have to
//     be deserialised and re-serialised around it.
//   • Privy embedded (Google login) — signs raw bytes, no (de)serialisation at all.
//
// Picking by "whatever is connected" is not good enough: a user can have Phantom
// connected in the browser while the card belongs to their Privy wallet, and
// signing with the wrong key produces a confusing on-chain failure rather than a
// clear error. So we match against the JWT's wallet — the address the backend
// actually minted the card to — and refuse when neither wallet can sign for it.

import { useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useAuth } from "./useAuth";
import { base64ToBytes, bytesToBase64, getPrivySigner } from "./txSigner";

/** CC doesn't document which transaction format it returns, so accept either. */
function deserialize(bytes: Uint8Array): Transaction | VersionedTransaction {
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

function serialize(tx: Transaction | VersionedTransaction): Uint8Array {
  if (tx instanceof VersionedTransaction) return tx.serialize();
  // Legacy: CollectorCrypt co-signs on their side, so ours is not the only
  // signature this transaction will ever carry — demanding a complete set here
  // would throw on a transaction that is perfectly valid so far.
  return new Uint8Array(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  );
}

export function useSignSerializedTransaction() {
  const { publicKey, signTransaction } = useWallet();
  const { activeAddress } = useAuth();

  return useCallback(
    async (serializedBase64: string): Promise<string> => {
      const bytes = base64ToBytes(serializedBase64);

      // Phantom, but only when it holds the very wallet the card belongs to.
      const phantomOwnsIt =
        !!signTransaction && !!publicKey && publicKey.toBase58() === activeAddress;
      if (phantomOwnsIt) {
        const signed = await signTransaction(deserialize(bytes));
        return bytesToBase64(serialize(signed));
      }

      // Otherwise the embedded wallet — the Google-login path, and the common one.
      const privySign = getPrivySigner();
      if (privySign) return bytesToBase64(await privySign(bytes));

      throw new Error(
        "Wallet pemilik kartu ini tidak tersedia untuk menandatangani. " +
          "Hubungkan kembali wallet-nya lalu coba lagi.",
      );
    },
    [signTransaction, publicKey, activeAddress],
  );
}
