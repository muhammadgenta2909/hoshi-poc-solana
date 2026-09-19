"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN SAYA — halaman untuk orang yang BARU SAJA menyerahkan barang mahal ke Hoshi.

   Yang dia butuhkan bukan dasbor. Empat pertanyaan, dan semuanya harus terjawab tanpa bertanya
   ke siapa pun:

     1. Apa saja punyaku yang sekarang dipegang Hoshi, dan sejak kapan?
     2. Bukti apa yang dicatat waktu aku menyerahkannya?
     3. Dipajang berapa, dan aku dapat berapa kalau laku?
     4. Kalau aku berubah pikiran, bagaimana cara memintanya kembali?

   HAK MENARIK KARTU DITAMPILKAN, BUKAN DIKUBUR. Penyimpan barang yang bisa kamu tinggalkan kapan
   saja adalah penyimpan barang yang layak dipercaya; menyembunyikan tombolnya justru memberi
   sinyal sebaliknya. Gratis, dan halaman ini mengatakannya.

   DUA KALIMAT YANG TIDAK BOLEH ADA DI SINI:
     • apa pun yang berbunyi seolah kartunya milik Hoshi;
     • apa pun yang menjanjikan asuransi/ganti rugi — backend tidak mencatat hal seperti itu,
       jadi UI tidak boleh mengarangnya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import {
  acceptedByLabel,
  canRequestReturn,
  certLookupUrl,
  commissionPct,
  estimatedPayout,
  eventTitle,
  getMyConsignments,
  ownerStatusLine,
  requestConsignmentReturn,
  returnBlockedReason,
  statusUi,
  PHOTO_KIND_LABEL,
  type ConsignmentPhotoKind,
  type MyConsignment,
} from "@/lib/consignment";
import TopNav from "@/components/packs/TopNav";
import { ACCOUNT_BG } from "@/lib/theme";
import { ConfirmDialog, EmptyState, GhostButton, PrimaryButton } from "@/components/account/ui";

const rp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const dt = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-white/[0.05] py-2 first:border-t-0">
      <span className="text-[12px] text-zinc-500">{label}</span>
      <span className="text-right text-[13px] text-zinc-200">{value}</span>
    </div>
  );
}

