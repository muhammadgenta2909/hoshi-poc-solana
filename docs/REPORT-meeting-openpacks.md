# Meeting Prep — Open Packs (Gacha) Progress Report

> **Untuk:** PM
> **Oleh:** Developer
> **Tanggal:** 15 Juli 2026
> **Konteks:** Ringkasan progress fitur Open Packs / Gacha — apa yang sudah dikerjakan, arsitektur, dan status saat ini.

---

## Ringkasan 1 Kalimat

Open Packs (gacha) sudah jalan end-to-end di devnet: frontend Next.js bisa menampilkan mesin dari CollectorCrypt, user login, lalu **treasury Hoshi yang membuka pack dan membayar USDC** — user menerima NFT-nya tanpa perlu wallet USDC/SOL.

---

## Apa Itu Open Packs

Fitur gacha di mana user membeli "pack" (kemasan kartu), dibuka, dan menerima kartu NFT (Solana/Metaplex Core) langsung ke wallet mereka. Di Hoshi, user **Indonesia membayar rupiah** dan tidak perlu punya USDC — treasury Hoshi yang jadi pembayar di belakang layar.

---

## Yang Sudah Dikerjakan

### 1. Backend — Gacha Service (NestJS)

Modul CollectorCrypt di `hoshi-backend/src/collectorcrypt/`:

| Komponen | File | Status | Fungsi |
|---|---|---|---|
| **GachaService** | `gacha.service.ts` | ✅ | Orkestrasi utama: generate → submit → open + ledger write-ahead |
| **GachaController** | `gacha.controller.ts` | ✅ | REST endpoint (`/api/gacha/*`) |
| **TreasuryService** | `treasury.service.ts` | ✅ | Dompet Hoshi yang membayar USDC & menandatangani transaksi |
| **CcGachaClient** | `cc-gacha.client.ts` | ✅ | HTTP client ke CollectorCrypt API |

**Endpoint yang sudah ada:**

| Method | Path | Fungsi | Auth |
|---|---|---|---|
| GET | `/api/gacha/machines` | Daftar mesin gacha (harga, odds, stock) | Publik |
| GET | `/api/gacha/stock` | Sisa stok per rarity | Publik |
| GET | `/api/gacha/winners` | 5 pemenang terakhir | Publik |
| GET | `/api/gacha/verify/:memo` | Bukti VRF on-chain | Publik |
| POST | `/api/gacha/purchase` | **Beli pack via treasury** (user tidak sign) | Admin |
| POST | `/api/gacha/packs` | Generate pack (user-bayar flow) | JWT |
| POST | `/api/gacha/packs/:memo/submit` | Submit transaksi bertanda tangan | JWT |
| POST | `/api/gacha/packs/:memo/open` | Buka pack → hasil VRF | JWT |
| GET | `/api/gacha/me/packs` | Riwayat pack user login | JWT |
| GET | `/api/gacha/packs/:memo` | Status satu pack | JWT |
| POST | `/api/gacha/buyback` | Jual balik kartu (72 jam window) | JWT |

**Alur treasury (yang dipakai untuk user Indonesia):**

```
User klik "Rip Pack"
  → POST /api/gacha/purchase { packType: "pokemon_250" }
  → Backend: snapshot harga dari /api/machines (bukan dari klien)
  → Backend: cek plafon harga & plafon harian treasury
  → Backend: WRITE-AHEAD baris ledger (sebelum dana bergerak)
  → Backend: klaim atomik GENERATED→SUBMITTING (anti double-pay)
  → Backend: tanda tangan transaksi pakai treasury keypair
  → Backend: submit ke CollectorCrypt
  → Backend: openPack (VRF on-chain) → rarity, nftAddress, nftName
  → Response: kartu dikirim ke wallet user
```

**Fitur keamanan yang sudah dibangun:**

- Plafon harga per-pack (default $100, configurable)
- Plafon belanja treasury per 24 jam (default $500)
- Write-ahead ledger — dana baru bergerak setelah ledger tertulis
- Klaim atomik anti double-pay (pola `updateMany` berpredikat status)
- Verifikasi memo ada di transaksi on-chain (`assertTransactionCarriesMemo`)
- Turbo mode ditolak di jalur treasury (anti pencucian USDC)
- Rate limit: 3x per menit untuk purchase
- Admin guard di `/purchase` (tidak bisa dipanggil user biasa)

### 2. Frontend — Open Packs UI (Next.js)

Halaman `app/open-packs/page.tsx` + komponen di `components/packs/`:

| Komponen | Fungsi |
|---|---|
| `SelectPackPanel` | Grid pilih mesin gacha |
| `PackShowcase` | Tampilan hero pack + tombol "Rip Pack" |
| `PackDetailsPanel` | Detail odds, EV, drop rate per rarity |
| `RipReveal` | Animasi reveal kartu + info NFT |
| `TopNav` | Navigasi atas |
| `LiveTicker` | Ticker kartu live (harga terakhir) |
| `WalletPill` | Tampilkan alamat wallet + balance |

**Data layer:**

- `lib/gacha.ts` — adapter mesin CC → bentuk Pack Hoshi (`machineToPack`, `pullToOpenResult`)
- `lib/openPack.ts` — logika draw lokal (fallback, sudah tidak dipakai di alur real)
- `lib/packs.ts` — tipe `Pack`, `Tier`, warna rarity, drop rate
- `lib/api.ts` — fetch wrapper, `getGachaMachines()`, `purchaseGachaPack()`
- `lib/useAuth.ts` — hook JWT + wallet login
- `lib/useWalletConnect.ts` — hook connect Phantom wallet

**Alur frontend:**

