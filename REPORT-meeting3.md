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

## Bukti on-chain (devnet) — live-mint dari browser (run 2026-06-26)

Demo end-to-end penuh dijalankan ulang dari browser di mesin saat ini. Keypair platform
di-generate baru di mesin ini (`28eEMis…`), beda dari run sebelumnya — wajar, karena secret
key tidak ikut git (lihat FAQ di bawah). NFT lama tetap valid, dikelola keypair lama.

- **NFT demo (metadata Irys, render penuh):** `CbQudme1VgJSUknV2C9gpRwwWVGKNVNCnyavSE1AT9h9`
  - Metaplex Core Explorer: https://core.metaplex.com/explorer/CbQudme1VgJSUknV2C9gpRwwWVGKNVNCnyavSE1AT9h9?env=devnet
- **owner** = `5UcNEuD2jMVsfuDu3xuE6yDM1r8X7BjXYAeRvd4Qa9ET` (wallet user / Phantom) ✓
- **updateAuthority** = `28eEMisTxjYRi85kx7Ui6tVWswRGAmZBTNcqYp9MqYhk` (platform, run ini) ✓
- **fee payer (tx)** = `28eEMisTxjYRi…MqYhk` (platform), fee 0.00001 SOL, status **Success / Finalized** ✓
- **metadata** = `https://gateway.irys.xyz/6UNWfKd2igXWUGF7XY39Mwa7baeVwFHVdorDCaH1bjN2` (HTTP 200, JSON valid) ✓
- **Poin kunci (tunjukkan ini):** saldo wallet user di UI = **0.0000 SOL**, tapi tetap menerima
  NFT yang ia miliki penuh → bukti **platform yang membayar mint**, bukan user.

> Catatan: NFT lama dari iterasi awal (mis. `BdmERYif…`, `BJjm…`, update authority `6ab4Uvy…`)
> masih ada & valid. **Saat demo, tunjuk hasil live-mint baru** (atau `CbQudme…`), bukan yang lama.

## FAQ — "data ini dari mana?" (jaga-jaga ditanya PM)

| Pertanyaan | Jawaban singkat |
|---|---|
| **Angka-angka di `platform.json` dari mana?** | Itu **secret key sebuah dompet Solana** yang **kita generate sendiri** pakai tool resmi (`solana-keygen` / `Keypair.generate()`). 64 angka = wujud byte dari kunci dompet. Dibuat lokal, bukan dari pihak luar. |
| **`PLATFORM_SECRET_KEY` di `.env` dari mana?** | **Isi yang sama persis** dengan `platform.json`, di-copy ke `.env.local` supaya kode server bisa membacanya. Ini dompet **"platform"** yang **membayar biaya mint** & jadi **update authority**. |
| **Link metadata (`...irys.xyz/...`) dari mana?** | Alamat sebuah **file JSON** (nama, gambar, atribut kartu) yang **kita upload ke Irys** (storage Arweave-style). NFT di-chain hanya menyimpan *link*-nya, bukan gambarnya langsung. |
| **Kok wallet user 0 SOL tapi bisa punya NFT?** | Karena yang membayar mint adalah **dompet platform**, bukan user. `owner` di-assign ke wallet user saat `create()`. Ini inti model "vault → mint ke user" Hoshi. |
| **Gambarnya kok placeholder?** | **Sengaja (by-design).** Tujuan POC = validasi teknis (wallet+sign+mint+metadata), bukan aset visual. |

### Implementasi aslinya nanti gimana? (3 hal berubah saat produksi/mainnet)

1. **Secret key** → TIDAK di file `.env`. Dipindah ke **KMS / Secret Manager** (mis. AWS KMS).
2. **Backend** → API route Next.js POC ini diganti **endpoint NestJS** asli Hoshi. Alur tetap sama.
3. **Storage & RPC** → metadata ke **Irys/Arweave mainnet** (permanen) + **RPC provider berbayar**
   (bukan devnet publik yang rate-limited).

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
