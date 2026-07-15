# Questions for CollectorCrypt — API integration

Context: we have already built an inventory abstraction on our backend with a
CollectorCrypt adapter in place. The adapter is complete except that its endpoint
contract is **our assumption, not something you have confirmed**. These questions are what
we need answered to replace those assumptions with your real contract.

Questions are numbered so you can reply inline. Q1 is the one that shapes everything else.

---

## A. The draw itself

**Q1. Who owns the draw?**
Our current design fetches the pool of cards eligible for a pack, runs a weighted random
draw on our server, and then reserves the specific card the user won. Your API appears to
work the other way: `generatePack` and `openPack` suggest that CollectorCrypt owns the
randomness and returns the result.

Which is it? Concretely: can a partner read a card pool and select the winner, or does the
partner call an endpoint that returns an already-drawn card?

*Why it matters: it decides who controls odds, expected value, and buyback exposure. It is
the difference between a configuration change and a redesign on our side.*

**Q2. If you own the draw, can a partner configure the odds and the card pool per pack, or
are packs fixed products defined by CollectorCrypt?**

**Q3. Is the draw provably fair — a commit-reveal seed, a VRF, or an on-chain program a
user can verify after the fact? If so, how does a partner surface that proof to the user?**

**Q4. Is there a pack price in your API, and in what currency is it denominated? Can a
partner set its own retail price on top?**

## B. Reservation, delivery, and failure

**Q5. Does a reservation or hold primitive exist?**
Our adapter assumes a two-phase flow: reserve a card, deliver it, and release the hold if
delivery fails. If your API has no reserve step, what prevents the same physical card from
being awarded twice under concurrent partner traffic?

**Q6. If holds exist, what is their TTL, and what happens when it expires?**

**Q7. Do you support idempotency keys on the endpoints that move a card?**
Specifically: if our `settle` request times out and we never see your response, how do we
determine whether the card was delivered, without risking a double award on retry? Is
there a lookup by our client-supplied request id?

**Q8. Where does the card land?**
Can you transfer the asset directly to an arbitrary Solana wallet address we supply, or
must the recipient already hold a CollectorCrypt account? If a CollectorCrypt account is
required, what does partner-side onboarding look like?

**Q9. What token standard is the delivered asset?**
Ours is Metaplex Core. If yours are Token Metadata programmable NFTs (pNFTs), we need to
know before we build transfer and marketplace logic around them.

**Q10. Which network — mainnet only? Is there a devnet or sandbox environment with test
credentials and fake inventory that we can develop against?**

**Q11. What is your error contract?** A list of error codes and which of them are safe to
retry would save us a great deal of guesswork.

## C. Attribution and commercials

**Q12. Confirm the per-API-key transaction tagging described in your docs.**
Is the tag written on-chain as a memo, recorded off-chain in your systems, or both? Can a
partner query their own attributed transactions over a date range?

**Q13. What is the reporting surface for a partner?**
Is there an endpoint or dashboard that shows volume and revenue attributed to our key, and
at what latency?

**Q14. Are rate limits, quotas, and any SLA tied to the API key, and what are they?**

**Q15. Is regional restriction enforced on your side, at the API, or is a partner
responsible for enforcing it?** You restrict some jurisdictions today. We need to know
whether an Indonesian user hitting your API through us is blocked by you, or whether
compliance is delegated to us.

## D. Buyback, marketplace, vault

**Q16. Is instant buyback exposed through the API?**
Can a user who pulled a card through our channel sell it back to you from inside our
product? Who quotes the price, who pays, and does the partner participate in that
transaction economically?

**Q17. Is there a price feed for card valuation?**
We need a market value per card for expected value and buyback quoting. Today our numbers
are placeholders. Is there an API for this, and what is the update cadence?

**Q18. Does the Marketplace API let a partner list or purchase your vaulted inventory on
behalf of a user, or is it read-only?**

**Q19. Vault and shipping: can a user redeem the physical card to an Indonesian address?**
Who is the shipper of record, and what does the API expose about that process?

## E. Games and derivative use

We plan to build games on top of the collection — a fishing-and-collecting game, and a card
battle game — where a card a user owns becomes a playable asset.

**Q20. May cards sourced through your API be displayed and used as assets inside a game
built by a partner? Does a partner API key cover derivative mechanics, or does that need
separate approval?**

**Q21. Can a card be locked, escrowed, or delegated for a period of time through your API,
so it cannot be sold or redeemed while it is committed to a match or an expedition?**
If a delegate or freeze authority mechanism exists, we would like to understand it.

