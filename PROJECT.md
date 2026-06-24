# Hoshi POC — Solana Technical Validation

## 📍 Status proyek (PATOKAN — update terakhir: 2026-06-24)

> File ini adalah **sumber kebenaran progress**. Setiap sesi/VS Code (walau di mesin lain) baca
> bagian ini dulu untuk tahu sudah sampai mana. Kalau ada perubahan signifikan, **update di sini**.

**Phase 1 & 2 SELESAI & terverifikasi on-chain (devnet). Keempat tujuan validasi tercapai. Demo siap.**
Ringkasan untuk meeting + checklist hari-H ada di [REPORT-meeting3.md](./REPORT-meeting3.md).

Sudah jalan & terbukti di browser/on-chain:
- ✅ Connect Phantom (devnet) + tampil address & SOL balance
- ✅ Sign message (login-with-wallet) → signature base58
- ✅ Mint Metaplex Core via `POST /api/mint`, **owner = wallet user**, platform = payer + update authority
- ✅ Metadata di-host di **Irys** (`umi-uploader-irys`), render penuh (nama+gambar+atribut) di explorer

Kode lengkap (`app/providers.tsx`, `components/*`, `app/api/mint/route.ts`, `lib/umi.ts`), `next build` lolos.
NFT demo: `BdmERYifUWwPogU4QSZm52Gqr1EyWkgFXXE6Dh1kJ6Lb` (owner `5UcNEuD2…Qa9ET`).

### Cara resume (penting jika clone di mesin lain — secret TIDAK ikut git)
`platform.json` dan `.env.local` **gitignored**, jadi tidak ada di repo. Untuk lanjut:
1. `npm install`
2. Buat keypair platform devnet → `platform.json` (via `solana-keygen` atau skrip Node `@solana/web3.js`),
   lalu fund di https://faucet.solana.com (pubkey lama: `6ab4UvyYAo5skGbN7jaMFBDUtNjA4FvWUCVPKEW7cb59`).
   Catatan: keypair baru = update authority baru; NFT lama tetap dikelola keypair lama.
3. `cp .env.example .env.local` → isi `PLATFORM_SECRET_KEY` (isi platform.json), `NEXT_PUBLIC_RPC_URL`,
   `NEXT_PUBLIC_METADATA_URI` (Irys saat ini: `https://gateway.irys.xyz/6UNWfKd2igXWUGF7XY39Mwa7baeVwFHVdorDCaH1bjN2`).
4. `npm run dev` → http://localhost:3000

### Sisa (di luar scope POC — roadmap, lihat REPORT)
Hardening produksi (KMS untuk key, auth + rate-limit endpoint, idempotency), storage permanen
(Irys/Arweave mainnet), RPC provider berbayar (bukan devnet publik yang rate-limited).

## Tujuan

POC untuk membuktikan arsitektur Hoshi bisa berjalan secara teknis di Solana **devnet**.
Bukan produk. Bukan marketplace. Hanya validasi 4 hal:

1. Wallet connection (Phantom + devnet)
2. Sign message (untuk login-with-wallet)
3. Mint NFT (Metaplex Core) ke devnet, owner = wallet user
4. Metadata tersimpan & bisa dibuka di explorer

**Konteks bisnis Hoshi:** platform menyimpan kartu fisik (vault) lalu mint NFT yang
merepresentasikan kartu tsb ke wallet user. Marketplace & redeem menyusul. Karena itu
minting dilakukan dari sisi **platform/backend** (bukan user yang bayar mint), lalu
owner di-assign ke wallet user.

## Stack (sudah diputuskan — JANGAN diganti)

- **Next.js** (App Router, TypeScript) — frontend + API route sebagai "backend" POC
- **Wallet:** `@solana/wallet-adapter-react` + `-react-ui` + `-wallets` + `-base`
- **`@solana/web3.js` v1** (install sebagai `@solana/web3.js@1`) — WAJIB v1 untuk
  kompatibilitas wallet-adapter & Umi signer. Jangan pakai v2 / `@solana/kit` di POC ini.
- **NFT: Metaplex Core** (`@metaplex-foundation/mpl-core`) via **Umi**
  (`@metaplex-foundation/umi` + `@metaplex-foundation/umi-bundle-defaults`).
  Alasan pakai Core (bukan Token Metadata): 1 account, biaya ~80% lebih murah, dan ini
  standar yang direkomendasikan Metaplex untuk project baru.
- **Uploader metadata:** mulai dengan URI statis (paling cepat), upgrade ke Irys
  (`@metaplex-foundation/umi-uploader-irys`) belakangan.
- `bs58` untuk encode signature hasil sign message.

**JANGAN pakai `@metaplex-foundation/js`** (SDK lama, deprecated). Selalu Umi.

