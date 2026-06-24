# Hoshi POC — Solana Technical Validation — Report Meeting 3

**Status: BERHASIL.** Keempat tujuan POC terpenuhi & terverifikasi on-chain di Solana **devnet**.

## Ringkasan 1 paragraf (untuk dibawa ke meeting)

POC membuktikan alur teknis utama Hoshi berfungsi end-to-end di Solana devnet: user
connect wallet (Phantom), sign message untuk login-with-wallet, lalu klik "Claim" dan
**platform yang mint NFT (Metaplex Core) sekaligus membayar biayanya**, dengan kepemilikan
(`owner`) langsung di-assign ke wallet user. Terverifikasi on-chain: wallet user yang
saldonya **0 SOL** tetap menerima NFT yang ia miliki penuh, sementara platform memegang
update authority — persis model "vault → mint ke user" yang direncanakan. Metadata di-host
di **Irys** (Arweave-style) dan terbuka penuh (nama, gambar, atribut) di explorer. Tidak ada
blocker arsitektur; sisanya hanya item hardening produksi yang memang di luar scope POC.

## 4 tujuan validasi (dari rencana POC)

| # | Tujuan | Status | Bukti |
|---|--------|--------|-------|
| 1 | Wallet connection (Phantom + devnet) | ✅ Berhasil | Address + balance tampil di UI |
| 2 | Sign message (login-with-wallet) | ✅ Berhasil | Signature base58 dihasilkan & ditampilkan |
| 3 | Mint NFT (Core) ke devnet, owner = user | ✅ Berhasil | Asset on-chain, owner = wallet user (terverifikasi) |
| 4 | Metadata tersimpan & dibuka di explorer | ✅ Berhasil | JSON di Irys (HTTP 200), nama+gambar+atribut render di explorer |

## Bukti on-chain (devnet) — NFT untuk didemokan

- **NFT demo (metadata Irys, render penuh):** `BdmERYifUWwPogU4QSZm52Gqr1EyWkgFXXE6Dh1kJ6Lb`
  - Metaplex Core Explorer: https://core.metaplex.com/explorer/BdmERYifUWwPogU4QSZm52Gqr1EyWkgFXXE6Dh1kJ6Lb?env=devnet
- **owner** = `5UcNEuD2jMVsfuDu3xuE6yDM1r8X7BjXYAeRvd4Qa9ET` (wallet user) ✓
- **updateAuthority** = `6ab4UvyYAo5skGbN7jaMFBDUtNjA4FvWUCVPKEW7cb59` (platform) ✓
- **metadata** = `https://gateway.irys.xyz/6UNWfKd2igXWUGF7XY39Mwa7baeVwFHVdorDCaH1bjN2` (HTTP 200, JSON valid) ✓
- Poin kunci: saldo wallet user **0 SOL** → membuktikan **platform yang membayar mint**, bukan user.

> Catatan: ada beberapa NFT lama di wallet user dari iterasi awal (mis. `BJjm…`) yang masih
> pakai URI placeholder lama dan akan tampil "kosong". **Saat demo, tunjuk `BdmERYif…`** (atau
> hasil live-mint baru), bukan yang lama.

## Status per fase (Definition of Done)

- **Phase 1 — connect + balance + sign:** ✅ Selesai. Terbukti di browser nyata (Phantom, devnet).
- **Phase 2 — mint Core, owner = user:** ✅ Selesai & terverifikasi on-chain.
- **Phase 3 — dokumentasi:** ✅ README + setup guide + report ini + link transaksi tersedia; screenshot tinggal di-capture dari UI.

## Checklist hari-H (biar demo mulus)

- [ ] **Re-mint NFT segar** sebelum demo (flow ~13 detik) — metadata Irys di-host di node **devnet** yang **tidak permanen**, jadi jangan andalkan NFT lama kalau demo ditunda berhari-hari. Cukup klik "Claim" sekali → dapat asset baru ber-metadata lengkap.
- [ ] **Biarkan `npm run dev` tetap hidup** di http://localhost:3000 (jangan tutup terminal / sleep laptop). Untuk lebih stabil bisa pakai `npm run build && npm run start`.
- [ ] **Phantom di mode Devnet** (Developer Settings) → buka tab **Collectibles**, mungkin perlu reload beberapa detik setelah mint (indexer butuh waktu sebentar).
- [ ] **Siapkan link explorer NFT sebagai cadangan** kalau klik live timeout — RPC devnet publik rate-limited, mint live bisa terasa lambat/sesekali gagal.
- [ ] Sampaikan ke audiens: **gambar memang placeholder by-design** (tujuan POC = validasi teknis, bukan aset visual).

## Yang BELUM / catatan (di luar scope POC)

1. **Hardening produksi** (roadmap, bukan POC): key management platform pakai KMS/secrets
   manager (bukan `.env`), auth + rate-limit di endpoint mint, idempotency, validasi input lebih ketat.
2. **Storage permanen produksi**: pindah dari Irys **devnet** → Irys/Arweave **mainnet** (permanen),
   dan host gambar di storage permanen (bukan placeholder pihak ketiga).
3. **RPC produksi**: ganti RPC devnet publik (rate-limited) dengan provider berbayar + treasury terdanai.

## Implikasi untuk arsitektur Hoshi asli

API route `/api/mint` di POC ini adalah **stand-in untuk endpoint NestJS**. Yang terbukti:
model **backend-mint** (platform sebagai payer + update authority, user sebagai owner) layak
secara teknis dan memetakan langsung ke stack target: **Next.js (frontend) + NestJS (backend)**.

## Sengaja DI LUAR scope POC (layer berikutnya)

Token, buyback, staking, lucky draw, battle system, marketplace, redeem, candy machine.

## Stack tervalidasi

Next.js 16 (App Router, Turbopack) · `@solana/wallet-adapter-*` · `@solana/web3.js` v1 ·
Metaplex **Core** via Umi (`@metaplex-foundation/mpl-core`) · metadata via **Irys** (`umi-uploader-irys`).
