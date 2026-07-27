# Hoshi POC — Solana devnet

Technical validation that the Hoshi architecture works on Solana **devnet**. Not a
product — it proves four things end-to-end:

1. **Wallet connect** — Phantom on devnet, show address + SOL balance
2. **Sign message** — login-with-wallet proof (signature logged + shown)
3. **Mint** — a Metaplex Core NFT minted **by the platform keypair**, with `owner` = the user's wallet
4. **Metadata** — opens correctly in an explorer

See [PROJECT.md](./PROJECT.md) for the full spec and rationale.

## Stack

Next.js 16 (App Router, Turbopack) · `@solana/wallet-adapter-*` · `@solana/web3.js` v1 ·
Metaplex Core (`@metaplex-foundation/mpl-core`) via Umi · `bs58`.

## Project map

```
app/
  layout.tsx          # server layout, wraps children in <Providers>
  providers.tsx       # "use client" — Connection/Wallet/WalletModal providers
  page.tsx            # 3-step UI
  api/mint/route.ts   # server-side Core mint (Node runtime)
components/
  WalletConnect.tsx   # WalletMultiButton + address + devnet balance
  SignMessage.tsx     # sign login message -> bs58 signature
  ClaimCard.tsx       # POST /api/mint, render explorer links
lib/
  umi.ts              # server-only: Umi + platform keypair from env
```

## Setup

### 1. Install

```bash
npm install
```

### 2. Create + fund the platform keypair (devnet)

The platform pays mint rent (~0.003 SOL/asset), so its keypair needs devnet SOL.

```bash
solana-keygen new --outfile platform.json        # gitignored — NEVER commit
solana airdrop 2 $(solana-keygen pubkey platform.json) --url devnet
# if the CLI airdrop is rate-limited, use https://faucet.solana.com (paste the pubkey)
```

### 3. Host the metadata JSON

Put a public JSON file somewhere reachable (fastest: a GitHub gist → "Raw" URL).
Use [metadata.example.json](./metadata.example.json) as the shape.

### 4. Configure env

```bash
cp .env.example .env.local
```

Fill `.env.local`:

```
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
PLATFORM_SECRET_KEY=[12,34,...]      # the FULL contents of platform.json (byte array)
NEXT_PUBLIC_METADATA_URI=https://gist.githubusercontent.com/<you>/<id>/raw/metadata.json
```

> `NEXT_PUBLIC_*` vars are read at dev-server start and inlined at build time. After
> editing them, restart `npm run dev` (or rebuild). `PLATFORM_SECRET_KEY` is server-only
> and never reaches the browser.

### 5. Run

```bash
npm run dev      # http://localhost:3000
```

## Manual test checklist

**Phantom:** Settings → Developer Settings → Testnet Mode → network **Devnet**.

**Phase 1 — wallet + sign**
- [ ] Click *Select Wallet* → Phantom connects; address + SOL balance show (devnet)
- [ ] Disconnect works
- [ ] *Sign login message* → Phantom prompts; a base58 signature appears and logs to console

**Phase 2 — mint**
- [ ] *Claim Card NFT* → returns within a few seconds
- [ ] *View NFT on Metaplex Core Explorer* opens and shows the metadata (name/image/attributes)
- [ ] *View mint transaction* opens on Solana Explorer (devnet) and is confirmed
- [ ] In Phantom (devnet) the new NFT appears under the **user's** wallet, not the platform's

## Notes

- Minting is done **server-side** by the platform keypair (the user does not pay), which
  mirrors the real Hoshi flow (Next.js frontend + NestJS backend; this API route stands in
  for the NestJS endpoint).
- `wallets={[]}` is intentional: modern Phantom auto-registers as a Standard Wallet, so it
  appears in the modal without an explicit adapter.
- Out of scope for this POC: token, marketplace, staking, redeem, candy machine.
