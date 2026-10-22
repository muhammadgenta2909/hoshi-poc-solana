import type { Metadata } from "next";
import Link from "next/link";
import { BUSINESS, LegalPage, Points, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Syarat & Ketentuan — Hoshimarket",
  description: "Syarat dan ketentuan penggunaan Hoshimarket.",
};

/*
 * Setiap janji di halaman ini harus SUDAH dijalankan sistem. Yang tertulis di sini adalah yang
 * akan dikutip pembeli dan penitip saat ada sengketa — dan yang dibaca pemeriksa payment gateway.
 * Kalau perilaku sistem berubah (batas tagihan, komisi, cara pengiriman), halaman ini ikut diubah.
 */
export default function SyaratKetentuanPage() {
  const b = "text-white";
  return (
    <LegalPage
      title="Syarat & Ketentuan"
      updated="17 Oktober 2026"
      intro={
        <>
          Halaman ini mengatur penggunaan {BUSINESS.brand}, yang dikelola oleh {BUSINESS.company}.
          Dengan membuat akun, membeli, atau menitipkan kartu, kamu menyetujui ketentuan berikut.
        </>
      }
    >
      <Section title="1. Tentang Hoshimarket">
        <p>
          {BUSINESS.brand} adalah tempat jual-beli kartu koleksi (trading card) fisik bergrading. Ada
          tiga jenis barang:
        </p>
        <Points
          items={[
            <>
              <strong className={b}>Kartu titipan</strong> — milik kolektor, disimpan dan dijualkan oleh
              Hoshi atas nama pemiliknya.
            </>,
            <>
              <strong className={b}>Stok Hoshi</strong> — kartu milik Hoshi sendiri.
            </>,
            <>
              <strong className={b}>Pack kartu isi acak (gacha)</strong> — disediakan dan dipenuhi oleh
              Collector Crypt (lihat bagian 6).
            </>,
          ]}
        />
      </Section>

      <Section title="2. Akun">
        <Points
          items={[
            "Kamu masuk menggunakan wallet atau akun Google. Kamu bertanggung jawab menjaga akses ke akunmu.",
            "Data yang kamu isi (terutama alamat pengiriman) harus benar dan milikmu sendiri.",
          ]}
        />
      </Section>

      <Section title="3. Harga dan pembayaran">
        <Points
          items={[
            "Semua harga dalam Rupiah. Tagihan yang kamu bayar sudah termasuk biaya layanan pembayaran QRIS (sekitar 0,7%).",
            "Pembayaran diproses oleh mitra pembayaran resmi kami. Pesanan baru diproses setelah pembayaran terkonfirmasi oleh mitra tersebut.",
            "Tagihan yang tidak dibayar sampai batas waktunya akan kedaluwarsa dengan sendirinya, tanpa biaya apa pun.",
            "Satu pembayaran online bernilai antara Rp 20.000 dan Rp 10.000.000.",
          ]}
        />
      </Section>

      <Section title="4. Kartu fisik dan pengiriman">
        <Points
          items={[
            <>
              Kartu yang kamu beli tersimpan di gudang Hoshi dan tampil di <strong className={b}>Vault</strong>
              milikmu. Kartu dikirim setelah kamu memintanya lewat menu{" "}
              <strong className={b}>Minta Kartu Dikirim</strong>.
            </>,
            "Ongkos kirim dibayar terpisah saat kamu meminta pengiriman, dan besarnya ditentukan oleh provinsi tujuan. Angkanya tampil sebelum kamu membayar.",
            "Pengiriman hanya ke alamat di Indonesia, menggunakan kurir domestik.",
            "Periksa alamat dengan teliti. Setelah ongkos kirim dibayar, alamat tidak dapat diubah lewat aplikasi — hubungi kami secepatnya kalau ada kesalahan.",
            <>
              Nomor resi tampil di <strong className={b}>Riwayat Pengiriman</strong> setelah paket kami
              serahkan ke kurir.
            </>,
          ]}
        />
      </Section>

      <Section title="5. Menitipkan kartu (untuk penitip)">
        <Points
          items={[
            "Kartu diserahkan langsung ke tim Hoshi. Saat serah terima kami mencatat kondisi kartu, mengambil foto sebagai bukti, dan memberikan struk serah terima yang ditandatangani kedua pihak. Foto bukti disimpan permanen dan tidak dapat dihapus.",
            "Harga jual dan harga terendah yang disepakati tertulis di struk. Perubahan harga hanya dilakukan dengan persetujuanmu.",
            "Hoshi memotong komisi sebesar yang tertulis di struk serah terima (standar 5% dari harga jual). Sisanya masuk ke saldo Hoshi milikmu begitu kartu terjual.",
            "Selama kartu belum terjual, kamu boleh meminta kartumu kembali. Cara pengembalian dan siapa yang menanggung ongkos kirim baliknya disepakati saat permintaan diajukan.",
            "Jika kartu hilang atau rusak selama berada dalam penyimpanan Hoshi, kami mengganti rugi sebesar harga jual yang tertulis di struk serah terima.",
            "Kartu yang dititipkan harus asli dan milikmu sendiri.",
          ]}
        />
      </Section>

      <Section title="6. Pack kartu isi acak (gacha)">
        <p>
          Pack gacha dan kartu di dalamnya disediakan dan dipenuhi <strong className={b}>sepenuhnya oleh
          Collector Crypt Corp.</strong>, bukan oleh Hoshi. Sebelum membeli pack, kamu akan diminta
          membaca dan menyetujui ketentuan Collector Crypt.
        </p>
        <Points
          items={[
            "Isi pack bersifat acak, dan pembelian tidak dapat dibatalkan setelah dibayar.",
            "Keaslian, grading, kondisi, penyimpanan, penawaran buyback, dan pengiriman kartu gacha sepenuhnya menjadi urusan antara kamu dan Collector Crypt.",
            "Kami dapat membantu meneruskan komunikasi dengan Collector Crypt, tanpa menimbulkan kewajiban atau tanggung jawab di pihak Hoshi.",
          ]}
        />
      </Section>

      <Section title="7. Saldo Hoshi">
        <Points
          items={[
            "Saldo bertambah dari isi saldo atau dari hasil penjualan kartu titipanmu.",
            "Saldo bukan simpanan dan tidak berbunga.",
            "Saldo dapat ditarik ke rekening bank atau e-wallet atas namamu, minimal Rp 10.000 per penarikan. Penarikan diproses oleh tim Hoshi.",
          ]}
        />
      </Section>

      <Section title="8. Yang tidak boleh dilakukan">
        <Points
          items={[
            "Menitipkan atau menjual kartu palsu, curian, atau yang bukan milikmu.",
            "Memakai beberapa akun untuk menyalahgunakan promo, harga, atau sistem.",
            "Mengganggu, meretas, atau mencoba melewati pengaman sistem Hoshimarket.",
          ]}
        />
        <p>Kami dapat menangguhkan akun yang melanggar ketentuan ini.</p>
      </Section>

      <Section title="9. Batas tanggung jawab">
        <p>
          Kami berupaya menjaga layanan tetap berjalan dengan baik, tetapi tidak menjamin layanan bebas
          gangguan. Tanggung jawab kami atas suatu transaksi terbatas pada nilai transaksi tersebut,
          kecuali ditentukan lain oleh hukum yang berlaku.
        </p>
      </Section>

      <Section title="10. Perubahan dan hukum yang berlaku">
        <p>
          Ketentuan ini dapat kami perbarui dari waktu ke waktu. Tanggal pembaruan tercantum di bagian
          atas halaman. Ketentuan ini tunduk pada hukum Republik Indonesia.
        </p>
      </Section>

      <Section title="11. Pengembalian dana dan kontak">
        <p>
          Ketentuan pengembalian dana ada di{" "}
          <Link href="/kebijakan-pengembalian" className="text-yellow-200 hover:underline">
            Kebijakan Pengembalian Dana
          </Link>
          . Pertanyaan lain dapat disampaikan lewat halaman{" "}
          <Link href="/kontak" className="text-yellow-200 hover:underline">
            Kontak
          </Link>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
