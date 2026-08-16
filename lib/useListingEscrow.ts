"use client";

// Langkah escrow-saat-listing untuk jalur P2P REAL (Flow B armed di produksi).
//
// Saat armed, backend membuat listing user berstatus PENDING_ESCROW: kartunya (aset mpl-core di
// wallet penjual) harus benar-benar dititipkan ke wallet escrow Hoshi SEBELUM bisa dibeli — kalau
// tidak, saat terjual escrow tak punya apa-apa untuk dikirim ke pembeli. Alur di sini:
//   prepare (backend bangun tx transfer→escrow) → penjual TTD → submit (backend siarkan → ACTIVE).
//
// Di staging/mock (dan produksi selama P2P belum di-arm) backend mengembalikan listing yang LANGSUNG
// ACTIVE, jadi hook ini NO-OP — tak ada permintaan tanda tangan, alur lama tak berubah. Keputusan
// "perlu escrow atau tidak" sepenuhnya digerakkan oleh STATUS yang dikembalikan backend, bukan flag
// frontend — sehingga frontend yang sama benar di kedua mode.

import { useCallback } from "react";
import { escrowPrepare, escrowSubmit } from "./api";
import { useSignSerializedTransaction } from "./useSignSerializedTransaction";
import type { Listing } from "./market";

export function useFinishListingEscrow() {
  const sign = useSignSerializedTransaction();

  /**
   * Selesaikan escrow bila listing kembali PENDING_ESCROW; kalau sudah ACTIVE, kembalikan apa
   * adanya (no-op). Melempar kalau penjual menolak tanda tangan / broadcast gagal — pemanggil
   * menampilkan errornya. Aman diulang: submit idempoten di sisi backend.
   */
  return useCallback(
    async (listing: Listing, token: string): Promise<Listing> => {
      if (listing.status !== "PENDING_ESCROW") return listing;
      const { serializedTransaction } = await escrowPrepare(listing.id, token);
      const signed = await sign(serializedTransaction);
      return escrowSubmit(listing.id, signed, token);
    },
    [sign],
  );
}
