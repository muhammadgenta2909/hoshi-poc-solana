"use client";

// Hoshi's own wallet-connect modal plumbing. Replaces the stock
// `@solana/wallet-adapter-react-ui` modal (which we can't easily reskin) with a
// small visibility context + a module-level error bus.
//
// Why an error bus? `<WalletProvider onError>` sits ABOVE this provider in the
// tree (it must, so the modal can call `useWallet`), so it can't read React
// state defined here. The bus lets the provider push a humanised message DOWN
// into the modal without threading callbacks through the whole tree.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  WalletError,
  WalletNotReadyError,
  type Adapter,
} from "@solana/wallet-adapter-base";
import WalletConnectModal from "@/components/packs/WalletConnectModal";

/* ------------------------------- error bus -------------------------------- */

type ErrorHandler = (message: string) => void;
let errorHandler: ErrorHandler | null = null;

/** The modal subscribes here; returns an unsubscribe for effect cleanup. */
export function onWalletError(cb: ErrorHandler): () => void {
  errorHandler = cb;
  return () => {
    if (errorHandler === cb) errorHandler = null;
  };
}

/** Turn a wallet-adapter error into a short, human sentence for the modal. */
export function humanizeWalletError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof WalletNotReadyError)
    return "That wallet isn’t installed. We opened its download page in a new tab.";
  // Match on the message only. Do NOT key off the WalletConnectionError type:
  // the adapters wrap EVERY connect failure (network, handshake, internal) in
  // that type, so a genuine decline is distinguished by its message text
  // ("User rejected the request."), not by the class.
  if (/reject|declin|denied|cancel/i.test(message))
    return "You declined the connection request.";
  return message || "Couldn’t connect to the wallet. Please try again.";
}

/** Passed to `<WalletProvider onError>`; preserves the adapter's default of
 *  opening the install page when a wallet isn't ready, then fans the message
 *  out to the modal (or logs it when no modal is mounted). */
export function emitWalletError(error: WalletError, adapter?: Adapter) {
  if (error instanceof WalletNotReadyError && typeof window !== "undefined" && adapter) {
    window.open(adapter.url, "_blank", "noopener,noreferrer");
  }
  if (errorHandler) errorHandler(humanizeWalletError(error));
  else console.error(error, adapter);
}

/* ------------------------------ visibility -------------------------------- */

type WalletConnectContextValue = {
  visible: boolean;
  open: () => void;
  close: () => void;
  /** Kept for drop-in parity with `useWalletModal().setVisible`. */
  setVisible: (visible: boolean) => void;
};

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ visible, open, close, setVisible }),
    [visible, open, close],
  );

  return (
    <WalletConnectContext.Provider value={value}>
      {children}
      <WalletConnectModal />
    </WalletConnectContext.Provider>
  );
}

export function useWalletConnect() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx)
    throw new Error("useWalletConnect must be used within a <WalletConnectProvider>.");
  return ctx;
}
