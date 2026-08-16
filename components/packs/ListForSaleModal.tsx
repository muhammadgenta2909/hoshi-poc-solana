"use client";

// Per-card "List for Sale" — pola CollectorCrypt: buka SATU kartu lalu pasang
// harga. Identitas kartu (art, nama, rarity, grade) sudah pasti dari hasil pull,
// jadi penjual tinggal menentukan HARGA. Tantangan UX-nya: penjual tidak tahu
// harus jual berapa. Form ini memberi PATOKAN + umpan balik langsung supaya harga
// bukan tebakan buta:
//   • Tawaran buyback CC (kalau ada) = "jual instan segini".
//   • Modal pack = biaya pack yang dibayar → jual di atasnya untuk untung.
//   • Saran harga + hitungan untung/rugi + "kamu terima penuh (tanpa potongan)".
// Submit menautkan listing ke NFT hasil pull via `fromPackMemo` (backend verifikasi).

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Listing } from "@/lib/market";
import { ApiError, createListing, getBuybackValue } from "@/lib/api";
import { pullToListingInput } from "@/lib/pullListing";
import { pullGradeLabel, type GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { useFinishListingEscrow } from "@/lib/useListingEscrow";
import { GOLD_GRADIENT, Img } from "./ui";

const idr = new Intl.NumberFormat("id-ID");

/** Flat POC rate, sama dengan yang dipakai lib/market.ts untuk baris "= USD".
 *  Satu angka = patokan dan marketplace tidak pernah mengutip harga berbeda. */
const USD_TO_IDR = 16_000;

const usd = (n: number) => `$${n.toFixed(2)}`;
const rp = (n: number) => `Rp ${idr.format(Math.round(n))}`;

export default function ListForSaleModal({
  pull,
  onClose,
  onListed,
}: {
  pull: GachaPull;
  onClose: () => void;
  onListed: (listing: Listing) => void;
}) {
  const { token, login } = useAuth();
  const { setVisible } = useWalletConnect();
  const finishEscrow = useFinishListingEscrow();

  // Grade kartu adalah FAKTA milik CollectorCrypt, bukan isian penjual — jadi ia
  // ditampilkan, bukan diminta. null = CC belum menjawab ⇒ kartunya belum boleh
  // dipajang (backend menolaknya juga, dengan alasan yang sama).
  const grade = useMemo(() => pullGradeLabel(pull), [pull]);
  const [price, setPrice] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal pack (yang dibayar user). priceUsdc = USDC base unit (6 desimal).
  const packUsd = pull.priceUsdc != null ? pull.priceUsdc / 1_000_000 : null;

  // Tawaran buyback CC — patokan nilai TERBAIK saat tersedia (≈85–93% nilai
  // pasar CC). Read-only: fetch-nya tidak mengeksekusi apa pun.
  const [ccUsd, setCcUsd] = useState<number | null>(null);
  // Selagi tawaran CC masih di-fetch, JANGAN tampilkan saran harga dulu: dulu ia
  // sempat mem-flash saran berbasis "modal pack" sepersekian detik sebelum angka
  // CC yang benar datang. Lebih baik tahan (skeleton) sampai patokan asli siap.
  const [ccPending, setCcPending] = useState<boolean>(() =>
    Boolean(token && pull.nftAddress),
  );
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!token || !pull.nftAddress) {
      setCcPending(false);
      return;
    }
    let alive = true;
    setCcPending(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    getBuybackValue(pull.nftAddress, token)
      .then((v) => {
        if (alive && v.available && v.refundAmountUsdc != null) {
          setCcUsd(v.refundAmountUsdc / 1_000_000);
        }
      })
      .catch(() => {
        /* patokan itu bonus — jangan pernah blokir listing karenanya */
      })
      .finally(() => {
        if (alive) setCcPending(false);
      });
    return () => {
      alive = false;
    };
  }, [token, pull.nftAddress]);

  // Anchor untuk saran harga: utamakan tawaran CC, kalau tidak ada pakai modal pack.
  const anchorUsd = ccUsd ?? packUsd;
  const suggestions = useMemo(() => {
    if (anchorUsd == null || anchorUsd <= 0) return [];
    // Kalau ada tawaran CC → dorong sedikit di atasnya. Kalau cuma modal pack →
    // margin lebih tebal (modal ≠ nilai kartu, biasanya kartu bagus > modal).
    const mults = ccUsd != null ? [1.1, 1.25] : [1.2, 1.5];
    return mults.map((m) => ({
      label: `+${Math.round((m - 1) * 100)}%`,
      idrValue: Math.round(anchorUsd * m * USD_TO_IDR),
    }));
  }, [anchorUsd, ccUsd]);

  const priceNum = Number(price);
  // Tanpa grade terverifikasi, tombol jual mati: lebih baik penjual menunggu
  // daripada pasar menerima klaim grade yang tidak berdasar.
  const valid = Number.isFinite(priceNum) && priceNum > 0 && grade !== null;
  const priceUsd = priceNum > 0 ? priceNum / USD_TO_IDR : 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      let t = token;
      if (!t) t = await login(); // pops connect/sign if needed
      const input = pullToListingInput(pull, { price: Math.round(priceNum) });
      const created = await createListing(input, t);
      // Real P2P (prod armed): kartu balik PENDING_ESCROW → penjual TTD transfer→escrow di sini.
      // Staging/mock: created sudah ACTIVE → finishEscrow no-op (tanpa popup tanda tangan).
      const listing = await finishEscrow(created, t);
      onListed(listing);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setVisible(true);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`List ${pull.nftName ?? "card"} for sale`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#141206] p-5 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar]:w-1.5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">List for Sale</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Card preview — identitas tetap, meniru "list this exact card" CC. */}
        <div className="mb-4 flex gap-3">
          <div className="h-24 w-[68px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
            <Img
              src={pull.nftImage ?? "/card-back.svg"}
              alt={pull.nftName ?? "Pulled card"}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">
              {pull.ccItemName ?? pull.nftName ?? "Your card"}
            </p>
            {pull.rarity && <p className="text-[12px] text-zinc-500">{pull.rarity}</p>}
            <p className="mt-1 text-[11px] text-zinc-500">Tertaut ke NFT hasil pull-mu.</p>
          </div>
        </div>

        {/* Patokan harga — tampil setelah patokan CC selesai dijemput, supaya
            box-nya muncul sudah lengkap (bukan nambah baris "beli instan" +
            ganti teks bantuan di tengah jalan). */}
        {ccPending ? (
          <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="h-3.5 w-28 animate-pulse rounded bg-white/[0.06]" />
              <span className="h-3.5 w-20 animate-pulse rounded bg-white/[0.06]" />
            </div>
            <span className="block h-3 w-3/4 animate-pulse rounded bg-white/[0.05]" />
          </div>
        ) : (
        <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {ccUsd != null && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-zinc-400">CollectorCrypt beli instan</span>
              <span className="text-right text-[13px] font-semibold text-emerald-300">
                {usd(ccUsd)} <span className="text-[11px] font-normal text-zinc-500">· ≈ {rp(ccUsd * USD_TO_IDR)}</span>
              </span>
            </div>
          )}
          {packUsd != null && (
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px] text-zinc-400">Modal pack kamu</span>
              <span className="text-right text-[13px] text-zinc-200">
                {usd(packUsd)} <span className="text-[11px] text-zinc-500">· ≈ {rp(packUsd * USD_TO_IDR)}</span>
              </span>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-zinc-500">
            {ccUsd != null
              ? "Pasang di atas tawaran CC untuk lebih untung — atau ambil tawaran instan itu."
              : packUsd != null
                ? "“Modal pack” = biaya pack yang kamu bayar, bukan nilai pasti kartu. Jual di atasnya untuk untung; cek harga kartu serupa di CollectorCrypt sebagai patokan."
                : "Belum ada patokan harga otomatis untuk kartu ini — cek harga kartu serupa di CollectorCrypt."}
          </p>
        </div>
        )}

        {/* Saran harga cepat (klik untuk mengisi field). Selagi patokan CC
            di-fetch, tampilkan skeleton — bukan saran berbasis modal pack yang
            langsung "loncat" begitu angka CC yang benar datang. */}
        {ccPending ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-zinc-500">Saran:</span>
            <span className="h-[26px] w-24 animate-pulse rounded-lg bg-white/[0.06]" />
            <span className="h-[26px] w-24 animate-pulse rounded-lg bg-white/[0.06]" />
          </div>
        ) : suggestions.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-zinc-500">Saran:</span>
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setPrice(String(s.idrValue))}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[12px] text-zinc-200 transition hover:bg-white/[0.08]"
                title={`${s.label} dari patokan`}
              >
                {rp(s.idrValue)}
              </button>
            ))}
          </div>
        ) : null}

        {/* Harga — satu-satunya field yang benar-benar diisi penjual. */}
        <label className="mb-1.5 block">
          <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
            Harga jual (IDRX)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="mis. 2.000.000"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
          />
          {priceNum > 0 && (
            <span className="mt-1.5 block text-[12px] text-zinc-500">
              ≈ {usd(priceUsd)}
              {packUsd != null && (
                <span className={priceUsd >= packUsd ? " text-emerald-400" : " text-amber-400"}>
                  {priceUsd >= packUsd
                    ? ` · untung ${rp((priceUsd - packUsd) * USD_TO_IDR)} dari modal pack`
                    : ` · ${rp((packUsd - priceUsd) * USD_TO_IDR)} di bawah modal pack`}
                </span>
              )}
              {ccUsd != null && (
                <span className={priceUsd >= ccUsd ? " text-emerald-400" : " text-amber-400"}>
                  {priceUsd >= ccUsd ? " · di atas tawaran CC ✓" : " · di bawah tawaran CC"}
                </span>
              )}
            </span>
          )}
        </label>

        {/* Kejelasan yang sering hilang di form jual: berapa yang benar-benar diterima. */}
        <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
          Pembeli membayar harga ini via Rupiah; hasilnya masuk <span className="text-zinc-300">saldomu</span> setelah dipotong komisi kecil Hoshi.
        </p>

        {/* Grade — DIBACA, bukan diisi. Dulu ini dua field yang bisa diedit dan
            default-nya "PSA 10" saat grade tak terbaca dari nama kartu; penjual
            yang menekan submit tanpa menyentuhnya menerbitkan klaim PSA 10 atas
            kartu yang grade aslinya tidak diketahui. Sekarang angkanya datang dari
            katalog CollectorCrypt, dan backend memakai versinya sendiri apa pun
            yang dikirim halaman ini. */}
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] text-zinc-400">Grade (dari CollectorCrypt)</span>
            <span
              className={`text-[13px] font-semibold ${grade ? "text-zinc-100" : "text-zinc-500"}`}
            >
              {grade ?? "Belum tersedia"}
            </span>
          </div>
          {grade ? (
            pull.ccGradeCert && (
              <p className="mt-1 text-[11px] text-zinc-500">Sertifikat {pull.ccGradeCert}</p>
            )
          ) : (
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-400/90">
              Data grade kartu ini belum bisa diambil dari CollectorCrypt, jadi kartunya
              belum bisa dipajang. Coba lagi beberapa saat lagi — kami tidak memajang
              kartu dengan grade yang tidak terverifikasi.
            </p>
          )}
        </div>

        {error && <p className="mb-3 text-[13px] text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundImage: GOLD_GRADIENT }}
        >
          {busy ? "Memajang…" : "List for Sale"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
