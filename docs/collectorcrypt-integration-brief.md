# Catatan Internal — Open Packs & CollectorCrypt

Ringkasan hasil analisis CollectorCrypt dan kondisi kesiapan Hoshi, sebagai konteks bagi
PM sebelum mengirimkan proposal ke pihak mereka.

## Temuan utama

Fitur Open Packs yang sedang kita kembangkan pada dasarnya identik dengan produk inti
CollectorCrypt. Mereka menyebutnya "Gacha": pengguna membeli pack lalu menerima kartu
secara acak dalam bentuk NFT, dengan jaminan buyback sekitar 85% dari nilai kartu. Volume
transaksi mereka sudah sangat besar, dan mayoritas pendapatannya berasal dari fitur ini.

Karena itu, posisi kita paling kuat bukan sebagai pihak yang sekadar "mengambil data dari
API mereka", melainkan sebagai pintu masuk pasar Indonesia. Hoshi menyediakan IDRX,
lokalisasi, dan jalur distribusi lokal; sementara CollectorCrypt menyediakan inventori
kartu, reputasi grading, dan likuiditas. Kerangka ini memberi mereka alasan bisnis yang
jelas untuk bekerja sama, alih-alih memandang kita sebagai pesaing.

## Kelayakan dan kesiapan

Integrasi memungkinkan secara teknis. CollectorCrypt memiliki API resmi untuk Gacha,
Marketplace, dan Vault/Shipping.

Di sisi Hoshi, backend sudah dirancang agar sumber kartu dapat ditukar dengan mudah. Saat
ini tersedia tiga sumber: vault Hoshi sendiri yang sudah berjalan hingga proses mint NFT,
mode pengembangan tanpa basis data, dan satu slot khusus CollectorCrypt yang tinggal
dilengkapi kredensial dan pemetaan endpoint. Dengan kata lain, apabila kerja sama
disepakati, integrasi di sisi kita cukup melengkapi satu komponen, bukan membangun ulang
fitur. Versi demo juga sedang disiapkan untuk di-deploy, dan tautannya akan menyertai
proposal.

## Dua catatan penting

Mekanik gacha berada pada area abu-abu antara permainan dan perjudian. CollectorCrypt
sendiri membatasi pengguna dari Amerika Serikat, Inggris, dan Tiongkok atas pertimbangan
ini, sementara kita menargetkan Indonesia yang regulasinya ketat. Kepastian hukum atas hal
ini akan memengaruhi ruang gerak produk.

Model ekonomi pack masih memakai angka sementara. Expected value saat ini lebih tinggi
daripada harga pack pada seluruh tier, yang berarti platform akan merugi bila dijalankan
apa adanya. Angka tersebut masih menunggu kalibrasi dengan nilai kartu aktual.
