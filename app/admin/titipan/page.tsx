"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN — daftar kartu MILIK ORANG LAIN yang fisiknya dipegang Hoshi.

   ┌──── URUTAN YANG MENUTUP RISIKONYA ────────────────────────────────────────────────────────┐
   │ Kartu ada di tangan Hoshi DULU, baru listing-nya tayang. Orang yang sudah menyerahkan      │
   │ kartunya tidak bisa menjualnya diam-diam ke orang lain — jadi tidak akan pernah ada dua    │
   │ pembeli untuk satu kartu. Kebalikannya (pajang dulu, ambil kartunya nanti) adalah persis   │
   │ kasus yang ditakutkan pemilik produk, dan tidak ada kepintaran kode yang bisa menutupnya.  │
   │                                                                                            │
   │ Itu sebabnya baris "Belum diterima" di layar ini tidak punya tombol pajang sama sekali:    │
   │ bukan disembunyikan — memang belum ada haknya.                                             │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   "PERLU TINDAKAN" DIHITUNG SERVER, dan klien TIDAK menurunkannya sendiri. Daftar itu menyorot
   hal-hal yang kalau tidak ditampilkan akan tak terlihat selamanya: kartu yang dijanjikan tapi
   tak pernah datang, permintaan kembali yang menggantung, dan kartu terjual yang masih di rak.
   Menyalin aturannya ke sini hanya akan membuat salah satu salinan diam.

   BUKAN STOK HOSHI. Kartu di sini bukan milik Hoshi; Hoshi menyimpan dan menjualkan, memotong
   komisi yang disepakati, sisanya milik penjual. Halaman "Stok Hoshi" adalah barang Hoshi sendiri
   dan settle-nya berbeda total — jangan pernah menyamakan keduanya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/adminAuth";
import { getAdminConsignments, type AdminConsignment } from "@/lib/admin-api";
import { commissionPct, statusUi, type ConsignmentStatus } from "@/lib/consignment";
import Thumb from "@/components/admin/Thumb";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

/** Tab filter. "PERLU_TINDAKAN" dan "SELESAI" bukan status server — keduanya saringan klien. */
type Filter = "PERLU_TINDAKAN" | "SEMUA" | ConsignmentStatus | "SELESAI";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "PERLU_TINDAKAN", label: "Perlu tindakan" },
  { key: "SEMUA", label: "Semua" },
  { key: "INTAKE", label: "Belum diterima" },
  { key: "IN_CUSTODY", label: "Di Hoshi" },
  { key: "LISTED", label: "Dipajang" },
  { key: "SOLD", label: "Terjual" },
  { key: "SELESAI", label: "Selesai / hilang" },
];

const TERMINAL: string[] = ["RELEASED", "LOST", "CANCELLED"];

/** Foto yang mewakili satu baris: gambar listing kalau sudah dipajang, kalau belum foto DEPAN. */
const thumbOf = (c: AdminConsignment): string | null =>
  c.listing?.image ?? c.photos?.find((p) => p.kind === "FRONT")?.url ?? c.photos?.[0]?.url ?? null;

export default function AdminTitipanPage() {
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<AdminConsignment[]>([]);
  /** id → kalimat "perlu tindakan" DARI SERVER. Kosong = tidak ada yang tertunggak. */
  const [todo, setTodo] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("PERLU_TINDAKAN");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Satu tarikan tanpa filter status, lalu disaring di klien: jumlah titipan diukur dalam
      // puluhan (kartu FISIK yang harus diambil satu per satu), jadi memecahnya per status hanya
      // membuat hitungan tab-nya butuh request sendiri-sendiri.
      const res = await getAdminConsignments(token);
      setRows(res.rows);
      setTodo(new Map(res.actionRequired.map((t) => [t.id, t.reasons])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar titipan.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { INTAKE: 0, IN_CUSTODY: 0, LISTED: 0, SOLD: 0, SELESAI: 0 };
    for (const r of rows) {
      if (r.status === "INTAKE") c.INTAKE += 1;
      else if (r.status === "IN_CUSTODY") c.IN_CUSTODY += 1;
      else if (r.status === "LISTED") c.LISTED += 1;
      else if (r.status === "SOLD") c.SOLD += 1;
      else if (TERMINAL.includes(r.status)) c.SELESAI += 1;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "PERLU_TINDAKAN" && !todo.has(r.id)) return false;
      if (filter === "SELESAI" && !TERMINAL.includes(r.status)) return false;
      if (
        filter !== "SEMUA" &&
        filter !== "PERLU_TINDAKAN" &&
        filter !== "SELESAI" &&
        r.status !== filter
      )
        return false;
      if (!q) return true;
      return (
        r.cardName.toLowerCase().includes(q) ||
        (r.certNumber ?? "").toLowerCase().includes(q) ||
        r.consignorNameAtIntake.toLowerCase().includes(q) ||
        (r.consignor?.displayName ?? "").toLowerCase().includes(q) ||
        (r.consignor?.walletAddress ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, todo]);

  const countFor = (k: Filter): number | null => {
    if (k === "PERLU_TINDAKAN") return todo.size;
    if (k === "SEMUA") return rows.length;
    if (k === "SELESAI") return counts.SELESAI;
    return counts[k as keyof typeof counts] ?? null;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-zinc-100">Titipan</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
            Kartu milik orang lain yang fisiknya dipegang Hoshi. Kartu diterima dulu, baru boleh
            dipajang — itu yang membuat satu kartu tidak bisa terjual dua kali.
          </p>
        </div>
        <Link
          href="/admin/titipan/baru"
          className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
          style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
        >
          + Titipan baru
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = countFor(f.key);
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                active
                  ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]"
              }`}
            >
              {f.label}
              {n != null && n > 0 && <span className="ml-1.5 text-[11px] opacity-70">{n}</span>}
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kartu / pemilik / no. sertifikat…"
          className="ml-auto w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-yellow-400/40 sm:w-72"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-[13px] text-zinc-500">Memuat…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-[14px] font-semibold text-zinc-300">
            {rows.length === 0
              ? "Belum ada titipan."
              : filter === "PERLU_TINDAKAN"
                ? "Tidak ada yang tertunggak."
                : "Tidak ada baris pada saringan ini."}
          </p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {rows.length === 0
              ? "Catat kesepakatan pertama lewat tombol “Titipan baru”."
              : "Coba saringan “Semua”."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((c) => {
            const ui = statusUi(c.status);
            const reasons = todo.get(c.id) ?? [];
            return (
              <li key={c.id}>
                <Link
                  href={`/admin/titipan/${c.id}`}
                  className="flex gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/15 hover:bg-white/[0.04]"
                >
                  <Thumb src={thumbOf(c)} alt={c.cardName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-zinc-100">
                        {c.cardName}
                      </span>
                      {c.gradeLabel && (
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-300">
                          {c.gradeLabel}
                        </span>
                      )}
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ui.cls}`}>
                        {ui.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[12px] text-zinc-500">
                      Milik {c.consignorNameAtIntake}
                      {c.consignor?.displayName ? ` · ${c.consignor.displayName}` : ""}
                      {c.custodyAcceptedAt ? ` · di Hoshi sejak ${dt(c.custodyAcceptedAt)}` : ""}
                      {c.storageLocation ? ` · ${c.storageLocation}` : ""}
                    </p>
                    {reasons.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {reasons.map((t) => (
                          <li
                            key={t}
                            className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-semibold text-zinc-100">{rp(c.askPriceIdr)}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      komisi {commissionPct(c.commissionBps)}%
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
