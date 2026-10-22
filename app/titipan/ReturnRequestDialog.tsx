"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   "MINTA KARTU SAYA KEMBALI" — DAN KE MANA IA DIKEMBALIKAN, DITANYAKAN DI LAYAR YANG SAMA.

   ┌──── APA YANG DULU TERJADI DI SINI ─────────────────────────────────────────────────────────┐
   │ Halaman /titipan memanggil `requestConsignmentReturn(id, token)` — dua argumen. Argumen     │
   │ ketiga dan keempat (`note`, `returnPlan`) sudah ada di helper-nya, backend sudah menulis    │
   │ metode PICKUP/COURIER, menyimpan alamat sebagai SNAPSHOT, dan bahkan MENAKSIR ongkir        │
   │ baliknya dari tabel tarif per-wilayah yang sama dengan kirim domestik. Tidak satu pun dari  │
   │ itu pernah terpakai, karena tidak ada satu kolom pun di layar untuk mengisinya.             │
   │                                                                                            │
   │ Akibatnya setiap penarikan berakhir di telepon. Dan penarikan yang butuh telepon adalah     │
   │ penarikan yang tertunda: `withdrawRequestedAt` terisi, kartunya tetap di rak, dan tidak ada │
   │ satu pun baris yang tahu ke mana ia harus pergi.                                            │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   DUA JALAN, DAN KEDUANYA HARUS ADA. Kolektor yang rumahnya lima menit dari kantor tidak boleh
   dipaksa menunggu kurir; kolektor di Medan tidak boleh diminta datang mengambil. Jadi pilihannya
   eksplisit, dan tidak ada yang dipilihkan diam-diam.

   ⚠️ TIDAK ADA SATU KATA PUN TENTANG TAGIHAN DI LAYAR INI, dan tidak boleh ditambahkan. Menarik
   kartu GRATIS. Backend memang mencatat ongkir balik dan penanggungnya — itu supaya ongkos yang
   ditanggung Hoshi berhenti menjadi kebocoran yang tak muncul di laporan mana pun — TAPI nol
   Rupiah bergerak, tidak ada tagihan yang terbit, dan `returnShippingPayer` SENGAJA tidak pernah
   dikirim dari sini: angka itu milik sisi operator, bukan sesuatu yang dinegosiasikan dengan
   orang yang sedang meminta barangnya sendiri kembali.

   ⚠️ JANGAN KIRIM `returnPlan` UNTUK BARIS INTAKE. Kartunya belum pernah berpindah tangan, dan
   backend MENOLAK (422) alih-alih menyimpan alamat pengembalian untuk kartu yang tidak pernah
   kami pegang. Halaman /titipan yang memakai dialog ini sudah menyaringnya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import {
  GeoCityControl,
  GeoStateControl,
  ModalField,
  PhoneField,
  useGeoCascade,
} from "@/components/account/AddAddressModal";
import { GhostButton, ModalShell, TextArea, TextInput } from "@/components/account/ui";
import { getMyAddresses, type ShippingAddress } from "@/lib/api";
import {
  requestConsignmentReturn,
  returnAddressProblem,
  type ConsignmentReturnMethod,
  type ConsignmentReturnPlan,
  type MyConsignment,
} from "@/lib/consignment";

/* Seluruh jalur kurir Hoshi domestik, dan taksiran ongkir baliknya di backend memang hanya
   berlaku untuk Indonesia (`isIndonesianDestination`). Jadi negaranya TETAP (dan tetap dikirim
   apa adanya — bukan diasumsikan diam-diam di server) alih-alih menjadi dropdown yang jawabannya
   cuma satu dan bisa dipilih salah. */
const RETURN_COUNTRY = "Indonesia";

/** Satu pilihan besar yang enak ditekan di layar ponsel. */
function MethodCard({
  active,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
        active
          ? "border-yellow-400/50 bg-yellow-400/10"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
    >
      <span className={`block text-[14px] font-semibold ${active ? "text-yellow-200" : "text-zinc-100"}`}>
        {title}
      </span>
      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-400">{desc}</span>
    </button>
  );
}

