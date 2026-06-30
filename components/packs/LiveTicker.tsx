import type { LiveCard } from "@/lib/packs";
import { CardThumb, Idrx } from "./ui";

export default function LiveTicker({ cards }: { cards: LiveCard[] }) {
  // Duplicate the list so the marquee can loop seamlessly (translateX -50%).
  const row = [...cards, ...cards];

  return (
    <section>
      <div className="mx-auto max-w-[1400px] px-4 pt-3 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
          </span>
          Live Card Won
        </div>
      </div>

      <div className="marquee-pause mx-auto max-w-[1400px] overflow-hidden px-4 py-3 sm:px-6">
        <div className="flex w-max gap-3 animate-marquee">
          {row.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className="flex w-[230px] shrink-0 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
            >
              <CardThumb accent={c.accent} className="h-12 w-9" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-100">{c.name}</p>
                <p className="text-[10px] text-zinc-500">{c.set}</p>
                <Idrx amount={c.price} size={12} className="mt-0.5 text-[11px] text-yellow-400" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
