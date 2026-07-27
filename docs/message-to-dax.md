# Pesan pembuka ke Dax (CTO CollectorCrypt)

Tujuan pesan ini: minta **API key devnet** untuk mulai integrasi Gacha API. Itu satu-satunya
yang kita butuhkan dari Dax sekarang. Pertanyaan teknis yang lebih dalam ditahan dulu sampai dia
balas — jangan dibanjirkan di pesan pertama.

---

## Versi English — INI yang kamu kirim ke Dax (copy-paste)

> Hi Dax — thanks for the intro from Joe.
>
> We've been through the Gacha docs + the `gacha-starter` repo and already built our backend
> against the Gacha API — `x-api-key` client, the full `generatePack → submitTransaction → openPack`
> flow, buyback, and a `memo`-keyed ledger on our side for attribution.
>
> Could you issue us a **devnet `x-api-key`** so we can run it end-to-end against `dev-gacha`?
> Production key can follow later.

---

## Versi Indonesia — supaya kamu paham persis apa yang kamu kirim

> Hi Dax — terima kasih Joe atas perkenalannya.
>
> Kami sudah menelusuri dokumentasi Gacha + repo `gacha-starter`, dan sudah membangun backend kami
> ke Gacha API — klien `x-api-key`, alur penuh `generatePack → submitTransaction → openPack`,
> buyback, plus buku besar ber-index `memo` di sisi kami untuk atribusi.
>
> Boleh kami diterbitkan **`x-api-key` devnet** supaya bisa menjalankannya ujung-ke-ujung di
> `dev-gacha`? Key produksi menyusul.

---

## Balasan setelah Dax mengirim key (copy-paste)

> Got it, thanks Dax 🙏 Plugging it into our devnet backend now.

---

## Kenapa dibuat begini (biar kamu percaya diri, bukan sekadar copy-paste)

- **Menyebut `gacha-starter`, bukan `cc-partner-test`.** `cc-partner-test` itu untuk Marketplace/
  Shipping (Privy/SIWS). Repo referensi khusus Gacha adalah `gacha-starter` — menyebut yang benar
  langsung menandakan kita paham peta API-nya.
- **Menyebut alur `generatePack → submitTransaction → openPack` dan `memo`.** Ini bukti kita sudah
  membaca kontraknya, bukan cuma dengar dari Joe. `memo` = mekanisme atribusi bagi hasil 50% —
  menyebutnya menunjukkan kita paham sisi komersialnya juga, tanpa perlu membahas komersial ke CTO.
- **Minta key DEVNET, bukan produksi.** Komitmennya kecil, wajar, dan pas dengan janji "siap tes
  hari ini". Tidak menuntut apa pun yang bersifat perjanjian komersial (itu jatah Joe).
- **Minta API key ke Dax itu memang prosedur yang benar.** Dokumentasi CC menulis key "issued to
  authorized partners" dan TIDAK ada tombol generate sendiri — satu-satunya jalur adalah kontak
  langsung. Jadi bertanya ke Dax bukan tanda tidak tahu; itu memang caranya.

## Yang JANGAN dilakukan

- Jangan mengirim 11 pertanyaan teknis sekaligus di pesan pertama. Tahan sampai dia balas — itu
  justru bikin dia lihat kita serius, tapi kalau dibanjirkan di awal terkesan belum siap.
- Jangan menawarkan/mendemokan halaman Open Packs publik sebagai "sudah pakai API kalian" — demo
  itu masih mengundi di browser dengan data mock. Backend-nya yang sudah benar, bukan demo publiknya.
- Jangan bahas komisi/50% ke Dax. Itu ranah Joe. Ke Dax cukup teknis.
