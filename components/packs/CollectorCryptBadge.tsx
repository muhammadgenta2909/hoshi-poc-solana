"use client";

// Schedule 1 (API Integration) branding: the page where the gacha lives must show
// the Collector Crypt logo, a "Powered by Collector Crypt" attribution, and a link
// to collectorcrypt.com. All three are here. Kept as a small, self-contained pill
// so it can sit wherever it's least intrusive on the gacha surface.

import { Img } from "./ui";

export default function CollectorCryptBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://collectorcrypt.com"
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white ${className}`}
    >
      <Img src="/logo-cc.png" alt="Collector Crypt" className="h-4 w-4 shrink-0 object-contain" />
      Powered by <span className="font-semibold text-zinc-100">Collector Crypt</span>
      <span aria-hidden className="text-zinc-500">
        ↗
      </span>
    </a>
  );
}