export default function ReturnRequestDialog({
  consignment,
  token,
  onClose,
  onDone,
}: {
  /** null = dialog tertutup. Barisnya IKUT jadi kunci mount, jadi formulir tidak pernah membawa
   *  alamat kartu lain yang baru saja diketik. */
  consignment: MyConsignment | null;
  token: string;
  onClose: () => void;
  /** Permintaan berhasil terkirim: halaman memuat ulang daftarnya dan menampilkan kalimat ini. */
  onDone: (message: string) => void;
}) {
  if (!consignment) return null;
  return (
    <ReturnRequestForm
      key={consignment.id}
      c={consignment}
      token={token}
      onClose={onClose}
      onDone={onDone}
    />
  );
}

function ReturnRequestForm({
  c,
  token,
  onClose,
  onDone,
}: {
  c: MyConsignment;
  token: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  /* null = belum memilih, DAN ITU DISENGAJA. Tidak ada default yang benar di sini: menebakkan
     "kirim kurir" mengirim kartu orang yang tinggal di sebelah kantor lewat kurir, dan menebakkan
     "ambil sendiri" membuat kolektor di luar kota mengira ia harus terbang ke Jakarta. */
  const [method, setMethod] = useState<ConsignmentReturnMethod | null>(null);

  const [recipientName, setRecipientName] = useState("");
  const [phoneCode, setPhoneCode] = useState("+62");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [apt, setApt] = useState("");
  const [zip, setZip] = useState("");
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Kaskade wilayah yang SAMA dengan buku alamat (`useGeoCascade` di AddAddressModal) — bukan
     salinan kedua. Negara dipasang di awal supaya daftar provinsinya langsung termuat; kalau
     layanan geo-nya mati, setiap tingkat merosot jadi input teks biasa dan formulirnya TETAP
     bisa dikirim. Orang tidak boleh terjebak tidak bisa meminta barangnya sendiri kembali karena
     sebuah dropdown gagal memuat. */
  const geo = useGeoCascade({ country: RETURN_COUNTRY });

  /* ── ALAMAT TERSIMPAN: MENGETIK ALAMAT DI PONSEL ADALAH BAGIAN PALING MENYAKITKAN DI SINI ──
     Buku alamat pengguna sudah ada (dipakai /withdraw dan /settings), jadi alamat yang pernah ia
     tulis ditawarkan sebagai isian sekali-tekan. GAGAL DIAM-DIAM dan itu disengaja: daftar ini
     kenyamanan, bukan syarat — permintaan pengembalian tidak boleh bergantung pada satu GET
     tambahan yang bisa saja 500. */
  const [saved, setSaved] = useState<ShippingAddress[]>([]);
  useEffect(() => {
    let alive = true;
    getMyAddresses(token)
      .then((rows) => alive && setSaved(rows))
      .catch(() => {
        /* tidak ada yang perlu dikatakan — formulirnya tetap bisa diisi manual */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const applySavedAddress = (a: ShippingAddress) => {
    setRecipientName(a.fullName);
    if (a.phoneCountryCode) setPhoneCode(a.phoneCountryCode);
    if (a.phoneNumber) setPhone(a.phoneNumber);
    setStreet(a.street);
    setApt(a.apt ?? "");
    // `ShippingAddress.state` boleh null di buku alamat, sedangkan PROVINSI WAJIB di sini (ia
    // yang menentukan tier ongkir balik). Yang kosong dibiarkan kosong supaya kolomnya terlihat
    // menunggu diisi — bukan diisi karangan yang membuat taksiran ongkirnya salah.
    // `typeState` (bukan `setState`): yang terakhir mengosongkan kota sebagai efek samping, dan
    // isian ini menetapkan provinsi DAN kota sekaligus — urutan pemanggilan tidak boleh menjadi
    // hal yang menentukan apakah kotanya terisi.
    geo.typeState(a.state ?? "");
    geo.setCity(a.city);
    setZip(a.zip === "-" ? "" : a.zip);
    setError(null);
  };

  const address = {
    recipientName,
    phoneNumber: phone,
    phoneCountryCode: phoneCode || undefined,
    street,
    apt: apt || undefined,
    city: geo.city,
    state: geo.state,
    zip,
    country: RETURN_COUNTRY,
  };
  const addressProblem = returnAddressProblem(address);

  const submit = useCallback(async () => {
    if (busy || !method) return;
    if (method === "COURIER" && addressProblem) {
      setError(addressProblem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const plan: ConsignmentReturnPlan =
        method === "PICKUP"
          ? { returnMethod: "PICKUP" }
          : {
              returnMethod: "COURIER",
              returnAddress: {
                recipientName: recipientName.trim(),
                phoneNumber: phone.trim(),
                ...(phoneCode ? { phoneCountryCode: phoneCode } : {}),
                street: street.trim(),
                ...(apt.trim() ? { apt: apt.trim() } : {}),
                city: geo.city.trim(),
                state: geo.state.trim(),
                zip: zip.trim(),
                country: RETURN_COUNTRY,
              },
            };
      await requestConsignmentReturn(c.id, token, note.trim() || undefined, plan);
      // Kalimatnya menyebut apa yang SUDAH terjadi dan apa yang BELUM — dua hal yang paling
      // mudah tertukar setelah menekan tombol ini. Klausa "diturunkan dari marketplace" hanya
      // ikut kalau kartunya MEMANG sedang dipajang: mengumumkan penurunan pajangan yang tidak
      // pernah ada membuat orangnya mengira ada langkah yang ia lewatkan.
      const takenDown = c.status === "LISTED" ? "Kartu ini sudah diturunkan dari marketplace. " : "";
      onDone(
        method === "PICKUP"
          ? `Permintaan terkirim. ${takenDown}Kamu tercatat akan mengambilnya sendiri di tempat Hoshi, dan kartunya tetap aman di rak kami sampai kamu datang. Tidak ada biaya apa pun untukmu.`
          : `Permintaan terkirim. ${takenDown}Alamat kirimnya sudah tercatat, dan kartunya tetap aman di rak kami sampai paketnya benar-benar berangkat — nomor resinya muncul di halaman ini begitu ia dikirim. Tidak ada biaya apa pun untukmu.`,
      );
    } catch (e) {
      // Pesan server dipakai apa adanya: kalau kartunya terjual lebih dulu, kalimat ITU yang
      // benar — bukan tebakan UI.
      setError(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    method,
    addressProblem,
    recipientName,
    phone,
    phoneCode,
    street,
    apt,
    geo.city,
    geo.state,
    zip,
    note,
    c.id,
    c.status,
    token,
    onDone,
  ]);

  const canSubmit = !busy && !!method && (method === "PICKUP" || !addressProblem);

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Minta kartu ini kembali"
      subtitle={`${c.cardName} akan diturunkan dari marketplace (kalau sedang dipajang) dan disiapkan untuk diserahkan kembali kepadamu. Tidak dipungut biaya apa pun.`}
      maxWidth={560}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-zinc-200">Ke mana kartunya dikembalikan?</p>
          <MethodCard
            active={method === "PICKUP"}
            onClick={() => setMethod("PICKUP")}
            title="Saya ambil sendiri di tempat Hoshi"
            desc="Tidak perlu alamat. Tim Hoshi menghubungimu untuk menyepakati waktunya, dan kartunya tetap di rak kami sampai kamu datang."
          />
          <MethodCard
            active={method === "COURIER"}
            onClick={() => setMethod("COURIER")}
            title="Kirim ke alamat saya"
            desc="Kami kirim lewat kurir. Nomor resinya muncul di halaman ini begitu paketnya berangkat, jadi kamu bisa melacaknya sendiri."
          />
        </div>

        {method === "COURIER" && (
          <div className="space-y-4 border-t border-white/[0.07] pt-4">
            {saved.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] text-zinc-500">
                  Pakai alamat yang sudah kamu simpan:
                </p>
                <div className="flex flex-wrap gap-2">
                  {saved.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => applySavedAddress(a)}
                      className="max-w-full truncate rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] text-zinc-300 transition hover:bg-white/[0.07]"
                      title={`${a.fullName} · ${a.street} · ${a.city}`}
                    >
                      {a.fullName} — {a.city}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-500">
                  Isinya tetap bisa kamu ubah di bawah. Alamat yang tersimpan ikut dipakai apa
                  adanya hanya kalau kamu mengirimkannya dari sini.
                </p>
              </div>
            )}

            {geo.offline && (
              <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
                Daftar wilayah sedang tidak bisa dimuat — ketik saja provinsi dan kotamu sendiri.
                Permintaanmu tetap bisa dikirim.
              </p>
            )}

            <ModalField label="Nama penerima">
              <TextInput
                value={recipientName}
                maxLength={200}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Nama orang yang menerima paketnya"
              />
              <span className="mt-1 block text-[11.5px] leading-relaxed text-zinc-500">
                Boleh nama orang lain — paket sering diterima keluarga di rumah.
              </span>
            </ModalField>

            <ModalField label="Nomor telepon">
              <PhoneField
                code={phoneCode}
                onCodeChange={setPhoneCode}
                value={phone}
                onChange={setPhone}
              />
              <span className="mt-1 block text-[11.5px] leading-relaxed text-zinc-500">
                Dipakai kurir kalau ia tidak menemukan alamatnya.
              </span>
            </ModalField>

            <ModalField label="Alamat lengkap">
              <TextInput
                value={street}
                maxLength={500}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Jl. Merdeka No. 10, RT 03 RW 05"
              />
            </ModalField>

            <ModalField label="Blok/unit/patokan (opsional)">
              <TextInput
                value={apt}
                maxLength={200}
                onChange={(e) => setApt(e.target.value)}
                placeholder="Blok C2, sebelah warung"
              />
            </ModalField>

            <div className="grid gap-4 sm:grid-cols-2">
              <ModalField label="Provinsi">
                <GeoStateControl
                  geo={geo}
                  placeholder="Pilih provinsi"
                  textPlaceholder="Ketik provinsimu"
                  searchPlaceholder="Cari atau ketik provinsi…"
                  ariaLabel="Provinsi"
                />
                <span className="mt-1 block text-[11.5px] leading-relaxed text-zinc-500">
                  Tidak ada di daftar? Ketik saja — yang kamu ketik ikut terkirim.
                </span>
              </ModalField>

              <ModalField label="Kota/kabupaten">
                <GeoCityControl
                  geo={geo}
                  placeholder="Pilih kota"
                  textPlaceholder="Ketik kotamu"
                  searchPlaceholder="Cari atau ketik kota…"
                  ariaLabel="Kota atau kabupaten"
                />
              </ModalField>
            </div>

            <ModalField label="Kode pos">
              <TextInput
                value={zip}
                maxLength={20}
                inputMode="numeric"
                onChange={(e) => setZip(e.target.value)}
                placeholder="40115"
              />
            </ModalField>

            <p className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[12px] leading-relaxed text-zinc-400">
              Alamat ini disalin sebagai catatan pengiriman kartu ini saja. Mengubah buku alamatmu
              nanti tidak mengubah ke mana kartu ini tercatat dikirim.
            </p>
          </div>
        )}

        <ModalField label="Catatan untuk tim Hoshi (opsional)">
          <TextArea
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              method === "PICKUP"
                ? "mis. saya datang Sabtu sore, atau yang mengambil adik saya"
                : "mis. tolong dibungkus ekstra, titip ke satpam kalau saya tidak di rumah"
            }
          />
        </ModalField>

        {/* Yang paling mudah disalahpahami setelah menekan tombol ini: bahwa kartunya langsung
            berangkat. Ia tidak. Ia masih di rak kami, dan itu justru kabar baiknya — selama ia di
            sana, ia masih tanggung jawab Hoshi. */}
        <p className="text-[12px] leading-relaxed text-zinc-500">
          Kalau kartunya kebetulan terjual persis saat permintaan ini masuk, penjualannya yang
          berlaku dan hasilnya langsung masuk ke saldomu — kami akan memberitahumu.
        </p>

        {error && (
          <p
            className="rounded-xl border border-red-400/30 bg-red-400/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-200"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <GhostButton onClick={onClose} disabled={busy}>
            Batal
          </GhostButton>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-xl bg-[#FBB222] px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? "Mengirim…"
              : method == null
                ? "Pilih salah satu dulu"
                : "Ya, minta kartu saya kembali"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
