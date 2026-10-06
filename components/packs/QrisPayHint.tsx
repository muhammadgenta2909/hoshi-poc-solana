/**
 * Petunjuk cara bayar, ditampilkan TEPAT sebelum pembeli dilempar ke halaman bayar IDRX.
 *
 * Kenapa perlu: QR yang dibuat IDRX bertanda kategori "quasi-cash" (kode MCC 6051), dan sebagian
 * aplikasi bank menolaknya mentah-mentah dengan pesan "Kode QR tidak terbaca" — terbukti di BNI
 * Wondr, dua kali, dua order berbeda. QR yang SAMA diterima DANA. Pembeli yang gagal di aplikasi
 * banknya tidak punya cara tahu bahwa masalahnya di aplikasi, bukan di Hoshi; dia akan mengira
 * tokonya rusak dan pergi.
 *
 * VA SENGAJA tidak disebut: IDRX hanya menerima transfer VA dari rekening atas nama pemilik akun
 * IDRX, dan pembeli Hoshi bukan pemilik akun itu — transfernya akan ditolak bank.
 *
 * Satu komponen untuk dua tempat (bayar kartu dan bayar ongkir), supaya petunjuknya tidak bisa
 * berbeda di antara keduanya.
 */
export function QrisPayHint() {
  return (
    <div className="w-full rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-3.5 py-2.5 text-left">
      <p className="text-[12.5px] font-semibold text-sky-100">Bayar pakai e-wallet, seperti DANA</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-zinc-400">
        Scan kode QRIS di halaman berikutnya. Beberapa aplikasi bank menolak kode ini dengan pesan
        &ldquo;QR tidak terbaca&rdquo;. Kalau itu terjadi, coba scan pakai e-wallet.
      </p>
    </div>
  );
}
