"use client";

// Admin: proses kirim kartu fisik (redemption). Alur: REQUESTED → PACKING → SHIPPED (atau CANCELED).
// SHIPPED = kartu benar-benar dikirim CollectorCrypt + NFT di-burn (kartu keluar vault). Jalur REAL
// itu digerbang & belum diaktifkan (record-only) — di sini admin memajukan status; di staging kartu
// "hilang dari vault" disimulasi frontend saat SHIPPED.

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminRedemptions,
  updateRedemptionStatus,
  type AdminRedemption,
  type RedemptionSource,
  type RedemptionStatus,
} from "@/lib/admin-api";
import Thumb from "@/components/admin/Thumb";
import { ConfirmDialog } from "@/components/account/ui";

const STATUS_UI: Record<RedemptionStatus, { label: string; cls: string }> = {
  REQUESTED: { label: "Diminta", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  PACKING: { label: "Dikemas", cls: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  SHIPPED: { label: "Dikirim", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  CANCELED: { label: "Dibatalkan", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
};

// Asal kartu → SIAPA yang kirim fisik. PACK/CC_CATALOG/P2P fisiknya di gudang CollectorCrypt (CC
// kirim); HOSHI = stok fisik Hoshi sendiri (Hoshi kirim).
const SOURCE_UI: Record<
  RedemptionSource,
  { label: string; ships: string; byHoshi: boolean }
> = {
  PACK: { label: "Hasil pack", ships: "CC (gudang US)", byHoshi: false },
  CC_CATALOG: { label: "Katalog CC", ships: "CC (gudang US)", byHoshi: false },
  P2P: { label: "Beli antar user", ships: "CC (gudang US)", byHoshi: false },
  HOSHI: { label: "Stok Hoshi", ships: "Hoshi (stok sendiri)", byHoshi: true },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "REQUESTED", label: "Diminta" },
  { key: "PACKING", label: "Dikemas" },
  { key: "SHIPPED", label: "Dikirim" },
  { key: "CANCELED", label: "Dibatalkan" },
  { key: "", label: "Semua" },
];

const dt = (s: string) =>
  new Date(s).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminRedemptionsPage() {
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<AdminRedemption[]>([]);
  const [filter, setFilter] = useState<string>("REQUESTED");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Konfirmasi "Kirim" (SHIPPED = di prod nanti burn NFT + panggil CC) → butuh konfirmasi.
  const [confirmShip, setConfirmShip] = useState<AdminRedemption | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getAdminRedemptions(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (id: string, status: RedemptionStatus) => {
    if (!token || busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await updateRedemptionStatus(id, status, token);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah status.");
    } finally {
      setBusyId(null);
    }
  };

  const visible = filter ? rows.filter((r) => r.status === filter) : rows;

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Kirim Kartu Fisik</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Proses permintaan kirim kartu ke rumah. Saat <b>Dikirim</b> di produksi, kartu dikirim lewat
          CollectorCrypt & NFT-nya di-burn (keluar dari vault). Sekarang record-only — belum diarmed.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition ${
                on
                  ? "bg-white/[0.1] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                  : "bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06]"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-500">Memuat…</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">Belum ada permintaan kirim.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                <th className="px-4 py-3 font-semibold">Kartu</th>
                <th className="px-4 py-3 font-semibold">Asal / Kirim oleh</th>
                <th className="px-4 py-3 font-semibold">Tujuan</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.05] bg-[#100e08]/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Thumb src={r.cardImage} alt={r.cardName} />
                      <div className="min-w-0">
                        <p className="max-w-[220px] truncate font-semibold text-zinc-100" title={r.cardName}>
                          {r.cardName}
                        </p>
                        {r.cardSet && <p className="truncate text-[11px] text-zinc-500">{r.cardSet}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {r.source && SOURCE_UI[r.source] ? (
                      <div className="flex flex-col gap-1">
                        <span className="w-fit rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
                          {SOURCE_UI[r.source].label}
                        </span>
                        <span
                          className={`w-fit rounded-md px-2 py-0.5 text-[11px] font-bold ${
                            SOURCE_UI[r.source].byHoshi
                              ? "bg-[#F2C101]/15 text-[#F2C101]"
                              : "bg-sky-500/15 text-sky-300"
                          }`}
                        >
                          Kirim: {SOURCE_UI[r.source].ships}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-zinc-300">
                    <p className="font-semibold text-zinc-100">{r.recipientName}</p>
                    <p className="text-zinc-400">
                      {r.street}, {[r.city, r.state, r.country].filter(Boolean).join(", ")} {r.zip}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_UI[r.status].cls}`}>
                      {STATUS_UI[r.status].label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[12px] text-zinc-500">{dt(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {r.status === "REQUESTED" && (
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, "PACKING")}
                          disabled={busyId === r.id}
                          className="rounded-lg bg-sky-500/20 px-3 py-1 text-[12px] font-semibold text-sky-300 transition hover:bg-sky-500/30 disabled:opacity-40"
                        >
                          Kemas
                        </button>
                      )}
                      {(r.status === "REQUESTED" || r.status === "PACKING") && (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmShip(r)}
                            disabled={busyId === r.id}
                            className="rounded-lg bg-emerald-500/20 px-3 py-1 text-[12px] font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                          >
                            Kirim
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatus(r.id, "CANCELED")}
                            disabled={busyId === r.id}
                            className="rounded-lg bg-red-500/20 px-3 py-1 text-[12px] font-semibold text-red-400 transition hover:bg-red-500/30 disabled:opacity-40"
                          >
                            Batal
                          </button>
                        </>
                      )}
                      {(r.status === "SHIPPED" || r.status === "CANCELED") && (
                        <span className="text-[12px] text-zinc-600">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmShip}
        title="Tandai Dikirim?"
        message={
          confirmShip
            ? `"${confirmShip.cardName}" akan ditandai DIKIRIM ke ${confirmShip.city}. Di produksi (saat diarmed) ini memicu kirim fisik lewat CollectorCrypt + burn NFT — kartu keluar dari vault pemilik. Saat ini record-only.`
            : ""
        }
        confirmLabel="Tandai Dikirim"
        onConfirm={() => {
          const id = confirmShip?.id;
          setConfirmShip(null);
          if (id) void setStatus(id, "SHIPPED");
        }}
        onCancel={() => setConfirmShip(null)}
      />
    </div>
  );
}
