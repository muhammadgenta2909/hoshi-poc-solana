"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { API_BASE } from "./api";

const ADMIN_TOKEN_KEY = "hoshi_admin_token";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   PENYIMPANAN LOKAL MILIK LAYAR ADMIN

   Layar admin menyimpan beberapa hal di localStorage (draf formulir titipan, misalnya). Dua sifat
   localStorage membuat itu berbahaya di perangkat yang dipakai bergantian:

     1. Ia TIDAK ikut hilang saat logout. Token dihapus, draf tetap tinggal.
     2. Ia TIDAK tahu siapa yang menulisnya. Operator berikutnya membuka formulir yang sama dan
        mendapati data orang lain sudah terisi di sana.

   Gabungan keduanya berarti: operator A mencatat titipan (nama pemilik, nomor telepon, empat
   angka terakhir KTP, harga yang disepakati), belum sempat menyimpan, lalu logout. Operator B
   login di ponsel yang sama dan formulirnya terbuka SUDAH TERISI data orang yang tidak pernah
   ia temui — dan kalau ia tidak sadar, data itu ikut tersimpan ke titipan kartu yang salah.

   Dua pagar dipasang, dan keduanya memang perlu:
     • AWALAN. Setiap kunci admin memakai `ADMIN_STORAGE_PREFIX`, jadi semuanya bisa disapu
       sekaligus saat logout tanpa harus mendaftar satu per satu di sini. Kunci admin BARU wajib
       memakai awalan ini — kalau tidak, ia lolos dari sapuan.
     • AKHIRAN IDENTITAS. Kunci diakhiri sidik jari operator (`adminScopeId`), jadi seandainya
       sapuan gagal (mode privat, penyimpanan diblokir, tab lain menulis ulang setelahnya),
       operator B tetap membaca kunci yang BERBEDA dan tidak pernah melihat draf operator A.

   Satu pagar saja tidak cukup: sapuan bisa gagal diam-diam, dan pemberian akhiran saja akan
   meninggalkan draf operator A tersimpan selamanya di perangkat itu.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Awalan wajib untuk SEMUA kunci localStorage milik layar admin. Lihat blok di atas. */
export const ADMIN_STORAGE_PREFIX = "hoshi.admin.";

/**
 * Sidik jari operator yang sedang login, untuk ditempel sebagai akhiran kunci penyimpanan.
 *
 * Diambil dari klaim `sub` JWT (= id user admin), bukan dari token mentahnya: token berganti
 * setiap kali login, sementara `sub` tetap. Artinya operator yang SAMA menemukan drafnya kembali
 * setelah login ulang, sedangkan operator yang BERBEDA selalu membaca kunci yang berbeda.
 *
 * Tidak memverifikasi tanda tangan, dan memang tidak perlu: ini cuma memilih laci penyimpanan di
 * perangkat sendiri, bukan memberi izin apa pun. Yang memutuskan izin tetap AdminGuard di backend.
 * Kalau token tidak bisa dibaca, hasilnya "unknown" — laci tersendiri yang tidak bertabrakan
 * dengan milik siapa pun.
 */
export function adminScopeId(token: string | null): string {
  if (!token) return "anon";
  if (token === "admin_auth") return "dev";
  try {
    const raw = token.split(".")[1];
    if (!raw) return "unknown";
    // base64url → base64, lalu dikembalikan padding-nya (atob menolak panjang yang tak kelipatan 4).
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { sub?: unknown };
    const sub = typeof claims.sub === "string" ? claims.sub : "";
    // Dipangkas & disaring supaya kunci tetap kunci: id Prisma sudah aman, tapi tak ada gunanya
    // mempercayai isi token untuk membentuk nama kunci.
    const safe = sub.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    return safe || "unknown";
  } catch {
    return "unknown";
  }
}

/** Kunci penyimpanan admin yang sudah berawalan dan teridentifikasi. `base` tanpa awalan/akhiran. */
export function adminStorageKey(base: string, token: string | null): string {
  return `${ADMIN_STORAGE_PREFIX}${base}.${adminScopeId(token)}`;
}

/** Sapu SEMUA kunci berawalan admin. Dipanggil saat logout — lihat blok di atas. */
function clearAdminStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(ADMIN_STORAGE_PREFIX)) doomed.push(k);
    }
    // Dikumpulkan dulu baru dihapus: menghapus sambil mengiterasi menggeser indeks dan melewati kunci.
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* mode privat / penyimpanan diblokir — akhiran identitas di atas tetap menjaga pemisahannya */
  }
}

// DEV-ONLY escape hatch. `NEXT_PUBLIC_*` is inlined into the client bundle at
// build time, so shipping this secret would let anyone read it out of the JS and
// unlock the admin shell. (The backend's AdminGuard still rejects the fake
// "admin_auth" token, so no data leaks — but the UI shouldn't open at all.)
// In production this is "" and the branch below is dead: only a real JWT from
// POST /admin/login works.
const envAdminSecret =
  process.env.NODE_ENV === "development" ? process.env.NEXT_PUBLIC_ADMIN_SECRET || "" : "";

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function getServerSnapshot(): string | null {
  return null;
}

function setStoredToken(token: string | null) {
  if (token === null) localStorage.removeItem(ADMIN_TOKEN_KEY);
  else localStorage.setItem(ADMIN_TOKEN_KEY, token);
  listeners.forEach((l) => l());
}

type AdminAuthValue = {
  token: string | null;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // `hydrated` HARUS false sampai token benar-benar terbaca di client. useSyncExternalStore
  // mengembalikan getServerSnapshot()=null di render pertama (SSR + hydration), jadi kalau hydrated
  // langsung true, konsumen (admin layout) mengira "tak ada token → bukan admin" lalu bounce ke
  // /admin/login SEBELUM localStorage kebaca — refresh di subhalaman malah lempar ke dashboard.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMounted(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = (await res.json()) as { accessToken: string };
        setStoredToken(data.accessToken);
        return;
      }
    } catch {
      // fall through to env secret fallback
    }

    if (envAdminSecret && password === envAdminSecret) {
      setStoredToken("admin_auth");
      return;
    }

    throw new Error("Invalid admin credentials.");
  }, []);

  // Urutannya disengaja: sapu DULU, baru buang token. Membuang token lebih dulu akan
  // membangunkan konsumen (layar admin melompat ke /admin/login, komponen ter-unmount) dan
  // sapuan bisa tidak pernah sampai dijalankan.
  const logout = useCallback(() => {
    clearAdminStorage();
    setStoredToken(null);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ token, isAdmin: !!token, hydrated: mounted, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>.");
  return ctx;
}
