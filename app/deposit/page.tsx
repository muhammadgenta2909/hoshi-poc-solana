"use client";

// Isi Saldo (top-up) — on-ramp Rupiah ke SALDO in-app lewat IDRX.
//
// Alur: pilih nominal → topUpBalance() bikin order → buka halaman bayar IDRX (hosted) → balik ke
// /deposit → halaman ini me-RESUME order-nya (poll getPaymentOrder) sampai FULFILLED → saldo naik.
// Fulfilment server HANYA mengkredit saldo (BalanceEntry) — TIDAK ada USDC treasury yang dipakai.
//
// Resume dipisah dari alur pack/listing: pakai key localStorage sendiri (hoshi_pending_topup)
// supaya tak bentrok dengan resume open-packs (hoshi_pending_pay).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PAYMENTS_ENABLED,
  getBalance,
  getPaymentOrder,
  isTerminalPaymentStatus,
  topUpBalance,
  type PaymentOrder,
  type PaymentStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { AccountShell, Panel, PrimaryButton, GOLD } from "@/components/account/ui";

const idr = new Intl.NumberFormat("id-ID");
const PENDING_TOPUP_KEY = "hoshi_pending_topup";
const PRESETS = [50_000, 100_000, 250_000, 500_000];
const MIN_TOPUP = 20_000;
const POLL_MS = 4_000;

// "checking" = balik dari halaman bayar, sedang MENGECEK status (spinner netral, BUKAN klaim sukses).
// "awaiting" = order ternyata masih PENDING (belum dibayar) → tampilkan layar bayar, bukan sukses.
// "polling"  = order BENAR-BENAR sudah dibayar (PAID/FULFILLING), saldo sedang disiapkan.
type Stage = "idle" | "creating" | "checking" | "awaiting" | "polling" | "done" | "error";

function terminalMessage(status: PaymentStatus): string {
  if (status === "EXPIRED") return "Pembayaran kedaluwarsa. Silakan ulangi.";
  if (status === "REFUND_DUE")
    return "Pembayaran diterima tapi saldo belum masuk. Tim kami akan menindaklanjuti — jangan bayar lagi.";
  return "Pembayaran gagal. Silakan ulangi.";
}

