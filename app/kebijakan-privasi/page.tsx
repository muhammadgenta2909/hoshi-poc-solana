import type { Metadata } from "next";
import { BUSINESS, LegalPage, Points, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Hoshimarket",
  description: "Bagaimana Hoshimarket mengumpulkan, memakai, dan melindungi datamu.",
};

/*
 * Daftar data di sini dicocokkan dengan yang BENAR-BENAR disimpan sistem — termasuk yang mudah
 * terlupa: snapshot identitas penitip saat serah terima (jenis identitas + 4 digit terakhir), foto
 * bukti yang sengaja tidak bisa dihapus, dan fakta bahwa email login Google TIDAK disalin ke
 * database Hoshi. Menambah kolom data pribadi baru berarti memperbarui halaman ini.
 */
export default function KebijakanPrivasiPage() {
  const b = "text-white";
  return (
    <LegalPage
      title="Kebijakan Privasi"
      updated="16 Oktober 2026"
      intro={
        <>
          {BUSINESS.company} (&ldquo;kami&rdquo;) mengelola {BUSINESS.brand}. Halaman ini menjelaskan
          data apa yang kami kumpulkan, untuk apa, dan dengan siapa data itu dibagikan, sesuai
          Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.
        </>
      }
    >
      <Section title="1. Data yang kami kumpulkan">
        <Points
          items={[
            <>
              <strong className={b}>Akun:</strong> alamat wallet, nama tampilan, dan email kalau kamu
              mengisinya sendiri di Pengaturan. Kalau kamu masuk dengan Google, proses masuknya
              ditangani oleh penyedia login kami. Email Google-mu tidak otomatis kami simpan.
            </>,
            <>
              <strong className={b}>Pengiriman:</strong> nama penerima, nomor telepon, alamat lengkap,
              dan kode pos.
            </>,
            <>
              <strong className={b}>Transaksi:</strong> riwayat pembelian, nomor order, nominal, dan
              status pembayaran. Data kartu, rekening, atau e-wallet yang kamu pakai membayar diproses
              oleh mitra pembayaran dan <strong className={b}>tidak kami simpan</strong>.
            </>,
            <>
              <strong className={b}>Penitip kartu:</strong> nama dan nomor telepon saat serah terima,
              jenis kartu identitas beserta 4 digit terakhir nomornya, foto kartu, dan foto struk serah
              terima.
            </>,
            <>
              <strong className={b}>Komunikasi:</strong> pesan yang kamu kirim lewat fitur pesan atau ke
              tim kami.
            </>,
            <>
              <strong className={b}>Teknis:</strong> catatan server (misalnya alamat IP dan waktu akses)
              yang dibutuhkan untuk keamanan dan perbaikan masalah.
            </>,
          ]}
        />
      </Section>

      <Section title="2. Untuk apa data dipakai">
        <Points
          items={[
            "Memproses pembelian, pembayaran, dan pengiriman kartu.",
            "Menjual kartu titipan dan membayarkan hasilnya ke penitip.",
            "Mengirim pemberitahuan tentang pesanan atau titipanmu.",
            "Mencegah penipuan, penyalahgunaan, dan transaksi ganda.",
            "Memenuhi kewajiban hukum, termasuk pencatatan transaksi.",
          ]}
        />
        <p>Kami tidak menjual data pribadimu kepada siapa pun.</p>
      </Section>

      <Section title="3. Dengan siapa data dibagikan">
        <p>Hanya sebatas yang diperlukan untuk menjalankan layanan:</p>
        <Points
          items={[
            "Mitra pembayaran — untuk memproses dan memverifikasi pembayaranmu.",
            "Kurir pengiriman — nama, telepon, dan alamat penerima, untuk mengantar paket.",
            "Collector Crypt — untuk transaksi pack gacha yang mereka penuhi.",
            "Penyedia layanan teknis — hosting, pengiriman email, dan login, yang memproses data atas nama kami.",
            "Pihak berwenang — bila diwajibkan oleh hukum.",
          ]}
        />
      </Section>

      <Section title="4. Data di blockchain">
        <p>
          Sebagian kartu (terutama dari pack gacha) tercatat di blockchain Solana. Alamat wallet dan
          transaksi di blockchain bersifat publik dan tidak dapat kami ubah atau hapus.
        </p>
      </Section>

      <Section title="5. Berapa lama data disimpan">
        <Points
          items={[
            "Data akun disimpan selama akunmu aktif.",
            "Catatan transaksi disimpan selama diperlukan untuk kewajiban hukum dan penyelesaian sengketa.",
            "Foto bukti serah terima titipan disimpan permanen, karena berfungsi sebagai bukti untuk pemilik kartu maupun Hoshi.",
          ]}
        />
      </Section>

      <Section title="6. Hakmu">
        <p>
          Kamu dapat meminta salinan data pribadimu, memperbaikinya, atau meminta akunmu dihapus dengan
          menghubungi kami. Data yang wajib kami simpan menurut hukum, atau yang menjadi bukti transaksi
          dan serah terima, tidak dapat dihapus selama kewajiban itu masih berlaku.
        </p>
      </Section>

      <Section title="7. Keamanan dan penyimpanan di perangkat">
        <p>
          Kami melindungi data dengan koneksi terenkripsi dan pembatasan akses. Situs ini menyimpan
          sedikit data di peramban (misalnya sesi masuk dan pembayaran yang sedang berjalan) supaya
          layanan berfungsi, bukan untuk iklan.
        </p>
      </Section>

      <Section title="8. Kontak">
        <p>
          Pertanyaan tentang privasi dapat dikirim ke{" "}
          <a href={`mailto:${BUSINESS.email}`} className="text-yellow-200 hover:underline">
            {BUSINESS.email}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
