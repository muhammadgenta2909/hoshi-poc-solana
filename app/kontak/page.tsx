import type { Metadata } from "next";
import { BUSINESS, LegalPage, Section } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Kontak — Hoshimarket",
  description: "Hubungi tim Hoshimarket (PT Portal Integrasi Nusantara).",
};

export default function KontakPage() {
  const row = "flex flex-col gap-0.5 border-t border-white/[0.07] py-3 first:border-t-0 sm:flex-row sm:gap-6";
  const label = "w-40 shrink-0 text-[13px] text-zinc-500";
  return (
    <LegalPage
      title="Kontak"
      updated="16 Oktober 2026"
      intro={
        <>
          Punya pertanyaan soal pesanan, pengiriman, titipan kartu, atau pembayaran? Hubungi kami
          lewat salah satu cara di bawah. Sertakan <strong className="text-white">nomor order</strong>{" "}
          kalau pertanyaannya tentang transaksi tertentu, supaya bisa kami cek lebih cepat.
        </>
      }
    >
      <Section title="Informasi usaha">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-2">
          <div className={row}>
            <span className={label}>Nama toko</span>
            <span>{BUSINESS.brand}</span>
          </div>
          <div className={row}>
            <span className={label}>Perusahaan</span>
            <span>{BUSINESS.company}</span>
          </div>
          <div className={row}>
            <span className={label}>Alamat</span>
            <span>{BUSINESS.address}</span>
          </div>
          <div className={row}>
            <span className={label}>Email</span>
            <a href={`mailto:${BUSINESS.email}`} className="text-yellow-200 hover:underline">
              {BUSINESS.email}
            </a>
          </div>
          <div className={row}>
            <span className={label}>Telepon / WhatsApp</span>
            <a
              href={`https://wa.me/${BUSINESS.phoneWa}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-200 hover:underline"
            >
              {BUSINESS.phoneDisplay}
            </a>
          </div>
          <div className={row}>
            <span className={label}>Jam layanan</span>
            <span>{BUSINESS.hours}</span>
          </div>
        </div>
      </Section>

      <Section title="Pertanyaan tentang kartu gacha">
        <p>
          Kartu dari pack gacha disediakan dan dipenuhi oleh <strong className="text-white">Collector Crypt</strong>.
          Pertanyaan atau klaim mengenai kartu tersebut diselesaikan dengan Collector Crypt, dan kami
          dapat membantu meneruskan komunikasinya. Lihat{" "}
          <a href="/syarat-ketentuan" className="text-yellow-200 hover:underline">
            Syarat &amp; Ketentuan
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
