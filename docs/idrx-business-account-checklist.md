# Pengajuan IDRX Business Account — Dokumen yang Dibutuhkan

**Untuk:** tim legal / admin perusahaan
**Dari:** Genta (Hoshi)
**Tujuan:** upgrade akun IDRX kita dari akun individu (sudah terverifikasi) menjadi
**Business Account**, supaya kita bisa mendapatkan **API Key** untuk integrasi pembayaran.

Tanpa upgrade ini, menu "API Key" tidak muncul di dashboard IDRX dan sistem pembayaran kita
tidak bisa jalan. Prosesnya makan **± 3 hari kerja** setelah dokumen lengkap dikirim, jadi mohon
diprioritaskan.

---

## Cara pengajuan

Kirim email ke **support@idrx.co** dengan subject **persis** seperti ini:

```
IDRX Business Account Application - [NAMA PERUSAHAAN]
```

Lampirkan semua dokumen di bawah dalam satu email.

> **Cara kerjanya:** Business Account BUKAN akun baru — ia meng-**upgrade** akun individu IDRX
> yang sudah kita daftarkan (atas nama pribadi founder, dengan email pribadi — ini normal dan
> memang titik awal yang benar). Saat mengajukan, gunakan **email yang sama** dengan akun individu
> itu; email pribadi tidak masalah, yang penting konsisten. Yang diverifikasi IDRX adalah **KTP
> Direktur** pada dokumen perusahaan — jadi pastikan pemegang akun individu adalah direktur, atau
> konfirmasikan dulu ke support@idrx.co bila bukan.

---

## Checklist dokumen (perusahaan Indonesia)

- [ ] **KTP Direktur** — scan/foto yang jelas
- [ ] **Akta Pendirian Perusahaan** (Akta Perusahaan)
- [ ] **Akta Perubahan** — *jika ada* perubahan setelah akta pendirian
- [ ] **SK Kemenkumham** (Surat Keputusan Kementerian Hukum & HAM)
- [ ] **NIB** (Nomor Induk Berusaha / Business Registration Number)

---

## Setelah disetujui (bagian ini dikerjakan tim teknis, bukan tim legal)

1. IDRX kirim notifikasi persetujuan ke email terdaftar.
2. Menu **"API Key"** muncul di sidebar dashboard → klik **Generate API Key**.
3. **Simpan `secret key` SEGERA** — ia hanya ditampilkan **satu kali**. Kalau hilang, harus
   di-generate ulang (dan yang lama hangus).
4. Daftarkan **Callback URL** di tab setelan API Key (menunjuk ke server backend kita).

---

## Catatan penting untuk tim teknis

- **Chain: SOLANA, bukan Base.** Dashboard IDRX default menampilkan "IDRX on Base". Sistem kita
  dibangun untuk **IDRX di Solana** (chain yang sama dengan inventory partner kita), jadi saat
  setup pastikan jaringannya Solana. Salah chain = dana masuk ke jaringan yang salah.
- `API Key`, `secret`, dan `Callback URL` adalah kredensial rahasia setingkat uang tunai —
  jangan pernah dikirim lewat chat biasa atau ditaruh di kode. Serahkan langsung ke tim teknis.

---

## Ringkasan timeline

| Langkah | Penanggung jawab | Perkiraan waktu |
|---|---|---|
| Kumpulkan 5 dokumen di atas | Tim legal/admin | — |
| Kirim email ke support@idrx.co | Genta | 1 hari |
| Verifikasi oleh IDRX | IDRX | ± 3 hari kerja |
| Generate API Key + Callback | Tim teknis | 1 hari setelah approve |
