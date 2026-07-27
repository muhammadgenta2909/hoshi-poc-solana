"use client";

// Client-side cart (localStorage). Like useAuth, the items are exposed via
// useSyncExternalStore so they read as an empty list on the server + first
// hydration render — the TopNav cart badge is SSR'd, so this avoids a hydration
// mismatch. No backend: a POC cart that persists per browser and drives an
// "Add to Cart" toggle + a /cart page.

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Listing } from "./market";

const CART_KEY = "hoshi_cart";
const EMPTY: Listing[] = [];

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb); // cross-tab
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function safeParse(raw: string): Listing[] {
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as Listing[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

// useSyncExternalStore requires a STABLE snapshot reference when unchanged
// (returning a fresh array each call would loop). Cache by the raw string.
let cache: { raw: string | null; parsed: Listing[] } = { raw: null, parsed: EMPTY };
function getSnapshot(): Listing[] {
  const raw = localStorage.getItem(CART_KEY);
  if (raw === cache.raw) return cache.parsed;
  cache = { raw, parsed: raw ? safeParse(raw) : EMPTY };
  return cache.parsed;
}
function getServerSnapshot(): Listing[] {
  return EMPTY;
}

function read(): Listing[] {
  return getSnapshot();
}
function write(items: Listing[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

type CartContextValue = {
  items: Listing[];
  count: number;
  has: (id: string) => boolean;
  add: (listing: Listing) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((listing: Listing) => {
    const cur = read();
    if (!cur.some((x) => x.id === listing.id)) write([...cur, listing]);
  }, []);
  const remove = useCallback((id: string) => {
    write(read().filter((x) => x.id !== id));
  }, []);
  const clear = useCallback(() => write(EMPTY), []);
  const has = useCallback((id: string) => items.some((x) => x.id === id), [items]);

  return (
    <CartContext.Provider value={{ items, count: items.length, has, add, remove, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a <CartProvider>.");
  return ctx;
}
