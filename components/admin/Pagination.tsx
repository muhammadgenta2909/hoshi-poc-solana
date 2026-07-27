"use client";

// Pagination bernomor untuk semua tabel admin. Bisa lompat langsung ke halaman
// mana pun (mis. ke 4) — bukan cuma Prev/Next satu-satu. Menyusut jadi ellipsis
// saat halaman banyak.

type Props = {
  page: number;
  totalPages: number;
  total?: number;
  onPage: (p: number) => void;
  /** Label item, mis. "listing" → "128 listings". Default "item". */
  unit?: string;
};

function windowPages(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [1];
  if (page > 4) out.push("…");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) out.push(i);
  if (page < totalPages - 3) out.push("…");
  out.push(totalPages);
  return out;
}

export default function Pagination({ page, totalPages, total, onPage, unit = "item" }: Props) {
  const pages = windowPages(page, Math.max(1, totalPages));
  const btn =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-[13px] font-medium transition";

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
      <span>
        {total != null && (
          <span className="tabular-nums text-zinc-400">{total.toLocaleString("id-ID")}</span>
        )}{" "}
        {total != null ? `${unit}${total === 1 ? "" : "s"} · ` : ""}Page{" "}
        <span className="tabular-nums text-zinc-300">{page}</span> of{" "}
        <span className="tabular-nums text-zinc-300">{Math.max(1, totalPages)}</span>
      </span>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          className={`${btn} border-white/10 text-zinc-300 hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent`}
          aria-label="Previous page"
        >
          ←
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-zinc-600">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? "page" : undefined}
              className={`${btn} tabular-nums ${
                p === page
                  ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-200 shadow-[0_0_0_1px_rgba(250,204,21,0.25)]"
                  : "border-white/10 text-zinc-300 hover:bg-white/[0.05]"
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className={`${btn} border-white/10 text-zinc-300 hover:bg-white/[0.05] disabled:opacity-30 disabled:hover:bg-transparent`}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}
