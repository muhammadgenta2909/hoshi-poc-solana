"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN — daftar kartu MILIK ORANG LAIN yang fisiknya dipegang Hoshi.

   ┌──── URUTAN YANG MENUTUP RISIKONYA ────────────────────────────────────────────────────────┐
   │ Kartu ada di tangan Hoshi DULU, baru listing-nya tayang. Orang yang sudah menyerahkan      │
   │ kartunya tidak bisa menjualnya diam-diam ke orang lain — jadi tidak akan pernah ada dua    │
   │ pembeli untuk satu kartu. Kebalikannya (pajang dulu, ambil kartunya nanti) adalah persis   │
   │ kasus yang ditakutkan pemilik produk, dan tidak ada kepintaran kode yang bisa menutupnya.  │
   │                                                                                            │
   │ Itu sebabnya baris "Belum diterima" di layar ini tidak punya tombol pajang sama sekali:    │
   │ bukan disembunyikan — memang belum ada haknya.                                             │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   "PERLU TINDAKAN" DIHITUNG SERVER, dan klien TIDAK menurunkannya sendiri. Daftar itu menyorot
   hal-hal yang kalau tidak ditampilkan akan tak terlihat selamanya: kartu yang dijanjikan tapi
   tak pernah datang, permintaan kembali yang menggantung, dan kartu terjual yang masih di rak.
   Menyalin aturannya ke sini hanya akan membuat salah satu salinan diam.

   ┌──── DUA SUMBU, DAN JANGAN PERNAH DICAMPUR ────────────────────────────────────────────────┐
   │ "Di Hoshi"          = kartunya ADA DI RAK KAMI.        (custody — custodyAcceptedAt)       │
   │ "Belum diklaim"     = belum ada AKUN pemiliknya.       (klaim  — consignorId/claimedAt)    │
   │                                                                                            │
   │ Sebuah kartu bisa keduanya sekaligus: sudah di rak, tapi belum punya akun tujuan. Ia tetap │
   │ TIDAK BISA DIPAJANG, dan alasannya sama sekali bukan soal custody — hasil penjualannya     │
   │ belum punya tempat untuk mendarat. Karena itu keadaan ini diberi lencana SENDIRI dengan    │
   │ warna sendiri, bukan diselipkan ke status. Operator yang membaca "Di Hoshi" lalu mengira   │
   │ kartunya siap dijual adalah persis salah paham yang membuat kartu orang tergeletak         │
   │ berminggu-minggu tanpa ada yang mengejar pemiliknya.                                       │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   BUKAN STOK HOSHI. Kartu di sini bukan milik Hoshi; Hoshi menyimpan dan menjualkan, memotong
   komisi yang disepakati, sisanya milik penjual. Halaman "Stok Hoshi" adalah barang Hoshi sendiri
   dan settle-nya berbeda total — jangan pernah menyamakan keduanya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminConsignments,
  issueAdminConsignmentClaimCode,
  type AdminConsignment,
  type AwaitingOwnerRow,
} from "@/lib/admin-api";
import { commissionPct, isAwaitingClaim, statusUi, type ConsignmentStatus } from "@/lib/consignment";
import Thumb from "@/components/admin/Thumb";
import ClaimCodeHandover from "@/components/admin/ClaimCodeHandover";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Panjang minimum catatan manusia — sama dengan yang ditegakkan DTO backend (NOTE_MIN). */
const NOTE_MIN = 10;

const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—";

/**
 * Tab filter. "PERLU_TINDAKAN", "MENUNGGU_KLAIM" dan "SELESAI" bukan status server — ketiganya
 * saringan klien.
 *
 * "MENUNGGU_KLAIM" berdiri sendiri dan BUKAN bagian dari deretan status, karena ia memang bukan
 * status: ia menyilang semuanya. Sebuah baris bisa INTAKE-dan-belum-diklaim maupun
 * IN_CUSTODY-dan-belum-diklaim, dan keduanya sama-sama butuh orang yang mengejar pemiliknya.
 */
type Filter = "PERLU_TINDAKAN" | "MENUNGGU_KLAIM" | "SEMUA" | ConsignmentStatus | "SELESAI";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "PERLU_TINDAKAN", label: "Perlu tindakan" },
  { key: "MENUNGGU_KLAIM", label: "Menunggu diklaim" },
  { key: "SEMUA", label: "Semua" },
  { key: "INTAKE", label: "Belum diterima" },
  { key: "IN_CUSTODY", label: "Di Hoshi" },
  { key: "LISTED", label: "Dipajang" },
  { key: "SOLD", label: "Terjual" },
  { key: "SELESAI", label: "Selesai / hilang" },
];

