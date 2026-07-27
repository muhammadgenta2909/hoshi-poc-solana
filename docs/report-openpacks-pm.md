# Hoshi — Open Packs × CollectorCrypt: Laporan Progress & Roadmap

**Untuk:** meeting internal dengan PM
**Update:** 15 Juli 2026
**Status singkat:** Inti Open Packs **terbukti jalan end-to-end di devnet** dan sudah tersambung ke web. Sekarang menunggu **akun bisnis IDRX** (untuk pembayaran rupiah asli) dan beberapa hal dari CollectorCrypt.

---

## 1. Ringkasan (buat yang cuma baca satu bagian)

Kita membuktikan hal terpenting: **orang Indonesia yang tidak punya kripto sama sekali bisa membuka pack dan menerima NFT kartu graded asli.** Hoshi yang membayar (USDC ke CollectorCrypt), user cukup punya wallet untuk menerima kartunya — tidak perlu USDC, tidak perlu tanda tangan, tidak perlu paham kripto.

Ini bukan simulasi. Satu pack sungguhan sudah dibuka lewat API asli CollectorCrypt di devnet: treasury bayar $250, kartu **Zubat PSA 9** mendarat di wallet, komisi tercatat. Alur ini sekarang sudah tersambung ke halaman Open Packs di web.

Yang belum: pembayaran rupiah (QRIS) masih menunggu akun bisnis IDRX aktif, dan kita masih di **devnet** (uang mainan), belum mainnet.

---

## 2. Yang sudah jadi & terbukti

| Area | Status | Catatan |
|---|---|---|
| Integrasi Gacha API CollectorCrypt | ✅ Terbukti (devnet) | API key resmi dari CTO mereka; alur beli–buka pack jalan lewat API asli |
| Model "treasury bayar, user tanpa kripto" | ✅ Terbukti | Treasury menandatangani di server; user tidak menyentuh kripto |
| Kartu asli mendarat di wallet user | ✅ Terbukti on-chain | Zubat PSA 9, bisa dicek siapa pun di Solana Explorer |
| Pencatatan komisi (ledger `memo`) | ✅ Jadi | Catatan independen tiap pack — dasar klaim bagi hasil 50% |
| Rel pembayaran IDRX (rupiah → USDC) | ✅ Kode jadi | Anti pembayaran palsu & anti dobel-bayar; menunggu kredensial IDRX untuk aktif |
| Halaman Open Packs tersambung ke backend | ✅ Deploy | Menampilkan 8 mesin asli CC; animasi pack (mp4) dipertahankan |
| Backend & frontend ter-deploy | ✅ Live | Backend di Render, web di Vercel |

**Bonus dari proses:** karena kita menembak API asli (bukan cuma baca dokumentasi), kita menemukan & memperbaiki **tiga bug yang tidak akan ketahuan dari dokumen** — salah satunya salah satuan harga yang nyaris menagih user **Rp 0,04 untuk pack seharga $50**. Ketiganya sudah beres dan dikunci dengan test.

---

## 3. Cara kerjanya (buat dijelaskan ke tim)

```
User pilih pack
  → bayar rupiah (QRIS / GoPay / OVO / DANA / transfer bank)
  → rupiah dikonversi ke IDRX lalu ke USDC (Hoshi yang menanggung kurs & rel lokal)
  → treasury Hoshi bayar USDC ke CollectorCrypt & tanda tangan di server
  → kartu NFT mendarat di wallet user
  → komisi 50% tercatat lewat `memo`
```

Buat user rasanya cuma **"bayar QRIS, dapat kartu"** — lapisan kripto tak kelihatan. Buat CollectorCrypt, ini transaksi USDC biasa. **Di situlah nilai kita: rel rupiah + distribusi Indonesia** — bagian yang tidak bisa mereka lokalkan sendiri.

---

## 4. Yang sedang ditunggu (blocker eksternal)

Ini bagian penting buat PM — hal-hal yang **bukan soal koding**, tapi menahan langkah berikutnya:

**a. Akun Bisnis IDRX** — *± 3 hari kerja setelah dokumen lengkap dikirim.*
Tanpa ini, menu "API Key" tidak muncul di dashboard IDRX, jadi pembayaran rupiah (QRIS) belum bisa aktif. Butuh upgrade dari akun individu ke bisnis: kirim 5 dokumen perusahaan (KTP direktur, Akta Pendirian, Akta Perubahan, SK Kemenkumham, NIB) ke support@idrx.co. **Ini pekerjaan terbesar yang tersisa** dan sebaiknya diprioritaskan karena makan waktu paling lama.

