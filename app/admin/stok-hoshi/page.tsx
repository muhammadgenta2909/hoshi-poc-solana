"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   STOK HOSHI YANG BELUM BISA DIBELI — perbaikan data flag `sellable`.

   ┌──── APA YANG SEBENARNYA RUSAK ─────────────────────────────────────────────────────────────┐
   │ Flag `sellable` default FALSE, dan itu benar: bentuk baris seed/chart-filler IDENTIK dengan │
   │ bentuk stok sungguhan (`source=HOSHI` + `sellerId=null` adalah bentuk DEFAULT setiap        │
   │ listing), jadi tanpa flag itu satu baris hiasan bisa dibeli orang — dan dijanjikan          │
   │ pengirimannya. Tapi stok yang diimpor SEBELUM importListings menulis `sellable: true` ikut  │
   │ tertahan: kartunya TERPAJANG, nol Rupiah bisa masuk, dan sampai layar ini ada, satu-satunya │
   │ jalan keluarnya adalah mengedit Postgres.                                                   │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   KENAPA LAYAR INI MEMAKSA MEMBACA DULU. Rute tulisnya sengaja menerima DAFTAR ID EKSPLISIT
   (maks 500), BUKAN sapuan massal — karena tidak ada predikat otomatis yang bisa membedakan
   "kartu fisik yang ada di rak" dari "chart filler". Hanya manusia yang tahu. Jadi di sini tidak
   ada tombol "tandai semua": operator memilih baris satu per satu, dari daftar yang ia baca.

   AMAN DIJALANKAN DUA KALI. Tulisannya berpagar `sellable: !sellable` di backend, jadi panggilan
   kedua mengubah 0 baris dan menjawab `changed: 0` — bukan error, bukan efek ganda.
   REVERSIBEL: salah tandai bisa diturunkan lagi (`sellable=false`) selama belum ada yang membeli.

   NOL DANA: layar ini tidak memindahkan uang apa pun. Yang berubah cuma boleh-tidaknya sebuah
   baris dibeli.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminUnsellableStock,
  setAdminListingsSellable,
  type AdminUnsellableStock,
  type SetListingsSellableResult,
} from "@/lib/admin-api";
import Thumb from "@/components/admin/Thumb";
import { ConfirmDialog } from "@/components/account/ui";

/** Batas per panggilan di backend. Ditegakkan juga di sini supaya tidak pernah jadi error 400. */
const MAX_PER_CALL = 500;

/** Ukuran halaman baca. Server menjepitnya di 1000 dan melaporkan `hasMore`. */
const PAGE_SIZE = 200;

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const dt = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });

