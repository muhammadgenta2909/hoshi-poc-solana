"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/useCart";
import TopNav from "@/components/packs/TopNav";
import { PayModal } from "@/components/packs/PayWithRupiah";
import { GradientText, Idrx, Img } from "@/components/packs/ui";

const JERSEY = { fontFamily: "var(--font-jersey)" } as const;
const GOLD = "linear-gradient(180deg,#FBB222,#FFF600)";

export default function CartPage() {
  const { items, remove, clear, count } = useCart();
  const total = items.reduce((sum, l) => sum + l.price, 0);
  // Kartu yang sedang dibayar via PayModal (REAL — createListingOrder → IDRX/Duitku, SAMA seperti
  // beli satu-satu; di produksi redirect asli). `bulk` = mode "Checkout semua" → maju ke kartu
  // berikutnya sesudah satu lunas (kalau tak ke-redirect duluan).
  const [payId, setPayId] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  return (
    <div
      className="page-bg relative min-h-screen text-zinc-100"
      style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
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
                    <button
                      type="button"
                      onClick={() => {
                        setBulk(false);
                        setPayId(l.id);
                      }}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-[#171717]"
                      style={{ backgroundImage: GOLD }}
                    >
                      Buy
                    </button>
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

            <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-[#181507] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-4 sm:justify-start">
                <span className="text-[15px] uppercase tracking-wide text-zinc-400" style={JERSEY}>
                  Total ({count} {count === 1 ? "card" : "cards"})
                </span>
                <Idrx amount={total} size={22} className="text-2xl text-white" />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (items[0]) {
                    setBulk(true);
                    setPayId(items[0].id);
                  }
                }}
                className="w-full rounded-xl px-5 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 sm:w-auto"
                style={{ backgroundImage: GOLD }}
              >
                Checkout semua ({count}) →
              </button>
            </div>
            <p className="mt-3 text-center text-[12px] text-zinc-600">
              Bayar tiap kartu lewat QRIS / e-wallet / VA (sama seperti beli satu-satu).
            </p>
          </>
        )}
      </main>

      {/* Pembayaran REAL (createListingOrder → IDRX/Duitku), SAMA persis dgn beli kartu satu-satu —
          tak ada penanganan khusus, tinggal dipakai di produksi. Sesudah satu kartu lunas: keluarkan
          dari keranjang; mode "Checkout semua" lanjut ke kartu berikutnya. */}
      {payId && (
        <PayModal
          listingId={payId}
          packType="MARKETPLACE"
          successHref="/vault"
          onFulfilled={() => {
            const paid = payId;
            remove(paid);
            if (bulk) {
              const next = items.find((i) => i.id !== paid);
              setPayId(next?.id ?? null);
            }
          }}
          onClose={() => {
            setPayId(null);
            setBulk(false);
          }}
        />
      )}
    </div>
  );
}