function ConsignmentCard({
  c,
  onAskReturn,
}: {
  c: MyConsignment;
  onAskReturn: (c: MyConsignment) => void;
}) {
  const [openEvidence, setOpenEvidence] = useState(false);
  const ui = statusUi(c.status);
  const photos = c.photos ?? [];
  const cover = photos.find((p) => p.kind === "FRONT")?.url ?? photos[0]?.url ?? c.listing?.image ?? null;
  const certUrl = certLookupUrl(c.grader ?? null, c.certNumber ?? null);
  const price = c.listing?.priceIdrx ?? c.askPriceIdr;
  const blocked = returnBlockedReason(c.status);

  return (
    <li className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="h-28 w-20 shrink-0 overflow-hidden rounded-xl bg-black/30 ring-1 ring-white/10">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={c.cardName} className="h-full w-full object-cover" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold text-white">{c.cardName}</h3>
            {c.gradeLabel && (
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-300">
                {c.gradeLabel}
              </span>
            )}
            <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ui.cls}`}>
              {ui.label}
            </span>
          </div>

          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-300">{ownerStatusLine(c)}</p>

          {c.custodyAcceptedAt && !c.custodyReleasedAt && (
            <p className="mt-1 text-[12px] text-zinc-500">
              Di Hoshi sejak {dt(c.custodyAcceptedAt)}
              {c.storageLocation ? ` · ${c.storageLocation}` : ""}
            </p>
          )}

          {(c.status === "LISTED" || c.status === "IN_CUSTODY") && (
            <p className="mt-2 text-[13px] text-zinc-300">
              {c.status === "LISTED" ? "Dipajang " : "Harga yang disepakati "}
              <strong className="text-white">{rp(price)}</strong>
              <span className="text-zinc-500">
                {" "}
                · kamu menerima ± {rp(estimatedPayout(price, c.commissionBps))} setelah komisi{" "}
                {commissionPct(c.commissionBps)}%
              </span>
            </p>
          )}

          {c.status === "SOLD" && (
            <p className="mt-2 text-[13px] text-zinc-300">
              Terjual · kamu menerima <strong className="text-emerald-300">{rp(c.payoutIdrx)}</strong>
              {c.commissionIdrx != null && (
                <span className="text-zinc-500"> (komisi Hoshi {rp(c.commissionIdrx)})</span>
              )}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {c.listing && (
              <Link
                href={`/marketplace/${c.listing.id}`}
                className="rounded-xl border border-white/12 bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
              >
                Lihat di marketplace
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpenEvidence((v) => !v)}
              className="rounded-xl border border-white/12 bg-white/[0.03] px-3.5 py-2 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.07]"
            >
              {openEvidence ? "Sembunyikan bukti" : `Bukti saat diserahkan${photos.length ? ` (${photos.length} foto)` : ""}`}
            </button>
            {canRequestReturn(c.status) ? (
              <button
                type="button"
                onClick={() => onAskReturn(c)}
                className="rounded-xl border border-yellow-400/35 bg-yellow-400/10 px-3.5 py-2 text-[13px] font-semibold text-yellow-200 transition hover:bg-yellow-400/20"
              >
                {/* Pada status INTAKE kartunya masih di tangan pemiliknya — tidak ada yang bisa
                    "dikembalikan", yang ada cuma kesepakatan yang dibatalkan. Memakai satu kalimat
                    untuk dua keadaan berbeda akan membuat orang mengira kami memegang barangnya. */}
                {c.status === "INTAKE" ? "Batalkan titipan ini" : "Minta kartu saya kembali"}
              </button>
            ) : (
              blocked && <span className="text-[12px] text-zinc-500">{blocked}</span>
            )}
          </div>
        </div>
      </div>

      {openEvidence && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
          <p className="text-[12px] leading-relaxed text-zinc-400">
            Ini yang dicatat Hoshi pada hari kartumu diserahkan. Foto dan catatan ini tersimpan
            permanen dan tidak bisa dihapus — termasuk oleh Hoshi.
          </p>

          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {photos.map((p) => (
                <figure key={p.id} className="overflow-hidden rounded-lg border border-white/[0.07]">
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={PHOTO_KIND_LABEL[p.kind as ConsignmentPhotoKind] ?? p.kind}
                      className="aspect-square w-full bg-black/40 object-contain"
                    />
                  </a>
                  <figcaption className="px-2 py-1.5 text-[11px] text-zinc-400">
                    {PHOTO_KIND_LABEL[p.kind as ConsignmentPhotoKind] ?? p.kind}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Fact label="Kondisi saat diterima" value={c.conditionNote || "—"} />
            {/* "Diterima oleh" dibaca dari jejak audit: nama orang yang benar-benar menekan
                tombol terima, bukan kolom turunan yang bisa diisi belakangan. */}
            <Fact label="Diterima oleh" value={acceptedByLabel(c.events) ?? "—"} />
            <Fact label="Tempat serah terima" value={c.receivedAtPlace ?? "—"} />
            <Fact label="Tanggal diterima" value={dt(c.custodyAcceptedAt)} />
            <Fact label="Disimpan di" value={c.storageLocation ?? "—"} />
            <Fact
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
                      {c.grader} {c.certNumber} — cek di situs {c.grader} ↗
                    </a>
                  ) : (
                    `${c.grader ?? ""} ${c.certNumber}`
                  )
                ) : (
                  "— (kartu mentah)"
                )
              }
            />
            <Fact label="Komisi yang disepakati" value={`${commissionPct(c.commissionBps)}%`} />
            {c.intakeReceiptRef && <Fact label="Tanda terima" value={c.intakeReceiptRef} />}
            {c.custodyReleasedAt && (
              <Fact label="Kartu keluar dari Hoshi" value={dt(c.custodyReleasedAt)} />
            )}
          </div>

          {c.certNumber && (
            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              Nomor sertifikat bisa kamu cek sendiri di situs grader-nya. Itu bukti yang tidak
              bergantung pada perkataan Hoshi.
            </p>
          )}

          {/* ── RIWAYAT ──────────────────────────────────────────────────────────────────────
              Ditampilkan ke PEMILIK, bukan cuma ke admin. Urutan kejadian — diterima, dipajang,
              harga diubah, diminta kembali, terjual — adalah hal yang membuat catatan ini bisa
              dipakai olehnya kalau suatu saat ada beda pendapat. Kalau hanya Hoshi yang bisa
              melihatnya, seluruh catatan ini kembali menjadi "kata Hoshi". */}
          {c.events && c.events.length > 0 && (
            <div className="mt-4 border-t border-white/[0.06] pt-4">
              <p className="text-[12px] font-semibold text-zinc-300">Riwayat</p>
              <ol className="mt-2 space-y-2.5">
                {[...c.events].reverse().map((e) => (
                  <li key={e.id} className="border-l-2 border-white/10 pl-3">
                    <p className="text-[12px] font-medium text-zinc-200">{eventTitle(e.kind)}</p>
                    <p className="text-[11px] text-zinc-500">
                      {new Date(e.createdAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {e.actorLabel ? ` · ${e.actorLabel}` : ""}
                    </p>
                    {e.note && (
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-400">{e.note}</p>
                    )}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Baris di sini tidak bisa diubah atau dihapus — termasuk oleh Hoshi. Perbaikan
                catatan pun ditulis sebagai baris baru, jadi koreksi terlihat sebagai koreksi.
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export default function TitipanPage() {
  const { token, hydrated, login } = useAuth();
  const { setVisible } = useWalletConnect();

  const [rows, setRows] = useState<MyConsignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [asking, setAsking] = useState<MyConsignment | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await getMyConsignments(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat titipan.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setLoading(false);
      return;
    }
    void load();
  }, [token, load]);

  const confirmReturn = async () => {
    if (!asking || !token || busy) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const wasIntake = asking.status === "INTAKE";
      await requestConsignmentReturn(asking.id, token);
      setOk(
        wasIntake
          ? "Titipan dibatalkan. Tidak ada kartu yang berpindah tangan."
          : "Permintaan terkirim. Kartu ini sudah tidak dipajang, dan tim Hoshi akan menghubungimu untuk mengatur serah terimanya.",
      );
      await load();
    } catch (e) {
      // Pesan server dipakai apa adanya: kalau kartunya terjual lebih dulu, kalimat itulah yang
      // benar — bukan tebakan UI.
      setError(e instanceof Error ? e.message : "Permintaan gagal.");
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  return (
    <div
      className="min-h-screen text-zinc-100"
      style={{ background: ACCOUNT_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Vault" />
      <main className="mx-auto max-w-[880px] px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Titipan Saya</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-zinc-400">
            Kartu yang kamu titipkan ke Hoshi untuk dijualkan. Kartunya tetap milikmu — Hoshi hanya
            menyimpan dan menjualkannya, lalu memotong komisi yang kalian sepakati. Kamu bisa
            memintanya kembali kapan saja selama belum terjual, tanpa biaya.
          </p>
        </header>

        {ok && (
          <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
            {ok}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
            {error}
          </p>
        )}

        {!hydrated ? (
          <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
        ) : !token ? (
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-zinc-200">Masuk untuk melihat titipanmu</p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-500">
              Daftar ini terikat ke akunmu, jadi kamu perlu masuk dulu.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <PrimaryButton
                onClick={() => {
                  login().catch(() => setVisible(true));
                }}
              >
                Masuk
              </PrimaryButton>
              <GhostButton onClick={() => setVisible(true)}>Hubungkan wallet</GhostButton>
            </div>
          </div>
        ) : loading ? (
          <p className="py-16 text-center text-sm text-zinc-500">Memuat…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Belum ada kartu yang kamu titipkan"
            sub="Titipan dicatat oleh tim Hoshi saat kartumu diserahkan langsung. Kalau kamu baru saja menyerahkan kartu dan belum muncul di sini, hubungi tim kami."
          />
        ) : (
          <ul className="space-y-4">
            {rows.map((c) => (
              <ConsignmentCard key={c.id} c={c} onAskReturn={setAsking} />
            ))}
          </ul>
        )}

        {/* ── Yang perlu kamu tahu: fakta, tanpa janji yang tidak dicatat sistem ── */}
        {token && rows.length > 0 && (
          <section className="mt-8 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h2 className="text-[14px] font-semibold text-zinc-200">Yang perlu kamu tahu</h2>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-zinc-400">
              <li>
                <strong className="text-zinc-200">Kartunya tetap milikmu.</strong> Hoshi menyimpan
                dan menjualkannya atas namamu. Hasil penjualan masuk ke saldomu dikurangi komisi
                yang kalian sepakati di awal — dan angka komisi itu dibekukan hari kartumu
                diserahkan, jadi tidak bisa berubah belakangan.
              </li>
              <li>
                <strong className="text-zinc-200">Buktinya tidak bisa dihapus.</strong> Tanggal
                terima, kondisi, dan foto yang diambil saat serah terima tersimpan permanen —
                termasuk dari sisi Hoshi. Kalau suatu saat ada beda pendapat soal kondisi kartu,
                catatan itu yang berbicara.
              </li>
              <li>
                <strong className="text-zinc-200">Kamu bisa menariknya kapan saja.</strong> Selama
                belum terjual, minta kembali lewat tombol di atas. Tidak ada biaya simpan, biaya
                tarik, atau biaya pajang.
              </li>
              <li>
                <strong className="text-zinc-200">Kalau kartumu bersertifikat,</strong> nomornya bisa
                kamu cek langsung di situs grader-nya. Itu bukti yang tidak bergantung pada
                perkataan Hoshi.
              </li>
            </ul>
          </section>
        )}
      </main>

      <ConfirmDialog
        open={!!asking}
        title={asking?.status === "INTAKE" ? "Batalkan titipan ini?" : "Minta kartu ini kembali?"}
        message={
          asking?.status === "INTAKE" ? (
            <>
              Kesepakatan untuk <strong>{asking?.cardName}</strong> dibatalkan. Kartunya masih ada
              di tanganmu, jadi tidak ada yang perlu diserahkan dan tidak ada biaya apa pun.
            </>
          ) : (
            <>
              Kartu <strong>{asking?.cardName}</strong> akan diturunkan dari marketplace (kalau
              sedang dipajang) dan disiapkan untuk diserahkan kembali kepadamu. Tidak dipungut biaya
              apa pun.
              <br />
              <br />
              Kalau kartunya kebetulan terjual persis saat permintaan ini masuk, penjualannya yang
              berlaku dan hasilnya langsung masuk ke saldomu — kami akan memberitahumu.
            </>
          )
        }
        confirmLabel={
          busy ? "Mengirim…" : asking?.status === "INTAKE" ? "Ya, batalkan" : "Ya, minta kembali"
        }
        onConfirm={() => void confirmReturn()}
        onCancel={() => setAsking(null)}
      />
    </div>
  );
}
