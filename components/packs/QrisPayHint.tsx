/**
 * Petunjuk cara bayar, ditampilkan TEPAT sebelum pembeli dilempar ke halaman bayar.
 *
 * Isinya bergantung pada REL PEMBAYARAN order-nya (`PaymentOrder.provider`, diturunkan backend dari
 * nomor order), karena dua rel itu berperilaku sangat berbeda di HP pembeli:
 *
 * - IDRX: halaman bayarnya cuma QRIS, dan QR-nya bertanda kategori quasi-cash (MCC 6051) — BNI Wondr
 *   menolaknya dengan "Kode QR tidak terbaca", sementara DANA membacanya. Jadi petunjuknya spesifik.
 *   VA SENGAJA tidak disebut: IDRX hanya menerima transfer VA atas nama pemilik akun IDRX.
 * - Duitku: pembeli memilih sendiri di halaman bayar — QRIS, e-wallet, atau transfer bank — dan
 *   tidak ada name matching. Petunjuk "bank sering menolak" di sana keliru dan menakut-nakuti.
 * - Belum tahu (mis. layar ongkir, yang melompat ke halaman bayar tanpa layar antara): kalimat
 *   netral yang benar untuk keduanya.
 *
 * Satu komponen untuk bayar kartu dan bayar ongkir, supaya petunjuknya tidak bisa berbeda.
 */
export function QrisPayHint({ provider }: { provider?: "IDRX" | "DUITKU" }) {
  const [title, body] =
    provider === "IDRX"
      ? [
          "Bayar pakai e-wallet, seperti DANA",
          "Scan kode QRIS di halaman berikutnya. Beberapa aplikasi bank menolak kode ini dengan pesan “QR tidak terbaca”. Kalau itu terjadi, coba scan pakai e-wallet.",
        ]
      : provider === "DUITKU"
        ? [
            "Pilih cara bayar di halaman berikutnya",
            "Bisa QRIS, e-wallet (DANA, OVO, ShopeePay), atau transfer bank lewat virtual account.",
          ]
        : [
            "Cara bayar ada di halaman berikutnya",
            "Kalau scan QRIS ditolak aplikasi bank, coba pakai e-wallet seperti DANA.",
          ];
  return (
    <div className="w-full rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-3.5 py-2.5 text-left">
      <p className="text-[12.5px] font-semibold text-sky-100">{title}</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}
