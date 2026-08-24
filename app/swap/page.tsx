"use client";

// Swap — SEGERA HADIR. Alur swap sebelumnya cuma stub record-only (tidak ada notifikasi ke
// penerima, tidak ada view penerima, tidak ada transfer kartu), jadi UI fungsionalnya disembunyikan
// di balik placeholder "Coming Soon". Halaman + link nav /swap tetap ada supaya nggak nyasar.

import {
  AccountShell,
  SwapArrowsIcon,
} from "@/components/account/ui";

export default function SwapPage() {
  return (
    <AccountShell active="Vault">
      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <div
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-yellow-300"
          style={{ boxShadow: "0 0 0 1px rgba(245,182,52,0.12)" }}
        >
          <SwapArrowsIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-white sm:text-2xl">Swap</h1>
          <p className="mt-0.5 text-[13px] text-zinc-400">
            Tukar kartu langsung antar kolektor — wallet ke wallet.
          </p>
        </div>
      </div>

      {/* Coming Soon panel */}
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center rounded-3xl border border-white/[0.07] bg-white/[0.02] px-6 py-16 text-center">
          <div
            className="grid h-16 w-16 place-items-center rounded-2xl border border-yellow-400/20 bg-yellow-400/[0.06] text-yellow-300"
            style={{ boxShadow: "0 0 0 1px rgba(245,182,52,0.12)" }}
          >
            <SwapArrowsIcon className="h-8 w-8" />
          </div>

          <span className="mt-6 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-yellow-300">
            Segera Hadir
          </span>

          <h2 className="mt-4 text-lg font-bold text-white sm:text-xl">
            Swap — Segera Hadir
          </h2>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-zinc-400">
            Tukar kartu langsung antar kolektor (wallet ke wallet) lagi dibangun. Nantikan ya!
          </p>
        </div>
      </div>
    </AccountShell>
  );
}
