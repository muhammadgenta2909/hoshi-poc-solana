# Hoshi — Technical Validation (Solana) — Progress Report

> **Alias:** "Apakah semua yang kita gambar bisa benar-benar dibuat?"
> Sambil menunggu UI/UX, fokus dialihkan ke **validasi teknis**. Dari 5 kandidat pekerjaan,
> diambil **2 prioritas tertinggi** (POC Wallet + POC Mint NFT) — dan **keduanya berhasil**.

**Status: SELESAI & terverifikasi on-chain di Solana devnet.** Tidak ada blocker arsitektur.

---

## Ringkasan 1 paragraf (untuk meeting)

Validasi teknis Solana + NFT minting **berhasil end-to-end di devnet**. User bisa connect
Phantom, baca address & balance, sign message (login-with-wallet), lalu **platform yang mint
NFT (Metaplex Core) sekaligus membayar biayanya**, dengan kepemilikan (`owner`) langsung
di-assign ke wallet user. Terverifikasi on-chain: wallet user **bersaldo 0 SOL pun tetap
menerima NFT yang ia miliki penuh**, sementara platform memegang update authority — persis
model "vault → mint ke user" yang dirancang Hoshi. Metadata di-host di **Irys** (Arweave-style)
dan render penuh (nama + gambar + atribut) di explorer. Arsitektur target (**Next.js + NestJS +
PostgreSQL**) terbukti layak; sisanya hanya item hardening produksi yang memang di luar scope POC.

---

## ✅ Yang sudah dikerjakan (DONE)

### 1. POC Wallet + Solana — *prioritas #1*

| Target | Status |
|---|---|
| Connect wallet (Phantom, devnet) | ✅ |
| Disconnect wallet | ✅ |
| Get wallet address | ✅ |
| Get balance (SOL) | ✅ |
| Sign message (login-with-wallet) → signature base58 | ✅ |

→ *"Koneksi wallet Solana sudah tervalidasi, tidak ada kendala."*

### 2. POC Mint NFT — *prioritas #2 (inti bisnis)*

| Target | Status |
|---|---|
| Mint NFT (Metaplex **Core**) ke devnet | ✅ |
| Owner = wallet user | ✅ |
| Platform = payer + update authority (model backend-mint) | ✅ |
| Metadata tersimpan (Irys) & dibuka di explorer | ✅ |

→ *"NFT flow terbukti bisa dijalankan: Mint → Metadata → Wallet user."*

### Bukti on-chain (devnet — live-mint dari browser)

- **NFT demo:** `CbQudme1VgJSUknV2C9gpRwwWVGKNVNCnyavSE1AT9h9`
  - Explorer: https://core.metaplex.com/explorer/CbQudme1VgJSUknV2C9gpRwwWVGKNVNCnyavSE1AT9h9?env=devnet
- **owner** = `5UcNEuD2…Qa9ET` (wallet user / Phantom) ✓
- **updateAuthority** = `28eEMis…MqYhk` (platform) ✓ — fee payer juga platform, status **Success / Finalized**
- **metadata** = `https://gateway.irys.xyz/6UNWfKd2igXWUGF7XY39Mwa7baeVwFHVdorDCaH1bjN2` (HTTP 200, JSON valid) ✓
- **Poin kunci:** saldo wallet user **0 SOL** tapi tetap memiliki NFT → bukti **platform yang membayar mint**, bukan user.

### Stack tervalidasi

Next.js 16 (App Router, TypeScript) · `@solana/wallet-adapter-*` · `@solana/web3.js` v1 ·
Metaplex **Core** via Umi (`@metaplex-foundation/mpl-core`) · metadata via **Irys**
(`umi-uploader-irys`). `next build` lolos. API route `/api/mint` = stand-in untuk endpoint
NestJS asli → memetakan langsung ke stack target Hoshi.

---

## Posisi terhadap 5 rekomendasi awal

| # | Rekomendasi | Status |
|---|---|---|
| 1 | POC Wallet + Solana | ✅ **Selesai** |
| 2 | POC Mint NFT (Mint → Metadata → Wallet) | ✅ **Selesai** |
| 3 | Database Production Draft (ERD → migration NestJS) | ⬜ Next |
| 4 | Smart Contract / Program Mapping | ⬜ Next |
| 5 | API Layer Design (draft endpoint) | ⬜ Next |

**Di luar scope (layer berikutnya, sengaja ditunda):** Token, buyback, staking, lucky draw,
battle system, marketplace, redeem, candy machine.

---

## ⬜ Next Steps (yang akan saya kerjakan)

### A. Database Production Draft *(rek. #3)*
Wujudkan ERD jadi schema PostgreSQL nyata + migration NestJS:
`users · wallets · cards · vault_cards · nfts · listings · transactions · redemptions`.
→ Output: *"Database schema sudah siap untuk MVP."*

### B. Smart Contract / Program Mapping *(rek. #4 — mapping dulu, belum coding Rust)*
Petakan program & fungsi sebelum tulis Rust:
- **Mint** → `mintCardNFT()`
- **Marketplace** → `createListing()`, `buyNFT()`, `cancelListing()`
- **Redeem** → `requestRedeem()`, `burnNFT()`

### C. API Layer Design *(rek. #5)*
Draft endpoint NestJS agar bentuk produk mulai kelihatan:
`POST /cards/submit` · `GET /cards` · `POST /nft/mint` · `POST /listing` · `POST /purchase` · `POST /redeem`.

### D. Hardening produksi (saat naik ke MVP/mainnet)
1. **Key management** — secret key platform pindah dari `.env` ke **KMS / Secret Manager** (mis. AWS KMS).
2. **Endpoint** — `/api/mint` (Next.js POC) diganti **endpoint NestJS** asli + auth + rate-limit + idempotency.
3. **Storage & RPC** — metadata ke **Irys/Arweave mainnet** (permanen) + **RPC provider berbayar** (bukan devnet publik rate-limited).

---

*Detail demo & checklist hari-H ada di [REPORT-meeting3.md](./REPORT-meeting3.md).*
