"use client";

// Riwayat kirim kartu fisik (redemption) milik user. Active = masih diproses (Diminta/Dikemas),
// Complete = Dikirim / Dibatalkan. Data REAL dari getMyRedemptions.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getMyRedemptions,
  isDomesticRedemption,
  type CardRedemption,
  type RedemptionStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/useAuth";
import { useTabParam } from "@/lib/useTabParam";
import {
  AccountShell,
  Panel,
  EmptyState,
  TextInput,
  GhostButton,
  SearchIcon,
  HistoryIcon,
} from "@/components/account/ui";
import { Img } from "@/components/packs/ui";

type View = "Active" | "Complete";
const VIEWS: readonly View[] = ["Active", "Complete"];

const AMBER = "border-amber-400/30 bg-amber-400/10 text-amber-300";
const SKY = "border-sky-400/30 bg-sky-400/10 text-sky-300";
const EMERALD = "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
const RED = "border-red-400/30 bg-red-400/10 text-red-300";

const STATUS_UI: Record<RedemptionStatus, { label: string; cls: string }> = {
  REQUESTED: { label: "Diminta", cls: AMBER },
  AWAITING_PAYMENT: { label: "Menunggu bayar ongkir", cls: AMBER },
  READY_TO_FUND: { label: "Siap ditandatangani", cls: AMBER },
  FUNDING: { label: "Menyiapkan", cls: SKY },
  // FUNDED = ongkirnya SUDAH didanai ke wallet user tapi burn-nya BELUM ditandatangani: kartunya
  // masih utuh di vault dan yang kurang cuma satu tanda tangan. Jadi BUKAN "Menyiapkan" (yang
  // terbaca seolah sistem sedang bekerja dan user tinggal menunggu) — labelnya disamakan PERSIS
  // dengan STATUS_LABEL.FUNDED di ShippingFlowModal, dan warnanya AMBER seperti status lain yang
  // menunggu aksi user, bukan SKY yang dipakai status "sedang berjalan".
  FUNDED: { label: "Menunggu tanda tanganmu", cls: AMBER },
  BURN_SUBMITTED: { label: "Diproses", cls: SKY },
  IN_TRANSIT: { label: "Dalam perjalanan", cls: SKY },
  DELIVERED: { label: "Terkirim", cls: EMERALD },
  PACKING: { label: "Dikemas", cls: SKY },
  SHIPPED: { label: "Dikirim", cls: EMERALD },
  CANCELED: { label: "Dibatalkan", cls: RED },
  REFUND_DUE: { label: "Refund diproses", cls: AMBER },
  RECLAIM_DUE: { label: "Perlu ditinjau", cls: AMBER },
  SHIP_FAILED_POST_BURN: { label: "Perlu bantuan tim", cls: RED },
};

// "Diproses" = masih berjalan / butuh tindakan. "Selesai" = DELIVERED / SHIPPED / CANCELED.
const ACTIVE_STATUSES: RedemptionStatus[] = [
  "REQUESTED",
  "AWAITING_PAYMENT",
  "READY_TO_FUND",
  "FUNDING",
  "FUNDED",
  "BURN_SUBMITTED",
  "IN_TRANSIT",
  "PACKING",
  "REFUND_DUE",
  "RECLAIM_DUE",
  "SHIP_FAILED_POST_BURN",
];

