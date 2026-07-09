"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PAGE_BG } from "@/lib/theme";
import { useAdminAuth } from "@/lib/adminAuth";
import { Img } from "@/components/packs/ui";

type AdminLink = {
  label: string;
  href: string;
  icon: string;
};

const ADMIN_NAV: AdminLink[] = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Listings", href: "/admin/listings", icon: "📋" },
  { label: "Cards", href: "/admin/cards", icon: "🃏" },
  { label: "Messages", href: "/admin/messages", icon: "✉️" },
  { label: "Offers", href: "/admin/offers", icon: "💰" },
  { label: "History", href: "/admin/riwayat", icon: "📜" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, hydrated, logout } = useAdminAuth();
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(() => {
    router.push("/admin/login");
  }, [router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0907] text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!isAdmin) {
    if (pathname === "/admin/login") {
      return <>{children}</>;
    }
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl bg-white/[0.03] px-6 py-16 text-center">
          <Img src="/notes.png" alt="" className="h-12 opacity-40" />
          <p className="text-sm text-zinc-400">Admin access requires authentication.</p>
          <button
            type="button"
            onClick={handleLogin}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-6 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10"
          >
            Go to Login
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen text-zinc-100"
      style={{ background: PAGE_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/30">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <Link href="/admin">
            <Img src="/logo.png" alt="HOSHI" className="h-[26px] w-auto" />
          </Link>
          <span className="rounded-md bg-yellow-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-300">
            Admin
          </span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {ADMIN_NAV.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-[14px] font-medium transition ${
                  active
                    ? "bg-yellow-400/10 text-yellow-200 shadow-[0_0_0_1px_rgba(250,204,21,0.3)]"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          <div className="flex flex-col gap-2">
            <Link
              href="/marketplace"
              className="block rounded-xl px-3 py-2 text-[12px] text-zinc-500 transition hover:text-zinc-300"
            >
              ← Back to Marketplace
            </Link>
            <button
              type="button"
              onClick={() => { logout(); router.push("/admin/login"); }}
              className="block rounded-xl px-3 py-2 text-left text-[12px] text-red-400 transition hover:text-red-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
