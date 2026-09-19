"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   SATU TITIPAN — layar kerja operator: bukti, serah terima, pajang, dan jalan keluarnya.

   ┌──── SATU FAKTA YANG MENENTUKAN SEGALANYA ─────────────────────────────────────────────────┐
   │ "Terima kartu" menulis tanggal terima SEKALI, dan tidak ada tombol di mana pun yang bisa   │
   │ menghapusnya. Kartu keluar dari Hoshi dicatat sebagai fakta KEDUA (dikembalikan / hilang), │
   │ bukan dengan membatalkan yang pertama. Karena itu tidak ada satu pun aksi di halaman ini   │
   │ yang bisa membuat sebuah kartu "tidak pernah dititipkan".                                  │
   │                                                                                            │
   │ Konsekuensinya buat operator: tombol "Terima kartu" hanya boleh ditekan kalau kartunya     │
   │ BENAR-BENAR sudah ada di tangan. Layar ini menolak menekannya selama bukti wajib kurang.   │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   CATATAN INTAKE TIDAK BISA DIEDIT — dan itu fitur, bukan keterbatasan. Catatan kondisi, foto,
   dan identitas kartu tidak punya rute ubah di server; yang perlu diluruskan ditulis sebagai
   KOREKSI, yaitu baris audit baru. Catatan kondisi yang bisa diubah diam-diam sesudah sengketa
   dimulai tidak ada harganya sebagai bukti — untuk kedua pihak.

   Gerbang sebenarnya ada di server; tombol di sini hanya disusun supaya operator tahu SEBELUM
   menekan, bukan sesudah ditolak. Nol USDC, nol SOL, nol escrow bergerak dari halaman ini.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  acceptConsignmentCustody,
  addAdminConsignmentCorrection,
  compensateAdminConsignment,
  consignmentAllowedActions,
  consignmentReleaseReason,
  getAdminConsignment,
  listAdminConsignment,
  markAdminConsignmentLost,
  releaseAdminConsignment,
  requestAdminConsignmentReturn,
  setAdminConsignmentPrice,
  type AdminConsignment,
  type ConsignmentAction,
} from "@/lib/admin-api";
import {
  certLookupUrl,
  commissionPct,
  estimatedPayout,
  eventTitle,
  isInHoshiCustody,
  statusUi,
  type ConsignmentPhotoKind,
} from "@/lib/consignment";
import ConsignmentPhotos from "@/components/admin/ConsignmentPhotos";
import { ConfirmDialog } from "@/components/account/ui";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/** Panjang minimum catatan manusia — sama dengan yang ditegakkan DTO backend (NOTE_MIN). */
const NOTE_MIN = 10;

const rp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const dt = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
      {sub && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.05] py-2 first:border-t-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="text-right text-[13px] text-zinc-200">{value}</span>
    </div>
  );
}