const dt = (s: string) =>
  new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function WithdrawHistoryPage() {
  const { token, hydrated } = useAuth();
  // View aktif persisten di URL (?view=…) → refresh/back/forward memulihkan tab yang dibuka.
  const [view, setView] = useTabParam<View>("Active", VIEWS, "view");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CardRedemption[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await getMyRedemptions(token));
    } catch {
      /* jaringan gagal — biarkan kosong */
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [hydrated, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const isActive = ACTIVE_STATUSES.includes(r.status);
      if (view === "Active" ? !isActive : isActive) return false;
      if (!q) return true;
      return (
        r.cardName.toLowerCase().includes(q) ||
        (r.cardSet ?? "").toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q)
      );
    });
  }, [rows, view, query]);

  const searching = query.trim().length > 0;

  return (
    <AccountShell active="Vault">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Status Pengiriman</h1>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            Pantau kartu fisik yang kamu minta kirim ke rumah.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {VIEWS.map((v) => {
            const on = v === view;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                  on
                    ? "bg-white/[0.08] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {v === "Active" && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full transition ${
                      on ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-zinc-600"
                    }`}
                  />
                )}
                {v === "Active" ? "Diproses" : "Selesai"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-5">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
          <SearchIcon className="h-4 w-4" />
        </span>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama kartu / kota"
          aria-label="Cari pengiriman"
          className="pl-10"
        />
      </div>

      <Panel className="mt-5 p-3 sm:p-4">
        {loading ? (
          <p className="py-14 text-center text-sm text-zinc-500">Memuat…</p>
        ) : filtered.length === 0 ? (
          searching ? (
            <EmptyState
              icon={<SearchIcon className="h-9 w-9" />}
              title="Tak ada pengiriman yang cocok"
              sub="Coba kata kunci lain."
            />
          ) : (
            /* Nama menunya DISALIN dari components/account/AccountMenu.tsx ("Ship Card", href
               /withdraw). Tidak ada item bernama "Withdraw" di menu itu — menyuruh user
               mencarinya sama saja dengan menyuruh mencari sesuatu yang tidak ada. */
            <EmptyState
              icon={<HistoryIcon className="h-9 w-9" />}
              title={view === "Active" ? "Belum ada pengiriman diproses" : "Belum ada pengiriman selesai"}
              sub="Minta kirim kartu lewat menu Ship Card, statusnya muncul di sini."
              action={
                <Link href="/withdraw">
                  <GhostButton>Kirim kartu →</GhostButton>
                </Link>
              }
            />
          )
        ) : (
          <ul className="flex flex-col gap-2.5">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#100e08]/60 p-3"
              >
                <Img
                  src={r.cardImage ?? "/card-back.svg"}
                  alt=""
                  className="h-14 w-[42px] shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white" title={r.cardName}>
                    {r.cardName}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {/* RAIL. Riwayat ini mencampur dua alur yang sangat berbeda — satu selesai
                        begitu ongkirnya lunas, satu masih meminta tanda tangan wallet dan
                        membakar NFT — dan status saja tidak membedakannya (REQUESTED /
                        AWAITING_PAYMENT / DELIVERED dipakai KEDUANYA). Dibaca dari fakta
                        persisten `listingId`, bukan dari nama/label. */}
                    <span
                      title={
                        isDomesticRedemption(r)
                          ? "Kartu stok Hoshi: dikirim kurir domestik. Kamu cuma membayar ongkir — tanpa NFT yang dibakar dan tanpa tanda tangan wallet."
                          : "Kartu vault CollectorCrypt: sesudah ongkirnya lunas kamu perlu menandatangani transaksi burn di wallet-mu."
                      }
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        isDomesticRedemption(r)
                          ? "border-[#F2C101]/45 bg-[#F2C101]/[0.12] text-[#F2C101]"
                          : "border-sky-400/40 bg-sky-400/[0.12] text-sky-300"
                      }`}
                    >
                      {isDomesticRedemption(r) ? "Kurir domestik" : "Vault CollectorCrypt"}
                    </span>
                    <span className="truncate text-[12px] text-zinc-500">
                      ke {r.city}, {r.country} · {dt(r.createdAt)}
                    </span>
                  </div>
                  {(r.trackingIds?.length ?? 0) > 0 && (
                    <p className="mt-0.5 truncate font-mono text-[11px] text-emerald-300/80">
                      Resi: {r.trackingIds?.join(", ")}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_UI[r.status].cls}`}
                >
                  {STATUS_UI[r.status].label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </AccountShell>
  );
}
