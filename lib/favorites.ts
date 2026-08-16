"use client";

// Favorite cards (maks 3) — CLIENT-ONLY, tanpa backend. Disimpan di localStorage per-wallet.
// Heart toggle ada di kartu Vault; banner profil membaca set ini + resolve ke kartu milik user.
// Sinkron lintas-komponen (same-tab) lewat custom event + lintas-tab lewat "storage".

import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "hoshi_favorites_";
export const MAX_FAVORITES = 3;
export const FAVORITES_EVENT = "hoshi-favorites-changed";

function storageKey(wallet: string | null | undefined): string {
  return KEY_PREFIX + (wallet ?? "anon");
}

export function getFavorites(wallet: string | null | undefined): string[] {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr)
      ? (arr.filter((x) => typeof x === "string") as string[]).slice(0, MAX_FAVORITES)
      : [];
  } catch {
    return [];
  }
}

function writeFavorites(wallet: string | null | undefined, ids: string[]): void {
  try {
    localStorage.setItem(storageKey(wallet), JSON.stringify(ids.slice(0, MAX_FAVORITES)));
  } catch {
    /* private mode / penuh — favorite cuma kosmetik */
  }
  try {
    window.dispatchEvent(new Event(FAVORITES_EVENT));
  } catch {
    /* SSR / no window */
  }
}

export function isFavorite(wallet: string | null | undefined, id: string): boolean {
  return getFavorites(wallet).includes(id);
}

/** Kosongkan SEMUA favorit (tombol trash di banner). */
export function clearFavorites(wallet: string | null | undefined): void {
  try {
    localStorage.removeItem(storageKey(wallet));
  } catch {
    /* abaikan */
  }
  try {
    window.dispatchEvent(new Event(FAVORITES_EVENT));
  } catch {
    /* SSR / no window */
  }
}

/**
 * Toggle favorite. Menambah dibatasi MAX_FAVORITES: kalau sudah penuh & mencoba menambah kartu
 * baru → `{ ok:false, atMax:true }` (pemanggil boleh tampilkan notice). Menghapus selalu ok.
 */
export function toggleFavorite(
  wallet: string | null | undefined,
  id: string,
): { ok: boolean; favorites: string[]; atMax: boolean } {
  const cur = getFavorites(wallet);
  if (cur.includes(id)) {
    const next = cur.filter((x) => x !== id);
    writeFavorites(wallet, next);
    return { ok: true, favorites: next, atMax: false };
  }
  if (cur.length >= MAX_FAVORITES) {
    return { ok: false, favorites: cur, atMax: true };
  }
  const next = [...cur, id];
  writeFavorites(wallet, next);
  return { ok: true, favorites: next, atMax: false };
}

export function subscribeFavorites(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(FAVORITES_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(FAVORITES_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Reaktif: daftar id favorit + toggle. Tetap sinkron saat komponen lain mengubahnya. */
export function useFavorites(wallet: string | null | undefined): {
  favorites: string[];
  toggle: (id: string) => { ok: boolean; favorites: string[]; atMax: boolean };
  clear: () => void;
} {
  const [favorites, setFavoritesState] = useState<string[]>([]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setFavoritesState(getFavorites(wallet));
    return subscribeFavorites(() => setFavoritesState(getFavorites(wallet)));
  }, [wallet]);

  const toggle = useCallback(
    (id: string) => {
      const res = toggleFavorite(wallet, id);
      setFavoritesState(res.favorites);
      return res;
    },
    [wallet],
  );

  const clear = useCallback(() => {
    clearFavorites(wallet);
    setFavoritesState([]);
  }, [wallet]);

  return { favorites, toggle, clear };
}
