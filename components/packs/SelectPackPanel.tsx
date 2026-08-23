import type { Pack } from "@/lib/packs";
import CollapsePanel from "./CollapsePanel";
import { GradientText, Idrx, LabelStrip, PackArt } from "./ui";

export const PACK_GROUPS = ["Normal Hoshi Pack", "Special Hoshi Pack"] as const;
export type PackGroup = (typeof PACK_GROUPS)[number];
/** Nilai tab "semua grup". Bukan salah satu PackGroup, jadi dibedakan tipenya. */
export const ALL_GROUPS = "All";
export type GroupFilter = typeof ALL_GROUPS | PackGroup;

/**
 * Isi daftar Select Pack, TANPA pembungkus panel. Dipisah supaya bentuk yang
 * sama persis bisa dipakai di dua tempat: panel samping desktop (CollapsePanel
 * di bawah) dan sheet mobile di /open-packs. Kalau di-copy jadi dua markup,
 * keduanya pasti pelan-pelan berbeda.
 */
export function SelectPackList({
  packs,
  selectedId,
  onSelect,
  group = ALL_GROUPS,
  soldOut,
}: {
  packs: Pack[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Batasi ke satu grup; "All" menampilkan keduanya. */
  group?: GroupFilter;
  /** Id pack (== machine.code) yang stok CC-nya habis. Tile-nya dirender redup +
   *  badge "Stok habis" dan tidak mengarahkan ke pembelian. Opsional: kalau tidak
   *  diberikan, semua pack dianggap tersedia (perilaku lama, aman untuk pemanggil
   *  lain). */
  soldOut?: Set<string>;
}) {
  const shown = PACK_GROUPS.filter((g) => group === ALL_GROUPS || g === group);

  return (
    <div className="flex flex-col gap-5">
      {shown.map((g) => (
        <div key={g}>
          <p className="mb-2 flex items-center text-[11px] uppercase tracking-wider text-zinc-500">
            <LabelStrip />
            {g}
          </p>
          {/* gap-y is wider than gap-x on purpose: each tile's price chip pokes
              ~10px above its top border (same pattern as the Rip button's price
              pill) and needs that headroom over the row above. */}
          <div className="grid grid-cols-3 gap-x-2 gap-y-3.5 pt-1.5 sm:gap-x-2.5 lg:grid-cols-2">
            {packs
              .filter((p) => p.group === g)
              .map((p) => {
                const selected = p.id === selectedId;
                const isSoldOut = soldOut?.has(p.id) ?? false;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p.id)}
                    aria-pressed={selected}
                    // Sold-out tiles stay clickable so the user can still open the
                    // pack's preview + details, but the "Rip Pack" CTA is disabled
                    // downstream — so tapping one never starts a purchase.
                    title={isSoldOut ? `${p.name} — stok habis` : p.name}
                    className={`relative flex flex-col items-center gap-2 rounded-xl border p-2.5 pt-3.5 text-center transition ${
                      isSoldOut
                        ? "border-red-400/25 bg-red-500/[0.05] opacity-60 hover:opacity-80"
                        : selected
                          ? "border-yellow-400 bg-yellow-400/10 shadow-[0_0_0_1px_rgba(250,204,21,0.4),0_0_26px_-6px_rgba(250,204,21,0.65)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                    }`}
                  >
                    {/* price chip — centered ON the tile's top border */}
                    <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#171717] px-2 py-0.5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)]">
                      <Idrx
                        amount={p.price}
                        size={11}
                        className="text-[11px] font-semibold text-zinc-100"
                      />
                    </span>
                    <PackArt
                      pack={p}
                      label={p.tierLabel}
                      className={`aspect-[3/4] w-full ${isSoldOut ? "grayscale" : ""}`}
                    />
                    <GradientText className="line-clamp-2 w-full text-[11px] font-semibold leading-tight">
                      {p.name}
                    </GradientText>
                    {isSoldOut && (
                      <span className="rounded-md border border-red-400/40 bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                        Stok habis
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SelectPackPanel({
  packs,
  selectedId,
  onSelect,
  group = ALL_GROUPS,
  className = "",
  soldOut,
}: {
  packs: Pack[];
  selectedId: string;
  onSelect: (id: string) => void;
  group?: GroupFilter;
  className?: string;
  /** Diteruskan apa adanya ke SelectPackList — lihat dok di sana. */
  soldOut?: Set<string>;
}) {
  return (
    <CollapsePanel
      icon="/icon-select.png"
      title="Select Pack"
      toggleIcon="/icon-left.png"
      side="left"
      sideLines
      sticky
      className={className}
      // The full catalogue is long; cap it to the viewport and give the list its
      // OWN scroll so it never pushes the center preview off-screen. Scrollbar is
      // hidden (no-scrollbar) but still functional; overflow-x-hidden kills the
      // stray horizontal bar.
      bodyClassName="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:overflow-x-hidden no-scrollbar"
    >
      <SelectPackList
        packs={packs}
        selectedId={selectedId}
        onSelect={onSelect}
        group={group}
        soldOut={soldOut}
      />
    </CollapsePanel>
  );
}