export default function AdminStokHoshiPage() {
  const { token } = useAdminAuth();
  const [data, setData] = useState<AdminUnsellableStock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ sellable: boolean; ids: string[] } | null>(null);
  const [result, setResult] = useState<SetListingsSellableResult | null>(null);

  /**
   * Muat satu halaman.
   *
   * `append` menyambung halaman berikutnya (server menjepit `limit` di 1000 dan melaporkan
   * `hasMore`), supaya daftar panjang tetap bisa dibaca seluruhnya tanpa satu query raksasa.
   * Memuat ULANG dari nol SELALU membuang pilihan: id yang tidak lagi ada di daftar berarti
   * sudah ditandai, dan menyimpannya hanya membuat panggilan berikutnya mengirim id tak relevan.
   */
  const load = useCallback(
    async (offset = 0) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getAdminUnsellableStock(token, PAGE_SIZE, offset);
        // `offset` (bukan state) yang memutuskan sambung-atau-ganti. Itu yang menjaga `load`
        // TETAP hanya bergantung pada `token`: kalau ia ikut bergantung pada `data`, efek mount
        // `[load]` akan memuat ulang setiap kali datanya berubah — lingkaran tanpa henti.
        setData((prev) => (offset > 0 && prev ? { ...res, data: [...prev.data, ...res.data] } : res));
        if (offset === 0) setPicked(new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat stok.");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.data ?? [];
    if (!q) return all;
    return all.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.set ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }, [data, search]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_PER_CALL) next.add(id);
      return next;
    });

  /** "Pilih semua" HANYA untuk yang sedang TERSARING & TERLIHAT — bukan untuk seluruh tabel. */
  const pickVisible = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (next.size >= MAX_PER_CALL) break;
        next.add(r.id);
      }
      return next;
    });

  const apply = async (sellable: boolean, ids: string[]) => {
    if (!token || busy || ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await setAdminListingsSellable(ids, sellable, token);
      setResult(res);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah flag.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Stok Hoshi Belum Bisa Dibeli</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Baris listing stok Hoshi yang <b>tidak bisa dibeli</b> karena flag{" "}
          <span className="font-mono">sellable=false</span>. Kartunya terpajang, tapi nol Rupiah
          bisa masuk untuknya — dan kartu yang tidak bisa dibeli juga tidak akan pernah bisa diminta
          kirim.
        </p>
      </header>

      {/* ╔═══ BACA DULU ═══╗ Kotak ini sengaja tidak bisa dilewatkan: daftar di bawah MENCAMPUR
          stok sungguhan dengan baris seed, dan tidak ada cara otomatis membedakannya. */}
      <div className="rounded-2xl border border-amber-400/35 bg-amber-400/[0.08] p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400/20 text-[15px]">
            👀
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold text-amber-200">Baca dulu, baru tandai</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-amber-100/85">
              Daftar ini <b>mencampur</b> stok fisik yang benar-benar ada di rak Hoshi dengan baris
              seed/placeholder — bentuknya identik di database dan <b>tidak bisa</b> dibedakan
              otomatis{data?.placeholderDetection === "MANUAL_ONLY" && " (server sendiri menyatakan: MANUAL_ONLY)"}.
              Menaikkan flag berarti baris itu <b>SEKARANG BISA DIBELI</b> pembeli sungguhan, dan
              sesudah dibeli ia akan diminta dikirim. Tandai <b>hanya</b> baris yang kartunya
              benar-benar ada.
            </p>
            {/* Kalimat DARI SERVER: kosong = tidak ada stok yang tertahan. Ia yang mencegah
                "ratusan baris tertahan tapi dashboard cuma merender tabel". */}
            {(data?.actionRequired ?? []).map((a) => (
              <p
                key={a}
                className="mt-2 rounded-xl border border-amber-400/25 bg-black/25 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-100"
              >
                {a}
              </p>
            ))}
            {data?.note && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-100/60">{data.note}</p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-zinc-100">
                {result.changed} dari {result.requested} baris berubah
              </p>
              {/* "Tidak berubah karena SUDAH benar" vs "tidak berubah karena DITOLAK pagar" adalah
                  dua hal yang sangat berbeda, dan `changed: 0` saja tidak membedakannya. Server
                  memisahkannya di `alreadyCorrect`; tanpa menampilkannya, menjalankan ulang layar
                  ini terasa seperti judi. */}
              {(result.alreadyCorrect?.length ?? 0) > 0 && (
                <p className="mt-1 text-[12px] leading-relaxed text-emerald-300/85">
                  {result.alreadyCorrect?.length} id flagnya memang <b>sudah sesuai</b> — tidak ada
                  yang perlu diubah. Menjalankan ini dua kali aman: panggilan kedua mengubah 0
                  baris, bukan error dan bukan efek ganda.
                </p>
              )}
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">{result.warning}</p>
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </div>
          {result.skipped.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3.5 py-2.5">
              <p className="text-[12px] font-semibold text-amber-200">
                {result.skipped.length} id dilewati — tidak memenuhi pagar bentuk
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-100/70">
                Artinya baris itu tidak ada, berasal dari katalog CollectorCrypt, milik penjual
                user, atau statusnya bukan ACTIVE. Ketiganya memang bukan “stok Hoshi”.
              </p>
              <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-500">
                {result.skipped.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama / set / id…"
          className="min-w-[220px] flex-1 rounded-xl border border-white/12 bg-black/30 px-3.5 py-2.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
        />
        <span className="text-[12px] text-zinc-500">
          {data ? `${data.data.length} dimuat dari ${data.total} total` : "—"}
        </span>
        {data?.hasMore && (
          <button
            type="button"
            onClick={() => void load(data.data.length)}
            disabled={loading}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
          >
            Muat {Math.min(PAGE_SIZE, data.total - data.data.length)} lagi
          </button>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          Muat ulang
        </button>
      </div>

      {/* Bilah aksi. Muncul hanya saat ada yang dipilih — tidak ada jalan untuk menekan tombol
          ini tanpa sengaja memilih baris lebih dulu. */}
      {picked.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-[#F2C101]/40 bg-[#1a1608] px-4 py-3 shadow-lg">
          <span className="text-[13px] font-semibold text-[#F2C101]">
            {picked.size} baris dipilih
            {picked.size >= MAX_PER_CALL && " (maksimum per sekali jalan)"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              disabled={busy}
              className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
            >
              Bersihkan pilihan
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ sellable: false, ids: [...picked] })}
              disabled={busy}
              className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-zinc-400 transition hover:bg-white/[0.08] disabled:opacity-40"
              title="Untuk membatalkan salah tandai. Baris di daftar ini memang sudah sellable=false, jadi ini biasanya tidak mengubah apa pun."
            >
              Tandai TIDAK bisa dibeli
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ sellable: true, ids: [...picked] })}
              disabled={busy}
              className="rounded-lg bg-[#F2C101] px-4 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
            >
              {busy ? "Menyimpan…" : `Tandai BISA DIBELI (${picked.size})`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          {data && data.total === 0
            ? "Tidak ada stok Hoshi yang tertahan — semua baris ACTIVE sudah bisa dibeli."
            : "Tak ada yang cocok dengan pencarianmu."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={pickVisible}
                    className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/[0.12]"
                    title="Pilih semua baris yang SEDANG TERLIHAT (mengikuti pencarian di atas)"
                  >
                    Pilih terlihat
                  </button>
                </th>
                <th className="px-4 py-3 font-semibold">Kartu</th>
                <th className="px-4 py-3 font-semibold">Harga</th>
                <th className="px-4 py-3 font-semibold">Vault</th>
                <th className="px-4 py-3 font-semibold">Dipajang</th>
                <th className="px-4 py-3 font-semibold">Id</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const on = picked.has(r.id);
                return (
                  <tr
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    className={`cursor-pointer border-t border-white/[0.05] transition ${
                      on ? "bg-[#F2C101]/[0.08]" : "bg-[#100e08]/60 hover:bg-white/[0.03]"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 accent-[#F2C101]"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={null} alt={r.name} />
                        <div className="min-w-0">
                          <p
                            className="max-w-[260px] truncate font-semibold text-zinc-100"
                            title={r.name}
                          >
                            {r.name}
                          </p>
                          {r.set && <p className="truncate text-[11px] text-zinc-500">{r.set}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-zinc-200">
                      {rp(r.priceIdrx)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">
                      {r.vaultLocation ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">
                      {dt(r.listedAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-zinc-600">{r.id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        danger={confirm?.sellable === true}
        title={
          confirm?.sellable ? "Buka penjualan untuk baris ini?" : "Tutup penjualan baris ini?"
        }
        message={
          confirm?.sellable
            ? `${confirm.ids.length} baris akan menjadi BISA DIBELI pembeli sungguhan. Sesudah dibeli, ` +
              "pembeli berhak meminta kartunya dikirim ke rumah — jadi lanjutkan hanya kalau kartu " +
              "fisiknya benar-benar ada di rak Hoshi. Bisa dibatalkan lagi selama belum ada yang membeli."
            : `${confirm?.ids.length ?? 0} baris akan ditandai TIDAK bisa dibeli. Order yang terlanjur ` +
              "PENDING untuk baris itu akan gagal di settlement dan perlu di-refund manual."
        }
        confirmLabel={confirm?.sellable ? "Ya, buka penjualan" : "Ya, tutup penjualan"}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c) void apply(c.sellable, c.ids);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