1. Mount → `GET /api/gacha/machines` → render grid mesin
2. User pilih mesin → tampilkan showcase + detail
3. User klik "Rip Pack":
   - Cek wallet connected? → kalau belum, buka modal connect
   - Cek JWT? → kalau belum, trigger wallet login (nonce → sign)
   - Cek role admin? → kalau user biasa, tolak (devnet only)
   - `POST /api/gacha/purchase` → loading overlay ~30s
   - Response `OPENED` → render `RipReveal` dengan info kartu
4. "Open Another" → tutup reveal, langsung trigger pull lagi

### 3. Integrasi Frontend ↔ Backend

Frontend sudah memanggil **endpoint real backend**, bukan draw lokal:

- `getGachaMachines()` → `GET /api/gacha/machines`
- `purchaseGachaPack(code, token)` → `POST /api/gacha/purchase`
- `pullToOpenResult()` → adapt response CC ke bentuk `OpenResult` untuk UI

Artinya demo yang diklik user sudah berjalan di jalur server-authoritative, bukan random di browser.

---

## Arsitektur (Visual)

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Next.js)                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ SelectPack   │  │ PackShowcase │  │ RipReveal        │  │
│  │ Panel        │  │ + Rip Button │  │ (animasi + NFT)  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────┘  │
│         │                 │                                 │
│         └────────┬────────┘                                 │
│                  ▼                                          │
│  lib/gacha.ts  →  lib/api.ts  →  POST /api/gacha/purchase  │
└──────────────────────────┬──────────────────────────────────┘
                           │ JWT (AdminGuard)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (NestJS) — GachaService                            │
│                                                             │
│  1. Snapshot harga dari CollectorCrypt                      │
│  2. Cek plafon (per-pack + daily cap)                       │
│  3. WRITE-AHEAD ledger (Prisma)                             │
│  4. Klaim atomik GENERATED→SUBMITTING                        │
│  5. TreasuryService.sign(transaction)                       │
│  6. CcGachaClient.submitTransaction()                       │
│  7. CcGachaClient.openPack() → VRF result                   │
│  8. Update ledger: rarity, nftAddress, nftName              │
│                                                             │
│  ┌──────────────────┐    ┌───────────────────────┐          │
│  │ TreasuryService  │    │ CollectorCrypt API     │          │
│  │ (USDC wallet)    │    │ (gacha, VRF, NFT)     │          │
│  └──────────────────┘    └───────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Status Saat Ini

| Area | Status | Catatan |
|---|---|---|
| Backend gacha service | ✅ Selesai | Build + lint lolos, hardening via review adversarial |
| Treasury service | ✅ Selesai | Lazy key loading, deserialisasi legacy + versioned tx |
| Frontend open-packs page | ✅ Selesai | Terhubung ke backend real |
| Integrasi FE ↔ BE | ✅ Selesai | `purchaseGachaPack()` memanggil endpoint real |
| Devnet testing | ✅ Berhasil | End-to-end dengan mesin CC devnet |
| Production readiness | ⚠️belum | Butuh: payment gateway IDRX, KMS, mainnet RPC |

---

## Yang Perlu Diketahui PM

1. **Saat ini hanya admin yang bisa beli pack** (`/purchase` dikunci ke `AdminGuard`). Ini karena belum ada gerbang bayar rupiah — treasury langsung mengeluarkan USDC tanpa verifikasi pembayaran. Kalau dibuka ke publik sekarang, siapa pun bisa membelanjakan treasury tanpa bayar.

2. **Treasury punya plafon harian $500** (configurable). Ini circuit breaker satu-satunya sampai payment gateway IDRX terpasang.

3. **Open Packs di demo sudah server-authoritative** — bukan random di browser. Mesinnya real dari CollectorCrypt, odds & harga real.

4. **Harga pack berasal dari CollectorCrypt**, bukan dari kita. Backend melakukan snapshot harga setiap kali ada pembelian. Kalau CC mengubah harga, otomatis terbaca.

5. **Turbo mode ditolak di jalur treasury** karena bisa menjadi pipa pencucian rupiah → USDC (user menekan satu tombol, USDC treasury keluar ke wallet user tanpa KYC).

---

## Sisa / Next Steps

| Prioritas | Item | Keterangan |
|---|---|---|
| **P1** | Payment gateway IDRX | Agar user bisa bayar rupiah → treasury beli pack |
| **P1** | Buka `/purchase` ke publik | Setelah payment gateway terpasang |
| **P2** | KMS untuk treasury key | Ganti env variable dengan secret manager |
| **P2** | Mainnet RPC | Ganti devnet publik (rate-limited) dengan provider berbayar |
| **P2** | Ledger reconciliation | Rekonsiliasi ledger kita vs status CC |
| **P3** | Idempotency key | Untuk retry safety di payment callback |
| **P3** | My Packs page (user-facing) | Riwayat pack yang sudah dibuka |
| **P3** | Buyback flow di frontend | Jual balik kartu langsung dari UI |

---

## File Terkait (untuk referensi)

| File | Lokasi |
|---|---|
| GachaService | `hoshi-backend/src/collectorcrypt/gacha.service.ts` |
| GachaController | `hoshi-backend/src/collectorcrypt/gacha.controller.ts` |
| TreasuryService | `hoshi-backend/src/collectorcrypt/treasury.service.ts` |
| Frontend page | `hoshi-poc-solana/app/open-packs/page.tsx` |
| Gacha adapter | `hoshi-poc-solana/lib/gacha.ts` |
| API wrapper | `hoshi-poc-solana/lib/api.ts` |
| Pack types | `hoshi-poc-solana/lib/packs.ts` |
