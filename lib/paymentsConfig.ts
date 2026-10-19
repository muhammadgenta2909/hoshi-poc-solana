"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "./api";

/**
 * Bisakah pembeli sungguhan membayar SEKARANG? Dijawab server (GET /payments/config).
 *
 * Kenapa ditanyakan ke server, bukan flag build Vercel: di hari Duitku dinyalakan, cukup mengisi
 * env di droplet lalu restart — tombol bayar di seluruh situs ikut terbuka tanpa deploy frontend.
 *
 * Kenapa perlu sama sekali: selama rel tagihan masih IDRX, TIDAK ADA pembeli yang bisa melunasi
 * QR-nya (IDRX mewajibkan nama pembayar = nama pemilik akun IDRX, yaitu PT). Menerbitkan QR yang
 * pasti gagal dibayar membuat pembeli mengira tokonya rusak.
 *
 * GAGAL-TERTUTUP: server tidak menjawab, menjawab error, atau backend lebih tua yang belum punya
 * rute ini (404) → dianggap TERTUTUP. Arah salah yang aman: pembeli diberi tahu "belum dibuka",
 * bukan diberi QR yang tidak bisa dibayar.
 */
export type PaymentsConfig = {
  provider: "IDRX" | "DUITKU";
  buyerCheckoutOpen: boolean;
};

const CLOSED: PaymentsConfig = { provider: "IDRX", buyerCheckoutOpen: false };

/** Satu permintaan per kunjungan halaman; jawaban gagal tidak disimpan supaya bisa dicoba lagi. */
let inflight: Promise<PaymentsConfig> | null = null;

export function getPaymentsConfig(): Promise<PaymentsConfig> {
  if (!inflight) {
    inflight = fetch(`${API_BASE}/payments/config`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as Partial<PaymentsConfig>;
        return {
          provider: body.provider === "DUITKU" ? "DUITKU" : "IDRX",
          // Hanya `true` yang membuka. Bentuk lain apa pun = tertutup.
          buyerCheckoutOpen: body.buyerCheckoutOpen === true,
        } satisfies PaymentsConfig;
      })
      .catch(() => {
        inflight = null;
        return CLOSED;
      });
  }
  return inflight;
}

/** `null` selama masih ditanyakan — pemanggil jangan menganggapnya terbuka maupun tertutup. */
export function usePaymentsConfig(): PaymentsConfig | null {
  const [cfg, setCfg] = useState<PaymentsConfig | null>(null);
  useEffect(() => {
    let alive = true;
    void getPaymentsConfig().then((c) => {
      if (alive) setCfg(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return cfg;
}
