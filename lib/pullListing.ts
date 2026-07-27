// Ubah kartu hasil pull (GachaPull) menjadi payload listing marketplace.
//
// Yang dikirim dari sini HANYA hal yang benar-benar diputuskan penjual: HARGA.
// Seluruh identitas kartu — nama, set, rarity, bahasa, era, dan terutama GRADE —
// ditentukan backend dari katalog CollectorCrypt lewat `fromPackMemo`, lalu
// menimpa apa pun yang dikirim klien.
//
// Sebelumnya file ini mengisi sendiri `set: "Promo"`, `element: "Fire"`,
// `category: "Full Art"`, dan menebak grade dengan regex atas nama NFT (dengan
// default "PSA 10" saat regex gagal). Semuanya karangan: kartu yang grade aslinya
// tidak diketahui bisa terbit ke marketplace sebagai PSA 10, dan halaman vault —
// yang menebak dengan cara yang sama — malah menuliskannya "Ungraded".

import type { GachaPull } from "./gacha";
import type { NewListingInput } from "./market";

/**
 * Payload POST /marketplace untuk kartu hasil pull. `fromPackMemo` mengikatnya ke
 * NFT on-chain yang nyata sekaligus membuktikan kepemilikan di sisi server —
 * dan itu pula yang membuat backend berwenang menetapkan grade-nya sendiri.
 */
export function pullToListingInput(
  pull: GachaPull,
  input: { price: number; expectedValue?: number },
): NewListingInput {
  return {
    // Backend menimpanya dengan judul katalog CC yang lengkap; nilai ini hanya
    // dipakai kalau CC tidak mencantumkan judul.
    name: pull.ccItemName ?? pull.nftName ?? "Pulled card",
    image: pull.nftImage ?? "/card-back.svg",
    price: input.price,
    expectedValue: input.expectedValue ?? input.price,
    fromPackMemo: pull.memo,
  };
}
