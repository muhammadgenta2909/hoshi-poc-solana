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
  { label: "Transaksi", href: "/admin/transactions", icon: "💸" },
  { label: "Penarikan", href: "/admin/withdrawals", icon: "🏧" },
  { label: "Kirim Kartu", href: "/admin/redemptions", icon: "📦" },
  // Tarif ongkir kirim DOMESTIK (stok Hoshi, kurir lokal). Sampai layar ini ada, resolusi tarif
  // jatuh ke TIER PENAMPUNG di kode — angka yang belum diputuskan pemilik produk, yang SEDANG
  // ditagihkan ke pembeli sungguhan. Ia harus bisa ditemukan tanpa curl.
  { label: "Ongkir Kirim", href: "/admin/ongkir", icon: "🚚" },
  // Stok Hoshi yang tertahan `sellable=false` (kartu terpajang, nol Rupiah bisa masuk).
  { label: "Stok Hoshi", href: "/admin/stok-hoshi", icon: "🏷️" },
  // Titipan = kartu MILIK ORANG LAIN yang fisiknya dipegang Hoshi (titip-jual, komisi 5%). Beda
  // dari "Stok Hoshi" (kartu milik Hoshi sendiri) dan itu bukan soal penamaan: keduanya settle
  // dengan cara yang berbeda — stok Hoshi seluruh harganya masuk kas Hoshi, titipan 95%-nya milik
  // penjual. Layar ini juga satu-satunya tempat serah terima kartu bisa dicatat.
  { label: "Titipan", href: "/admin/titipan", icon: "🤝" },
  { label: "Listings", href: "/admin/listings", icon: "📋" },
  { label: "Users", href: "/admin/users", icon: "👥" },
  // Cards page (katalog master-data) disembunyikan dari nav — marketplace = Listings,
  // katalog CC = sync. Route /admin/cards masih ada (reversible).
  { label: "Messages", href: "/admin/messages", icon: "✉️" },
  { label: "Offers", href: "/admin/offers", icon: "💰" },
  // /admin/vault (inventory read-only) DISEMBUNYIKAN dari nav — custody kartu fisik ada di CC
  // (Hoshi cuma front-end), jadi view ini informasi read-only yang bikin bingung & tumpang-tindih
  // dgn "Kirim Kartu". Route masih ada (reversible) kalau nanti perlu.
  { label: "History", href: "/admin/riwayat", icon: "📜" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, isAdmin, hydrated, logout } = useAdminAuth();
  const [unread, setUnread] = useState(0);
  // Laci nav untuk layar sempit. Ada karena satu layar admin memang dipakai DI LUAR meja: serah
  // terima kartu titipan dilakukan di rumah pemiliknya, dari ponsel. Sidebar tetap 240px di ≥lg
  // (desktop tidak berubah sama sekali); di bawah itu ia jadi laci supaya konten punya lebar penuh.
  const [navOpen, setNavOpen] = useState(false);

  const isLoginRoute = pathname === "/admin/login";

  // Pindah halaman = tutup laci. Tanpa ini, tap sebuah menu di ponsel meninggalkan laci terbuka
  // menutupi halaman yang baru saja dibuka.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setNavOpen(false);
  }, [pathname]);

  // Auto-redirect ke halaman login — bawa path SEKARANG sbg ?next= supaya sesudah login (atau
  // sesudah verify sesaat saat refresh) user balik ke halaman ini, bukan selalu ke dashboard.
  useEffect(() => {
    if (hydrated && !isAdmin && !isLoginRoute) {
      const next = pathname && pathname !== "/admin" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/admin/login${next}`);
    }
  }, [hydrated, isAdmin, isLoginRoute, pathname, router]);

  // Badge unread pada nav Messages — REALTIME(-ish): fetch awal + poll tiap 15 detik + refetch
  // begitu tab kembali fokus/terlihat. Jadi angka pesan baru muncul tanpa perlu refresh manual.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () => {
      getAdminSupportUnread(token)
        .then((r) => { if (alive) setUnread(r.unread); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
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

  // Isi sidebar — SATU definisi, dirender dua kali: sebagai kolom tetap di desktop dan sebagai
  // laci di ponsel. Menyalinnya berarti dua menu yang bisa menyimpang, dan yang menyimpang selalu
  // yang dipakai di lapangan.
  const sidebar = (
    <>
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-[18px]">
          <button
            type="button"
            onClick={() => setNavOpen(false)}
            aria-label="Tutup menu"
            className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100 lg:hidden"
          >
            ✕
          </button>
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
    </>
  );

  return (
    <div
      className="flex h-screen overflow-hidden text-zinc-100"
      style={{ background: ADMIN_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      {/* Desktop: kolom tetap, persis seperti sebelumnya. */}
      <aside
        className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] lg:flex"
        style={{ background: ADMIN_PANEL }}
      >
        {sidebar}
      </aside>

      {/* Ponsel: laci di atas konten. Dirender hanya saat terbuka supaya tidak ada panel tak
          terlihat yang menangkap tap. */}
      {navOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside
            className="relative flex w-64 max-w-[82vw] flex-col border-r border-white/[0.06] shadow-2xl"
            style={{ background: ADMIN_PANEL }}
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Bilah atas ponsel: tanpa ini menu admin tidak bisa dijangkau sama sekali di layar sempit. */}
        <header
          className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 lg:hidden"
          style={{ background: ADMIN_PANEL }}
        >
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Buka menu"
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.06] text-[18px] leading-none text-zinc-200 transition hover:bg-white/[0.12]"
          >
            ☰
          </button>
          <Link href="/admin" className="flex items-center gap-2.5">
            <Img src="/logo.png" alt="HOSHI" className="h-[22px] w-auto" />
          </Link>
          <span className="rounded-md bg-yellow-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-yellow-300">
            Admin
          </span>
          {unread > 0 && (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[11px] font-bold text-[#171717]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
