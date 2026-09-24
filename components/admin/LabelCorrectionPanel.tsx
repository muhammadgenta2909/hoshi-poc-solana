"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KOREKSI KETERANGAN KARTU — satu-satunya layar yang MENIMPA kolom identitas sebuah titipan.

   ┌──── GARIS YANG MEMBUAT PANEL INI BOLEH ADA ───────────────────────────────────────────────┐
   │ Catatan kondisi dan foto adalah BUKTI: pernyataan tentang keadaan kartu pada HARI ia       │
   │ diterima. Keduanya TIDAK punya rute ubah, dan panel ini tidak melonggarkannya sedikit pun. │
   │                                                                                            │
   │ Nama kartu, set, nomor, sertifikat, grader, dan grade adalah LABEL: klaim tentang kartu    │
   │ MANA ini — bisa dicek terhadap slab fisiknya sendiri dan terhadap situs grader-nya. Label  │
   │ yang salah ketik bukan bukti tentang apa pun; ia cuma salah.                               │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   Dua kejadian nyata yang dulu tidak punya jalan keluar sama sekali:

   1. Dropdown Grader tertinggal kosong saat intake di teras rumah kolektor. `createListingFor`
      menolak SELAMANYA kartu tanpa grader, jadi slab PSA milik orang lain duduk di rak tanpa bisa
      dijual — dan satu-satunya jalan keluar dari IN_CUSTODY adalah RELEASE ("kartu sudah keluar
      dari Hoshi") atau LOST ("hilang"). Dua-duanya FAKTA PALSU yang ditulis ke buku besar yang
      sengaja append-only.
   2. Satu digit nomor sertifikat salah ketik. Nomor itu TAYANG ke pembeli, tidak cocok saat dicek
      di situs PSA, dan tidak ada satu layar pun untuk membetulkannya.

   Yang membuat ini bukan pintu belakang: `note` WAJIB, nilai SEBELUM dan SESUDAH disimpan
   permanen sebagai baris audit `LABEL_CORRECTION`, dan jejak itu bisa dibaca PEMILIK KARTUNYA
   SENDIRI di /titipan. Koreksi tetap TERLIHAT sebagai koreksi.

   Gerbang yang sebenarnya ada di server. Yang ditulis di sini adalah CERMINnya, supaya operator
   tahu SEBELUM menekan — bukan sesudah ditolak sambil pemilik kartunya menunggu di depan meja.
   Kalau keduanya pernah berbeda pendapat, YANG BENAR ADALAH SERVER.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useState, type ReactNode } from "react";
import {
  AdminApiError,
  correctAdminConsignmentLabel,
  type AdminConsignment,
  type ConsignmentLabelChange,
  type CorrectConsignmentLabelInput,
} from "@/lib/admin-api";
import Select from "@/components/admin/Select";
import { ConfirmDialog } from "@/components/account/ui";

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/** Sama dengan NOTE_MIN di DTO backend. Alasan yang lebih pendek ditolak server. */
const NOTE_MIN = 10;

/**
 * Grader yang dikenal kolom listing. Kosong = kartunya MENTAH (kolomnya dikosongkan).
 *
 * Urutannya mengikuti enum `Grader` backend: PSA lalu TAG (dua grader yang sungguh beredar di
 * pasar Indonesia), baru CGC/BGS. Nilai di luar daftar ini DITOLAK server — daftar ini bukan
 * saran, ia cermin dari enum Postgres.
 */
const GRADER_OPTIONS = [
  { value: "", label: "Kartu mentah — tanpa grading" },
  { value: "PSA", label: "PSA" },
  { value: "TAG", label: "TAG" },
  { value: "CGC", label: "CGC" },
  { value: "BGS", label: "BGS" },
];

/** Label manusia untuk tiap kolom — dipakai di ringkasan perubahan dan di dialog konfirmasi. */
const FIELD_LABEL: Record<ConsignmentLabelChange["field"], string> = {
  cardName: "Nama kartu",
  cardSet: "Set / seri",
  cardNumber: "Nomor kartu",
  certNumber: "Nomor sertifikat",
  grader: "Grader",
  gradeLabel: "Label grade",
  gradeScore: "Skor grade",
};

const shown = (v: string | number | null | undefined) =>
  v == null || v === "" ? "(kosong)" : String(v);

