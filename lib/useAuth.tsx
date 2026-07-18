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

/* ---- Privy logout bridge --------------------------------------------------

   A Privy (Google) session outlives our JWT: clearing the JWT alone would make
   <PrivyBridge> immediately re-mint one, so `logout()` must ALSO end the Privy
   session. The bridge registers Privy's logout here, and `logout()` flips
   `suppressAutoLogin` so the bridge doesn't re-login during the tear-down race
   (it clears once Privy reports `authenticated=false`). Module-level so the two
   sides don't need a shared React context. */
let externalLogout: (() => void | Promise<void>) | null = null;
let suppressAutoLogin = false;

/** The bridge registers Privy's logout; returns an unregister for effect cleanup. */
export function registerPrivyLogout(fn: () => void | Promise<void>): () => void {
  externalLogout = fn;
  return () => {
    if (externalLogout === fn) externalLogout = null;
  };
}
/** True right after a manual logout — blocks the bridge from auto-re-logging-in. */
export const isAutoLoginSuppressed = () => suppressAutoLogin;
/** The bridge clears this once Privy has actually signed out. */
export const clearAutoLoginSuppression = () => {
  suppressAutoLogin = false;
};

/** Signs the raw nonce bytes with whatever wallet the caller controls. */
export type MessageSigner = (message: Uint8Array) => Promise<Uint8Array>;

type AuthContextValue = {
  token: string | null;
  isAuthed: boolean;
  hydrated: boolean;
  user: LoginResponse["user"] | null;
  isAdmin: boolean;
  login: () => Promise<string>;
  /** Nonce→sign→JWT for ANY signer (wallet-adapter, or a Privy embedded wallet
   *  once Google/email login is wired). Backend /auth/* accept any address whose
   *  signature verifies, so no backend change is needed for a new login method. */
  loginWith: (address: string, signMessage: MessageSigner) => Promise<string>;
  /** The address to DISPLAY as "connected": the wallet-adapter key when a wallet
   *  is connected, else the signed-in user's wallet from the JWT. This is what
   *  lets a Privy/Google user (who has no wallet-adapter publicKey) still read as
   *  connected across the nav / vault / settings. Prefer this over
   *  `useWallet().publicKey` for DISPLAY; keep `useWallet()` for signing. */
  activeAddress: string | null;
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
  // Wallet-adapter key wins; otherwise fall back to the JWT user's wallet (a
  // Google/Privy user is authed with a real address but no wallet-adapter key).
  const activeAddress = walletAddress ?? (token ? user?.walletAddress ?? null : null);

  const isAdmin =
    user?.role === "ADMIN" ||
    (!!activeAddress && !!ADMIN_WALLET && activeAddress === ADMIN_WALLET);

  // The provider-agnostic core: nonce → sign → JWT for a given address + signer.
  const loginWith = useCallback<AuthContextValue["loginWith"]>(async (address, signMessageFn) => {
    const { message } = await requestNonce(address);
    const sig = await signMessageFn(new TextEncoder().encode(message));
    const { accessToken, user: userData } = await apiLogin(address, bs58.encode(sig));
    setStoredToken(accessToken, userData);
    return accessToken;
  }, []);

  const login = useCallback(async () => {
    if (!publicKey) throw new Error("Connect a wallet first.");
    if (!signMessage)
      throw new Error("This wallet does not support message signing.");
    return loginWith(publicKey.toBase58(), signMessage);
  }, [publicKey, signMessage, loginWith]);

  const logout = useCallback(() => {
    suppressAutoLogin = true; // block <PrivyBridge> from re-minting a session
    void externalLogout?.(); // end the Privy session too (no-op for wallet users)
    setStoredToken(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthed: !!token,
        hydrated,
        user,
        isAdmin,
        login,
        loginWith,
        activeAddress,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>.");
  return ctx;
}