const TERMINAL: string[] = ["RELEASED", "LOST", "CANCELLED"];

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TAB DISIMPAN DI URL, BUKAN HANYA DI STATE REACT.

   Dulu tab yang dipilih hidup di `useState` saja, jadi setiap refresh melemparnya kembali ke
   "Perlu tindakan". Itu terasa seperti kerusakan kecil, tapi akibatnya nyata di layar ini:
   operator membuka satu titipan dari tab "Menunggu diklaim", menekan kembali atau me-refresh
   setelah bertindak, dan mendapati dirinya di tab lain — lalu harus mencari lagi barisnya di
   antara yang lain. Di layar yang dipakai sambil mengejar orang lewat telepon, itu mahal.

   Sekarang pilihannya ikut di `?tab=`, jadi refresh, tombol kembali, dan tautan yang di-share
   sama-sama mendarat di tempat yang sama.

   DIBACA LEWAT `window.location`, BUKAN `useSearchParams` — konvensi yang sudah dipakai
   app/marketplace, app/messages, dan app/admin/login di repo ini: `useSearchParams` memaksa
   halaman punya Suspense boundary, dan tidak ada yang mau ditukar dengan itu demi satu tab.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
const TAB_PARAM = "tab";

/** Nilai dari URL hanya diterima kalau ia benar-benar salah satu tab — bukan apa pun yang diketik. */
const parseTab = (raw: string | null): Filter | null =>
  raw && FILTERS.some((f) => f.key === raw) ? (raw as Filter) : null;

/** Foto yang mewakili satu baris: gambar listing kalau sudah dipajang, kalau belum foto DEPAN. */
const thumbOf = (c: AdminConsignment): string | null =>
  c.listing?.image ?? c.photos?.find((p) => p.kind === "FRONT")?.url ?? c.photos?.[0]?.url ?? null;