export default function AdminTitipanDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id ?? "");
  const { token } = useAdminAuth();

  const [c, setC] = useState<AdminConsignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  /* form-form aksi */
  const [storageLocation, setStorageLocation] = useState("");
  const [acceptNote, setAcceptNote] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [listImage, setListImage] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [releaseReceipt, setReleaseReceipt] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [compAmount, setCompAmount] = useState("");
  const [compNote, setCompNote] = useState("");
  const [correction, setCorrection] = useState("");
  const [confirm, setConfirm] = useState<
    null | { kind: "ACCEPT" } | { kind: "RETURN" } | { kind: "RELEASE" } | { kind: "LOST" } | { kind: "COMPENSATE" }
  >(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const row = await getAdminConsignment(id, token);
      setC(row);
      setStorageLocation(row.storageLocation ?? "");
      setListPrice(String(row.askPriceIdr ?? ""));
      setNewPrice(String(row.listing?.priceIdrx ?? row.askPriceIdr ?? ""));
      setListImage(
        row.listing?.image ??
          row.photos?.find((p) => p.kind === "FRONT")?.url ??
          row.photos?.[0]?.url ??
          "",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat titipan.");
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  const photos = useMemo(() => c?.photos ?? [], [c]);

  /** Bukti yang WAJIB sebelum kartu boleh dinyatakan diterima — cermin gerbang di server. */
  const requiredKinds = useMemo<ConsignmentPhotoKind[]>(
    () => (c?.certNumber ? ["FRONT", "BACK", "CERT"] : ["FRONT", "BACK"]),
    [c?.certNumber],
  );

  /** Apa yang masih kurang untuk menekan "Terima kartu". Ditampilkan, bukan disembunyikan. */
  const acceptBlockers = useMemo(() => {
    const m: string[] = [];
    for (const k of requiredKinds) {
      if (!photos.some((p) => p.kind === k))
        m.push(k === "FRONT" ? "foto depan" : k === "BACK" ? "foto belakang" : "foto sertifikat");
    }
    if (!storageLocation.trim()) m.push("lokasi penyimpanan");
    return m;
  }, [photos, requiredKinds, storageLocation]);

  const allowed: ConsignmentAction[] = c ? consignmentAllowedActions(c) : [];
  const can = (a: ConsignmentAction) => allowed.includes(a);

  /** Satu pembungkus untuk semua aksi. Semua rute menjawab dengan baris terbaru. */
  const run = async (fn: () => Promise<AdminConsignment>, okMsg: string) => {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      setC(await fn());
      setOk(okMsg);
    } catch (e) {
      // Pesan server dipakai APA ADANYA: ia sudah menjelaskan posisi kartu dan uangnya lebih baik
      // daripada terjemahan mana pun yang bisa ditulis di sini.
      setError(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading && !c) return <p className="py-16 text-center text-[13px] text-zinc-500">Memuat…</p>;

  if (!c)
    return (
      <div className="space-y-4">
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 hover:text-zinc-300">
          ← Titipan
        </Link>
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error ?? "Titipan tidak ditemukan."}
        </p>
      </div>
    );

  const ui = statusUi(c.status);
  const inCustody = isInHoshiCustody(c);
  const certUrl = certLookupUrl(c.grader, c.certNumber);
  const release = consignmentReleaseReason(c);
  /**
   * Siapa yang MENERIMA kartunya.
   *
   * Hanya ada kalau serah terimanya sudah dicatat: kolom `receivedById` sudah terisi sejak baris
   * kesepakatan dibuat (oleh admin yang mencatat), jadi membacanya mentah-mentah akan menampilkan
   * "diterima oleh X" untuk kartu yang belum diterima siapa pun. Sumber pertama adalah baris audit
   * ACCEPT_CUSTODY — pelakunya yang sebenarnya.
   */
  const receiverLabel = c.custodyAcceptedAt
    ? (c.events?.find((e) => e.kind === "ACCEPT_CUSTODY")?.actorLabel ??
      c.receivedBy?.displayName?.trim() ??
      c.receivedBy?.walletAddress ??
      null)
    : null;
  /** Kartu MENTAH belum bisa dipajang di fase ini (kolom grader listing hanya kenal PSA/CGC/BGS). */
  const rawUnlistable = c.grader == null;

  return (
    <div className="space-y-5 pb-10">
      <header>
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 transition hover:text-zinc-300">
          ← Titipan
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-bold text-zinc-100">{c.cardName}</h1>
          <span className={`rounded-md border px-2 py-0.5 text-[12px] font-semibold ${ui.cls}`}>
            {ui.label}
          </span>
          {c.gradeLabel && (
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[12px] text-zinc-300">
              {c.gradeLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-[13px] text-zinc-500">
          Milik <strong className="text-zinc-300">{c.consignorNameAtIntake}</strong> · komisi{" "}
          {commissionPct(c.commissionBps)}% · harga {rp(c.askPriceIdr)}
        </p>
      </header>

      {/* ── Keadaan custody: satu kalimat, paling atas, tanpa jargon ── */}
      <div
        className={`rounded-2xl border px-4 py-3.5 text-[13px] leading-relaxed ${
          inCustody
            ? "border-sky-400/25 bg-sky-400/[0.07] text-sky-100"
            : c.status === "INTAKE"
              ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-100"
              : "border-white/10 bg-white/[0.03] text-zinc-300"
        }`}
      >
        {c.status === "INTAKE" && (
          <>
            <strong>Kartu belum diterima.</strong> Selama serah terimanya belum dicatat, kartu ini
            tidak bisa dipajang oleh siapa pun — dan memang begitu seharusnya: kartu yang masih di
            tangan pemiliknya masih bisa ia jual sendiri ke orang lain.
          </>
        )}
        {inCustody && (
          <>
            <strong>Kartu ada di Hoshi</strong> sejak {dt(c.custodyAcceptedAt)}
            {c.storageLocation ? ` · ${c.storageLocation}` : ""}. Diterima oleh{" "}
            {receiverLabel ?? "—"}
            {c.receivedAtPlace ? ` di ${c.receivedAtPlace}` : ""}.
          </>
        )}
        {c.status === "SOLD" && (
          <>
            <strong>Sudah terjual.</strong> Kartunya{" "}
            {c.custodyReleasedAt ? "sudah keluar dari penyimpanan" : "masih di rak"} — pemiliknya
            sudah dibayar {rp(c.payoutIdrx)} (komisi Hoshi {rp(c.commissionIdrx)}).
          </>
        )}
        {c.status === "RELEASED" && (
          <>
            <strong>Kartu sudah keluar dari Hoshi</strong> pada {dt(c.custodyReleasedAt)}
            {c.releaseReason ? ` (${c.releaseReason})` : ""}.
          </>
        )}
        {c.status === "LOST" && (
          <>
            <strong>Kartu tercatat hilang / rusak</strong> pada {dt(c.custodyReleasedAt)}. Ia tidak
            bisa dijual, dikirim, atau dipajang lagi oleh apa pun.
          </>
        )}
        {c.status === "CANCELLED" && (
          <>
            <strong>Kesepakatan dibatalkan</strong> sebelum serah terima. Tidak ada kartu yang
            pernah berpindah.
          </>
        )}
      </div>

      {c.withdrawRequestedAt && !c.custodyReleasedAt && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3.5 text-[13px] leading-relaxed text-amber-100">
          <strong>Pemilik minta kartunya kembali</strong> ({dt(c.withdrawRequestedAt)}). Atur serah
          terimanya, lalu catat di bagian “Kartu keluar dari Hoshi”. Permintaan kembali tidak
          dipungut biaya apa pun.
        </div>
      )}

      {ok && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
          {ok}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {/* ── BUKTI ── */}
      <Card
        title="Bukti"
        sub="Diambil di tempat, di depan pemiliknya. Foto tidak bisa dihapus setelah tersimpan — itu yang membuatnya berlaku sebagai bukti untuk kedua pihak."
      >
        <ConsignmentPhotos
          consignmentId={c.id}
          photos={photos}
          token={token ?? ""}
          required={c.custodyAcceptedAt ? [] : requiredKinds}
          onUpdated={setC}
        />
      </Card>

      {/* ── TERIMA KARTU (hanya sebelum custody ada) ── */}
      {can("ACCEPT") && (
        <Card
          title="Terima kartu"
          sub="Tekan hanya kalau kartunya benar-benar sudah ada di tanganmu. Tanggal terima ditulis sekali dan tidak bisa dibatalkan."
        >
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
            <p className="text-[12px] text-zinc-500">Catatan kondisi (dari pencatatan awal)</p>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-200">{c.conditionNote}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Tidak bisa diedit di sini. Kalau ada yang perlu diluruskan, tulis koreksi di bawah —
              koreksi disimpan sebagai catatan baru, jadi terlihat sebagai koreksi.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Lokasi penyimpanan
              </span>
              <input
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="mis. Rak A-3, Jakarta"
                className={INPUT}
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Kartu orang lain yang tidak tercatat ada di rak mana adalah kartu yang belum
                benar-benar kita pegang.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Nomor / arsip tanda terima
              </span>
              <input
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                placeholder="opsional"
                className={INPUT}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Catatan serah terima
              </span>
              <input
                value={acceptNote}
                onChange={(e) => setAcceptNote(e.target.value)}
                placeholder="opsional — mis. “diserahkan langsung oleh pemilik, disaksikan kakaknya”"
                className={INPUT}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirm({ kind: "ACCEPT" })}
              disabled={busy || acceptBlockers.length > 0}
              className="rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
            >
              Terima kartu
            </button>
            <p className="text-[12px] text-zinc-500">
              {acceptBlockers.length === 0
                ? "Bukti lengkap."
                : `Belum bisa: ${acceptBlockers.join(", ")}.`}
            </p>
          </div>
        </Card>
      )}

      {/* ── PAJANG ── */}
      {can("LIST") && (
        <Card
          title="Pajang di marketplace"
          sub="Baru mungkin karena kartunya sudah ada di Hoshi. Listing-nya terikat ke titipan ini, jadi tidak bisa ada listing tanpa kartunya."
        >
          {rawUnlistable ? (
            <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-100">
              Kartu ini tidak punya grading, dan kartu tanpa grading belum bisa dipajang di fase
              ini: kolom grader pada listing hanya mengenal PSA/CGC/BGS, dan mengisinya berarti
              memberi label palsu pada kartu orang lain. Titipannya tetap tercatat dan tetap bisa
              ditarik kembali kapan saja.
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    Harga (Rp)
                  </span>
                  <input
                    value={listPrice}
                    onChange={(e) => setListPrice(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    className={INPUT}
                  />
                  <span className="mt-1 block text-[11px] text-zinc-500">
                    Pemilik menerima ± {rp(estimatedPayout(Number(listPrice) || 0, c.commissionBps))}{" "}
                    setelah komisi {commissionPct(c.commissionBps)}%.
                  </span>
                </label>
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                    Gambar listing
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setListImage(p.url)}
                        className={`overflow-hidden rounded-lg border-2 transition ${
                          listImage === p.url
                            ? "border-yellow-400"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="h-16 w-12 object-cover" />
                      </button>
                    ))}
                  </div>
                  {photos.length === 0 && (
                    <p className="text-[12px] text-zinc-500">Belum ada foto untuk dipakai.</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  void run(
                    () =>
                      listAdminConsignment(
                        c.id,
                        {
                          image: listImage,
                          ...(listPrice ? { priceIdrx: Number(listPrice) } : {}),
                        },
                        token ?? "",
                      ),
                    "Kartu dipajang.",
                  )
                }
                disabled={busy || !listImage || !listPrice}
                className="mt-4 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
              >
                {busy ? "Memproses…" : "Pajang sekarang"}
              </button>
            </>
          )}
        </Card>
      )}

      {/* ── LISTING & HARGA ── */}
      {(c.listing || can("PRICE")) && (
        <Card
          title="Harga & listing"
          sub="Harga di perjanjian dan harga di marketplace ditulis dalam satu transaksi, jadi keduanya tidak bisa berbeda."
        >
          {c.listing ? (
            <>
              <Row
                label="Listing"
                value={
                  <Link
                    href={`/marketplace/${c.listing.id}`}
                    className="text-yellow-300 hover:underline"
                  >
                    {c.listing.id}
                  </Link>
                }
              />
              <Row label="Status listing" value={c.listing.status} />
              <Row label="Harga listing" value={rp(c.listing.priceIdrx)} />
              <Row label="Dipajang" value={dt(c.listing.listedAt)} />
              {c.listing.soldAt && <Row label="Terjual" value={dt(c.listing.soldAt)} />}
            </>
          ) : (
            <Row label="Harga yang disepakati" value={rp(c.askPriceIdr)} />
          )}

          {can("PRICE") && (
            <div className="mt-4 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                  Harga baru (Rp)
                </span>
                <input
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  className={INPUT}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                  Alasan perubahan
                </span>
                <input
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="mis. “pemilik setuju turun harga lewat WA, 19 Sep”"
                  className={INPUT}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  void run(
                    () =>
                      setAdminConsignmentPrice(
                        c.id,
                        { askPriceIdr: Number(newPrice), note: priceNote.trim() },
                        token ?? "",
                      ),
                    "Harga diperbarui.",
                  )
                }
                disabled={busy || !newPrice || priceNote.trim().length < NOTE_MIN}
                className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Simpan harga
              </button>
              <p className="text-[11px] text-zinc-500 sm:col-span-3">
                Harga adalah bagian dari perjanjian yang ditandatangani pemilik kartu — beri tahu
                dia sebelum mengubahnya. Alasannya disimpan permanen.
              </p>
            </div>
          )}
        </Card>
      )}

      {/* ── FAKTA ── */}
      <Card title="Catatan serah terima">
        <Row
          label="Pemilik (akun)"
          value={`${c.consignor?.displayName ?? "—"} · ${c.consignor?.walletAddress ?? c.consignorId}`}
        />
        <Row label="Nama di tanda terima" value={c.consignorNameAtIntake} />
        <Row label="HP" value={c.consignorPhoneAtIntake} />
        <Row
          label="Identitas"
          value={c.consignorIdKind ? `${c.consignorIdKind} ··· ${c.consignorIdLast4 ?? "????"}` : "—"}
        />
        <Row label="Diterima oleh" value={receiverLabel ?? "—"} />
        <Row label="Tempat serah terima" value={c.receivedAtPlace} />
        <Row label="Set / nomor" value={[c.cardSet, c.cardNumber].filter(Boolean).join(" · ") || "—"} />
        <Row
          label="Sertifikat"
          value={
            c.certNumber ? (
              certUrl ? (
                <a
                  href={certUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-yellow-300 hover:underline"
                >
                  {c.grader} {c.certNumber} ↗
                </a>
              ) : (
                `${c.grader ?? ""} ${c.certNumber}`
              )
            ) : (
              "— (kartu mentah)"
            )
          }
        />
        <Row label="Kondisi saat diterima" value={c.conditionNote} />
        {c.rawCondition && <Row label="Kondisi (kode)" value={c.rawCondition} />}
        <Row label="Penyimpanan" value={c.storageLocation ?? "—"} />
        <Row label="Tanda terima" value={c.intakeReceiptRef ?? "—"} />
        <Row label="Perjanjian" value={c.agreementRef ?? "—"} />
        <Row label="Dicatat" value={dt(c.createdAt)} />
        <Row label="Diterima" value={dt(c.custodyAcceptedAt)} />
        <Row label="Keluar" value={dt(c.custodyReleasedAt)} />
        {c.soldOrderId && <Row label="Order penjualan" value={c.soldOrderId} />}
        {c.payoutIdrx != null && <Row label="Dibayar ke pemilik" value={rp(c.payoutIdrx)} />}
        {c.commissionIdrx != null && <Row label="Komisi Hoshi" value={rp(c.commissionIdrx)} />}

        {can("CORRECTION") && (
          <div className="mt-4 border-t border-white/[0.05] pt-4">
            <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
              Tulis koreksi
            </span>
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={2}
              placeholder="Apa yang keliru dan apa yang benar. Catatan lama tetap tersimpan apa adanya."
              className={`${INPUT} resize-y leading-relaxed`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    const row = await addAdminConsignmentCorrection(
                      c.id,
                      correction.trim(),
                      token ?? "",
                    );
                    setCorrection("");
                    return row;
                  }, "Koreksi tercatat.")
                }
                disabled={busy || correction.trim().length < NOTE_MIN}
                className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                Simpan koreksi
              </button>
              <p className="text-[11px] text-zinc-500">
                Tidak menimpa apa pun — ditulis sebagai catatan baru di riwayat.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* ── RIWAYAT ── */}
      {c.events && c.events.length > 0 && (
        <Card
          title="Riwayat"
          sub="Siapa melakukan apa, dan kapan. Tidak ada baris yang bisa diubah atau dihapus."
        >
          <ol className="space-y-3">
            {[...c.events].reverse().map((e) => (
              <li key={e.id} className="border-l-2 border-white/10 pl-3">
                <p className="text-[13px] font-semibold text-zinc-200">
                  {eventTitle(e.kind)}
                  {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
                    <span className="ml-2 text-[11px] font-normal text-zinc-500">
                      {e.fromStatus} → {e.toStatus}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {dt(e.createdAt)}
                  {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                </p>
                {e.note && <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">{e.note}</p>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* ── JALAN KELUAR ── */}
      {(can("RETURN") || can("RELEASE") || can("LOST") || can("COMPENSATE")) && (
        <Card
          title="Kartu keluar dari Hoshi"
          sub="Semua yang di bawah ini mencatat FAKTA baru. Tidak ada yang menghapus catatan bahwa kartunya pernah diterima."
        >
          <div className="space-y-5">
            {can("RETURN") && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="text-[13px] font-semibold text-zinc-200">
                  {c.status === "INTAKE"
                    ? "Pemilik batal menitipkan"
                    : "Pemilik minta kartunya kembali"}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  {c.status === "INTAKE"
                    ? "Kesepakatan dibatalkan. Tidak ada kartu yang pernah berpindah, jadi tidak ada yang perlu diserahkan."
                    : "Menurunkan listing-nya (kalau sedang dipajang) dan mengembalikan kartu ke keadaan “di Hoshi, tidak dijual”. Gratis. Kalau kartunya kebetulan terjual pada detik yang sama, server menolak permintaan ini — penjualannya yang menang, dan hasilnya masuk ke saldo pemilik."}
                </p>
                <input
                  value={returnNote}
                  onChange={(e) => setReturnNote(e.target.value)}
                  placeholder="Catatan (opsional) — mis. “diminta langsung saat kunjungan”"
                  className={`${INPUT} mt-3`}
                />
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "RETURN" })}
                  disabled={busy}
                  className="mt-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {c.status === "INTAKE" ? "Batalkan kesepakatan" : "Catat permintaan kembali"}
                </button>
              </div>
            )}

            {can("RELEASE") && release && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="text-[13px] font-semibold text-zinc-200">Kartu fisik sudah keluar</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  Dicatat saat kartunya benar-benar berpindah tangan. Untuk kartu yang sudah
                  terjual, pengirimannya biasanya sudah tercatat otomatis dari layar “Kirim Kartu” —
                  pakai ini kalau serah terimanya dilakukan langsung.
                </p>
                <p className="mt-2 rounded-lg bg-black/25 px-3 py-2 text-[12px] text-zinc-300">
                  Yang akan dicatat: <strong>{release.label}</strong>
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    value={releaseReceipt}
                    onChange={(e) => setReleaseReceipt(e.target.value)}
                    placeholder="Nomor / arsip tanda terima keluar (opsional)"
                    className={INPUT}
                  />
                  <input
                    value={releaseNote}
                    onChange={(e) => setReleaseNote(e.target.value)}
                    placeholder="Catatan serah terima (wajib)"
                    className={INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "RELEASE" })}
                  disabled={busy || releaseNote.trim().length < NOTE_MIN}
                  className="mt-3 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  Catat kartu keluar
                </button>
              </div>
            )}

            {can("LOST") && (
              <div className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-3.5">
                <p className="text-[13px] font-semibold text-red-200">Kartu hilang atau rusak</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                  Jalan keluar yang jujur, dan ia harus ada — tanpa ini satu-satunya cara menutup
                  baris seperti ini adalah berpura-pura kartunya masih ada. Sesudah dicatat, kartu
                  tidak bisa dijual, dikirim, atau dipajang lagi. Ganti rugi TIDAK otomatis: tidak
                  ada uang yang berpindah dari tombol ini.
                </p>
                <textarea
                  value={lostNote}
                  onChange={(e) => setLostNote(e.target.value)}
                  rows={2}
                  placeholder="Apa yang terjadi, sejelas mungkin."
                  className={`${INPUT} mt-3 resize-y leading-relaxed`}
                />
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "LOST" })}
                  disabled={busy || lostNote.trim().length < NOTE_MIN}
                  className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-[13px] font-semibold text-red-200 transition hover:bg-red-400/20 disabled:opacity-50"
                >
                  Catat hilang / rusak
                </button>
              </div>
            )}

            {can("COMPENSATE") && (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5">
                <p className="text-[13px] font-semibold text-emerald-200">Ganti rugi ke pemilik</p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                  Mengkredit saldo pemilik kartu. Nominalnya keputusan manusia, bukan rumus —
                  bicarakan dulu dengan orangnya. Aman ditekan dua kali: server hanya membayar
                  sekali per titipan.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input
                    value={compAmount}
                    onChange={(e) => setCompAmount(e.target.value.replace(/[^\d]/g, ""))}
                    inputMode="numeric"
                    placeholder="Nominal (Rp)"
                    className={INPUT}
                  />
                  <input
                    value={compNote}
                    onChange={(e) => setCompNote(e.target.value)}
                    placeholder="Dasar kesepakatannya (wajib)"
                    className={INPUT}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setConfirm({ kind: "COMPENSATE" })}
                  disabled={busy || !compAmount || compNote.trim().length < NOTE_MIN}
                  className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-200 transition hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  Bayar ganti rugi
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirm?.kind === "ACCEPT"}
        title="Kartunya sudah di tanganmu?"
        message={
          <>
            Ini mencatat bahwa Hoshi memegang kartu ini, sejak sekarang, dan mencatat kamu sebagai
            penerimanya. Catatan itu <strong>tidak bisa dibatalkan</strong> — kalau kartunya keluar
            lagi, itu dicatat sebagai kejadian terpisah. Sesudah ini kartu boleh dipajang.
          </>
        }
        confirmLabel="Ya, kartunya ada di saya"
        onConfirm={() =>
          void run(
            () =>
              acceptConsignmentCustody(
                c.id,
                {
                  storageLocation: storageLocation.trim(),
                  ...(receiptRef.trim() ? { intakeReceiptRef: receiptRef.trim() } : {}),
                  ...(acceptNote.trim() ? { note: acceptNote.trim() } : {}),
                },
                token ?? "",
              ),
            "Kartu tercatat diterima. Sekarang boleh dipajang.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "RETURN"}
        title={c.status === "INTAKE" ? "Batalkan kesepakatan?" : "Catat permintaan kembali?"}
        message={
          c.status === "INTAKE"
            ? "Kesepakatan ditutup. Tidak ada kartu yang pernah berpindah tangan."
            : "Listing-nya diturunkan kalau sedang dipajang, dan kartu kembali ke keadaan tidak dijual. Tidak ada biaya apa pun untuk pemilik."
        }
        confirmLabel="Catat"
        onConfirm={() =>
          void run(
            () => requestAdminConsignmentReturn(c.id, token ?? "", returnNote.trim() || undefined),
            c.status === "INTAKE"
              ? "Kesepakatan dibatalkan."
              : "Permintaan kembali tercatat. Atur serah terimanya.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "RELEASE"}
        title="Kartu fisik sudah keluar?"
        message="Sesudah ini kartu tidak bisa dipajang, dijual, atau dikirim lewat sistem lagi."
        confirmLabel="Catat keluar"
        onConfirm={() =>
          void run(
            () =>
              releaseAdminConsignment(
                c.id,
                {
                  releaseReason: release?.value ?? "WITHDRAWN",
                  note: releaseNote.trim(),
                  ...(releaseReceipt.trim() ? { releaseReceiptRef: releaseReceipt.trim() } : {}),
                },
                token ?? "",
              ),
            "Tercatat: kartu sudah keluar dari Hoshi.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "LOST"}
        title="Catat kartu hilang / rusak?"
        danger
        message="Ini catatan permanen bahwa barang orang lain hilang atau rusak saat ada di tangan Hoshi. Hubungi pemiliknya langsung — jangan biarkan dia mengetahuinya dari layar."
        confirmLabel="Catat"
        onConfirm={() =>
          void run(
            () => markAdminConsignmentLost(c.id, lostNote.trim(), token ?? ""),
            "Tercatat. Hubungi pemilik kartunya.",
          )
        }
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === "COMPENSATE"}
        title={`Bayar ${rp(Number(compAmount) || 0)} ke pemilik?`}
        message="Nominal ini langsung masuk ke saldo pemiliknya. Pastikan angkanya memang yang kalian sepakati."
        confirmLabel="Bayar"
        onConfirm={() =>
          void run(
            () =>
              compensateAdminConsignment(
                c.id,
                { amountIdr: Number(compAmount), note: compNote.trim() },
                token ?? "",
              ),
            "Ganti rugi tercatat di saldo pemilik.",
          )
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