type FormState = {
  cardName: string;
  cardSet: string;
  cardNumber: string;
  certNumber: string;
  gradeLabel: string;
  gradeScore: string;
  grader: string;
};

/** Nilai yang TERSIMPAN sekarang, dalam bentuk yang sama dengan isi formulir. */
const seedFrom = (c: AdminConsignment): FormState => ({
  cardName: c.cardName ?? "",
  cardSet: c.cardSet ?? "",
  cardNumber: c.cardNumber ?? "",
  certNumber: c.certNumber ?? "",
  gradeLabel: c.gradeLabel ?? "",
  gradeScore: c.gradeScore == null ? "" : String(c.gradeScore),
  grader: c.grader ?? "",
});

/** Satu kolom + nilai yang tersimpan sekarang di sebelahnya, supaya yang diubah terlihat. */
function Field({
  label,
  hint,
  now,
  changed,
  children,
}: {
  label: string;
  hint?: ReactNode;
  now: ReactNode;
  changed: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[13px] font-medium text-zinc-300">{label}</span>
        {changed && (
          <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-200">
            akan diubah
          </span>
        )}
      </span>
      {children}
      <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
        Sekarang: <span className="text-zinc-400">{now}</span>
        {hint ? <> · {hint}</> : null}
      </span>
    </label>
  );
}

