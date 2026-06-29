import type { ReactNode } from "react";
import type { Pack } from "@/lib/packs";
import { Idrx, PackArt } from "./ui";

export default function PackShowcase({ pack }: { pack: Pack }) {
  return (
    <section className="flex flex-col items-center justify-center gap-7 py-6">
      <div className="relative">
        <div
          className="absolute -inset-10 -z-10 rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, rgba(245,158,11,0.45), transparent 70%)" }}
        />
        <PackArt
          pack={pack}
          label={pack.tierLabel}
          big
          className="h-[340px] w-[260px] sm:h-[380px] sm:w-[290px]"
        />
      </div>

      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <button
          className="relative w-full overflow-hidden rounded-2xl px-6 py-4 text-center font-pixel text-base text-amber-950 shadow-[0_8px_30px_-8px_rgba(245,158,11,0.7)] transition hover:brightness-105 active:scale-[0.99]"
          style={{ backgroundImage: "linear-gradient(to bottom,#fde047,#f59e0b)" }}
        >
          Rip Pack
          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-amber-950/85 px-2 py-1 font-sans text-xs font-semibold text-yellow-200">
            <Idrx amount={pack.price} size={12} />
          </span>
        </button>

        <div className="flex w-full gap-3">
          <GhostButton>
            <Badge>?</Badge> How it Works <span className="text-zinc-500">›</span>
          </GhostButton>
          <GhostButton>
            <Badge>%</Badge> Odds <span className="text-zinc-500">›</span>
          </GhostButton>
        </div>
      </div>
    </section>
  );
}

function GhostButton({ children }: { children: ReactNode }) {
  return (
    <button className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-medium text-zinc-300 transition hover:bg-white/[0.07]">
      {children}
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-white/10 text-[9px] font-bold text-yellow-400">
      {children}
    </span>
  );
}