**Q22. While a card is committed to a game, what happens to its vault status and to the
owner's right to redeem the physical card?**
If the owner can pull the physical card mid-match, the game's economy breaks. This is the
single question that decides whether the game is buildable.

**Q23. Who carries the buyback obligation for a card that was pulled through our channel
and is currently in play?**

## F. Getting started

**Q24. How does a team become an authorized partner, and what do you need from us to issue
an API key?**

**Q25. Is there a written API specification (OpenAPI, Postman collection) you can share
under NDA, so we can align our adapter before any commercial terms are signed?**

---

### For reference — what our adapter currently assumes

These are the paths we guessed. We expect them to be wrong; correcting them is a
configuration change on our side.

| Our method | Assumed call | Purpose |
|---|---|---|
| `listAvailable(packId)` | `GET /gacha/pool?packId=` | cards eligible for a pack |
| `reserve(card)` | `POST /gacha/reserve` | exclusive short-lived lock on one card |
| `deliver(hold, recipient)` | `POST /gacha/settle` | transfer the asset to the user's wallet |
| `release(hold)` | `POST /gacha/release` | drop the lock when a draw is cancelled |

Auth is assumed to be a bearer API key. The adapter refuses to run until
`COLLECTORCRYPT_API_BASE_URL` and `COLLECTORCRYPT_API_KEY` are configured.

---

---

# Lampiran — Catatan Internal

> **JANGAN DI-SHARE.**

## Q1 adalah taruhannya

Kalau CollectorCrypt yang memegang RNG (dan `generatePack`/`openPack` mengisyaratkan begitu),
maka `listAvailable` + `reserve` di `inventory.types.ts` tidak punya padanan sama sekali.
`PacksService.open` mengundi rarity sendiri pakai `randomInt` lalu mengunci kartu spesifik —
seluruh alur itu jadi mati. Yang tersisa buat kita cuma memanggil satu endpoint dan menampilkan
hasilnya.

Itu bukan cuma soal kode. Yang pindah ke mereka adalah **kendali atas odds, expected value, dan
eksposur buyback**. Konsekuensinya: tabel `dropRates` dan `RARITY_VALUE` di `packs.catalog.ts`
tidak lagi jadi milik kita, dan margin kita sepenuhnya ditentukan selisih harga jual eceran kita
terhadap harga pack partner. Kalau ini yang terjadi, satu-satunya lever ekonomi kita adalah Q4
(boleh menetapkan harga eceran sendiri) dan Q2 (boleh mengatur pool/odds).

Tanyakan Q1 lebih dulu, sebelum yang lain. Jawabannya menentukan apakah sisa pertanyaan di
bagian B masih relevan.

## Deal-breaker

Tiga pertanyaan yang jawabannya bisa membatalkan rencana:

- **Q15** — kalau pembatasan regional ditegakkan di sisi mereka dan Indonesia diblokir, tidak ada
  yang bisa dibicarakan lagi. Tanyakan ini lebih awal, jangan di akhir meeting.
- **Q8** — kalau penerima wajib punya akun CollectorCrypt, "user Hoshi" jadi fiksi; kita cuma
  jadi halaman depan mereka, dan posisi tawar kita untuk komisi runtuh.
- **Q22** — kalau kartu bisa ditarik fisik saat sedang dipakai bertanding, game battle tidak bisa
  dibangun di atas inventori mereka.

## Yang jangan kita tawarkan duluan

Q7 (idempotency) dan Q11 (error contract) memperlihatkan bahwa kita memikirkan kegagalan produksi,
bukan cuma happy path. Itu bagus untuk kredibilitas teknis — pakai untuk membangun kepercayaan.

Tapi jangan menawarkan bahwa Open Packs di demo kita masih mengundi di browser dan memakai
inventory mock, kecuali ditanya. Kalau ditanya, jawab lugas: mesin pack yang otoritatif ada di
backend, demo publiknya belum memanggilnya. Sudah kita sebut terus terang di brief meeting, jadi
tidak ada yang perlu ditutupi — cukup jangan dijadikan pembuka percakapan.

## Q25 lebih penting dari kelihatannya

Spesifikasi API di bawah NDA memungkinkan kita menyelaraskan adapter **sebelum** terms komersial
diteken. Itu membalik urutan tawar-menawar: kita datang ke negosiasi komersial dengan integrasi
yang sudah terbukti jalan di sandbox, bukan dengan janji.
