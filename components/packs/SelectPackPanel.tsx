import type { Pack } from "@/lib/packs";
import { ChevronLeftIcon, Idrx, PackArt } from "./ui";

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
    <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-pixel text-xs text-yellow-400">Select Pack</h2>
        <button
          className="text-zinc-500 transition hover:text-zinc-200"
          aria-label="Collapse panel"
        >
          <ChevronLeftIcon />
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500">— {group}</p>
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
                      <span className="text-[11px] font-medium text-zinc-200">{p.name}</span>
                      <Idrx amount={p.price} size={12} className="text-[11px] text-yellow-400" />
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
