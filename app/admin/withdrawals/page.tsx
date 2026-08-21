"use client";

// Admin: proses penarikan saldo penjual (payout manual). Approve = admin sudah transfer manual →
// tandai PAID. Reject = kembalikan saldo ke penjual. Saldo sudah di-hold saat request dibuat.

import { useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import { useTabParam } from "@/lib/useTabParam";
import {
  getAdminWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  type AdminWithdrawal,
} from "@/lib/admin-api";
import { formatIdr } from "@/components/packs/ui";
import { ConfirmDialog } from "@/components/account/ui";

const STATUS_UI: Record<AdminWithdrawal["status"], { label: string; cls: string }> = {
  REQUESTED: { label: "Perlu diproses", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  PAID: { label: "Selesai", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  REJECTED: { label: "Ditolak", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "REQUESTED", label: "Perlu diproses" },
  { key: "PAID", label: "Selesai" },
  { key: "REJECTED", label: "Ditolak" },
  { key: "", label: "Semua" },
];
// Nilai tab yang sah untuk persist di URL (?status=…) — refresh/back tetap di tab yang dipilih.
const FILTER_KEYS = FILTERS.map((f) => f.key);

const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdminWithdrawalsPage() {
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<AdminWithdrawal[]>([]);
  // Tab status persisten di URL (?status=…) → refresh/back/forward memulihkan tab yang aktif.
  const [filter, setFilter] = useTabParam<string>("REQUESTED", FILTER_KEYS, "status");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Pesan error bertema (pengganti alert() bawaan browser).
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setLoading(true);
    getAdminWithdrawals(token, filter || undefined)
      .then((r) => {
        if (alive) {
          setRows(r);
          setError(null);
        }
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, filter, reloadKey]);

  async function act(w: AdminWithdrawal, kind: "approve" | "reject") {
    if (!token || busyId) return;
    const note =
      kind === "approve"
        ? (window.prompt("No. referensi transfer (opsional):", "") ?? "")
        : (window.prompt("Alasan tolak (saldo dikembalikan ke penjual):", "") ?? "");
    if (kind === "reject" && note.trim() === "") return; // alasan wajib untuk tolak
    setBusyId(w.id);
    try {
      if (kind === "approve") await approveWithdrawal(w.id, note.trim(), token);
      else await rejectWithdrawal(w.id, note.trim(), token);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setAlertMsg(e instanceof Error ? e.message : "Gagal memproses");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Penarikan Saldo</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Payout manual. Transfer ke rekening penjual lalu klik <b>Tandai transfer</b>. Saldo sudah di-hold saat
          request; <b>Tolak</b> mengembalikan saldo.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key || "ALL"}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-medium transition ${
              filter === f.key
                ? "border-yellow-400/50 bg-yellow-400/[0.12] text-yellow-200"
                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading…</p>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-12 text-center text-sm text-zinc-500">
          Tidak ada penarikan{filter ? ` berstatus ${filter}` : ""}.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((w) => {
            const s = STATUS_UI[w.status];
            return (
              <div
                key={w.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold tabular-nums text-white">Rp {formatIdr(w.amountIdr)}</p>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                        {s.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-zinc-300">
                      {w.method === "BANK" ? "🏦" : "📱"} <b>{w.destBank}</b> · {w.destAccount} · a.n. {w.destName}
                    </p>
                    <p className="mt-0.5 text-[12px] text-zinc-500">
                      Penjual: {w.userLabel} ·{" "}
                      <span className="font-mono">
                        {w.userWallet.slice(0, 6)}…{w.userWallet.slice(-4)}
                      </span>{" "}
                      · {dt(w.createdAt)}
                    </p>
                    {w.note && <p className="mt-1 text-[12px] text-zinc-400">Catatan: {w.note}</p>}
                  </div>

                  {w.status === "REQUESTED" && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => act(w, "approve")}
                        className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[13px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20 disabled:opacity-40"
                      >
                        ✓ Tandai transfer
                      </button>
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => act(w, "reject")}
                        className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-1.5 text-[13px] font-semibold text-red-300 transition hover:bg-red-400/20 disabled:opacity-40"
                      >
                        ✕ Tolak
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!alertMsg}
        title="Gagal memproses"
        message={alertMsg}
        confirmLabel="OK"
        danger
        onConfirm={() => setAlertMsg(null)}
      />
    </div>
  );
}
