"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_BG, ADMIN_PANEL } from "@/lib/theme";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminSupportUnread } from "@/lib/support";
import { Img } from "@/components/packs/ui";

type AdminLink = {
  label: string;
  href: string;
  icon: string;
};

const ADMIN_NAV: AdminLink[] = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Listings", href: "/admin/listings", icon: "📋" },
  { label: "Users", href: "/admin/users", icon: "👥" },
  // Cards page (katalog master-data) disembunyikan dari nav — marketplace = Listings,
  // katalog CC = sync. Route /admin/cards masih ada (reversible).
  { label: "Messages", href: "/admin/messages", icon: "✉️" },
  { label: "Offers", href: "/admin/offers", icon: "💰" },
  { label: "Vault", href: "/admin/vault", icon: "🏦" },
  { label: "History", href: "/admin/riwayat", icon: "📜" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, isAdmin, hydrated, logout } = useAdminAuth();
  const [unread, setUnread] = useState(0);

  const isLoginRoute = pathname === "/admin/login";

  // Auto-redirect ke halaman login — tidak perlu klik tombol "Go to Login" lagi.
  useEffect(() => {
    if (hydrated && !isAdmin && !isLoginRoute) router.replace("/admin/login");
  }, [hydrated, isAdmin, isLoginRoute, router]);

  // Badge unread pada nav Messages.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getAdminSupportUnread(token)
      .then((r) => { if (alive) setUnread(r.unread); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token, pathname]);

  // Login page merender dirinya sendiri (tanpa shell).
  if (isLoginRoute) return <>{children}</>;

  if (!hydrated || !isAdmin) {
    return (
      <div
        className="flex min-h-screen items-center justify-center text-zinc-500"
        style={{ background: ADMIN_BG }}
      >
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen overflow-hidden text-zinc-100"
      style={{ background: ADMIN_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <aside
        className="flex w-60 shrink-0 flex-col border-r border-white/[0.06]"
        style={{ background: ADMIN_PANEL }}
      >
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-[18px]">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Img src="/logo.png" alt="HOSHI" className="h-[24px] w-auto" />
          </Link>
          <span className="rounded-md bg-yellow-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-300">
            Admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {ADMIN_NAV.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            const showBadge = n.href === "/admin/messages" && unread > 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14px] font-medium transition ${
                  active
                    ? "bg-yellow-400/10 text-yellow-200 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.28)]"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
                }`}
              >
                <span className="text-[15px] leading-none">{n.icon}</span>
                <span className="flex-1">{n.label}</span>
                {showBadge && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[11px] font-bold text-[#171717]">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <button
            type="button"
            onClick={() => { logout(); router.replace("/admin/login"); }}
            className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <span className="text-[15px] leading-none">⎋</span>
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
