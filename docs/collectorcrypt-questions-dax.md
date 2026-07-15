# Questions for Dax — Gacha API integration

Hi Dax. Scope on our side is narrow: **we are integrating the Gacha API only**, for pack opening. Not
the Marketplace.

The problem we solve is payment. Most Indonesians have no credit card, so international checkout simply
fails for them. They pay with QRIS, bank transfer, or e-wallets (GoPay, OVO, DANA). We take that rupiah,
convert it through IDRX to USDC, and from your side it should look like an ordinary USDC pack purchase.

We have already built the backend: a typed client on `x-api-key`, the
`generatePack → submitTransaction → openPack` flow, buyback, and our own ledger keyed on `memo`. It is
tested and ready to point at `dev-gacha` as soon as we have a key.

Everything below is what the docs and `cc-partner-test` do not answer. Where we have already made a
decision, we state it and ask you to correct us — faster than an open question.

---

## 1. The one that decides our architecture: who is the `playerAddress`?

Our user pays in rupiah, holds no USDC, and usually has no wallet at all. But `generatePack` debits
`playerAddress`, and the docs say only the player's wallet can sign.

**Q1.** Our plan: the user signs in with **email** through our Privy app, Privy provisions an embedded
Solana wallet, **we fund that wallet with USDC** from our treasury (bought with the rupiah they paid us),
and `playerAddress` is that wallet. From your side it is a normal player wallet holding normal USDC.
Is that the shape you expect from a partner, or is there a pattern you prefer?

**Q2.** Who signs? Either the embedded wallet signs in-browser, or the user grants **delegated actions**
once and our server signs on their behalf. We saw `delegated` on the wallet snapshot in
`app/connect-cc/page.tsx`, so the second looks intentional. Is server-side delegated signing acceptable
for `generatePack` purchases?

**Q3.** Does either shape affect the `memo` attribution from our `x-api-key`? We want to be certain the
packs we originate stay attributed to us.

**Q4.** We also considered making our **treasury** the `playerAddress` and setting `altPlayerAddress` to
the user, so we pay and they receive the card. We think that is wrong because the user then has no
CollectorCrypt identity. Is that reading right, or is the omnibus-payer pattern allowed?

## 2. Correctness, from having actually built it

**Q5.** `403` "blocked address" — what actually triggers it, and is the check on `playerAddress`,
`altPlayerAddress`, and `altFundsRecipient` independently? We want to surface the right message to the
user rather than a generic failure, and to know whether it is retryable.

**Q6.** `submitTransaction` is not documented as idempotent, and it waits on Solana confirmation, so our
client can time out while the purchase actually lands. We therefore **refuse to re-submit** and force
reconciliation instead, because a blind retry could charge the user twice. Is
`GET /api/pack/status?memo=` the authoritative way to find out whether the purchase landed? Is that the
recovery path you intend?

**Q7.** Your responses carry `webhook_received` / `webhook_sent` / `webhook_confirmed`, but no
partner-subscribable webhook is documented. Can we subscribe to pack lifecycle events instead of polling?

**Q8.** If a user takes the unsigned transaction from `generatePack` and broadcasts it themselves,
bypassing our `submitTransaction` call — the memo is still inside the transaction. Do we still get
attributed?

**Q9.** What are the rate limits on the Gacha endpoints?

## 3. To get moving

**Q10.** Can we get a devnet `x-api-key` now, before commercial terms are signed, so we can finish
testing against `dev-gacha`? We are ready to point at it today.

**Q11.** We will register our Privy app in your `PartnerApp` table with our origins allowlisted, per the
`cc-partner-test` README. Do you need anything from us beyond the Privy app ID and the origin? (We are
moving off `*.vercel.app` since Privy rejects Public-Suffix-List domains.)

---

---

# Lampiran — Catatan Internal

> **JANGAN DI-SHARE.**

## Kenapa daftarnya cuma segini

