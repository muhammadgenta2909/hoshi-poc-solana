import { NextResponse, type NextRequest } from "next/server";
import { create } from "@metaplex-foundation/mpl-core";
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { getPlatformUmi } from "@/lib/umi";

// Pin the Node.js runtime: this route reads process.env secrets and uses
// Node-only Solana/Umi libraries. (Node is the default, but make it explicit.)
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ownerAddress?: unknown };
    const ownerAddress = body.ownerAddress;
    if (typeof ownerAddress !== "string" || ownerAddress.length === 0) {
      return NextResponse.json(
        { error: "ownerAddress (wallet pubkey) is required" },
        { status: 400 },
      );
    }

    const metadataUri = process.env.NEXT_PUBLIC_METADATA_URI;
    if (!metadataUri) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_METADATA_URI is not set (see .env.example)." },
        { status: 500 },
      );
    }

    const umi = getPlatformUmi();
    const asset = generateSigner(umi);

    // Platform signs/pays; `owner` assigns the asset directly to the user.
    const { signature } = await create(umi, {
      asset,
      name: "Hoshi Card #001 — Charizard",
      uri: metadataUri,
      owner: publicKey(ownerAddress),
    }).sendAndConfirm(umi);

    // sendAndConfirm returns the signature as a Uint8Array — decode to base58.
    const sig = base58.deserialize(signature)[0];
    const assetAddress = asset.publicKey.toString();

    return NextResponse.json({
      assetAddress,
      signature: sig,
      explorerNft: `https://core.metaplex.com/explorer/${assetAddress}?env=devnet`,
      explorerAddress: `https://explorer.solana.com/address/${assetAddress}?cluster=devnet`,
      explorerTx: `https://explorer.solana.com/tx/${sig}?cluster=devnet`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Mint failed";
    console.error("[/api/mint] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
