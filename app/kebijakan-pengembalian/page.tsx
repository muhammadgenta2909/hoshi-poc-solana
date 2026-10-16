import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, LegalPage, Points, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Kebijakan Pengembalian Dana — Hoshimarket",
  description: "Kapan dan bagaimana dana pembelian di Hoshimarket dikembalikan.",
};

/*
 * Kasus 1–3 mengikuti perilaku sistem: pembayaran yang lunas tapi barangnya tidak bisa diserahkan
 * dicatat sebagai utang refund (REFUND_DUE), dan kartu titipan yang hilang SESUDAH terjual
 * dipulihkan ke PEMBELI, bukan ke penitip. Pengembaliannya sendiri dikerjakan manual oleh tim —
 * tidak ada kode yang mengirim Rupiah balik otomatis — jadi halaman ini menjanjikan proses manusia,
 * bukan refund otomatis. Tenggat waktu di bagian 6 adalah keputusan bisnis, bukan sifat sistem.
 */
export default function KebijakanPengembalianPage() {
  const b = "text-white";
  return (
    <LegalPage
      title="Kebijakan Pengembalian Dana"
      updated="16 Oktober 2026"
      intro={
        <>
          Kartu koleksi adalah barang yang unik, jadi pembelian yang sudah dibayar pada dasarnya tidak
          dapat dibatalkan. Kecuali dalam kondisi berikut, di mana kami mengembalikan danamu.
        </>
      }
    >
      <Section title="1. Kartu tidak bisa kami serahkan">
        <p>
          Kalau pembayaranmu berhasil tetapi kartunya ternyata tidak bisa kami serahkan — misalnya sudah
          terjual lebih dulu atau ditarik pemiliknya — <strong className={b}>dana dikembalikan penuh</strong>,
          sebesar yang kamu bayar.
        </p>
      </Section>

      <Section title="2. Kartu hilang atau rusak di gudang Hoshi">
        <p>
          Kalau kartu yang sudah kamu beli hilang atau rusak selama masih kami simpan, sebelum diserahkan
          ke kurir, <strong className={b}>dana dikembalikan penuh</strong>, termasuk ongkos kirim kalau sudah
          kamu bayar.
        </p>
      </Section>

      <Section title="3. Ongkos kirim">
        <Points
          items={[
            "Permintaan pengiriman bisa kamu batalkan sendiri selama ongkos kirim belum dibayar. Tidak ada biaya.",
            "Setelah ongkos kirim dibayar, pengiriman tidak bisa dibatalkan lewat aplikasi. Kalau pengiriman batal karena alasan dari pihak kami, ongkos kirim dikembalikan.",
            "Kalau paket kembali karena alamat yang kamu isi salah atau tidak lengkap, biaya pengiriman ulang ditanggung pembeli.",
          ]}
        />
      </Section>

      <Section title="4. Kartu yang diterima tidak sesuai">
        <p>
          Kalau kartu yang kamu terima berbeda dari yang tertera di halaman produk (misalnya nama kartu,
          grading, atau nomor sertifikat), laporkan kepada kami{" "}
          <strong className={b}>paling lambat 2 × 24 jam setelah paket diterima</strong>, dengan video saat
          membuka paket. Kalau terbukti, kartu dikembalikan kepada kami dan dana dikembalikan penuh,
          termasuk ongkos kirim.
        </p>
      </Section>

      <Section title="5. Yang tidak termasuk">
        <Points
          items={[
            "Berubah pikiran setelah pembayaran berhasil.",
            <>
              Pack kartu isi acak (gacha). Pack disediakan dan dipenuhi oleh Collector Crypt, sehingga
              pengembaliannya tunduk pada ketentuan Collector Crypt. Lihat{" "}
              <Link href="/syarat-ketentuan" className="text-yellow-200 hover:underline">
                Syarat &amp; Ketentuan
              </Link>
              .
            </>,
            "Saldo Hoshi tidak dikembalikan sebagai pengembalian dana, tetapi kapan saja dapat kamu tarik lewat menu Tarik Saldo.",
          ]}
        />
      </Section>

      <Section title="6. Cara mengajukan">
        <Points
          items={[
            <>
              Hubungi kami lewat email{" "}
              <a href={`mailto:${BUSINESS.email}`} className="text-yellow-200 hover:underline">
                {BUSINESS.email}
              </a>{" "}
              atau WhatsApp {BUSINESS.phoneDisplay}, dengan menyebutkan <strong className={b}>nomor order</strong>{" "}
              dan penjelasan singkat.
            </>,
            "Kami meninjau dan menjawab dalam 3 hari kerja.",
            "Kalau disetujui, dana dikembalikan ke rekening bank atau e-wallet atas nama pembayar, paling lambat 14 hari kerja.",
          ]}
        />
      </Section>
    </LegalPage>
  );
}
