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
    >
      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 flex items-center text-[11px] uppercase tracking-wider text-zinc-500">
              <LabelStrip />{group}
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {packs
                .filter((p) => p.group === group)
                .map((p) => {
                  const selected = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      aria-pressed={selected}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-2.5 text-center transition ${
                        selected
                          ? "border-yellow-400 bg-yellow-400/10 shadow-[0_0_0_1px_rgba(250,204,21,0.4),0_0_26px_-6px_rgba(250,204,21,0.65)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                      }`}
                    >
                      <PackArt pack={p} label={p.tierLabel} className="aspect-[3/4] w-full" />
                      <GradientText className="text-[11px] font-semibold">{p.name}</GradientText>
                      <Idrx amount={p.price} size={12} className="text-[11px] text-zinc-200" />
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
