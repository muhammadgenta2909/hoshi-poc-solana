"use client";

// Tarik saldo penjual (in-app IDRX) → rekening bank / e-wallet. BEDA dari /withdraw (yang untuk
// KIRIM KARTU FISIK). Payout MANUAL: request → saldo langsung di-hold → admin transfer manual →
// tandai selesai. Kalau ditolak, saldo dikembalikan.

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import {
  ApiError,
  getBalance,
  getMyWithdrawals,
  requestWithdrawal,
  type Withdrawal,
} from "@/lib/api";
import TopNav from "@/components/packs/TopNav";
import { formatIdr, GOLD_GRADIENT } from "@/components/packs/ui";
import { ACCOUNT_BG } from "@/lib/theme";

const MIN_IDR = 10_000;

const STATUS_UI: Record<Withdrawal["status"], { label: string; cls: string }> = {
  REQUESTED: { label: "Diproses", cls: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  PAID: { label: "Selesai ✓", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  REJECTED: { label: "Ditolak", cls: "border-red-400/30 bg-red-400/10 text-red-300" },
};

const dt = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function TarikSaldoPage() {
  const { token, login, hydrated } = useAuth();
  const { setVisible } = useWalletConnect();

  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"BANK" | "EWALLET">("BANK");
  const [destBank, setDestBank] = useState("");
  const [destAccount, setDestAccount] = useState("");
  const [destName, setDestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    Promise.all([
      getBalance(token).catch(() => null),
      getMyWithdrawals(token).catch(() => [] as Withdrawal[]),
    ]).then(([b, w]) => {
      if (!alive) return;
      if (b) setBalance(b.balanceIdrx);
      setHistory(w);
    });
    return () => {
      alive = false;
    };
  }, [token, reloadKey]);

  const amountNum = Number(amount);
  const enough = (balance ?? 0) >= amountNum;
  const valid =
    Number.isFinite(amountNum) &&
    amountNum >= MIN_IDR &&
    enough &&
    destBank.trim().length > 0 &&
    destAccount.trim().length > 0 &&
    destName.trim().length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      let t = token;
      if (!t) t = await login();
      await requestWithdrawal(
        {
          amount: Math.floor(amountNum),
          method,
          destBank: destBank.trim(),
          destAccount: destAccount.trim(),
          destName: destName.trim(),
        },
        t,
      );
      setOk("Permintaan tarik dikirim — saldo sudah di-hold. Admin akan transfer manual ke rekeningmu.");
      setAmount("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setVisible(true);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-yellow-400/40";

  return (
    <div className="min-h-screen text-zinc-100" style={{ background: ACCOUNT_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
      <TopNav active="Vault" />
      <main className="mx-auto max-w-[720px] px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Tarik Saldo</h1>
          <p className="mt-1 text-[13px] text-zinc-500">
            Cairkan saldo hasil jual kartu ke rekening bank / e-wallet. (Untuk kirim kartu fisik, pakai menu Withdraw.)
          </p>
        </header>

        {!hydrated ? (
          <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
        ) : !token ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="mb-3 text-sm text-zinc-400">Masuk dulu untuk melihat & menarik saldo.</p>
            <button
              type="button"
              onClick={() => setVisible(true)}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#171717]"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              Hubungkan Wallet
            </button>
          </div>
        ) : (
          <>
            {/* Saldo tersedia — kartu gelap, aksen emas saja (bukan gradient/glow tebal). */}
            <div className="mb-6 rounded-2xl border border-white/10 bg-[#0f0d08] px-5 py-4 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Saldo tersedia</p>
              <p className="mt-0.5 text-3xl font-extrabold tabular-nums text-white">
                {balance === null ? "…" : `Rp ${formatIdr(balance)}`}
              </p>
            </div>

            {/* Form tarik */}
            <div className="mb-8 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Jumlah tarik (Rp)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={MIN_IDR}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={`min. ${formatIdr(MIN_IDR)}`}
                  className={`${inputCls} tabular-nums`}
                />
                {amount !== "" && amountNum < MIN_IDR && (
                  <p className="mt-1 text-[12px] text-amber-400">Minimal Rp {formatIdr(MIN_IDR)}.</p>
                )}
                {amount !== "" && amountNum >= MIN_IDR && !enough && (
                  <p className="mt-1 text-[12px] text-red-400">Melebihi saldo tersedia.</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Metode</label>
                <div className="flex gap-2">
                  {(["BANK", "EWALLET"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                        method === m
                          ? "border-yellow-400/50 bg-yellow-400/[0.12] text-yellow-200"
                          : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
                      }`}
                    >
                      {m === "BANK" ? "Bank" : "E-Wallet"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    {method === "BANK" ? "Nama bank" : "E-wallet"}
                  </label>
                  <input
                    value={destBank}
                    onChange={(e) => setDestBank(e.target.value)}
                    placeholder={method === "BANK" ? "mis. BCA" : "mis. GoPay / OVO / DANA"}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    {method === "BANK" ? "No. rekening" : "No. HP terdaftar"}
                  </label>
                  <input
                    value={destAccount}
                    onChange={(e) => setDestAccount(e.target.value)}
                    placeholder={method === "BANK" ? "1234567890" : "08xxxxxxxxxx"}
                    className={`${inputCls} tabular-nums`}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Nama pemilik rekening</label>
                <input
                  value={destName}
                  onChange={(e) => setDestName(e.target.value)}
                  placeholder="Sesuai buku rekening / akun e-wallet"
                  className={inputCls}
                />
              </div>

              {error && <p className="text-[13px] text-red-400">{error}</p>}
              {ok && <p className="text-[13px] text-emerald-400">{ok}</p>}

              <button
                type="button"
                onClick={submit}
                disabled={!valid || busy}
                className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundImage: GOLD_GRADIENT }}
              >
                {busy ? "Mengirim…" : "Ajukan Penarikan"}
              </button>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Saat diajukan, saldo langsung di-hold. Admin akan transfer manual ke rekeningmu lalu menandai
                selesai. Kalau ditolak, saldo dikembalikan penuh.
              </p>
            </div>

            {/* Riwayat */}
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Riwayat penarikan</h2>
            {history.length === 0 ? (
              <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
                Belum ada penarikan.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((w) => {
                  const s = STATUS_UI[w.status];
                  return (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold tabular-nums text-zinc-100">Rp {formatIdr(w.amountIdr)}</p>
                        <p className="truncate text-[12px] text-zinc-500">
                          {w.destBank} · {w.destAccount} · {w.destName}
                        </p>
                        <p className="text-[11px] text-zinc-600">{dt(w.createdAt)}</p>
                        {w.note && <p className="mt-0.5 text-[11px] text-zinc-500">Catatan: {w.note}</p>}
                      </div>
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
