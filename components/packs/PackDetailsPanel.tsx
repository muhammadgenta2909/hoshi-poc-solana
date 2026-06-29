import type { Pack } from "@/lib/packs";
import { ChevronRightIcon, Idrx, InfoIcon, ShieldIcon } from "./ui";

export default function PackDetailsPanel({ pack }: { pack: Pack }) {
  return (
    <aside className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-pixel text-xs text-yellow-400">
          <InfoIcon /> Pack Details
        </h2>
        <button
          className="text-zinc-500 transition hover:text-zinc-200"
          aria-label="Expand panel"
        >
          <ChevronRightIcon />
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {/* Guarantee */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
            <span>— Guarantee</span>
            <button className="text-yellow-400/80 transition hover:text-yellow-300">
              Click for details
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-yellow-400/20 bg-yellow-400/[0.06] px-3 py-2.5 text-sm">
            <ShieldIcon className="h-4 w-4 shrink-0 text-yellow-400" />
            <span className="font-semibold text-yellow-100">
              Buyback Guarantee <span className="font-normal text-zinc-400">by</span>{" "}
              <span className="font-pixel text-[10px] text-yellow-400">HOSHI</span>
            </span>
          </div>
        </div>

        {/* Expected value */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
            <span>— Expected Value</span>
            <span>On IDRX</span>
          </div>
          <Idrx
            amount={pack.expectedValue}
            size={20}
            className="text-2xl font-semibold text-zinc-50"
          />
        </div>

        {/* Drop rates */}
        <div>
          <p className="mb-2.5 text-[11px] uppercase tracking-wider text-zinc-500">— Drop Rates</p>
          <ul className="flex flex-col gap-2.5">
            {pack.dropRates.map((r) => (
              <li key={r.tier} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ background: r.color }}
                  />
                  {r.tier}
                </span>
                <span className="font-semibold tabular-nums text-zinc-100">{r.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
