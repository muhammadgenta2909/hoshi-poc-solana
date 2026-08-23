"use client";

// Favorite cards (maks 3) — CLIENT-ONLY, tanpa backend. Disimpan di localStorage per-wallet.
// Heart toggle ada di kartu Vault; banner profil membaca set ini + resolve ke kartu milik user.
// Sinkron lintas-komponen (same-tab) lewat custom event + lintas-tab lewat "storage".

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { getMyPacks, getMyPurchases } from "@/lib/api";
import type { GachaPull } from "@/lib/gacha";
import type { Listing } from "@/lib/market";

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

/** Satu kartu favorit yang sudah di-resolve ke nama + art (untuk banner profil). */
export type FavoriteCard = { nftAddress: string; name: string; image: string | null };

/**
 * Resolve id favorit → kartu (nama + art) dari kartu milik user. PURE, dipakai
 * bersama oleh /account (yang sudah punya pulls/assets) dan hook di bawah, jadi
 * logika peta-nya SATU sumber. Key: pull = `nftAddress`, listing/bought = `listing.id`
 * (♥ di kartu mana pun tampil di banner, tak dibeda-bedakan). Maks mengikuti favoriteIds.
 */
export function buildFavoriteCards(
  favoriteIds: string[],
  pulls: GachaPull[],
  assets: Listing[],
): FavoriteCard[] {
  const byKey = new Map<string, FavoriteCard>();
  for (const p of pulls) {
    if (p.nftAddress) {
      byKey.set(p.nftAddress, {
        nftAddress: p.nftAddress,
        name: p.ccItemName ?? p.nftName ?? "Kartu",
        image: p.nftImage ?? null,
      });
    }
  }
  for (const l of assets) {
    byKey.set(l.id, { nftAddress: l.id, name: l.name, image: l.image ?? null });
  }
  return favoriteIds
    .map((id) => byKey.get(id))
    .filter((c): c is FavoriteCard => !!c);
}

/**
 * Self-contained: daftar kartu favorit (maks 3, resolved) + clear, untuk halaman
 * yang BELUM memuat pulls/assets sendiri (mis. /settings). Fetch pulls (gacha) +
 * assets (marketplace purchases) pakai JWT dari useAuth, lalu resolve lewat
 * `buildFavoriteCards`. Sinkron via `useFavorites` (event/localStorage). Semua
 * setState ada di callback async (tak ada sync-in-effect); aman SSR / tanpa token.
 *
 * Catatan: halaman yang SUDAH punya pulls/assets (mis. /account) sebaiknya pakai
 * `buildFavoriteCards` langsung agar tak fetch dobel.
 */
export function useFavoriteCards(wallet: string | null | undefined): {
  favoriteCards: FavoriteCard[];
  clearFavorites: () => void;
} {
  const { token } = useAuth();
  const { favorites: favoriteIds, clear } = useFavorites(wallet);
  const [pulls, setPulls] = useState<GachaPull[]>([]);
  const [assets, setAssets] = useState<Listing[]>([]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([
      // Assets = marketplace purchases; pulls = opened gacha packs. Kegagalan salah
      // satunya tak boleh membuang yang lain — resolve masing-masing ke [].
      getMyPurchases(token).catch(() => [] as Listing[]),
      getMyPacks(token).catch(() => [] as GachaPull[]),
    ])
      .then(([a, pk]) => {
        if (!alive) return;
        setAssets(a);
        setPulls(pk.filter((p) => p.status === "OPENED" && !!p.nftAddress));
      })
      .catch(() => {
        /* box favorit sekadar kosong — kosmetik */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const favoriteCards = useMemo(
    () => buildFavoriteCards(favoriteIds, pulls, assets),
    [favoriteIds, pulls, assets],
  );

  return { favoriteCards, clearFavorites: clear };
}
