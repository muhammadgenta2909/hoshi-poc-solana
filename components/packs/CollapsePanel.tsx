"use client";

import { useState, type ReactNode } from "react";
import { Img, SIDE_LINES } from "./ui";

/**
 * Side panel with a collapsible body. The header (icon + title + toggle) stays
 * put; clicking the toggle smoothly collapses/expands the content via a
 * grid-template-rows 1fr↔0fr transition. Open by default.
 */
export default function CollapsePanel({
  icon,
  title,
  toggleIcon,
  side,
  defaultOpen = true,
  sideLines = false,
  sticky = false,
  className = "",
  bodyClassName = "",
  children,
}: {
  icon: string;
  title: string;
  toggleIcon: string;
  side: "left" | "right";
  defaultOpen?: boolean;
  /** Kelas pada <aside> itu sendiri. Dipakai /open-packs untuk menyembunyikan
   *  panel di bawah `lg`. HARUS di sini, bukan di div pembungkus: panel ini
   *  adalah GRID ITEM, dan `position: sticky`-nya memakai grid area sebagai
   *  containing block. Dibungkus div, containing block-nya menyusut jadi setinggi
   *  konten dan sticky-nya diam-diam mati. */
  className?: string;
  /** Faded white hairlines down the panel's own left & right edges (Figma). */
  sideLines?: boolean;
  /** Pin the panel below the nav on desktop so a long list can't push the
   *  center pack preview off-screen. Pair with bodyClassName for internal scroll. */
  sticky?: boolean;
  /** Extra classes on the scrollable body — e.g. a max-height + overflow so the
   *  panel's OWN content scrolls instead of growing the whole page. */
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <aside
      className={`${side === "left" ? "rounded-r-2xl" : "rounded-l-2xl"} bg-[#181507] p-4 ${
        sticky ? "lg:sticky lg:top-[72px] lg:self-start" : ""
      } ${className}`}
      style={sideLines ? SIDE_LINES : undefined}
    >
      <div className="flex items-center justify-between">
        <h2
          className="flex items-center gap-2 text-base font-semibold text-white"
          style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
        >
          <Img src={icon} alt="" className="h-4 w-4" />
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse panel" : "Expand panel"}
          className="opacity-80 transition hover:opacity-100"
        >
          <Img
            src={toggleIcon}
            alt=""
            className="h-4 w-4 transition-transform duration-300"
            style={{ transform: open ? "none" : "rotate(180deg)" }}
          />
        </button>
      </div>

      {/* Collapsible body: grid rows animate height, inner fades for polish. */}
      <div
        className="grid transition-[grid-template-rows] duration-500 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div
            className={`mt-3 border-t border-white/10 pt-4 transition-opacity duration-300 ${
              open ? "opacity-100 delay-150" : "opacity-0"
            } ${bodyClassName}`}
          >
            {children}
          </div>
        </div>
      </div>
    </aside>
  );
}
