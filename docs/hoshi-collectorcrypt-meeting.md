# Hoshi × CollectorCrypt — meeting brief

Purpose: give CollectorCrypt a clear picture of what Hoshi is, what we have already
built, and the three things we want to agree on.

Sections 1–7 are in English and can be shared or put on screen. The final appendix is
in Bahasa Indonesia and is **internal only — do not share**.

---

## 1. What Hoshi is

Hoshi is a trading-card platform built for the Indonesian market. A physical graded card
sits in a vault, and the person who owns it holds an NFT on Solana that represents it.
The NFT is the transferable claim on the card; the card itself never has to move for
ownership to change hands.

Everything is priced in IDRX, a rupiah stablecoin, because our users think in rupiah and
pay in rupiah. Around that core sit three surfaces: a pack-opening experience
("Open Packs"), a secondary marketplace, and a personal vault where a collector holds,
lists, and sells what they own.

We are not trying to rebuild vaulting, grading, or liquidity. Those took you years and
real capital. We want to be the door into Indonesia.

## 2. Where we are today

Both halves of the product are deployed and reachable right now.

| | |
|---|---|
| Web app | https://hoshi-poc-solana.vercel.app |
| API | https://hoshi-backend-ozjn.onrender.com/api (OpenAPI at `/docs`) |
| Chain | Solana **devnet** — not mainnet |
| Token standard | Metaplex Core, minted via Umi |
| Stack | Next.js · NestJS · Prisma · Postgres (Neon) |

What works end to end, on chain:

**Wallet login.** The backend issues a nonce, the user signs it with their wallet, we
verify the Ed25519 signature and return a JWT. No passwords.

**Minting.** The platform keypair pays the mint fee and the asset lands in the user's
wallet with the user as owner. Metadata is hosted on Irys. A card minted this way is a
real, inspectable asset: `BdmERYifUWwPogU4QSZm52Gqr1EyWkgFXXE6Dh1kJ6Lb`.

**Vault.** A card is stored, a user claims it, and the NFT is minted to them. The claim is
atomic, so the same physical card can never be minted twice even under concurrent requests.

**Marketplace.** Listing, buying (which mints the card to the buyer), offers with
accept/reject/cancel, listing withdrawal, and an activity feed. A collector can also
re-list a card they already own straight from their vault page.

Two things we want to state plainly rather than have you discover them:

- The chain is **devnet**. Mainnet is a configuration change plus a paid RPC provider and
  permanent storage, not a rewrite — but we have not done it.
- On the live demo, the **Open Packs draw currently runs in the browser**. Our backend has
  a server-authoritative pack engine with the same odds, buyback ratio, and result shape,
  and the deployed demo does not call it yet. The demo also runs against a mock card
  inventory, not a real one. It is a faithful preview of the mechanic, not the production
  path.

## 3. Why we are talking to you

You already run the hard part: vaulting, grading trust, liquidity, and the instant-buyback
backstop. We would rather plug into your inventory than spend years and capital
reproducing it badly.

What we bring is the part a global platform does not localize easily: regional
distribution, a rupiah settlement rail, local payment habits, and local support.

## 4. What we have already built toward you

Our backend does not know where a card comes from. It talks to an `InventoryProvider`
interface with four methods, and the active provider is chosen by a single environment
variable. Three providers exist today: our own Hoshi vault, a mock source for development,
and a CollectorCrypt adapter.

That adapter is written and shaped for a two-phase handoff. We reserve a card, we deliver
it to the user's wallet, and if anything fails in between we release the hold. A card is
never awarded twice and never silently lost.

The adapter is complete except for two things: credentials, and confirmation of your real
endpoint contract. **The endpoint paths in our code are our best guess, not something you
have confirmed to us** — we assumed a pool, reserve, settle, and release shape. Until an
API key is set it refuses to run rather than fail quietly. Correcting our guesses is a
configuration task on our side, not a rebuild.

One file changes when this deal closes: `src/inventory/providers/collectorcrypt.provider.ts`.
Nothing else in our system moves.

For context, our pack tiers today are priced at IDR 10,000 / 15,000 / 50,000 / 75,000 with
a buyback ratio of 85%, chosen to sit alongside your instant-buyback rather than undercut
it. The underlying card values are placeholders pending a real price feed — yours, we hope.

## 5. What we are asking for

Three things, in order of importance to us.

**A partner API key.** Tell us how a team becomes an authorized partner and what you need
from us to issue one.

**A commission on the demand we originate.** This is the core of the conversation. When a
user opens a pack or places an order on Hoshi that is fulfilled from CollectorCrypt
inventory through your API, we want to share in that transaction. We bring you volume from
a market you do not currently serve; you fulfil it; we split the economics. Your
documentation describes per-API-key tagging on transactions, which appears purpose-built
for exactly this kind of attribution — so the mechanism may already exist. What we need
from you is the commercial shape: revenue share, referral fee, preferential partner
pricing on packs, or something else you prefer.

**Licensing scope for games.** We intend to build games on top of the collection — a
fishing-and-collecting game, and a card battle game — where a card a user owns becomes a
playable asset. Before we invest in that, we need to know where your line is:

- May cards sourced through your API be displayed and used as assets inside a game we build?
- Can a card be locked or staked in game logic for a period of time, and if so, what
  constraints do you place on that?
- Do derivative game mechanics built on your inventory need separate approval, or does a
  partner key cover them?
- While a card is committed to a game, what happens to its vault status and the owner's
  right to redeem the physical card?
- Who carries the buyback obligation for a card that was pulled through our channel and is
  currently in play?

## 6. Open questions for the call

