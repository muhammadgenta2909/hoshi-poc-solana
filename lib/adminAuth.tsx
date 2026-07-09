"use client";

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { API_BASE } from "./api";

const ADMIN_TOKEN_KEY = "hoshi_admin_token";

// DEV-ONLY escape hatch. `NEXT_PUBLIC_*` is inlined into the client bundle at
// build time, so shipping this secret would let anyone read it out of the JS and
// unlock the admin shell. (The backend's AdminGuard still rejects the fake
// "admin_auth" token, so no data leaks — but the UI shouldn't open at all.)
// In production this is "" and the branch below is dead: only a real JWT from
// POST /admin/login works.
const envAdminSecret =
  process.env.NODE_ENV === "development" ? process.env.NEXT_PUBLIC_ADMIN_SECRET || "" : "";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

function setStoredToken(token: string | null) {
  if (token === null) localStorage.removeItem(ADMIN_TOKEN_KEY);
  else localStorage.setItem(ADMIN_TOKEN_KEY, token);
  listeners.forEach((l) => l());
}

type AdminAuthValue = {
  token: string | null;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as { accessToken: string };
        setStoredToken(data.accessToken);
        return;
      }
    } catch {
      // fall through to env secret fallback
    }

    if (envAdminSecret && password === envAdminSecret) {
      setStoredToken("admin_auth");
      return;
    }

    throw new Error("Invalid admin credentials.");
  }, []);

  const logout = useCallback(() => setStoredToken(null), []);

  return (
    <AdminAuthContext.Provider value={{ token, isAdmin: !!token, hydrated: true, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>.");
  return ctx;
}
