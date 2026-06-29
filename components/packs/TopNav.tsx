import { IdrxGlyph, SwapIcon } from "./ui";

const NAV = [
  { label: "Open Packs", active: true },
  { label: "Marketplace" },
  { label: "Vault" },
];

export default function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-black/40 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
        {/* left — primary nav (desktop) */}
        <nav className="hidden flex-1 items-center gap-6 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.label} label={n.label} active={n.active} />
          ))}
        </nav>

        {/* center — wordmark */}
        <div className="flex flex-1 justify-center md:flex-none">
          <span className="font-pixel text-lg tracking-wider text-yellow-400 drop-shadow-[0_2px_0_rgba(0,0,0,0.45)] sm:text-xl">
            HOSHI
          </span>
        </div>

        {/* right — currency + wallet */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <button className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10 sm:inline-flex">
            <IdrxGlyph size={14} />
            IDRX
            <SwapIcon className="h-3 w-3 text-zinc-400" />
          </button>
          <button className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
            <span className="font-mono">x023dsa..2931</span>
            <span className="text-base leading-none">🦊</span>
          </button>
        </div>
      </div>

      {/* mobile nav row */}
      <nav className="no-scrollbar flex items-center gap-6 overflow-x-auto border-t border-white/5 px-4 py-2 md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.label} label={n.label} active={n.active} />
        ))}
      </nav>
    </header>
  );
}

function NavLink({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={`relative whitespace-nowrap text-sm font-medium transition ${
        active ? "text-yellow-400" : "text-zinc-400 hover:text-zinc-100"
      }`}
    >
      {label}
      {active && (
        <span className="absolute -bottom-1.5 left-0 h-0.5 w-full rounded-full bg-yellow-400" />
      )}
    </button>
  );
}