**b. Dari CollectorCrypt (via CTO mereka, Dax):**
- **Mesin devnet yang lebih murah/terdanai** — saat ini di devnet cuma pack **$50** dan **$250** yang benar-benar bisa ditarik; sisanya "kosong". Sudah bisa dites, tapi idealnya minta mereka danai mesin murah biar tes tidak mahal.
- **Perjanjian komersial tertulis** — struktur bagi hasil 50% (jalur teknisnya sudah ada lewat `memo`) → ini ranah negosiasi dengan Joe (BD mereka), bukan Dax.
- **Izin pemakaian kartu untuk game** — kalau nanti kita bikin game (fishing/battle) yang memakai kartu.

**c. Naik ke mainnet** — butuh keypair treasury baru (bukan yang devnet), USDC asli, dan RPC berbayar. Ini perubahan konfigurasi, bukan tulis ulang.

---

## 5. Yang bisa dites sekarang

- **Halaman Open Packs** (web): menampilkan mesin asli CollectorCrypt dengan harga/odds/stok sungguhan. Admin bisa melakukan **tarikan devnet asli** — kartu mendarat di wallet, dengan animasi pack yang sudah dibuat.
- **Bukti kartu di blockchain:** kartu Zubat dari tes bisa dilihat di Solana Explorer (nyata, bisa diperiksa).
- **API backend** (Swagger `/docs`): daftar endpoint gacha & pembayaran yang sudah live.

*Catatan tes:* tarikan asli butuh ~30 detik (backend mengerjakan generate → tanda tangan treasury → submit → buka pack dalam satu panggilan). Treasury devnet punya **~$750 USDC** = cukup **±15 tarikan** pack $50 untuk demo.

---

## 6. Roadmap

**Fase 1 — Integrasi inti** ✅ SELESAI
Gacha API tersambung & terbukti · treasury-pays · ledger komisi · web tersambung · ter-deploy.

**Fase 2 — Rel pembayaran rupiah** 🔄 SEDANG BERJALAN
Kode IDRX sudah jadi. Menunggu **akun bisnis IDRX** aktif → isi kredensial → user bisa bayar QRIS sungguhan. *Ini yang paling menentukan kapan produk bisa dipakai orang Indonesia beneran.*

**Fase 3 — Polish & uji publik** ⏭️ BERIKUTNYA
Perbaikan tampilan/UX Open Packs · pesan error yang lebih ramah · uji end-to-end pembayaran rupiah begitu IDRX aktif · (opsional) promote wallet tim lain jadi admin untuk ikut tes.

**Fase 4 — Mainnet & komersial** ⏭️ BERIKUTNYA
Keypair treasury produksi · USDC asli · RPC berbayar · perjanjian komersial 50% dengan CollectorCrypt diteken · storage permanen.

**Fase 5 — Ekspansi** 🔮 NANTI
Game di atas koleksi (fishing/battle) · Marketplace & Vault disempurnakan (pondasinya sudah jalan) · kalibrasi ekonomi pack.

---

## 7. Risiko & catatan jujur (jangan ditutupi ke tim)

- **Masih devnet, bukan mainnet.** Semua yang jalan sekarang pakai uang mainan. Naik mainnet butuh langkah Fase 4.
- **Pembayaran rupiah belum aktif.** Rel-nya (yang jadi seluruh alasan Hoshi ada) menunggu akun IDRX. Sampai itu beres, user asli belum bisa bayar.
- **Ekonomi pack perlu kalibrasi.** Pack termurah CollectorCrypt yang aktif saat ini **$50** (~Rp 800.000) — berat untuk pasar kita. Perlu didorong ke mereka soal pack lebih murah, dan model harga kita perlu dihitung ulang terhadap nilai kartu asli.
- **Gacha = area abu-abu regulasi** (antara game dan judi). CollectorCrypt sendiri memblokir beberapa negara. Kita menyasar Indonesia yang regulasinya ketat — ini risiko produk, bukan teknis, dan perlu kepastian hukum.
- **Manajemen kunci treasury** belum pakai KMS (masih env var) — wajar untuk devnet, tapi harus dibenahi sebelum mainnet karena treasury memegang uang asli.

---

## 8. Yang butuh keputusan / bantuan tim

1. **Percepat dokumen IDRX** — ini jalur kritis paling lambat. Siapa yang urus dokumen perusahaan?
2. **Margin & harga jual** — keputusan sekarang: **tanpa markup** (harga = harga CC, pendapatan murni dari komisi 50%). Perlu dikonfirmasi apakah ini strategi yang mau dipegang.
3. **Kepastian regulasi gacha di Indonesia** — perlu didalami sebelum publik.
4. **Siapa saja yang perlu akses tes** — kalau PM/tim lain mau ikut buka pack di web, tinggal daftarkan wallet-nya jadi admin devnet.

---

*Semua klaim di dokumen ini bisa diperiksa langsung: kartu di Solana Explorer, endpoint di Swagger, dan halaman Open Packs di web. Tidak ada yang di-overclaim — begitu ada yang mencoba, semuanya nyata.*
