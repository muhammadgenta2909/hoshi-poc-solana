import type { Pack } from "@/lib/packs";
import { TIER_ICON } from "@/lib/packs";
import CollapsePanel from "./CollapsePanel";
import { GradientText, Idrx, Img, LabelStrip } from "./ui";

export default function PackDetailsPanel({ pack }: { pack: Pack }) {
  return (
    <CollapsePanel
      icon="/icon-info.png"
      title="Pack Details"
      toggleIcon="/icon-right.png"
      side="right"
      sideLines
      sticky
      bodyClassName="lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:overflow-x-hidden no-scrollbar"
    >
      <div className="flex flex-col gap-5">
        {/* Guarantee */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
            <span className="flex items-center"><LabelStrip />Guarantee</span>
            <button className="normal-case tracking-normal transition hover:brightness-110">
              <GradientText className="font-semibold">Click for details</GradientText>
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2.5 text-sm">
            <Img src="/icon-buyback.png" alt="" className="h-4 w-4 shrink-0" />
            <span className="flex items-baseline gap-1">
              <GradientText className="font-semibold">Buyback Guarantee</GradientText>
              <span className="text-xs font-normal text-zinc-400">by</span>
              <GradientText
                className="text-base"
                style={{ fontFamily: "var(--font-jersey)" }}
              >
                HOSHI
              </GradientText>
            </span>
          </div>
        </div>

        {/* Expected value */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
            <span className="flex items-center"><LabelStrip />Expected Value</span>
            <span>On IDRX</span>
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2.5">
            <Idrx
              amount={pack.expectedValue}
              size={20}
              className="text-2xl font-semibold text-zinc-50"
            />
          </div>
        </div>

        {/* Divider below the price, matching the Figma. */}
        <div className="border-t border-white/10" />

        {/* Drop rates */}
        <div>
          <p className="mb-2.5 flex items-center text-[11px] uppercase tracking-wider text-zinc-500">
            <LabelStrip />Drop Rates
          </p>
          <ul className="flex flex-col gap-2.5">
            {pack.dropRates.map((r) => (
              <li key={r.tier} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <Img src={TIER_ICON[r.tier]} alt="" className="h-3.5 w-auto" />
                  {r.tier}
                </span>
                <span
                  className="text-lg leading-none text-zinc-100"
                  style={{ fontFamily: "var(--font-jersey)" }}
                >
                  {r.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </CollapsePanel>
  );
}