Dax orang teknis. Pertanyaan komersial — 50% itu gacha-only atau tidak, cara mengaudit komisi, ada pack
lebih murah dari $50 atau tidak — **bukan jatah dia, itu jatah Joe.** Menanyakan hal komersial ke CTO
cuma bikin dia meneruskan ke orang lain dan kita kehilangan satu putaran.

Semua pertanyaan yang ternyata sudah dijawab dokumentasi atau repo `cc-partner-test` sudah dibuang.
Contoh yang nyaris lolos: cara registrasi PartnerApp (README mereka menjawabnya verbatim) dan tarif
ongkir "Rest of World" (ada di tabel mereka). Menanyakan itu ke Dax = memberi tahu dia kita tidak
membaca.

## Q1 adalah taruhannya

Repo `cc-partner-test` menunjukkan jalur yang tidak ada di dokumentasi: **Privy embedded wallet +
delegated actions**. User login pakai email, Privy membuatkan wallet, user memberi delegasi sekali, lalu
server kita bisa menandatangani atas namanya. Kuncinya **tidak disimpan siapa pun** (Shamir secret
sharing di secure enclave) — jadi kita **bukan kustodian** secara regulasi, tapi tetap memenuhi syarat
"pemain menandatangani" yang diwajibkan API mereka.

Ini yang membuat janji ke Joe bisa ditepati: user cuma bayar QRIS, tidak pernah melihat kripto, dan CC
tetap melihat transaksi USDC biasa.

**Bentuk yang salah (Q4):** treasury Hoshi jadi `playerAddress` langsung. Kelihatan paling harfiah cocok
dengan kalimat "we settle the pack purchase to you in USDC", tapi user jadi tidak punya baris user di CC.
Bagus di demo, mentok begitu ada yang mau menebus kartunya. Sengaja kita ajukan sebagai pertanyaan supaya
Dax yang menolaknya, bukan kita yang menebak.

## Jangan tanya "apakah Indonesia diblokir"

Joe **sudah menjawabnya di meeting**: mereka punya banyak user Indonesia ("outsized amount... some of our
large users are actually Indonesian"), mereka kirim kartu ke Indonesia tanpa masalah, dan mereka **sedang
mencari partner di Indonesia**. Indonesia tidak diblokir — mereka justru mengejar pasar ini.

Menanyakannya = menanyakan hal yang sudah dijawab, **menanam keraguan yang tadinya tidak ada** (memancing
"coba saya cek ke legal dulu"), dan terbaca tidak percaya diri. Posisi kita kuat: kita membawa pasar yang
traffic-nya sudah mereka lihat tapi belum bisa mereka layani. Bawa diri sesuai itu.

Yang tersisa cuma Q5 versi teknis: apa yang memicu `403`, supaya kode kita menanganinya benar. Itu saja.

## Dua hal yang harus dijaga

**Demo bisa menggigit balik.** `hoshi-poc-solana.vercel.app/open-packs` masih mengundi **di browser**
dengan inventory mock, padahal ke Joe sudah disebut "a CollectorCrypt adapter mapped to your Gacha API".
Backend-nya sekarang sudah benar (`src/collectorcrypt/`, alur asli mereka, 50 test hijau) tapi demo
publiknya belum di-repoint. Kalau Dax buka network tab, klaim itu runtuh. Kalau ditanya: jawab jujur —
backend sudah jadi, tinggal butuh API key; demo publik belum diarahkan.

**Rel IDRX belum ada.** Ke Joe sudah disebut "finalizing the IDRX business onboarding right now". Di
kode, `idrx.signature.ts` baru penyiapan tanda tangan request dan belum tersambung ke controller mana
pun. Butuh akun bisnis + KYC + API key IDRX, plus integrasi PSP (Xendit/Midtrans) yang belum dimulai.
**Ini pekerjaan terbesar yang tersisa — lebih besar dari integrasi CC-nya sendiri.**
