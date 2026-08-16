// Shared page chrome so Open Packs and Marketplace can never visually drift.

// CATATAN: latar gold marketplace / open-packs TIDAK lagi ada di file ini. Ia
// pindah ke class `.page-bg` di app/globals.css, karena lapisannya harus berbeda
// per lebar layar dan media query tidak bisa hidup di dalam atribut `style`.
// Semua glow desktop berukuran 600–1850px, jadi di viewport ~375px semuanya
// menyelimuti layar sekaligus dan halaman terbaca emas solid, bukan gelap dengan
// sudut hangat. Pakai `className="page-bg …"`, bukan `style={{ background }}`.

// Calmer background for account / settings / shipment pages. Dense forms and
// tables need to stay readable, so instead of the marketplace's layered gold
// wash we use a single soft warm glow at the top on the dark base — Hoshi warmth
// without busy gradients competing with the content.
export const ACCOUNT_BG = [
  "radial-gradient(1200px 460px at 50% -240px, rgba(245,182,52,0.10) 0%, rgba(245,182,52,0) 60%)",
  // Transparent base (was #0a0907) so the fixed bg-main.png layer shows through.
  "transparent",
].join(", ");

// Admin backoffice — a calm, OPAQUE dark surface. Deliberately NOT the bright
// gold marketplace wash: the solid `#0b0b0f` base (last layer) fully covers the
// site-wide fixed bg-main.png so tables/forms stay high-contrast and readable,
// with only a whisper of warm glow up top for depth. Edit here once.
export const ADMIN_BG = [
  "radial-gradient(1100px 480px at 50% -340px, rgba(245,182,52,0.05) 0%, rgba(245,182,52,0) 62%)",
  "#0b0b0f",
].join(", ");

// Slightly raised opaque panel tint for the admin sidebar / cards over ADMIN_BG.
export const ADMIN_PANEL = "#121217";
