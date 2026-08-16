"use client";

// Kirim kartu fisik ke rumah (redeem). Pilih alamat tersimpan → konfirmasi → POST /redemptions.
//
// RECORD-ONLY: server cuma MENCATAT permintaan (tidak burn/transfer NFT). Kartu tetap di wallet
// sampai admin memproses pengiriman — modal menyampaikan ini dengan jujur ke user.

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  getMyAddresses,
  requestRedemption,
  type ShippingAddress,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { GOLD } from "@/components/account/ui";

export default function RedeemModal({
  nftAddress,
  cardName,
  onClose,
  onRequested,
}: {
  nftAddress: string;
  cardName: string | null;
  onClose: () => void;
  onRequested?: () => void;
}) {
  const { token, login } = useAuth();
  const [addresses, setAddresses] = useState<ShippingAddress[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let t = token;
        if (!t) t = await login();
        const list = await getMyAddresses(t);
        if (!alive) return;
        setAddresses(list);
        const def = list.find((a) => a.isDefault) ?? list[0];
        setSelectedId(def?.id ?? null);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Gagal memuat alamat.");
        setAddresses([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token, login]);

  const submit = useCallback(async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let t = token;
      if (!t) t = await login();
      await requestRedemption({ nftAddress, shippingAddressId: selectedId }, t);
      setDone(true);
      onRequested?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim permintaan.");
    } finally {
      setSubmitting(false);
    }
  }, [selectedId, submitting, token, login, nftAddress, onRequested]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kirim kartu fisik ke rumah"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Kirim kartu ke rumah</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              📦
            </div>
            <p className="text-base font-semibold text-white">Permintaan terkirim!</p>
            <p className="max-w-[20rem] text-[13px] leading-relaxed text-zinc-400">
              Kami akan kemas &amp; kirim <span className="text-zinc-200">{cardName ?? "kartu"}</span>{" "}
              ke alamatmu. NFT tetap di wallet-mu sampai pengiriman diproses.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD }}
            >
              Selesai
            </button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-400">
              Tukar kartu ini jadi kartu fisik yang dikirim ke rumah. Pilih alamat tujuan.
            </p>

            {addresses === null ? (
              <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
                Memuat alamat…
              </div>
            ) : addresses.length === 0 ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-4 text-[13px] text-amber-200">
                Belum ada alamat pengiriman.{" "}
                <Link href="/settings" className="font-semibold underline underline-offset-2">
                  Tambah alamat di Settings →
                </Link>
              </div>
            ) : (
              <div className="grid gap-2">
                {addresses.map((a) => {
                  const active = a.id === selectedId;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedId(a.id)}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        active
                          ? "border-yellow-400/60 bg-yellow-400/[0.08]"
                          : "border-white/10 bg-white/[0.03] hover:border-white/25"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-zinc-100">{a.fullName}</span>
                        {a.isDefault && (
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-zinc-300">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">
                        {[a.street, a.apt, a.city, a.state, a.zip, a.country]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!selectedId || submitting}
              className="mt-5 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: GOLD }}
            >
              {submitting ? "Mengirim…" : "Kirim ke alamat ini →"}
            </button>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-500">
              Gratis untuk diminta. NFT tetap di wallet sampai pengiriman diproses.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
