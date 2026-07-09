"use client";

import Link from "next/link";
import { useCart } from "@/lib/useCart";
import { PAGE_BG } from "@/lib/theme";
import TopNav from "@/components/packs/TopNav";
import { GradientText, Idrx, Img } from "@/components/packs/ui";

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;

export default function CartPage() {
  const { items, remove, clear, count } = useCart();
  const total = items.reduce((sum, l) => sum + l.price, 0);

  return (
    <div
      className="relative min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Marketplace" />

      <main className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-zinc-500">Cards you&apos;ve saved to buy.</p>
            <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Your Cart
            </h1>
          </div>
          {count > 0 && (
            <button
              type="button"
              onClick={clear}
              className="text-[13px] text-zinc-500 transition hover:text-red-400"
            >
              Clear all
            </button>
          )}
        </header>

        {count === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
            <GradientText style={JERSEY} className="text-3xl">
              Cart is empty
            </GradientText>
            <p className="text-sm text-zinc-400">
              Add cards from the marketplace to line them up for purchase.
            </p>
            <Link
              href="/marketplace"
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
            >
              Go to Marketplace →
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {items.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#181507] p-3"
                >
                  <Img src={l.image} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-white">{l.name}</p>
                    <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                      {l.grade} · {l.set} · {l.rarity}
                    </p>
                    <Idrx amount={l.price} size={14} className="mt-1.5 text-[14px] text-zinc-200" />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link
                      href={`/marketplace/${l.id}`}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#171717]"
                      style={{ backgroundImage: "linear-gradient(180deg,#FBB222,#FFF600)" }}
                    >
                      Buy
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(l.id)}
                      className="text-[12px] text-zinc-500 transition hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center justify-between rounded-2xl bg-[#181507] p-5">
              <span className="text-[15px] uppercase tracking-wide text-zinc-400" style={JERSEY}>
                Total ({count} {count === 1 ? "card" : "cards"})
              </span>
              <Idrx amount={total} size={22} className="text-2xl text-white" />
            </div>
            <p className="mt-3 text-center text-[12px] text-zinc-600">
              POC: buy each card from its detail page (single-card checkout). Cart-wide checkout
              lands with IDRX settlement.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