1. How does a team become an authorized partner, and what is the process for an API key?
2. Which commercial model do you prefer, and what rate limits and SLA come with it?
3. Regional availability: you restrict some jurisdictions today. Is Indonesia open to us?
4. Can pack settlement support IDRX or rupiah, or does that bridge sit entirely on our side?
5. Can you confirm the real endpoint contract for the pool / reserve / settle / release flow,
   so we can correct our assumptions?
6. Is there a price feed we can consume for card valuation and buyback quoting?

## 7. Next steps

- A short call to walk through the demo and the adapter.
- If there is mutual interest, a sandbox API key so we can replace our assumed endpoints
  with the real ones.
- A written commercial outline covering attribution, commission, and game licensing.

---

---

# Lampiran — Catatan Internal

> **JANGAN DI-SHARE.** Bagian ini untuk pegangan kita sendiri saat meeting.

## Posisi negosiasi

Yang kita tawarkan adalah distribusi pasar Indonesia dan rel pembayaran rupiah. Itu satu-satunya
hal yang tidak mereka punya dan mahal untuk mereka bangun sendiri. Jangan pernah memposisikan diri
sebagai "pihak yang butuh API mereka" — posisi itu membuat komisi mustahil dinegosiasikan. Posisikan
sebagai kanal permintaan baru yang hari ini tidak ditangkap siapa pun.

Deal minimum yang masuk akal: **API key + attribution per-key + rev-share pada pack yang kita
originate.** Kalau rev-share ditolak, jatuhkan ke *preferential partner pricing* — kita beli pack
di harga partner, jual di harga lokal, marginnya milik kita. Itu secara ekonomi mirip komisi tapi
lebih mudah mereka setujui karena tidak menyentuh struktur revenue mereka.

Soal game: jangan minta izin terbuka. Minta **ruang lingkup tertulis**. Pertanyaan paling penting
bukan "boleh atau tidak", tapi "apa yang terjadi pada status vault dan hak redeem kartu saat kartu
itu sedang dipakai di game" — karena kalau kartu terkunci di game sementara pemiliknya bisa menarik
kartu fisiknya, seluruh mekanik game kita bocor.

## Dua risiko yang harus kita sadari

**Gacha itu area abu-abu antara game dan judi.** CollectorCrypt sendiri memblokir pengguna AS,
Inggris, dan Tiongkok atas pertimbangan ini. Kita menyasar Indonesia, yang regulasinya ketat. Ini
bukan risiko teknis, ini risiko eksistensial buat produk. Kalau mereka menanyakan kepastian hukum
kita di Indonesia, kita belum punya jawaban — jangan mengarang.

**Ekonomi pack kita saat ini rugi di semua tier.** Nilai rarity di `packs.catalog.ts` masih
placeholder, dan expected value-nya jauh di atas harga pack:

| Pack | Harga | Expected value | Rasio |
|---|---|---|---|
| N | 10.000 | ~57.300 | 5,7× |
| UC | 15.000 | ~77.640 | 5,2× |
| R | 50.000 | ~107.550 | 2,2× |
| SR | 75.000 | ~114.750 | 1,5× |

Dijalankan apa adanya, platform bakar uang tiap pack dibuka. Angka ini wajib dikalibrasi dengan
nilai kartu asli — idealnya dari price feed CollectorCrypt, yang juga jadi alasan teknis kenapa
kita butuh mereka. **Jangan sebutkan angka ini di meeting.** Kalau ditanya soal ekonomi pack, cukup
bilang model harga sedang menunggu kalibrasi terhadap nilai pasar aktual.

## Gap POC — jangan diangkat duluan, tapi siapkan jawaban

Kalau mereka menggali, ini yang akan ketemu. Lebih baik kita yang menjawab tenang daripada mereka
yang menemukan sendiri.

- **Devnet, bukan mainnet.** Naik ke mainnet butuh RPC berbayar dan storage permanen. Bukan rewrite.
- **Kunci platform ada di environment variable**, bukan di KMS. Ini tidak layak produksi dan kita tahu.
- **Belum ada settlement IDRX sungguhan.** `idrx.signature.ts` baru berupa penyiapan request-signing
  dan belum terhubung ke controller mana pun. Harga masih sekadar integer di Postgres. Butuh akun
  bisnis + KYC + API key dari IDRX.
- **Jual-ulang kartu me-mint NFT kedua** untuk kartu fisik yang sama; pemilik lama masih memegang
  aset pertama. Transfer sungguhan butuh tanda tangan pemilik atau plugin `TransferDelegate` saat
  mint. Ada `TODO(transfer)` di `marketplace.service.ts`. Kalau integrasi dengan CollectorCrypt
  jadi, masalah ini kemungkinan besar hilang — merekalah yang memegang custody dan transfer.
- **Open Packs di demo menarik undian di browser.** Backend punya mesin pack yang otoritatif, tapi
  demo yang mereka klik belum memanggilnya, dan inventory-nya mock. Ini sudah kita sebut terus terang
  di bagian 2, jadi bukan jebakan — tapi jangan sampai ada yang mendemokannya sambil bilang
  "ini server-side".

## Pertanyaan yang mungkin mereka balikkan ke kita

- Berapa proyeksi volume dari Indonesia? — kita belum punya data; jangan mengarang angka.
- Bagaimana kepastian regulasi kalian? — belum ada; katakan sedang didalami.
- Kenapa kami butuh kalian, bukan buka sendiri di Indonesia? — jawabannya rel rupiah, lokalisasi,
  dukungan lokal, dan biaya masuk pasar yang tidak sepadan buat mereka.
