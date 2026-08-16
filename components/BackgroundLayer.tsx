"use client";

import { usePathname } from "next/navigation";

/**
 * Site-wide bg-main.png pinned to the viewport, covering it fully on both axes,
 * fixed so it stays put while pages scroll. Sits at the lowest z-index (-z-10)
 * behind ALL content; page wrappers use a transparent base (see the `.page-bg`
 * class in globals.css / ACCOUNT_BG) so it shows through on every page. Di bawah
 * `sm`, .page-bg menambah scrim gelap di atas layer ini — foto ini terlalu terang
 * kalau tampil apa adanya di layar sempit.
 *
 * Exception: the /admin back-office runs its own solid dark surface (ADMIN_BG),
 * so the photo background is suppressed there — otherwise it flashes through for
 * a frame on refresh before the admin shell paints. Returning null on /admin
 * means the layer is never in the HTML for those routes, so there is nothing to
 * flash. Decorative only → aria-hidden + pointer-events-none.
 */
export default function BackgroundLayer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/bg-main.png)" }}
    />
  );
}
