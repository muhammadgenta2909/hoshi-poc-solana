// IDRX (Indonesian Rupiah stablecoin) config + integration seam for Hoshi.
// Facts sourced from https://docs.idrx.co. IMPORTANT: live mint/redeem/rates
// calls require a business account + KYC + an API key/secret and are HMAC-SHA256
// signed — they MUST run server-side (the secret can never reach the browser).
// See docs/idrx-integration.md for the full plan; backend seam lives in
// hoshi-backend/src/idrx/idrx.signature.ts.

/** IDRX SPL-token mint on Solana (MAINNET). Devnet has no IDRX. */
export const IDRX_SOLANA_MINT = "idrxZcP8xiKkYk6XGD4uz1dxEYCWSgKDHqgjsBbwDur";

/** Deprecated older Solana mint — redeemable 1:1 through IDRX support. */
export const IDRX_SOLANA_MINT_DEPRECATED = "idrxTdNftk6tYedPv2M7tCFHBVCpk5rkiNRd8yUArhr";

/** IDRX is pegged 1:1 to IDR (1 IDRX ≈ 1 rupiah). */
export const IDRX_PEG = "IDR" as const;

/** Configured mint (from env). null ⇒ balance pill falls back to SOL. */
export const configuredIdrxMint = process.env.NEXT_PUBLIC_IDRX_MINT ?? null;