export default function LabelCorrectionPanel({
  c,
  token,
  onUpdated,
  onReload,
}: {
  c: AdminConsignment;
  token: string;
  /** Baris terbaru dari server — dipakai halaman sebagai state barisnya. */
  onUpdated: (row: AdminConsignment) => void;
  /** Muat ulang baris dari server. Dipakai kalau gerbang optimistik server menolak. */
  onReload: () => void;
}) {
  const stored = seedFrom(c);
  const [form, setForm] = useState<FormState>(stored);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** 409 = keadaan barisnya menolak; yang ini memancing tombol "muat ulang". */
  const [errStale, setErrStale] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof FormState) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  /* ── APA YANG SEBENARNYA DIKIRIM ──────────────────────────────────────────────────────────
     HANYA kolom yang BERBEDA dari nilai tersimpan. Itu bukan penghematan byte: server memakai
     gerbang optimistik yang menyebut NILAI LAMA setiap kolom yang disentuh, dan setiap kolom yang
     ikut terkirim tanpa alasan menambah satu cara permintaan ini kalah balapan dengan operator
     lain yang sedang memperbaiki kolom yang sama sekali berbeda. */
  const patch: CorrectConsignmentLabelInput = { note: note.trim() };
  const changes: { field: ConsignmentLabelChange["field"]; before: string; after: string }[] = [];
  const blockers: string[] = [];

  const addText = (field: Exclude<ConsignmentLabelChange["field"], "gradeScore">) => {
    const next = form[field].trim();
    const before = stored[field];
    if (next === before) return;
    // String kosong = KOSONGKAN kolomnya. Itu arti yang dipakai server, dan koreksi yang benar
    // kadang memang berarti menghapus (nomor sertifikat pada kartu yang ternyata mentah).
    patch[field] = next;
    changes.push({ field, before, after: next });
  };

  // `cardName` lebih dulu, dan dengan satu pengecualian: ia judul PUBLIK kartunya
  // (`createListingFor` menyalinnya langsung ke `Listing.name`), jadi ia tidak boleh dikosongkan.
  if (form.cardName.trim().length === 0) {
    blockers.push(
      "Nama kartu tidak boleh dikosongkan — ia judul publik kartu ini. Tulis nama yang BENAR, " +
        "bukan kolom kosong.",
    );
  } else {
    addText("cardName");
  }
  addText("cardSet");
  addText("cardNumber");
  addText("certNumber");
  addText("gradeLabel");
  addText("grader");

  /* Skor grade: satu-satunya kolom yang TIDAK punya bentuk "kosong" di DTO server (ia angka
     0–10). Dikosongkan di layar ini berarti permintaannya tidak bisa menyampaikan maksudnya —
     jadi dikatakan, bukan diabaikan diam-diam. */
  const scoreRaw = form.gradeScore.trim();
  if (scoreRaw !== stored.gradeScore) {
    if (scoreRaw === "") {
      blockers.push(
        "Skor grade tidak bisa DIKOSONGKAN lewat koreksi label (server hanya menerima angka " +
          "0–10). Kalau kartunya ternyata mentah, kosongkan Grader dan Label grade — skornya " +
          "ikut tidak berarti apa-apa lagi.",
      );
    } else {
      const n = Number(scoreRaw);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        blockers.push("Skor grade harus angka antara 0 dan 10.");
      } else if (n !== c.gradeScore) {
        patch.gradeScore = n;
        changes.push({ field: "gradeScore", before: stored.gradeScore, after: String(n) });
      }
    }
  }

  /* ── CERMIN GERBANG SERVER ────────────────────────────────────────────────────────────────
     Ketiganya ditegakkan `correctLabel` dan ditulis ulang di sini HANYA supaya operator membacanya
     sebelum menekan. Tidak ada satu pun yang "dilonggarkan" di layar. */
  const graderChanged = patch.grader !== undefined;
  const soldToBuyer =
    c.status === "SOLD" || c.soldOrderId != null || c.listing?.buyerId != null;
  const listingActive = c.listing?.status === "ACTIVE";

  if (graderChanged && soldToBuyer) {
    blockers.push(
      `Grader tidak bisa dikoreksi lagi: titipan ini SUDAH punya pembeli yang membayar${
        c.soldOrderId ? ` (order ${c.soldOrderId})` : ""
      }. Ia membayar untuk kartu ber-grading “${c.grader ?? "mentah"}”, dan itulah yang dibacanya ` +
        "saat menekan Beli. Field label lain masih boleh dikoreksi. Kalau grading yang benar " +
        "memang berbeda, itu urusan yang harus diselesaikan DENGAN pembelinya — tulis duduk " +
        "perkaranya di “Tulis koreksi”.",
    );
  }
  if (graderChanged && patch.grader === "" && listingActive) {
    blockers.push(
      "Grader tidak bisa dikosongkan selagi kartunya TAYANG: kolom grader pada listing hanya " +
        "mengenal PSA/TAG/CGC/BGS dan tidak punya nilai yang jujur untuk kartu mentah. Turunkan " +
        "dulu pajangannya lewat “Pemilik minta kartunya kembali”, baru koreksi labelnya — " +
        "kartunya tetap di rak Hoshi selama itu.",
    );
  }
  /* Kunci anti-dobel-titip adalah PASANGAN (grader, certNumber): di Postgres grader NULL membuat
     kunci itu TIDAK PERNAH bentrok, jadi satu slab fisik bisa punya dua titipan hidup tanpa satu
     lapis pun berbunyi. Dipicu HANYA kalau koreksinya menyentuh salah satu dari keduanya — persis
     seperti server — supaya baris WARISAN yang sudah terlanjur berbentuk begitu tetap boleh
     diperbaiki nama/set-nya tanpa dipaksa menyelesaikan urusan grader lebih dulu. */
  const nextGrader = patch.grader !== undefined ? patch.grader : stored.grader;
  const nextCert = patch.certNumber !== undefined ? patch.certNumber : stored.certNumber;
  if ((graderChanged || patch.certNumber !== undefined) && nextCert !== "" && nextGrader === "") {
    blockers.push(
      "Nomor sertifikat terisi tapi Grader kosong — ditolak server. Keduanya satu paket: kunci " +
        "anti-dobel-titip adalah pasangan (grader, certNumber). Pilih grader-nya sesuai yang " +
        "tertera di slab, ATAU kosongkan nomor sertifikatnya kalau kartunya memang MENTAH.",
    );
  }

  const noteTooShort = note.trim().length < NOTE_MIN;
  const nothingChanged = changes.length === 0;
  const canSubmit = !busy && !nothingChanged && !noteTooShort && blockers.length === 0;

  const submit = async () => {
    if (!canSubmit || !token) return;
    setBusy(true);
    setErr(null);
    setErrStale(false);
    setDone(null);
    try {
      const res = await correctAdminConsignmentLabel(c.id, patch, token);
      const { corrected, listingUpdated, ...row } = res;
      onUpdated(row);
      // Formulir DISEMAI ULANG dari baris yang baru: kalau tidak, kolom yang barusan diperbaiki
      // akan terus tampil sebagai "akan diubah" terhadap nilai lamanya, dan operator akan mengira
      // koreksinya belum tersimpan.
      setForm(seedFrom(row));
      setNote("");
      // Yang dilaporkan adalah apa yang BENAR-BENAR tertulis menurut server (ia membuang kolom
      // yang nilainya ternyata sudah sama), bukan apa yang dikirim layar ini.
      const ringkas = corrected
        .map((ch) => `${FIELD_LABEL[ch.field]}: ${shown(ch.before)} → ${shown(ch.after)}`)
        .join("; ");
      const publik = listingUpdated
        ? "Judul yang dilihat publik di marketplace ikut diperbaiki di transaksi yang sama."
        : c.listing
          ? listingActive
            ? "Tidak ada kolom listing yang perlu ikut berubah."
            : "Listing-nya tidak disentuh — baris itu snapshot apa yang dibeli pembeli."
          : "Kartu ini belum pernah dipajang, jadi tidak ada judul publik yang perlu ikut berubah.";
      setDone(
        `Tersimpan. ${ringkas}. ${publik} Nilai lamanya tidak hilang: ia pindah ke jejak audit, ` +
          "dan pemilik kartu bisa membacanya sendiri.",
      );
    } catch (e) {
      // Pesan server dipakai APA ADANYA: ia menyebut kolom, nilai, dan titipan lain yang bentrok
      // jauh lebih tepat daripada terjemahan mana pun yang bisa ditulis di sini.
      setErr(e instanceof Error ? e.message : "Koreksi gagal.");
      setErrStale(e instanceof AdminApiError && e.status === 409);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div>
      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-amber-100/90">
        Yang diubah di sini <strong>menimpa kolomnya</strong> — termasuk judul yang dilihat pembeli
        kalau kartunya sedang tayang. Nilai lamanya tidak hilang: ia tersimpan permanen sebagai
        baris <strong>“Keterangan kartu diperbaiki”</strong> di Riwayat, lengkap dengan nilai
        sebelum dan sesudah, dan{" "}
        <strong>pemilik kartu ini bisa membacanya sendiri</strong> di halaman titipannya. Catatan
        kondisi dan foto tidak bisa ditimpa dari sini — keduanya bukti.
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama kartu"
          now={shown(c.cardName)}
          changed={patch.cardName !== undefined}
          hint="judul publik kartunya — tidak boleh dikosongkan"
        >
          <input
            value={form.cardName}
            onChange={(e) => set("cardName")(e.target.value)}
            className={INPUT}
          />
        </Field>

        <Field label="Set / seri" now={shown(c.cardSet)} changed={patch.cardSet !== undefined}>
          <input
            value={form.cardSet}
            onChange={(e) => set("cardSet")(e.target.value)}
            placeholder="kosongkan untuk menghapus"
            className={INPUT}
          />
        </Field>

        <Field
          label="Nomor kartu"
          now={shown(c.cardNumber)}
          changed={patch.cardNumber !== undefined}
        >
          <input
            value={form.cardNumber}
            onChange={(e) => set("cardNumber")(e.target.value)}
            placeholder="kosongkan untuk menghapus"
            className={INPUT}
          />
        </Field>

        <Field
          label="Grader"
          now={shown(c.grader)}
          changed={graderChanged}
          hint="kosong = kartunya mentah"
        >
          <Select
            value={form.grader}
            onChange={set("grader")}
            options={GRADER_OPTIONS}
            placeholder="Pilih grader"
          />
        </Field>

        <Field
          label="Nomor sertifikat"
          now={shown(c.certNumber)}
          changed={patch.certNumber !== undefined}
          hint="dicocokkan dengan slab-nya, bukan dengan ingatan"
        >
          <input
            value={form.certNumber}
            onChange={(e) => set("certNumber")(e.target.value)}
            placeholder="kosongkan untuk menghapus"
            className={INPUT}
          />
        </Field>

        <Field label="Label grade" now={shown(c.gradeLabel)} changed={patch.gradeLabel !== undefined}>
          <input
            value={form.gradeLabel}
            onChange={(e) => set("gradeLabel")(e.target.value)}
            placeholder="mis. PSA 10"
            className={INPUT}
          />
        </Field>

        <Field
          label="Skor grade"
          now={shown(c.gradeScore)}
          changed={patch.gradeScore !== undefined}
          hint="0–10; tidak bisa dikosongkan"
        >
          <input
            value={form.gradeScore}
            onChange={(e) => set("gradeScore")(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            className={INPUT}
          />
        </Field>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
          Alasan koreksi (wajib)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="APA yang salah dan DARI MANA kamu tahu nilai yang benar — mis. “dropdown grader tertinggal kosong saat intake di rumah pemilik; dicocokkan ulang dengan slab PSA 12345678 yang difoto di bukti”."
          className={`${INPUT} resize-y leading-relaxed`}
        />
        <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
          Minimal {NOTE_MIN} karakter. Tersimpan permanen, dan pemilik kartu ikut membacanya.
        </span>
      </div>

      {/* Apa yang akan berubah — DITAMPILKAN sebelum tombolnya ditekan, bukan sesudah. */}
      {changes.length > 0 && blockers.length === 0 && (
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-3">
          <p className="text-[12.5px] font-semibold text-zinc-200">Yang akan ditulis:</p>
          <ul className="mt-1.5 space-y-1">
            {changes.map((ch) => (
              <li key={ch.field} className="text-[12px] leading-relaxed text-zinc-400">
                {FIELD_LABEL[ch.field]}:{" "}
                <span className="text-zinc-500">{shown(ch.before)}</span> →{" "}
                <span className="text-zinc-100">{shown(ch.after)}</span>
              </li>
            ))}
          </ul>
          {/* Satu-satunya penolakan yang TIDAK bisa diperiksa dari layar ini: layar tidak boleh
              bisa menanyakan titipan orang lain. Dikatakan sebagai kemungkinan, supaya 409-nya
              tidak terbaca seperti kerusakan. */}
          {(graderChanged || patch.certNumber !== undefined) && nextCert !== "" && (
            <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-[11.5px] leading-relaxed text-zinc-500">
              Pasangan <strong className="text-zinc-400">{nextGrader || "(kosong)"} {nextCert}</strong>{" "}
              ikut diperiksa terhadap titipan yang masih HIDUP: kalau ia sudah dipakai baris lain,
              server menolak dan <strong>tidak ada yang berubah</strong> — satu kartu fisik tidak
              bisa punya dua titipan hidup. Periksa lagi nomor yang tertera di slab-nya.
            </p>
          )}
        </div>
      )}

      {/* Penghalang — ditampilkan, bukan disembunyikan di balik tombol mati. */}
      {blockers.length > 0 && (
        <ul className="mt-4 space-y-2">
          {blockers.map((b) => (
            <li
              key={b.slice(0, 40)}
              className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-100"
            >
              {b}
            </li>
          ))}
        </ul>
      )}

      {done && (
        <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-200">
          {done}
        </p>
      )}
      {err && (
        <div className="mt-4 rounded-xl border border-red-400/35 bg-red-400/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-200">
          <p className="font-semibold">Koreksi DITOLAK — tidak ada yang berubah.</p>
          <p className="mt-1">{err}</p>
          {errStale && (
            <button
              type="button"
              onClick={onReload}
              className="mt-2.5 rounded-lg border border-red-300/40 bg-red-400/10 px-3 py-1.5 text-[12px] font-semibold text-red-100 transition hover:bg-red-400/20"
            >
              Muat ulang barisnya
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setConfirm(true)}
          disabled={!canSubmit}
          className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Simpan koreksi keterangan"}
        </button>
        <p className="text-[12px] leading-relaxed text-zinc-500">
          {nothingChanged
            ? "Belum ada yang diubah — ubah dulu salah satu kolom di atas."
            : noteTooShort
              ? "Tulis dulu alasannya (minimal 10 karakter)."
              : blockers.length > 0
                ? "Selesaikan dulu yang di atas."
                : `${changes.length} kolom akan ditimpa, dalam satu transaksi bersama baris auditnya.`}
        </p>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Tulis koreksi keterangan kartu?"
        message={
          <>
            <span className="block">
              Kolom ini ditimpa, dan judul yang dilihat publik ikut diperbaiki kalau kartunya masih
              tayang:
            </span>
            <span className="mt-2 block space-y-1">
              {changes.map((ch) => (
                <span key={ch.field} className="block text-[12.5px]">
                  <strong>{FIELD_LABEL[ch.field]}</strong>: {shown(ch.before)} →{" "}
                  {shown(ch.after)}
                </span>
              ))}
            </span>
            <span className="mt-2 block">
              Nilai lamanya pindah ke jejak audit yang pemilik kartu bisa baca sendiri.
            </span>
          </>
        }
        confirmLabel="Ya, betulkan"
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
