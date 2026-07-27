import type { Pack } from "@/lib/packs";
import CollapsePanel from "./CollapsePanel";
import { GradientText, Idrx, LabelStrip, PackArt } from "./ui";

const GROUPS = ["Normal Hoshi Pack", "Special Hoshi Pack"] as const;

export default function SelectPackPanel({
  packs,
  selectedId,
  onSelect,
}: {
  packs: Pack[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <CollapsePanel
      icon="/icon-select.png"
      title="Select Pack"
      toggleIcon="/icon-left.png"
      side="left"
      sideLines
      sticky
      // The full catalogue is long; cap it to the viewport and give the list its
      // OWN scroll so it never pushes the center preview off-screen. Scrollbar is
      // hidden (no-scrollbar) but still functional; overflow-x-hidden kills the
      // stray horizontal bar.
      bodyClassName="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:overflow-x-hidden no-scrollbar"
    >
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 flex items-center text-[11px] uppercase tracking-wider text-zinc-500">
              <LabelStrip />{group}
            </p>
            {/* gap-y is wider than gap-x on purpose: each tile's price chip pokes
                ~10px above its top border (same pattern as the Rip button's price
                pill) and needs that headroom over the row above. */}
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-4 pt-1.5">
              {packs
                .filter((p) => p.group === group)
                .map((p) => {
                  const selected = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      aria-pressed={selected}
                      title={p.name}
                      className={`relative flex flex-col items-center gap-2 rounded-xl border p-2.5 pt-3.5 text-center transition ${
                        selected
                          ? "border-yellow-400 bg-yellow-400/10 shadow-[0_0_0_1px_rgba(250,204,21,0.4),0_0_26px_-6px_rgba(250,204,21,0.65)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      {/* price chip — centered ON the tile's top border */}
                      <span className="absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-[#171717] px-2 py-0.5 shadow-[0_4px_12px_-2px_rgba(0,0,0,0.6)]">
                        <Idrx amount={p.price} size={11} className="text-[11px] font-semibold text-zinc-100" />
                      </span>
                      <PackArt pack={p} label={p.tierLabel} className="aspect-[3/4] w-full" />
                      <GradientText className="line-clamp-2 w-full text-[11px] font-semibold leading-tight">
                        {p.name}
                      </GradientText>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </CollapsePanel>
  );
}
