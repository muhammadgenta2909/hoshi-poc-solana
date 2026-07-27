// Shared page chrome so Open Packs and Marketplace can never visually drift.

// Layered warm-glow background (matches Figma): a strong gold glow hugging the
// top-right corner that bleeds onto the right detail panel, a softer top-left glow
// dropped a little from the top, a full-height glow down the left column, plus a
// broad warm wash so the layers blend without banding. Edit here once — both the
// Open Packs and Marketplace pages import it.
export const PAGE_BG = [
  // luminous hotspot pinned to the very top-right corner
  "radial-gradient(340px 300px at 100% 0px, rgba(255,230,150,0.45) 0%, rgba(255,230,150,0) 60%)",
  // top-right hero glow — bold gold hugging the corner, reaching toward the right panel
  "radial-gradient(1300px 900px at 100% -40px, rgba(245,182,52,0.46) 0%, rgba(245,182,52,0.17) 28%, rgba(245,182,52,0) 58%)",
  "radial-gradient(660px 580px at 100% 0px, rgba(255,210,104,0.42) 0%, rgba(255,210,104,0) 55%)",
  // top-left glow — softer, dropped a little from the very top
  "radial-gradient(960px 720px at -90px 150px, rgba(226,168,66,0.28) 0%, rgba(226,168,66,0) 60%)",
  // gold glow running the full height of the left column — an upper lobe plus a
  // stronger lower hotspot so it reads as one continuous warm wash top-to-bottom.
  "radial-gradient(600px 560px at 23% 30%, rgba(245,182,52,0.28) 0%, rgba(245,182,52,0.10) 36%, rgba(245,182,52,0) 62%)",
  "radial-gradient(620px 460px at 23% 90%, rgba(245,182,52,0.36) 0%, rgba(245,182,52,0.12) 34%, rgba(245,182,52,0) 62%)",
  // warm wash across the whole top so the layers blend without banding
  "radial-gradient(1850px 740px at 60% -260px, rgba(82,62,28,0.62) 0%, rgba(82,62,28,0) 62%)",
  // Transparent base (was the flat #0a0907) so the site-wide bg-main.png image —
  // painted as a fixed lowest-z layer in the root layout — shows through beneath
  // these warm-glow gradients on every page that uses PAGE_BG.
  "transparent",
].join(", ");

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