export default function DepositPage() {
  const { token, login } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(100_000);
  const [custom, setCustom] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [creditedIdr, setCreditedIdr] = useState<number | null>(null);
  // Order yang di-resume (dipakai layar "awaiting": nominal + tombol buka halaman bayar yang SAMA).
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const resumedRef = useRef(false);
  // id interval poll resume, supaya tombol "Isi nominal lain" bisa menghentikannya lalu balik ke form.
  const pollRef = useRef<number | null>(null);
  // Token TERBARU via ref. Effect resume ber-deps [] jalan SEKALI saat mount — sering SEBELUM token
  // ter-hidrasi dari storage, jadi menutupnya di closure = token basi (null) selamanya → tiap tick
  // jatuh ke login() yang di background gagal/menggantung → poll tak pernah query order → loading
  // ABADI walau saldo sudah masuk. Ref membuat tiap tick membaca token yang SEKARANG.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const effectiveAmount = custom.trim() ? Number(custom.replace(/\D/g, "")) : amount;
  const canSubmit =
    Number.isFinite(effectiveAmount) && effectiveAmount >= MIN_TOPUP && stage !== "creating";

  const refreshBalance = useCallback(async () => {
    if (!token) return;
    try {
      const b = await getBalance(token);
      setBalance(b.balanceIdrx);
    } catch {
      /* abaikan — saldo cuma info */
    }
  }, [token]);

  useEffect(() => {
    // setState terjadi di dalam async refreshBalance (bukan sinkron di effect) — false-positive.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void refreshBalance();
  }, [refreshBalance]);

  // RESUME: balik dari halaman bayar → poll order tersimpan sampai FULFILLED.
  useEffect(() => {
    if (resumedRef.current) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_TOPUP_KEY);
    } catch {
      pending = null;
    }
    if (!pending) return;
    resumedRef.current = true;
    // Balik dari halaman bayar: JANGAN langsung klaim sukses. Mulai netral "checking" (cuma cek
    // status). Tick pertama mengoreksi ke stage yang benar begitu order ter-fetch: "done" kalau
    // FULFILLED, "polling" ("Pembayaran diproses ✓") kalau PAID/FULFILLING, "awaiting" (layar bayar)
    // kalau masih PENDING — mis. user klik Back tanpa membayar. Tanpa ini order PENDING salah tampil
    // "Pembayaran diproses ✓" padahal uangnya belum masuk (false success di halaman uang).
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setStage("checking");

    let alive = true;
    const clear = () => {
      try {
        localStorage.removeItem(PENDING_TOPUP_KEY);
      } catch {
        /* ignore */
      }
    };
    const tick = async () => {
      const t = tokenRef.current;
      if (!t) return; // token belum ter-hidrasi → lewati; tick berikutnya coba lagi (JANGAN pop login
      //                  di background poll — itu yang bikin loading abadi saat token sesaat null).
      try {
        const fetched = await getPaymentOrder(pending as string, t);
        if (!alive) return;
        setOrder(fetched);
        if (fetched.status === "FULFILLED") {
          window.clearInterval(interval);
          clear();
          setCreditedIdr(fetched.priceIdr);
          setStage("done");
          void refreshBalance();
        } else if (isTerminalPaymentStatus(fetched.status)) {
          window.clearInterval(interval);
          clear();
          setErrorMsg(terminalMessage(fetched.status));
          setStage("error");
        } else if (fetched.status === "PAID" || fetched.status === "FULFILLING") {
          // Benar-benar sudah dibayar, saldo sedang disiapkan → "diproses ✓"; poll lanjut ke FULFILLED.
          setStage("polling");
        } else {
          // PENDING = order dibuat tapi BELUM dibayar (klik Back tanpa menuntaskan bayar / VA belum
          // ditransfer). JANGAN klaim sukses — tampilkan layar bayar (awaiting) memakai paymentUrl
          // yang SAMA (bukan order baru) → nol risiko bayar dobel; poll tetap menangkap begitu lunas.
          setStage("awaiting");
        }
      } catch {
        /* transien — terus poll; status terminal yang menghentikan */
      }
    };
    const interval = window.setInterval(() => void tick(), POLL_MS);
    pollRef.current = interval;
    void tick();
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
    // token/login/refreshBalance dibaca saat fire; sekali-jalan dijaga resumedRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tinggalkan order PENDING yang di-resume: hentikan poll, lupakan order, balik ke form isi-saldo.
  // Callback backend tetap mengkredit kalau ternyata user jadi membayar setelah ini.
  const leaveResume = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    try {
      localStorage.removeItem(PENDING_TOPUP_KEY);
    } catch {
      /* ignore */
    }
    setOrder(null);
    setErrorMsg(null);
    setStage("idle");
  }, []);

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setErrorMsg(null);
    setStage("creating");
    try {
      let t = token;
      if (!t) t = await login();
      const order = await topUpBalance(effectiveAmount, t);
      if (order.paymentUrl) {
        try {
          localStorage.setItem(PENDING_TOPUP_KEY, order.merchantOrderId);
        } catch {
          /* private mode — resume tak tersedia, tapi callback tetap mengkredit */
        }
        window.location.href = order.paymentUrl;
        return;
      }
      // Tanpa paymentUrl (mis. QRIS inline) → poll di tempat.
      try {
        localStorage.setItem(PENDING_TOPUP_KEY, order.merchantOrderId);
      } catch {
        /* ignore */
      }
      resumedRef.current = false; // biarkan effect resume mengambil alih pada mount berikutnya
      setStage("polling");
      // Poll langsung di sini juga.
      const poll = window.setInterval(async () => {
        try {
          const next = await getPaymentOrder(order.merchantOrderId, t as string);
          if (next.status === "FULFILLED") {
            window.clearInterval(poll);
            try {
              localStorage.removeItem(PENDING_TOPUP_KEY);
            } catch {
              /* ignore */
            }
            setCreditedIdr(next.priceIdr);
            setStage("done");
            void refreshBalance();
          } else if (isTerminalPaymentStatus(next.status)) {
            window.clearInterval(poll);
            setErrorMsg(terminalMessage(next.status));
            setStage("error");
          }
        } catch {
          /* transien */
        }
      }, POLL_MS);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Gagal membuat tagihan.");
      setStage("error");
    }
  }, [canSubmit, token, login, effectiveAmount, refreshBalance]);

  return (
    <AccountShell active="Vault">
      <Panel className="mx-auto max-w-xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-white sm:text-[22px]">Isi Saldo</h1>
            <p className="mt-1 text-[13px] text-zinc-400">
              Tambah saldo Rupiah untuk beli kartu tanpa ribet bayar tiap transaksi.
            </p>
          </div>
          <span className="shrink-0 rounded-xl border border-white/10 bg-[#0f0d08] px-3 py-2 text-right shadow-[0_10px_30px_-18px_rgba(0,0,0,0.8)]">
            <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
              Saldo
            </span>
            <span className="block text-[15px] font-bold text-[#F7D046]">
              Rp {idr.format(balance ?? 0)}
            </span>
          </span>
        </div>

        {!PAYMENTS_ENABLED && (
          <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
            Pembayaran belum aktif di lingkungan ini.
          </div>
        )}

        {stage === "done" ? (
          <div className="mt-6 flex flex-col items-center gap-3 py-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <p className="text-base font-semibold text-white">Saldo berhasil diisi!</p>
            {creditedIdr != null && (
              <p className="text-[14px] text-zinc-300">
                +Rp {idr.format(creditedIdr)} masuk ke saldomu.
              </p>
            )}
            <p className="text-[13px] text-zinc-400">
              Saldo sekarang{" "}
              <span className="font-semibold text-yellow-200">Rp {idr.format(balance ?? 0)}</span>.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStage("idle");
                  setCustom("");
                }}
                className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                Isi lagi
              </button>
              <Link
                href="/vault"
                className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
                style={{ backgroundImage: GOLD }}
              >
                Ke Vault →
              </Link>
            </div>
          </div>
        ) : stage === "checking" ? (
          /* Balik dari halaman bayar → cek status dulu. Netral: TIDAK mengklaim sukses. */
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
            <p className="text-sm text-zinc-400">Memeriksa status pembayaran…</p>
          </div>
        ) : stage === "polling" ? (
          /* Hanya untuk order yang BENAR-BENAR sudah dibayar (PAID/FULFILLING). */
          <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
            <p className="text-sm font-medium text-emerald-400">Pembayaran diterima ✓</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Lagi dikonfirmasi — biasanya 1–3 menit. Saldo otomatis update di sini.
            </p>
          </div>
        ) : stage === "awaiting" ? (
          /* Order masih PENDING (belum dibayar) → layar bayar, BUKAN layar sukses. */
          <div className="mt-6 flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-zinc-300">
              Isi saldo{" "}
              <span className="font-semibold text-white">
                Rp {idr.format(order?.priceIdr ?? 0)}
              </span>
            </p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Pembayaran belum selesai. Buka lagi halaman pembayaran untuk menuntaskannya, atau isi
              nominal lain.
            </p>
            {order?.paymentUrl && (
              <button
                type="button"
                onClick={() => {
                  window.location.href = order.paymentUrl as string;
                }}
                className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
                style={{ backgroundImage: GOLD }}
              >
                Buka Halaman Pembayaran ↗
              </button>
            )}
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
              Menunggu pembayaran…
            </p>
            <button
              type="button"
              onClick={leaveResume}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Isi nominal lain
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {PRESETS.map((p) => {
                const active = !custom.trim() && amount === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setAmount(p);
                      setCustom("");
                    }}
                    className={`rounded-xl border px-3 py-3 text-[14px] font-semibold transition ${
                      active
                        ? "border-yellow-400/60 bg-yellow-400/[0.12] text-yellow-200"
                        : "border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/25"
                    }`}
                  >
                    {idr.format(p / 1000)}k
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-2">
              <label className="text-[13px] font-medium text-zinc-300">Atau nominal lain</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-zinc-500">
                  Rp
                </span>
                <input
                  inputMode="numeric"
                  value={custom ? idr.format(Number(custom.replace(/\D/g, "")) || 0) : ""}
                  onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
                  placeholder={`Minimal ${idr.format(MIN_TOPUP)}`}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2.5 pl-11 pr-4 text-[15px] text-zinc-100 outline-none transition focus:border-yellow-400/50"
                />
              </div>
              {custom.trim() && effectiveAmount < MIN_TOPUP && (
                <p className="text-[12px] text-red-400">
                  Minimal isi saldo Rp {idr.format(MIN_TOPUP)}.
                </p>
              )}
            </div>

            {errorMsg && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                {errorMsg}
              </div>
            )}

            <PrimaryButton
              type="button"
              onClick={submit}
              disabled={!canSubmit || !PAYMENTS_ENABLED}
              className="mt-6 w-full"
            >
              {stage === "creating"
                ? "Menyiapkan…"
                : `Isi Rp ${idr.format(effectiveAmount || 0)} →`}
            </PrimaryButton>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
              Bayar via QRIS / e-wallet / VA. Saldo bertambah otomatis setelah pembayaran
              dikonfirmasi.
            </p>
          </>
        )}
      </Panel>
    </AccountShell>
  );
}