export default function AdminTitipanPage() {
  const { token } = useAdminAuth();
  const [rows, setRows] = useState<AdminConsignment[]>([]);
  /** id → kalimat "perlu tindakan" DARI SERVER. Kosong = tidak ada yang tertunggak. */
  const [todo, setTodo] = useState<Map<string, string[]>>(new Map());
  /**
   * id → baris "menunggu pemiliknya" DARI SERVER.
   *
   * Sumbernya `awaitingOwner` di jawaban daftar, bukan turunan klien — alasan yang sama dengan
   * `actionRequired`: dua salinan aturan berarti yang satu akan diam. Yang dibawanya juga lebih
   * dari sekadar "ya/tidak": keadaan kode klaimnya, dan nomor telepon dari serah-terima.
   */
  const [awaiting, setAwaiting] = useState<Map<string, AwaitingOwnerRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("PERLU_TINDAKAN");
  /** Gerbang: jangan menulis URL sebelum URL-nya sempat DIBACA, kalau tidak tab dari tautan
   *  langsung tertimpa nilai bawaan pada render pertama. */
  const [urlRead, setUrlRead] = useState(false);
  const [search, setSearch] = useState("");

  // Baca ?tab= SEKALI saat halaman dibuka. Nilai yang tidak dikenal diabaikan diam-diam —
  // tautan lama atau URL yang diketik tangan tidak boleh membuat layar ini kosong tanpa sebab.
  useEffect(() => {
    try {
      const fromUrl = parseTab(
        new URLSearchParams(window.location.search).get(TAB_PARAM),
      );
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      if (fromUrl) setFilter(fromUrl);
    } catch {
      /* URL tak terbaca — halaman tetap jalan, cuma mulai dari tab bawaan */
    }
    setUrlRead(true);
  }, []);

  // Tulis balik setiap kali tab berganti, supaya refresh dan tombol kembali mendarat di tempat
  // yang sama. `replaceState`, bukan `pushState`: berpindah tab bukan navigasi, dan menumpuk
  // riwayat membuat tombol kembali menyusuri tab satu per satu alih-alih keluar dari layar ini.
  useEffect(() => {
    if (!urlRead) return;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (filter === "PERLU_TINDAKAN") sp.delete(TAB_PARAM);
      else sp.set(TAB_PARAM, filter);
      const qs = sp.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    } catch {
      /* history tak bisa ditulis — tab tetap jalan, cuma tak bertahan saat refresh */
    }
  }, [filter, urlRead]);

  /** Kode klaim yang baru saja terbit dari layar ini dan belum diberikan ke pemiliknya. */
  const [handover, setHandover] = useState<{
    code: string;
    expiresAt: string | null;
    cardName: string;
    ownerName: string;
    ownerPhone: string;
    place: string;
  } | null>(null);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  /** Baris yang sedang dibukakan kolom alasan sebelum kodenya diterbitkan. */
  const [nudgeId, setNudgeId] = useState<string | null>(null);
  const [nudgeNote, setNudgeNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Satu tarikan tanpa filter status, lalu disaring di klien: jumlah titipan diukur dalam
      // puluhan (kartu FISIK yang harus diambil satu per satu), jadi memecahnya per status hanya
      // membuat hitungan tab-nya butuh request sendiri-sendiri.
      const res = await getAdminConsignments(token);
      setRows(res.rows);
      setTodo(new Map(res.actionRequired.map((t) => [t.id, t.reasons])));
      setAwaiting(new Map((res.awaitingOwner ?? []).map((a) => [a.id, a])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar titipan.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { INTAKE: 0, IN_CUSTODY: 0, LISTED: 0, SOLD: 0, SELESAI: 0, MENUNGGU_KLAIM: 0 };
    for (const r of rows) {
      if (r.status === "INTAKE") c.INTAKE += 1;
      else if (r.status === "IN_CUSTODY") c.IN_CUSTODY += 1;
      else if (r.status === "LISTED") c.LISTED += 1;
      else if (r.status === "SOLD") c.SOLD += 1;
      else if (TERMINAL.includes(r.status)) c.SELESAI += 1;
      // Dihitung TERPISAH dan tanpa `else`: "menunggu diklaim" menyilang semua status di atas,
      // bukan salah satu di antaranya.
      if (isAwaitingClaim(r)) c.MENUNGGU_KLAIM += 1;
    }
    return c;
  }, [rows]);

  /**
   * Terbitkan kode klaim baru dari daftar — "tegur" yang paling langsung: operator bisa mengirim
   * ulang kodenya lewat WhatsApp tanpa membuka halaman detail.
   *
   * Barisnya TIDAK dimuat ulang sesudah ini, dan itu disengaja: satu-satunya yang berubah di
   * server adalah sidik kode (baris ini tetap belum diklaim), sementara memuat ulang daftar di
   * bawah layar serah-terima hanya memperbesar peluang kodenya tergeser dari layar sebelum
   * sempat diberikan.
   */
  const issueCode = async (c: AdminConsignment) => {
    if (!token || issuingId || nudgeNote.trim().length < NOTE_MIN) return;
    setIssuingId(c.id);
    setError(null);
    try {
      const res = await issueAdminConsignmentClaimCode(c.id, nudgeNote.trim(), token);
      if (!res.claimCode) {
        setError(
          "Server tidak mengirimkan kode baru untuk titipan ini. Buka halaman titipannya untuk melihat keadaannya.",
        );
        return;
      }
      setHandover({
        code: res.claimCode,
        expiresAt: res.claimCodeExpiresAt ?? null,
        cardName: res.cardName,
        ownerName: res.consignorNameAtIntake,
        ownerPhone: res.consignorPhoneAtIntake,
        place: res.receivedAtPlace,
      });
      setNudgeId(null);
      setNudgeNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menerbitkan kode klaim.");
    } finally {
      setIssuingId(null);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "PERLU_TINDAKAN" && !todo.has(r.id)) return false;
      if (filter === "MENUNGGU_KLAIM" && !isAwaitingClaim(r)) return false;
      if (filter === "SELESAI" && !TERMINAL.includes(r.status)) return false;
      if (
        filter !== "SEMUA" &&
        filter !== "PERLU_TINDAKAN" &&
        filter !== "MENUNGGU_KLAIM" &&
        filter !== "SELESAI" &&
        r.status !== filter
      )
        return false;
      if (!q) return true;
      return (
        r.cardName.toLowerCase().includes(q) ||
        (r.certNumber ?? "").toLowerCase().includes(q) ||
        r.consignorNameAtIntake.toLowerCase().includes(q) ||
        (r.consignor?.displayName ?? "").toLowerCase().includes(q) ||
        (r.consignor?.walletAddress ?? "").toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, todo]);

  const countFor = (k: Filter): number | null => {
    if (k === "PERLU_TINDAKAN") return todo.size;
    if (k === "SEMUA") return rows.length;
    if (k === "SELESAI") return counts.SELESAI;
    return counts[k as keyof typeof counts] ?? null;
  };

  /* ── Layar serah-terima kode: MENGGANTI daftar, bukan modal yang bisa tertutup tak sengaja ────
     Kodenya hanya ada di memori halaman ini dan tidak bisa dibaca ulang dari server. Sebuah modal
     yang tertutup karena jari menyenggol latar belakang akan membuangnya, dan operator harus
     menerbitkan kode ketiga di depan pemilik kartu. Jadi jalan keluarnya cuma tombol yang sengaja
     ditekan. */
  if (handover) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-[22px] font-bold text-zinc-100">Kode klaim diterbitkan</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
            Untuk “{handover.cardName}”, atas nama {handover.ownerName}.
          </p>
        </header>
        <ClaimCodeHandover
          code={handover.code}
          cardName={handover.cardName}
          ownerName={handover.ownerName}
          ownerPhone={handover.ownerPhone}
          place={handover.place}
          expiresAt={handover.expiresAt}
          reissued
          doneLabel="Kembali ke daftar titipan"
          onDone={() => {
            setHandover(null);
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-zinc-100">Titipan</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
            Kartu milik orang lain yang fisiknya dipegang Hoshi. Kartu diterima dulu, baru boleh
            dipajang — itu yang membuat satu kartu tidak bisa terjual dua kali.
          </p>
        </div>
        <Link
          href="/admin/titipan/baru"
          className="rounded-xl px-4 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
          style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
        >
          + Titipan baru
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = countFor(f.key);
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-xl border px-3 py-2 text-[13px] font-medium transition ${
                active
                  ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]"
              }`}
            >
              {f.label}
              {n != null && n > 0 && <span className="ml-1.5 text-[11px] opacity-70">{n}</span>}
            </button>
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kartu / pemilik / no. sertifikat…"
          className="ml-auto w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-yellow-400/40 sm:w-72"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-[13px] text-zinc-500">Memuat…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-[14px] font-semibold text-zinc-300">
            {rows.length === 0
              ? "Belum ada titipan."
              : filter === "PERLU_TINDAKAN"
                ? "Tidak ada yang tertunggak."
                : filter === "MENUNGGU_KLAIM"
                  ? "Semua titipan sudah punya akun pemiliknya."
                  : "Tidak ada baris pada saringan ini."}
          </p>
          <p className="mt-1 text-[13px] text-zinc-500">
            {rows.length === 0
              ? "Catat kesepakatan pertama lewat tombol “Titipan baru”."
              : "Coba saringan “Semua”."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((c) => {
            const ui = statusUi(c.status);
            const reasons = todo.get(c.id) ?? [];
            // DUA hal dari server, dan keduanya dipakai untuk pekerjaan yang berbeda:
            //   `isAwaitingClaim(c)` membaca flag `awaitingOwnerClaim` di barisnya → ya/tidak.
            //   `awaiting.get(c.id)` membawa KEADAAN KODENYA + telepon dari serah-terima → apa
            //   yang harus operator lakukan sekarang, menelepon atau menerbitkan ulang.
            const awaitingClaim = isAwaitingClaim(c);
            const wait = awaiting.get(c.id) ?? null;
            return (
              <li
                key={c.id}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] transition hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="flex gap-3 p-3">
                {/* Tautan ke detail hanya membungkus BAGIAN KIRI — tombol kode klaim di kanan
                    adalah aksi, bukan navigasi, dan tombol di dalam <a> bukan HTML yang sah. */}
                <Link href={`/admin/titipan/${c.id}`} className="flex min-w-0 flex-1 gap-3">
                  <Thumb src={thumbOf(c)} alt={c.cardName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-zinc-100">
                        {c.cardName}
                      </span>
                      {c.gradeLabel && (
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-300">
                          {c.gradeLabel}
                        </span>
                      )}
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ui.cls}`}>
                        {ui.label}
                      </span>
                      {/* Lencana KEDUA, warna sendiri. Ia berdampingan dengan status custody dan
                          tidak pernah menggantikannya: "Di Hoshi · Belum diklaim" adalah dua
                          kenyataan yang benar sekaligus, dan operator perlu membaca keduanya. */}
                      {awaitingClaim && (
                        <span className="rounded-md border border-violet-400/35 bg-violet-400/10 px-2 py-0.5 text-[11px] font-semibold text-violet-200">
                          Belum diklaim
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-[12px] text-zinc-500">
                      Milik {c.consignorNameAtIntake}
                      {c.consignor?.displayName ? ` · ${c.consignor.displayName}` : ""}
                      {c.custodyAcceptedAt ? ` · di Hoshi sejak ${dt(c.custodyAcceptedAt)}` : ""}
                      {c.storageLocation ? ` · ${c.storageLocation}` : ""}
                    </p>
                    {awaitingClaim && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-violet-200/80">
                        {wait?.heldByHoshi
                          ? "Kartunya sudah di rak Hoshi, tapi belum ada akun yang akan menerima hasil penjualannya"
                          : "Belum ada akun yang akan menerima hasil penjualannya"}
                        {wait?.needsClaimCode
                          ? " — belum pernah ada kode klaim untuk kartu ini."
                          : wait?.claimCodeExpired
                            ? " — kode klaimnya sudah kedaluwarsa."
                            : wait?.claimCodeExpiresAt
                              ? ` — kodenya berlaku sampai ${dt(wait.claimCodeExpiresAt)}.`
                              : " — pemiliknya belum menukarkan kode klaimnya."}{" "}
                        Kartu ini belum bisa dipajang.
                        {wait?.consignorPhoneAtIntake ? ` Hubungi ${wait.consignorPhoneAtIntake}.` : ""}
                      </p>
                    )}
                    {reasons.length > 0 && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {reasons.map((t) => (
                          <li
                            key={t}
                            className="rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Link>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-semibold text-zinc-100">{rp(c.askPriceIdr)}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    komisi {commissionPct(c.commissionBps)}%
                  </p>
                  {/* ── JALAN KE FOTO, DARI DAFTAR ────────────────────────────────────────────
                      Baris berstatus INTAKE artinya kesepakatannya sudah tercatat tapi kartunya
                      BELUM diserahkan — dan yang membuka langkah berikutnya adalah FOTO (depan,
                      belakang, sertifikat, struk bertanda tangan) lalu "Terima kartu".

                      Sebelum ini satu-satunya tombol di baris seperti itu adalah "Kirim kode
                      lagi", jadi jalan menuju foto sama sekali tidak terlihat dari sini: ia cuma
                      ada di balik nama kartunya, atau di layar yang muncul tepat setelah
                      menyimpan. Operator yang kembali ke daftar keesokan harinya wajar menyimpulkan
                      unggah fotonya memang tidak ada — dan itu memang yang terjadi. */}
                  {c.status === "INTAKE" && (
                    <Link
                      href={`/admin/titipan/${c.id}`}
                      className="mt-2 block rounded-lg border border-[#F2C101]/40 bg-[#F2C101]/10 px-3 py-1.5 text-center text-[12px] font-semibold text-[#F2C101] transition hover:bg-[#F2C101]/20"
                    >
                      Foto &amp; terima kartu →
                    </Link>
                  )}
                  {awaitingClaim && nudgeId !== c.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setNudgeId(c.id);
                        setNudgeNote("");
                      }}
                      disabled={issuingId !== null}
                      className="mt-2 rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-1.5 text-[12px] font-semibold text-violet-200 transition hover:bg-violet-400/20 disabled:opacity-50"
                    >
                      Kirim kode lagi
                    </button>
                  )}
                </div>
                </div>

                {/* ── TEGUR: terbitkan kode baru, dari daftar ─────────────────────────────────
                    Alasannya diminta SEBELUM kodenya terbit. Penerbitan mematikan kode yang
                    mungkin masih dipegang seseorang, jadi "kenapa" harus sudah tertulis pada saat
                    itu terjadi — bukan diingat-ingat waktu ada yang bertanya. */}
                {nudgeId === c.id && (
                  <div className="border-t border-white/[0.07] px-3 pb-3 pt-3">
                    <textarea
                      value={nudgeNote}
                      onChange={(e) => setNudgeNote(e.target.value)}
                      rows={2}
                      autoFocus
                      placeholder="Kenapa kodenya diterbitkan lagi — mis. “tanda terima hilang, dikonfirmasi lewat WA ke nomor saat serah terima”."
                      className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-violet-400/40"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void issueCode(c)}
                        disabled={issuingId !== null || nudgeNote.trim().length < NOTE_MIN}
                        className="rounded-lg border border-violet-400/40 bg-violet-400/10 px-3.5 py-1.5 text-[12.5px] font-semibold text-violet-200 transition hover:bg-violet-400/20 disabled:opacity-50"
                      >
                        {issuingId === c.id ? "Menerbitkan…" : "Terbitkan kode baru"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNudgeId(null);
                          setNudgeNote("");
                        }}
                        className="rounded-lg px-2 py-1.5 text-[12.5px] text-zinc-500 transition hover:text-zinc-300"
                      >
                        Batal
                      </button>
                      <span className="text-[11px] text-zinc-500">
                        Kode sebelumnya langsung mati.
                      </span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
