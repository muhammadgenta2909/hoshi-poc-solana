import { Img } from "./ui";

const NAV = [
  { label: "Open Packs", active: true, icon: "/nav-icon.png" },
  { label: "Marketplace" },
  { label: "Vault" },
];

export default function TopNav() {
  return (
    <header className="sticky top-0 z-30">
      <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3.5 sm:px-6">
        {/* left — primary nav (desktop) */}
        <nav className="hidden flex-1 items-center gap-7 md:flex">
          {NAV.map((n) => (
            <NavLink key={n.label} label={n.label} active={n.active} icon={n.icon} />
          ))}
        </nav>

        {/* center — logo */}
        <div className="flex flex-1 justify-center md:flex-none">
          {/* translate-y nudges the wordmark to optical center: the asset carries a
              white underline-glow in its lower half, so the box centers a touch high. */}
          <Img
            src="/logo.png"
            alt="HOSHI"
            className="h-[34px] w-auto translate-y-[7px] sm:h-[38px]"
          />
        </div>

        {/* right — currency + wallet */}
        <div className="flex flex-1 items-center justify-end gap-3">
          <button className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 sm:inline-flex">
            <Img src="/idrx.png" alt="IDRX" className="h-5 w-5" />
            IDRX
            <Img src="/cached.png" alt="" className="h-[18px] w-[18px]" />
          </button>
          <button className="inline-flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10">
            <span className="tracking-wide">x023dsa..2931</span>
            <Img src="/metamask.png" alt="MetaMask" className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* mobile nav row */}
      <nav className="no-scrollbar flex items-center gap-6 overflow-x-auto px-4 py-2.5 md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.label} label={n.label} active={n.active} icon={n.icon} />
        ))}
      </nav>
    </header>
  );
}

// Active-nav gold gradient (Figma: linear #FBB222 -> #FFF600).
const NAV_GRADIENT = "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)";

function NavLink({
  label,
  active,
  icon,
}: {
  label: string;
  active?: boolean;
  icon?: string;
}) {
  return (
    <button
      className={`relative inline-flex items-center gap-2 whitespace-nowrap text-[15px] font-semibold leading-none transition ${
        active ? "" : "text-zinc-100 hover:text-white"
      }`}
    >
      {icon && <Img src={icon} alt="" className="h-4 w-auto" />}
      {/* wrapper shrinks to the text, so the underline tracks the label width only */}
      <span className="relative inline-block">
        <span
          style={
            active
              ? {
                  backgroundImage: NAV_GRADIENT,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter: "drop-shadow(0 1px 4px rgba(251,178,34,0.35))",
                }
              : undefined
          }
        >
          {label}
        </span>
        {active && (
          <span
            className="absolute -bottom-1 left-0 h-[3px] w-full rounded-full"
            style={{
              backgroundImage: NAV_GRADIENT,
              boxShadow: "0 1px 4px rgba(251,178,34,0.35)",
            }}
          />
        )}
      </span>
    </button>
  );
}
