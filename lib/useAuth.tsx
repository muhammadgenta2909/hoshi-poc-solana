"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { login as apiLogin, requestNonce } from "./api";
import type { LoginResponse } from "./api";

const TOKEN_KEY = "hoshi_jwt";
const USER_KEY = "hoshi_user";

const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? null;

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
  return localStorage.getItem(TOKEN_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

const noopSubscribe = () => () => {};
function getHydratedClient() { return true; }
function getHydratedServer() { return false; }

function getStoredUserRaw(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function parseUser(raw: string | null): LoginResponse["user"] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as LoginResponse["user"]; } catch { return null; }
}

function setStoredToken(token: string | null, user?: LoginResponse["user"] | null) {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  listeners.forEach((l) => l());
}

type AuthContextValue = {
  token: string | null;
  isAuthed: boolean;
  hydrated: boolean;
  user: LoginResponse["user"] | null;
  isAdmin: boolean;
  login: () => Promise<string>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, getHydratedClient, getHydratedServer);
  const userRaw = useSyncExternalStore(subscribe, getStoredUserRaw, getServerSnapshot);
  const user = parseUser(userRaw);

  const walletAddress = publicKey?.toBase58() ?? null;

  const isAdmin =
    user?.role === "ADMIN" ||
    (!!walletAddress && !!ADMIN_WALLET && walletAddress === ADMIN_WALLET);

  const login = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet first.");
    if (!signMessage)
      throw new Error("This wallet does not support message signing.");

    const wallet = publicKey.toBase58();
    const { message } = await requestNonce(wallet);
    const sig = await signMessage(new TextEncoder().encode(message));
    const { accessToken, user: userData } = await apiLogin(wallet, bs58.encode(sig));

    setStoredToken(accessToken, userData);
    return accessToken;
  }, [publicKey, signMessage]);

  const logout = useCallback(() => setStoredToken(null), []);

  return (
    <AuthContext.Provider value={{ token, isAuthed: !!token, hydrated, user, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>.");
  return ctx;
}
