"use client";

// Lencana notifikasi ringan (tanpa backend baru): poll endpoint yang sudah ada + jejak "sudah dilihat"
// di localStorage. Tiga sinyal:
//   • offersPending    — PENJUAL: ada offer masuk yang belum ditindak (self-clearing: turun begitu
//                        di-accept/reject). Tak perlu jejak "seen".
//   • offersRejectedNew — PEMBELI: offer-nya DITOLAK sejak terakhir dilihat (REJECTED tinggal
//                        selamanya, jadi butuh set "seen" di localStorage).
//   • balanceUp        — saldo jual BERTAMBAH sejak terakhir dilihat (baseline pertama = diam).
// Dipakai AccountMenu untuk render dot; halaman /account & dropdown memanggil mark* saat "melihat".

import { useCallback, useEffect, useState } from "react";
import { getBalance, getMyListings, getOffersMade, getOffersReceived } from "./api";
import { getMarketUnread } from "./marketMessaging";
import { useAuth } from "./useAuth";

const SEEN_REJECTED_KEY = "hoshi_seen_rejected_offers";
const LAST_BALANCE_KEY = "hoshi_last_seen_balance";
const LAST_SOLD_KEY = "hoshi_last_seen_sold";
const POLL_MS = 30_000;
const REFRESH_EVENT = "hoshi-badges-refresh";

function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...s]));
  } catch {
    /* localStorage penuh/diblokir — abaikan, badge cuma kosmetik */
  }
}

export type AccountBadges = {
  offersPending: number;
  offersRejectedNew: number;
  /** Offer yang DITERIMA penjual tapi belum dibayar → pembeli perlu "Lanjutkan Pembayaran". */
  offersAccepted: number;
  balanceUp: boolean;
  messageUnread: number;
  soldNew: number;
};

const ZERO: AccountBadges = {
  offersPending: 0,
  offersRejectedNew: 0,
  offersAccepted: 0,
  balanceUp: false,
  messageUnread: 0,
  soldNew: 0,
};

export function useAccountBadges(): AccountBadges {
  const { token } = useAuth();
  const [badges, setBadges] = useState<AccountBadges>(ZERO);

  const refresh = useCallback(async () => {
    if (!token) {
      setBadges(ZERO);
      return;
    }
    try {
      const [received, made, bal, unread, myListings] = await Promise.all([
        getOffersReceived(token).catch(() => []),
        getOffersMade(token).catch(() => []),
        getBalance(token).catch(() => null),
        getMarketUnread(token).catch(() => ({ unread: 0 })),
        getMyListings(token).catch(() => []),
      ]);
      const offersPending = received.filter((o) => o.status === "PENDING").length;
      const seen = readSet(SEEN_REJECTED_KEY);
      const offersRejectedNew = made.filter(
        (o) => o.status === "REJECTED" && !seen.has(o.id),
      ).length;
      // Offer DITERIMA penjual & listing masih ACTIVE = belum dibayar → notif "lanjutkan bayar".
      const offersAccepted = made.filter(
        (o) => o.status === "ACCEPTED" && o.item.status === "ACTIVE",
      ).length;
      const messageUnread = unread.unread;

      let balanceUp = false;
      if (bal) {
        const raw = localStorage.getItem(LAST_BALANCE_KEY);
        const last = raw === null ? null : Number(raw);
        if (last === null || !Number.isFinite(last)) {
          // Pertama kali lihat: set baseline, JANGAN nyalakan dot (bukan "baru masuk").
          try {
            localStorage.setItem(LAST_BALANCE_KEY, String(bal.balanceIdrx));
          } catch {
            /* abaikan */
          }
        } else {
          balanceUp = bal.balanceIdrx > last;
        }
      }

      // Kartu TERJUAL sejak terakhir dilihat: listing milik user (sbg penjual) berstatus SOLD dengan
      // soldAt lebih baru. Baseline pertama = diam. Cermin pola balanceUp.
      let soldNew = 0;
      const soldTimes = myListings
        .filter((l) => l.status === "SOLD" && l.soldAt)
        .map((l) => Date.parse(l.soldAt as string))
        .filter((t) => Number.isFinite(t));
      if (soldTimes.length) {
        const maxSold = Math.max(...soldTimes);
        const raw = localStorage.getItem(LAST_SOLD_KEY);
        const last = raw === null ? null : Number(raw);
        if (last === null || !Number.isFinite(last)) {
          try {
            localStorage.setItem(LAST_SOLD_KEY, String(maxSold));
          } catch {
            /* abaikan */
          }
        } else {
          soldNew = soldTimes.filter((t) => t > last).length;
        }
      }

      setBadges({
        offersPending,
        offersRejectedNew,
        offersAccepted,
        balanceUp,
        messageUnread,
        soldNew,
      });
    } catch {
      /* jaringan gagal — pertahankan badge terakhir */
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setBadges(ZERO);
      return;
    }
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocusOrCustom = () => void refresh();
    window.addEventListener("focus", onFocusOrCustom);
    window.addEventListener(REFRESH_EVENT, onFocusOrCustom);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocusOrCustom);
      window.removeEventListener(REFRESH_EVENT, onFocusOrCustom);
    };
  }, [token, refresh]);

  return badges;
}

/** Berapa dari offer-ditolak ini yang BELUM dilihat (untuk badge tab "Offers Made"). */
export function countUnseenRejected(rejectedIds: string[]): number {
  const seen = readSet(SEEN_REJECTED_KEY);
  return rejectedIds.filter((id) => !seen.has(id)).length;
}

/** Tandai offer-ditolak sudah dilihat (panggil saat pembeli membuka tab "Offers Made"). */
export function markOffersRejectedSeen(rejectedIds: string[]) {
  if (rejectedIds.length === 0) return;
  const seen = readSet(SEEN_REJECTED_KEY);
  rejectedIds.forEach((id) => seen.add(id));
  writeSet(SEEN_REJECTED_KEY, seen);
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Tandai saldo sudah dilihat (panggil saat user membuka dropdown / halaman saldo). */
export function markBalanceSeen(balanceIdrx: number) {
  try {
    localStorage.setItem(LAST_BALANCE_KEY, String(balanceIdrx));
  } catch {
    /* abaikan */
  }
  window.dispatchEvent(new Event(REFRESH_EVENT));
}

/** Tandai notifikasi "kartu terjual" sudah dilihat (panggil saat penjual membuka dropdown/akun).
 *  Baseline = sekarang → semua penjualan lampau ter-clear (soldAt selalu di masa lalu). */
export function markSoldSeen() {
  try {
    localStorage.setItem(LAST_SOLD_KEY, String(Date.now()));
  } catch {
    /* abaikan */
  }
  window.dispatchEvent(new Event(REFRESH_EVENT));
}
