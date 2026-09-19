"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TITIPAN BARU — catatan kesepakatan, ditulis di depan pemilik kartu.

   Layar ini SENGAJA tidak menerima kartunya. Yang dibuat di sini hanyalah baris berstatus
   "Belum diterima": kesepakatan sudah ada, barangnya belum. Serah terima dicatat di langkah
   berikutnya (foto → "Terima kartu"), dan hanya langkah itu yang membuka hak untuk dipajang.

   Dua hal yang dipisah itu bukan birokrasi: selama keduanya jadi satu tombol, akan selalu ada
   godaan memajang kartu yang "besok diambil" — dan kartu yang masih di tangan orang lain bisa
   ia jual sendiri ke pembeli lain.

   SATU LAGI, SOAL IDENTITAS: yang disimpan hanya JENIS dokumen + EMPAT ANGKA TERAKHIR. Nomor
   identitas lengkap tidak pernah dikirim, tidak pernah disimpan, tidak pernah ditampilkan.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  createAdminConsignment,
  getAdminUsers,
  type AdminUser,
  type CreateConsignmentInput,
} from "@/lib/admin-api";
import { commissionPct } from "@/lib/consignment";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/** Komisi bawaan (5%) — nilai yang dipakai pemilik produk hari ini. Dibekukan per baris titipan. */
const DEFAULT_COMMISSION_BPS = 500;

