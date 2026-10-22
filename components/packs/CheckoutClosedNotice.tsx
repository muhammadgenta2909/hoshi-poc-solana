"use client";

import { BUSINESS } from "@/components/legal/business";
import { GOLD_GRADIENT } from "./ui";

/**
 * Pengganti layar bayar selama pembayaran online pembeli belum dibuka (lihat lib/paymentsConfig.ts).
 *
 * Sengaja TIDAK menjanjikan "kami bantu proses pembeliannya": belum ada jalur penjualan manual di
 * sistem, jadi janji itu tidak bisa ditepati admin. Yang dijanjikan hanya yang benar — pembayaran
 * akan dibuka, dan minat pembeli bisa disampaikan sekarang.
 */
export function CheckoutClosedNotice({
  onClose,
  subject,
}: {
  onClose: () => void;
  /** Apa yang ingin dibeli, untuk isi pesan WhatsApp — mis. "kartu ini" atau "ongkir pengiriman". */
  subject: string;
}) {
  const page = typeof window !== "undefined" ? window.location.href : BUSINESS.brand;
  const text = `Halo ${BUSINESS.brand}, saya tertarik dengan ${subject}: ${page}`;
  const wa = `https://wa.me/${BUSINESS.phoneWa}?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-sky-500/15 text-2xl">⏳</div>
      <p className="text-base font-semibold text-white">Pembayaran online belum dibuka</p>
      <p className="max-w-[19rem] text-[13px] leading-relaxed text-zinc-400">
        Kami sedang menyiapkan sistem pembayarannya. Kalau kamu tertarik, kabari kami lewat
        WhatsApp — kami kabari begitu pembayaran sudah bisa dilakukan.
      </p>
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
        style={{ backgroundImage: GOLD_GRADIENT }}
      >
        Chat WhatsApp
      </a>
      <button
        type="button"
        onClick={onClose}
        className="text-[13px] text-zinc-400 transition hover:text-zinc-200"
      >
        Tutup
      </button>
    </div>
  );
}
