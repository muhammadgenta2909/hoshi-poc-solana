"use client";

// Chip saldo di navbar. Menampilkan SALDO IDRX IN-APP (Rupiah) milik user — SAMA dengan "Saldo
// Penjualan" di Vault (getBalance → balanceIdrx), bukan saldo on-chain SOL. Auto-refresh saat
// fokus / event "hoshi-badges-refresh" (mis. sesudah jual kartu / top-up) + tiap 30 dtk.

import { useCallback, useEffect, useState } from "react";
import { getBalance } from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { formatIdr, Img } from "./ui";

const REFRESH_EVENT = "hoshi-badges-refresh";

/** `className` membawa layout & visibility (top bar dari lg ke atas; drawer full-width di bawahnya).
 *  `shrink-0` load-bearing supaya pill tak diperas flexbox.
 *  `compact` = varian mungil untuk navbar MOBILE (padding rapat + ikon refresh disembunyikan) supaya
 *  tak bertabrakan dengan logo yang terpusat. */
export default function BalancePill({
  className = "hidden shrink-0 sm:inline-flex",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { token } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setBalance(null);
      return;
    }
    setBusy(true);
    try {
      const b = await getBalance(token);
      setBalance(b.balanceIdrx);
    } catch {
      /* jaringan gagal — pertahankan angka terakhir */
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const onEvt = () => void load();
    window.addEventListener("focus", onEvt);
    window.addEventListener(REFRESH_EVENT, onEvt);
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      window.removeEventListener("focus", onEvt);
      window.removeEventListener(REFRESH_EVENT, onEvt);
      window.clearInterval(id);
    };
  }, [load]);

  const text = !token ? "—" : balance === null ? "…" : `Rp ${formatIdr(balance)}`;
  // Auto-kecilkan angka panjang HANYA di mode compact (navbar mobile): saldo jutaan bikin pill
  // melebar & nabrak logo → turunkan ukuran font bertahap. Kalau masih pendek, tetap normal.
  const numSize = compact
    ? text.length > 13
      ? "text-[11px]"
      : text.length > 10
        ? "text-[12px]"
        : "text-[13px]"
    : "text-[15px]";

  return (
    <button
      type="button"
      onClick={() => void load()}
      disabled={!token || busy}
      title={token ? "Refresh saldo IDRX" : "Masuk untuk melihat saldo"}
      className={`items-center rounded-2xl bg-white/[0.06] font-semibold text-zinc-100 transition hover:bg-white/10 disabled:opacity-60 ${
        compact ? "gap-1.5 px-2.5 py-2" : "gap-2 px-4 py-2.5"
      } ${className}`}
    >
      <Img src="/idrx.png" alt="" className={`shrink-0 ${compact ? "h-[18px] w-[18px]" : "h-5 w-5"}`} />
      <span className={`min-w-0 truncate tabular-nums ${numSize}`}>{text}</span>
      {!compact && (
        <Img src="/cached.png" alt="" className={`h-[18px] w-[18px] ${busy ? "animate-spin" : ""}`} />
      )}
    </button>
  );
}