const GRADERS = ["", "PSA", "CGC", "BGS"] as const;
const ID_KINDS = ["", "KTP", "SIM", "PASPOR"] as const;
const RAW_CONDITIONS = ["", "NM", "LP", "MP", "HP", "DMG"] as const;

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-zinc-300">
        {label}
        {required && <span className="text-[11px] font-bold uppercase text-amber-300">wajib</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">{hint}</span>}
    </label>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
      {sub && <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{sub}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function AdminTitipanBaruPage() {
  const { token } = useAdminAuth();
  const router = useRouter();

  /* ── pemilik kartu ── */
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [consignor, setConsignor] = useState<AdminUser | null>(null);
  const [nameAtIntake, setNameAtIntake] = useState("");
  const [phone, setPhone] = useState("");
  const [idKind, setIdKind] = useState<string>("");
  const [idLast4, setIdLast4] = useState("");
  const [place, setPlace] = useState("");

  /* ── kartu ── */
  const [cardName, setCardName] = useState("");
  const [cardSet, setCardSet] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [language, setLanguage] = useState("");
  const [tcg, setTcg] = useState("");
  const [grader, setGrader] = useState<string>("");
  const [certNumber, setCertNumber] = useState("");
  const [gradeLabel, setGradeLabel] = useState("");
  const [gradeScore, setGradeScore] = useState("");
  const [rawCondition, setRawCondition] = useState("");
  const [conditionNote, setConditionNote] = useState("");

  /* ── kesepakatan ── */
  const [askPrice, setAskPrice] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [commissionBps, setCommissionBps] = useState(String(DEFAULT_COMMISSION_BPS));
  const [agreementRef, setAgreementRef] = useState("");
  const [intakeReceiptRef, setIntakeReceiptRef] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Pencarian user — debounce ringan supaya tiap ketukan huruf tidak jadi satu request. */
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!token) return;
    const q = userQuery.trim();
    if (q.length < 2) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setUserResults([]);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setUserSearching(true);
      getAdminUsers(token, { search: q, limit: 8 })
        .then((r) => setUserResults(r.data))
        .catch(() => setUserResults([]))
        .finally(() => setUserSearching(false));
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [userQuery, token]);

  const askNum = Number(askPrice);
  const bpsNum = Number(commissionBps);

  /**
   * Yang masih kurang — ditampilkan terus, bukan baru muncul setelah tombol ditekan.
   *
   * Batas-batasnya SENGAJA sama dengan yang ditegakkan server (nama ≥2, HP ≥5, tempat ≥3,
   * catatan kondisi ≥10, grade 0–10, komisi 0–10000). Validasi klien yang lebih longgar hanya
   * memindahkan penolakan ke detik setelah operator menekan Simpan — di depan pemilik kartu.
   */
  const missing = useMemo(() => {
    const m: string[] = [];
    if (!consignor) m.push("pemilik kartu (akun Hoshi)");
    if (nameAtIntake.trim().length < 2) m.push("nama pemilik di tanda terima");
    if (phone.trim().length < 5) m.push("nomor HP pemilik");
    if (idLast4 !== "" && idLast4.length !== 4) m.push("4 angka terakhir identitas (harus 4 digit)");
    if (place.trim().length < 3) m.push("tempat serah terima");
    if (!cardName.trim()) m.push("nama kartu");
    if (conditionNote.trim().length < 10)
      m.push("catatan kondisi (minimal satu kalimat, 10 huruf)");
    if (gradeScore.trim() !== "" && !(Number(gradeScore) >= 0 && Number(gradeScore) <= 10))
      m.push("nilai grade antara 0 dan 10");
    if (!Number.isFinite(askNum) || askNum <= 0) m.push("harga jual yang disepakati");
    if (!Number.isFinite(bpsNum) || bpsNum < 0 || bpsNum > 10_000) m.push("komisi yang wajar");
    return m;
  }, [
    consignor,
    nameAtIntake,
    phone,
    idLast4,
    place,
    cardName,
    conditionNote,
    gradeScore,
    askNum,
    bpsNum,
  ]);

  const submit = async () => {
    if (!token || busy || missing.length > 0 || !consignor) return;
    setBusy(true);
    setError(null);
    try {
      const input: CreateConsignmentInput = {
        consignorId: consignor.id,
        consignorNameAtIntake: nameAtIntake.trim(),
        consignorPhoneAtIntake: phone.trim(),
        ...(idKind ? { consignorIdKind: idKind } : {}),
        ...(idLast4.trim() ? { consignorIdLast4: idLast4.trim().slice(-4) } : {}),
        receivedAtPlace: place.trim(),
        cardName: cardName.trim(),
        ...(cardSet.trim() ? { cardSet: cardSet.trim() } : {}),
        ...(cardNumber.trim() ? { cardNumber: cardNumber.trim() } : {}),
        ...(language.trim() ? { language: language.trim() } : {}),
        ...(tcg.trim() ? { tcg: tcg.trim() } : {}),
        ...(grader ? { grader } : {}),
        ...(certNumber.trim() ? { certNumber: certNumber.trim() } : {}),
        ...(gradeLabel.trim() ? { gradeLabel: gradeLabel.trim() } : {}),
        ...(gradeScore.trim() && Number.isFinite(Number(gradeScore))
          ? { gradeScore: Number(gradeScore) }
          : {}),
        ...(rawCondition ? { rawCondition } : {}),
        conditionNote: conditionNote.trim(),
        askPriceIdr: Math.round(askNum),
        ...(reservePrice.trim() && Number.isFinite(Number(reservePrice))
          ? { reservePriceIdr: Math.round(Number(reservePrice)) }
          : {}),
        commissionBps: Math.round(bpsNum),
        ...(agreementRef.trim() ? { agreementRef: agreementRef.trim() } : {}),
        ...(intakeReceiptRef.trim() ? { intakeReceiptRef: intakeReceiptRef.trim() } : {}),
      };
      const created = await createAdminConsignment(input, token);
      // Langsung ke halaman barisnya: di sanalah foto diambil dan kartu dinyatakan diterima.
      router.push(`/admin/titipan/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan titipan.");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-28">
      <header>
        <Link href="/admin/titipan" className="text-[13px] text-zinc-500 transition hover:text-zinc-300">
          ← Titipan
        </Link>
        <h1 className="mt-2 text-[22px] font-bold text-zinc-100">Titipan baru</h1>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-zinc-500">
          Catat kesepakatannya dulu. Kartunya baru dinyatakan diterima di langkah berikutnya —
          setelah difoto — dan baru sesudah itu ia boleh dipajang.
        </p>
      </header>

      <Section
        title="Pemilik kartu"
        sub="Harus akun Hoshi yang sungguhan: dia yang nanti menerima hasil penjualannya."
      >
        <div className="sm:col-span-2">
          <Field label="Cari akun pemilik" required hint="Ketik nama, email, atau alamat wallet.">
            <input
              value={consignor ? `${consignor.displayName ?? "Tanpa nama"} · ${consignor.walletAddress}` : userQuery}
              onChange={(e) => {
                setConsignor(null);
                setUserQuery(e.target.value);
              }}
              placeholder="mis. Budi / 7xKXt…"
              className={INPUT}
            />
          </Field>
          {!consignor && userQuery.trim().length >= 2 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#121217]">
              {userSearching && <p className="px-3.5 py-2.5 text-[12px] text-zinc-500">Mencari…</p>}
              {!userSearching && userResults.length === 0 && (
                <p className="px-3.5 py-2.5 text-[12px] text-zinc-500">
                  Tidak ada akun yang cocok. Pemilik kartu harus punya akun Hoshi lebih dulu.
                </p>
              )}
              {userResults.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setConsignor(u);
                    setUserQuery("");
                    if (!nameAtIntake.trim()) setNameAtIntake(u.displayName ?? "");
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/[0.05]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-zinc-200">
                      {u.displayName ?? "Tanpa nama"}
                    </span>
                    <span className="block truncate text-[11px] text-zinc-500">{u.walletAddress}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-zinc-600">{u.email ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Field
          label="Nama di tanda terima"
          required
          hint="Ditulis apa adanya hari ini. Nama akun bisa diganti pemiliknya kapan saja; yang ini tidak."
        >
          <input value={nameAtIntake} onChange={(e) => setNameAtIntake(e.target.value)} className={INPUT} />
        </Field>

        <Field label="Nomor HP" required>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="08…"
            className={INPUT}
          />
        </Field>

        <Field label="Jenis identitas">
          <select value={idKind} onChange={(e) => setIdKind(e.target.value)} className={INPUT}>
            {ID_KINDS.map((k) => (
              <option key={k} value={k} className="bg-[#121217]">
                {k || "— tidak dicatat —"}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="4 angka terakhir identitas"
          hint="HANYA empat angka terakhir. Jangan pernah catat nomor lengkapnya di mana pun."
        >
          <input
            value={idLast4}
            onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, "").slice(-4))}
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            className={INPUT}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Tempat serah terima"
            required
            hint="mis. “Rumah pemilik, Bandung” atau “Kantor Hoshi, Jakarta”."
          >
            <input value={place} onChange={(e) => setPlace(e.target.value)} className={INPUT} />
          </Field>
        </div>
      </Section>

      <Section
        title="Kartunya"
        sub="Nomor sertifikat adalah bukti identitas terkuat yang ada — dan pemilik kartu bisa mengeceknya sendiri di situs grader-nya, tanpa perlu percaya Hoshi."
      >
        <div className="sm:col-span-2">
          <Field label="Nama kartu" required>
            <input
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="mis. Charizard VMAX"
              className={INPUT}
            />
          </Field>
        </div>

        <Field label="Set / seri">
          <input value={cardSet} onChange={(e) => setCardSet(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Nomor kartu">
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Bahasa">
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="English / Japan"
            className={INPUT}
          />
        </Field>
        <Field label="TCG">
          <input
            value={tcg}
            onChange={(e) => setTcg(e.target.value)}
            placeholder="Pokemon / One Piece…"
            className={INPUT}
          />
        </Field>

        <Field label="Grader" hint="Kosongkan untuk kartu mentah (belum di-grade).">
          <select value={grader} onChange={(e) => setGrader(e.target.value)} className={INPUT}>
            {GRADERS.map((g) => (
              <option key={g} value={g} className="bg-[#121217]">
                {g || "— mentah / tanpa grading —"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nomor sertifikat">
          <input
            value={certNumber}
            onChange={(e) => setCertNumber(e.target.value)}
            placeholder="mis. 74185296"
            className={INPUT}
          />
        </Field>
        <Field label="Grade">
          <input
            value={gradeLabel}
            onChange={(e) => setGradeLabel(e.target.value)}
            placeholder="PSA 10"
            className={INPUT}
          />
        </Field>
        <Field label="Nilai grade (angka)">
          <input
            value={gradeScore}
            onChange={(e) => setGradeScore(e.target.value)}
            inputMode="decimal"
            placeholder="10"
            className={INPUT}
          />
        </Field>

        <Field label="Kondisi kartu mentah">
          <select
            value={rawCondition}
            onChange={(e) => setRawCondition(e.target.value)}
            className={INPUT}
          >
            {RAW_CONDITIONS.map((c) => (
              <option key={c} value={c} className="bg-[#121217]">
                {c || "— tidak berlaku —"}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field
            label="Catatan kondisi"
            required
            hint="Tulis dengan kata-katamu sendiri, di depan pemiliknya — termasuk untuk slab (“slab utuh, tidak retak, label lurus”). Kalimat inilah yang dipakai kalau berbulan-bulan lagi ada perbedaan pendapat soal kondisi."
          >
            <textarea
              value={conditionNote}
              onChange={(e) => setConditionNote(e.target.value)}
              rows={3}
              className={`${INPUT} resize-y leading-relaxed`}
            />
          </Field>
        </div>
      </Section>

      <Section title="Kesepakatan" sub="Angka-angka ini dibekukan di baris titipan hari ini.">
        <Field label="Harga jual (Rp)" required>
          <input
            value={askPrice}
            onChange={(e) => setAskPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder="2500000"
            className={INPUT}
          />
        </Field>
        <Field label="Harga terendah yang boleh (Rp)" hint="Opsional — catatan internal.">
          <input
            value={reservePrice}
            onChange={(e) => setReservePrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={INPUT}
          />
        </Field>

        <Field
          label="Komisi Hoshi (bps)"
          hint="500 = 5%. Disimpan per titipan, jadi perubahan komisi standar di kemudian hari tidak mengubah apa yang sudah dijanjikan untuk kartu ini."
        >
          <input
            value={commissionBps}
            onChange={(e) => setCommissionBps(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            className={INPUT}
          />
        </Field>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
          <p className="text-[12px] text-zinc-500">Kalau terjual di harga ini</p>
          <p className="mt-1 text-[14px] text-zinc-200">
            Pemilik menerima{" "}
            <strong className="text-emerald-300">
              Rp{" "}
              {Number.isFinite(askNum) && askNum > 0 && Number.isFinite(bpsNum)
                ? Math.max(
                    0,
                    Math.round(askNum) - Math.floor((Math.round(askNum) * Math.min(Math.max(bpsNum, 0), 10_000)) / 10_000),
                  ).toLocaleString("id-ID")
                : "—"}
            </strong>
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            Komisi Hoshi {Number.isFinite(bpsNum) ? commissionPct(bpsNum) : "—"}%. Angka pastinya
            dihitung server dari jumlah yang benar-benar dibayar pembeli.
          </p>
        </div>

        <Field label="Nomor / arsip perjanjian" hint="Opsional: penanda dokumen yang ditandatangani.">
          <input value={agreementRef} onChange={(e) => setAgreementRef(e.target.value)} className={INPUT} />
        </Field>
        <Field
          label="Nomor / arsip tanda terima"
          hint="Tanda terima yang ditandatangani KEDUA pihak. Pemilik kartu memegang salinannya — ini buktinya, bukan bukti Hoshi."
        >
          <input
            value={intakeReceiptRef}
            onChange={(e) => setIntakeReceiptRef(e.target.value)}
            className={INPUT}
          />
        </Field>
      </Section>

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      {/* Bilah simpan — menempel di bawah layar supaya di ponsel tidak perlu menggulung balik, dan
          selalu menyebut apa yang masih kurang alih-alih menunggu tombolnya ditolak. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0b0b0f]/95 px-4 py-3 backdrop-blur lg:pl-[264px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-zinc-500">
            {missing.length === 0 ? (
              <>Siap disimpan. Setelah ini: foto kartunya, lalu nyatakan diterima.</>
            ) : (
              <>Belum lengkap: {missing.join(", ")}.</>
            )}
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || missing.length > 0}
            className="shrink-0 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
          >
            {busy ? "Menyimpan…" : "Simpan kesepakatan"}
          </button>
        </div>
      </div>
    </div>
  );
}
