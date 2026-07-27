// SPL-token balance helpers shared by the account menu and the settings
// balance tab. One place to own the mint constants so "real balance" always
// means the same mint everywhere.

import { type Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

/** USDC mint, network-configurable so going to mainnet is an ENV change, not a
 *  code edit. Defaults to Circle's DEVNET USDC (this POC runs on devnet). For
 *  mainnet set NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v.
 *  Kept named `DEVNET_USDC_MINT` for its call sites; the value is the configured
 *  mint for whatever network the deploy targets. */
export const DEVNET_USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Sum of all the owner's token accounts for `mint`, in UI units (not base
 *  units). 0 when the owner holds no account for the mint. */
export async function fetchSplBalance(
  connection: Connection,
  owner: PublicKey,
  mint: string,
): Promise<number> {
  const res = await connection.getParsedTokenAccountsByOwner(owner, {
    mint: new PublicKey(mint),
  });
  return res.value.reduce(
    (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0,
  );
}

/** Owner's SOL balance in SOL (not lamports). */
export async function fetchSolBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<number> {
  const lamports = await connection.getBalance(owner, "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

// ONE precision per unit, used everywhere a balance is shown (top-bar pill,
// account dropdown, settings) so the SAME wallet never reads 0.998 in one place
// and 1.00 in another. SOL keeps 3 dp (0.998 stays honest, not rounded to 1.00);
// USDC uses its native 2 dp.
export const formatSol = (n: number): string => n.toFixed(3);
export const formatUsdc = (n: number): string => n.toFixed(2);
