"use client";

// Kontrol khusus mobile untuk /open-packs. Di desktop, Select Pack dan Pack
// Details adalah dua panel samping yang selalu terlihat. Di layar sempit tidak
// ada ruang untuk itu — panel-panelnya menumpuk vertikal dan mendorong preview
// pack + tombol Rip jauh ke bawah lipatan. Jadi di bawah `lg` keduanya berubah
// jadi sepasang tombol (kiri & kanan), dan isinya muncul sebagai sheet.

import { useEffect, type ReactNode } from "react";
import { ALL_GROUPS, PACK_GROUPS, type GroupFilter } from "./SelectPackPanel";
import { Img } from "./ui";

const TABS: GroupFilter[] = [ALL_GROUPS, ...PACK_GROUPS];

/**
 * Baris tab grup pack, bisa di-scroll ke samping.
 *
 * Mockup-nya memakai tab kategori ilustrasi milik marketplace (Special
 * Illustration / Secret Rare / …), tapi di halaman ini tidak ada satu pun data
 * yang bisa disaring dengan itu: feed "Live Card Won" datang dari CollectorCrypt
 * dan hanya membawa nama, gambar, dan wallet pemenang — tanpa kategori. Jadi
 * barisnya memakai sumbu yang MEMANG ada di data pack, yaitu grup-nya, dan
 * benar-benar menyaring daftar Select Pack. Tab yang tidak menyaring apa pun
 * hanyalah kontrol palsu.
 */
export function PackGroupTabs({
  value,
  onChange,
  className = "",
}: {
  value: GroupFilter;
  onChange: (v: GroupFilter) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter grup pack"
      // no-scrollbar menyembunyikan bar-nya tapi scroll tetap jalan; snap bikin
      // geser dengan jempol berhenti rapi di tab, bukan di tengah-tengah.
      className={`no-scrollbar flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-4 sm:px-6 ${className}`}
    >
      {TABS.map((t) => {
        const active = value === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t)}
            style={{ fontFamily: "var(--font-jersey)" }}
            className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-3.5 py-1 text-[16px] leading-none tracking-wide transition ${
              active
                ? "border-yellow-400 text-yellow-400"
                : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
            }`}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/** Sepasang tombol pembuka panel — kiri "Select Pack", kanan "Pack Details". */
export function MobilePanelButtons({
  onOpenSelect,
  onOpenDetails,
  className = "",
}: {
  onOpenSelect: () => void;
  onOpenDetails: () => void;
  className?: string;
}) {
  return (
    // Tanpa padding horizontal: kedua tombol rata ke tepi viewport, meniru panel
    // samping desktop yang juga full-bleed (hanya sudut sisi DALAM yang membulat).
    <div className={`flex items-stretch gap-3 ${className}`}>
      <PanelButton icon="/icon-select.png" label="Select Pack" side="left" onClick={onOpenSelect} />
      <PanelButton icon="/icon-info.png" label="Pack Details" side="right" onClick={onOpenDetails} />
    </div>
  );
}

function PanelButton({
  icon,
  label,
  side,
  onClick,
}: {
  icon: string;
  label: string;
  side: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Sudut membulat hanya di sisi LUAR, meniru panel desktop yang menempel
      // rata ke tepi viewport kiri/kanan.
      className={`flex flex-1 items-center gap-2 bg-[#181507] px-3.5 py-2.5 text-left text-sm font-semibold text-white transition active:brightness-125 ${
        side === "left" ? "rounded-r-2xl" : "flex-row-reverse rounded-l-2xl text-right"
      }`}
    >
      {/* Ikon saja, tanpa chevron. Panah panel desktop (icon-left/right.png)
          berarti "lipat ke kiri/kanan" dan di tombol ini terbaca sebagai `>|`
          — arah yang salah untuk kontrol yang justru MEMBUKA sesuatu. */}
      <Img src={icon} alt="" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * Sheet mobile: backdrop + panel yang naik dari bawah. Sengaja bottom sheet
 * (bukan dipatok tepat di bawah ticker seperti mockup) supaya tingginya tidak
 * bergantung pada tinggi TopNav + ticker yang berubah-ubah — dipatok ke offset
 * tetap, satu baris ticker yang membungkus saja sudah bikin sheet-nya meleset.
 */
export function MobileSheet({
  open,
  title,
  icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  icon: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Esc menutup, dan body dikunci supaya scroll jempol mengenai isi sheet, bukan
  // halaman di belakangnya.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] lg:hidden">
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // dvh, bukan vh: di browser mobile bar alamat yang muncul-hilang bikin
        // 85vh meleset dan dasar sheet tersembunyi di balik chrome browser.
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-[#181507] shadow-[0_-16px_40px_-10px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <h2
            className="flex items-center gap-2 text-base font-semibold text-white"
            style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
          >
            <Img src={icon} alt="" className="h-4 w-4" />
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {/* pb ekstra: ruang aman di atas home-indicator iOS. */}
        <div className="no-scrollbar overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
