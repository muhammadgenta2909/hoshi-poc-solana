// Server-only Umi helper. Imported solely by app/api/mint/route.ts (Node runtime).
// Never import this from a client component — it parses the platform secret key.
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";
import { clusterApiUrl } from "@solana/web3.js";

/**
 * Builds a Umi instance whose identity/payer is the platform keypair, with the
 * mpl-core program registered. The platform pays mint rent; ownership of the
 * minted asset is assigned to the user at create() time.
 */
export function getPlatformUmi(): Umi {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");

  const secretRaw = process.env.PLATFORM_SECRET_KEY;
  if (!secretRaw) {
    throw new Error("PLATFORM_SECRET_KEY is not set (see .env.example).");
  }

  let secret: Uint8Array;
  try {
    secret = Uint8Array.from(JSON.parse(secretRaw) as number[]);
  } catch {
    throw new Error(
      "PLATFORM_SECRET_KEY must be a JSON byte array — the full contents of platform.json.",
    );
  }

  const umi = createUmi(endpoint).use(mplCore());
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(keypair));
  return umi;
}