## Arsitektur POC (alur end-to-end)

```
[Browser: connect Phantom]
  -> tampilkan address + SOL balance
  -> sign message (bukti kepemilikan wallet)
  -> klik "Claim Card NFT"
  -> POST /api/mint { ownerAddress }
[API route /api/mint (server)]
  -> Umi pakai PLATFORM keypair (dari env, JANGAN commit)
  -> create() Core asset, owner = ownerAddress, uri = metadata
  -> return { assetAddress, explorerNft, explorerTx, signature }
[Browser] tampilkan link explorer NFT yang baru di-mint
```

Ini memetakan langsung ke stack asli Hoshi: Next.js (frontend) + NestJS (backend).
API route di sini = stand-in untuk endpoint NestJS nanti.

## Struktur folder

```
hoshi-poc-solana/
  app/
    layout.tsx
    page.tsx                # UI: connect, balance, sign, claim
    providers.tsx           # WalletProvider (client only, "use client")
    api/mint/route.ts       # server-side mint Core NFT
  components/
    WalletConnect.tsx       # WalletMultiButton + address + balance
    SignMessage.tsx
    ClaimCard.tsx           # fetch /api/mint, tampil link explorer
  lib/
    umi.ts                  # (opsional) helper init Umi + platform keypair
  .env.local                # PLATFORM_SECRET_KEY, NEXT_PUBLIC_*  (jangan commit)
  .gitignore                # WAJIB ignore .env.local DAN platform.json
```

## Gotchas (penting — sering bikin error)

- wallet-adapter butuh `"use client"` di provider. Tanpa itu Next.js App Router error
  saat build/SSR. Kalau tombol wallet bikin hydration warning, bungkus render-nya pakai
  guard `mounted` (state di-set true di `useEffect`).
- Import CSS modal wajib: `import "@solana/wallet-adapter-react-ui/styles.css"`.
- RPC devnet default: `clusterApiUrl("devnet")` atau `https://api.devnet.solana.com`
  (rate-limited; nanti bisa ganti RPC provider via `NEXT_PUBLIC_RPC_URL`).
- Platform keypair butuh devnet SOL untuk bayar rent (~0.003 SOL/asset). Airdrop dulu.
- Secret key disimpan sebagai JSON array byte di env, parse dengan
  `Uint8Array.from(JSON.parse(...))`. NEVER commit.
- Server mint -> signer `keypairIdentity(platformKeypair)`.
  Browser mint pakai wallet user -> signer `walletAdapterIdentity(wallet)`
  (`@metaplex-foundation/umi-signer-wallet-adapters`). POC ini pakai yang **server**.
- Untuk assign NFT langsung ke user, `create()` mpl-core menerima param `owner`.
  Verifikasi field ini terhadap tipe versi mpl-core yang ter-install; kalau tidak ada,
  mint ke platform lalu `transferV1` ke user.

## Definition of Done

- **Phase 1 (hari 1):** connect/disconnect Phantom jalan, address + SOL balance tampil,
  sign message berhasil & signature ter-log di console.
- **Phase 2 (hari 2):** `POST /api/mint` berhasil mint Core NFT ke devnet, owner = wallet
  user, link explorer kebuka & metadata tampil benar.
- **Phase 3 (hari 3):** README + screenshot + link transaksi + catatan kendala. 1 paragraf
  ringkasan untuk dibawa ke meeting 3.

## Cara test devnet

- Phantom: aktifkan Developer Settings -> ganti network ke **Devnet**.
- Buat keypair platform & airdrop:
  ```
  solana-keygen new --outfile platform.json     # JANGAN commit
  solana-keygen pubkey platform.json
  solana airdrop 2 <PUBKEY> --url devnet         # pakai faucet web kalau rate-limited
  ```
- Isi `.env.local`:
  ```
  NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
  PLATFORM_SECRET_KEY=[12,34, ...]               # ISI dari platform.json
  NEXT_PUBLIC_METADATA_URI=https://gist.githubusercontent.com/.../metadata.json
  ```

## Contoh metadata JSON (host di gist raw / storage publik)

```json
{
  "name": "Hoshi Card #001 — Charizard",
  "description": "POC card NFT untuk validasi vault Hoshi",
  "image": "https://<public-image-url>.png",
  "attributes": [
    { "trait_type": "Set", "value": "Base" },
    { "trait_type": "Rarity", "value": "Holo Rare" }
  ]
}
```

## Yang JANGAN dikerjakan dulu (di luar scope POC ini)

Token, buyback, staking, lucky draw, battle system, marketplace, candy machine.
Itu semua layer berikutnya. Fokus: wallet + sign + mint 1 NFT ke devnet.
