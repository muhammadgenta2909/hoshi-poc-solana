# IDRX Integration — Plan & Prepared Seam

Status: **prepared, not live.** IDRX is the rupiah rail the PM wants Hoshi to settle
on. This captures what we learned from https://docs.idrx.co and what's already
scaffolded, so wiring it up later is mechanical.

## What IDRX is

- A stablecoin **pegged 1:1 to the Indonesian Rupiah** (1 IDRX ≈ Rp 1), backed by
  fiat reserves + government bonds.
- Multi-chain, and **it supports Solana** — which matches our stack.

## Contract / mint addresses

| Chain | Address |
|-------|---------|
| **Solana (mainnet)** | `idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur` |
| Solana (deprecated) | `idrxTdNftk6tYedPv2M7tCFHBVCpk5rkiNRd8yUArhr` (redeem 1:1 via support) |
| Polygon / BNB | `0x649a2DA7B28E0D54c13D5eFf95d3A660652742cC` |
| Base / Lisk / Etherlink / Kaia / World / Gnosis | `0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22` |

> There is **no IDRX on devnet.** The POC runs on devnet, so the on-chain IDRX
> balance / settlement can only be demoed against mainnet. Until then the app
> shows SOL (BalancePill) and treats IDRX as a 1:1 IDR display unit.

## API surface (from the docs)

Base path prefix `/api`. Key endpoints:

- **Onboarding** — `POST /api/auth/onboarding`, `GET /api/auth/members`,
  bank-account CRUD. Registers users/merchants.
- **Transactions** — `POST /api/transaction/mint-request` (IDR → IDRX),
  `POST /api/transaction/redeem-request` (IDRX → IDR, the off-ramp),
  `POST /api/transaction/bridge-request`, `GET /api/transaction/rates`,
  `GET /api/transaction/user-transaction-history`.
- **Callback** — IDRX calls us back on transaction status changes.

### Auth (already implemented in the seam)

Every request is signed: **HMAC-SHA256** over `timestamp + method + url + body`
with the base64-decoded secret, digest as base64url. Headers:
`idrx-api-key`, `idrx-api-sig`, `idrx-api-ts`.

Implemented in `hoshi-backend/src/idrx/idrx.signature.ts`
(`createIdrxSignature` + `buildIdrxRequest`). Not yet imported anywhere.

## What's BLOCKED (PM action)

Going live needs, from IDRX directly (not self-serve):

1. A **business account + KYC**.
2. An issued **API key + secret**, and the exact **API base URL**.
3. Confirmation of **fees** and the **rates** flow for IDR↔IDRX(↔USDT/USDC).

## How it plugs into Hoshi (target design)

1. **Display** (done): prices are IDRX; the "= IDR" line already treats 1 IDRX ≈ 1
   IDR. Optional: replace the hardcoded USD rate in `lib/market.ts` with a
   server-fetched `GET /api/transaction/rates`.
2. **Balance** (ready): set `NEXT_PUBLIC_IDRX_MINT` to the Solana mainnet mint and
   `BalancePill` shows the real IDRX balance.
3. **Buy settlement** (Smart Contract phase): on `POST /marketplace/:id/buy`,
   settle the price in IDRX (SPL transfer / escrow) before flipping status — the
   `buy()` TODO. Off-ramp for sellers = `redeem-request`.
4. **On-ramp**: `mint-request` lets a user top up IDRX from rupiah.

## Env

```
# frontend (.env.local)
NEXT_PUBLIC_IDRX_MINT=idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur   # mainnet only

# backend (.env) — obtain from IDRX onboarding
IDRX_API_BASE=
IDRX_API_KEY=
IDRX_API_SECRET=
```
