# Privy — Google/email login + embedded Solana wallet (activation guide)

Goal: let Indonesian users sign in with **Google/email** (no Phantom needed) and
automatically get a **Solana wallet** under the hood, so pulled cards are real
NFTs they own and the QRIS/IDRX payment flow has a wallet to mint to.

## Why this is staged (not auto-installed)

Privy's embedded wallet has **no official `@solana/wallet-adapter-react` bridge**
(confirmed against Privy docs, 2026). The whole app currently reads the wallet via
`useWallet()` (wallet-adapter). So Privy is a real integration, not a drop-in — and
it can't be verified without your Privy **App ID**. To avoid breaking the working
Phantom flow, the safe, dependency-free groundwork is already in `main`:

- **`useAuth().loginWith(address, signMessage)`** — provider-agnostic nonce→sign→JWT.
  A Privy embedded wallet can call this directly; the backend `/auth/*` accepts any
  address whose signature verifies, so **no backend change is needed**.
- **`NEXT_PUBLIC_PRIVY_APP_ID`** env var is documented in `.env.example`.

The steps below are the remaining, credential-gated work.

## Prerequisites (you do these once)

1. Create an app at https://dashboard.privy.io → copy the **App ID**.
2. Dashboard → **Login Methods → OAuth** → enable **Google**.
3. Dashboard → **Embedded wallets** → enable **Solana**, "create on login".
4. Put `NEXT_PUBLIC_PRIVY_APP_ID=<app id>` in `.env.local` (and in Vercel env).

## Step 1 — install (do at a stopping point; adds web3.js v2 peer deps)

```bash
npm install @privy-io/react-auth @solana/kit @solana-program/memo @solana-program/system @solana-program/token
```

## Step 2 — env-gated provider (new file `app/PrivyProviders.tsx`)

Only wraps children when the App ID is set, so with Privy off the app is byte-for-byte unchanged.

```tsx
"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import type { ReactNode } from "react";

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export default function PrivyProviders({ children }: { children: ReactNode }) {
  if (!APP_ID) return <>{children}</>; // inert until configured
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        embeddedWallets: { createOnLogin: "all-users" },
        solana: {
          rpcs: {
            // key the cluster you deploy to; devnet shown here
            "solana:devnet": {
              rpc: createSolanaRpc(RPC),
              rpcSubscriptions: createSolanaRpcSubscriptions(RPC.replace("https", "wss")),
            },
          },
        },
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

Mount it in `app/providers.tsx` OUTSIDE `AuthProvider` (so the button can read Privy):
wrap the existing tree with `<PrivyProviders>…</PrivyProviders>`.

## Step 3 — "Continue with Google" button (bridges Privy → our JWT)

Add to the connect modal (`components/packs/WalletConnectModal.tsx`, shown only when
`NEXT_PUBLIC_PRIVY_APP_ID` is set):

```tsx
"use client";
import { usePrivy, useLoginWithOAuth } from "@privy-io/react-auth";
import { useWallets, useSignMessage } from "@privy-io/react-auth/solana";
import { useAuth } from "@/lib/useAuth";

function GoogleLogin() {
  const { ready, authenticated } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { loginWith } = useAuth();

  const go = async () => {
    if (!authenticated) await initOAuth({ provider: "google" }); // creates embedded wallet
    const w = wallets.find((x) => x.standardWallet?.name === "Privy");
    if (!w) return;
    // loginWith wants (address, (bytes) => Promise<bytes>)
    await loginWith(w.address, async (msg) => {
      const { signature } = await signMessage({ message: msg, wallet: w });
      return signature; // Uint8Array
    });
  };

  if (!ready) return null;
  return <button onClick={go}>Continue with Google</button>;
}
```

After `loginWith` resolves, our JWT is stored and every existing API call works.

## Step 4 — show the Google user as "connected" (display bridge)

Components read `useWallet().publicKey` for the address; a Privy user won't have that.
Minimal fix: expose an **`activeAddress`** from `useAuth` = `useWallet().publicKey?.toBase58()`
**or** the JWT user's `walletAddress` (already stored on login), and use it in `TopNav`,
`AccountMenu`, `Vault` gate, and the `open-packs` gate instead of `publicKey`. This is the
only multi-file change; keep it small by adding the helper in `useAuth` and swapping reads.

## Step 5 — verify

`npm run build` must pass with the deps installed. Then, with a real App ID: Google login →
embedded wallet created → `loginWith` yields a JWT → Vault/settings load → pull/pay works.

> Contact point: everything up to Step 1 is already merged. Ping me when you have the App ID
> and I'll execute Steps 1–5 and test end-to-end together.
