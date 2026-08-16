"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { ADMIN_BG } from "@/lib/theme";
import { Img } from "@/components/packs/ui";

/** Tujuan sesudah login = ?next= (kalau ada & internal /admin), else dashboard. Cegah open-redirect
 *  (harus mulai "/admin" dan bukan halaman login itu sendiri). Dibaca dari window (client-only) supaya
 *  tak perlu Suspense useSearchParams. */
function nextDest(): string {
  if (typeof window === "undefined") return "/admin";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/admin") && n !== "/admin/login" ? n : "/admin";
}

export default function AdminLoginPage() {
  const { login, isAdmin } = useAdminAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Sudah admin (mis. bounce dari layout saat verify sesaat) → balik ke halaman ASAL, bukan
    // selalu dashboard — refresh di /admin/withdrawals tetap mendarat di /admin/withdrawals.
    if (isAdmin) router.replace(nextDest());
  }, [isAdmin, router]);

  if (isAdmin) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      router.replace(nextDest());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: ADMIN_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] px-8 py-10">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Img src="/logo.png" alt="HOSHI" className="h-8 w-auto" />
          <span className="rounded-md bg-yellow-400/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-yellow-300">
            Admin
          </span>
          <p className="text-sm text-zinc-500">Sign in to the backoffice.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          {error && <p className="text-center text-xs text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}
