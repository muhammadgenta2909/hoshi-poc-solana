"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   MEMILIH PEMILIK KARTU — satu-satunya tempat di frontend yang menerjemahkan hasil pencarian
   pemilik menjadi sebuah pilihan.

   ┌──── KENAPA SATU KOMPONEN, BUKAN DUA SALINAN ──────────────────────────────────────────────┐
   │ Ada DUA layar yang butuh ini: mencatat titipan baru (Path A), dan menautkan akun ke titipan │
   │ yang sudah tercatat tapi belum bertuan. Keduanya mengakhiri pertanyaan yang sama —          │
   │ "SIAPA yang akan dibayar kalau kartu ini terjual?" — dan kalau peringatan ambigunya ditulis │
   │ dua kali, salah satu salinan akan berbeda suatu hari, lalu diam.                            │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   TIDAK ADA YANG TERPILIH SENDIRI DI SINI, bahkan ketika yang cocok cuma satu — dan itu bukan
   kehati-hatian berlebihan. Di backend hanya `walletAddress` yang unik: `displayName` boleh sama
   persis untuk sepuluh orang, dan `email` bukan cuma tidak unik, ia TIDAK PERNAH DIVERIFIKASI.
   Komponen yang memilihkan satu kandidat akan, cepat atau lambat, menautkan kartu senilai puluhan
   juta ke orang yang salah — diam-diam, dan tidak ada yang tahu sampai kartunya terjual.

   ALAMAT WALLET DITAMPILKAN UTUH, tidak pernah dipendekkan. "Abc1…Xyz9" membuat dua alamat yang
   berbeda tampak sama persis, padahal inilah satu-satunya kolom yang benar-benar membedakan orang
   — dan operator memang sedang mencocokkannya huruf per huruf dengan layar pemilik kartunya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  searchAdminConsignors,
  type ConsignorCandidate,
  type ConsignorSearchResult,
} from "@/lib/admin-api";

/** Ambang minimum pencarian — sama dengan `CONSIGNOR_SEARCH_MIN_QUERY` yang ditegakkan server. */
export const CONSIGNOR_SEARCH_MIN = 3;

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-[14px] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40";

/**
 * Email DITUTUP sebagian.
 *
 * Ia ditampilkan hanya sebagai pembeda kasar antara dua orang yang namanya mirip — bukan sebagai
 * bukti, dan bukan yang dipakai memilih. Yang dipakai memilih adalah alamat wallet di bawahnya.
 *
 * Konsol ini dipakai sambil berdiri di ruang tamu orang, dengan layar yang bisa dilihat siapa saja
 * di ruangan itu; alamat email lengkap milik pengguna LAIN tidak punya alasan untuk ada di sana.
 */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 1) return "email tersimpan";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${"•".repeat(Math.max(1, Math.min(5, local.length - head.length)))}@${domain}`;
}

const joinedAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("id-ID", { month: "short", year: "numeric" });
};

/** "cocok pada: nama tampilan, email" — supaya "cocok karena emailnya" tidak terbaca sebagai bukti. */
const MATCHED_ON_LABEL: Record<string, string> = {
  walletAddress: "alamat wallet",
  displayName: "nama tampilan",
  email: "email",
};

export default function ConsignorPicker({
  token,
  onPick,
  emptyAction,
  placeholder = "mis. Budi / 7xKXt…",
  autoFocus,
}: {
  token: string | null;
  onPick: (u: ConsignorCandidate) => void;
  /** Ditawarkan saat tidak ada yang cocok — mis. "catat tanpa akun, pakai kode klaim". */
  emptyAction?: ReactNode;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ConsignorSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  /* Debounce ringan supaya tiap ketukan huruf tidak jadi satu request. */
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!token) return;
    const q = query.trim();
    if (q.length < CONSIGNOR_SEARCH_MIN) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setResult(null);
      return;
    }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setSearching(true);
      // Rute KHUSUS titipan, bukan /admin/users: ia mengembalikan `ambiguous`, `truncated`,
      // `exactWalletMatch`, dan `matchedOn` — empat hal yang memberi tahu operator SEBERAPA YAKIN
      // ia boleh merasa. Daftar user biasa tidak bisa mengatakan apa pun soal itu.
      searchAdminConsignors(q, token)
        .then(setResult)
        .catch(() => setResult(null))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [query, token]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={INPUT}
      />

      {query.trim().length >= CONSIGNOR_SEARCH_MIN && (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#121217]">
          {searching && <p className="px-3.5 py-2.5 text-[12px] text-zinc-500">Mencari…</p>}

          {/* ── LEBIH DARI SATU YANG COCOK ─────────────────────────────────────────────────
              Keadaan paling berbahaya di seluruh layar, ditampilkan APA ADANYA alih-alih
              diringkas jadi "hasil teratas". Nasihatnya datang dari server dan dipakai apa
              adanya: ia menyebutkan bahwa email tidak pernah diverifikasi — hal yang operator
              tidak punya cara lain untuk mengetahuinya. */}
          {!searching && result?.ambiguous && (
            <p className="border-b border-white/[0.07] bg-amber-400/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-100">
              {result.total} akun cocok dengan “{result.query}”. {result.advice}
            </p>
          )}
          {!searching && result?.truncated && (
            <p className="border-b border-white/[0.07] bg-red-400/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-red-100">
              Sebagian kandidat TIDAK ditampilkan. Persempit pencarianmu (pakai alamat wallet) —
              jangan memilih dari daftar yang kamu tahu tidak lengkap.
            </p>
          )}

          {!searching && result != null && result.matches.length === 0 && (
            <div className="px-3.5 py-3">
              <p className="text-[12.5px] text-zinc-400">
                Tidak ada akun yang cocok dengan “{result.query}”.
              </p>
              {emptyAction && <div className="mt-2">{emptyAction}</div>}
            </div>
          )}

          {(result?.matches ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onPick(u);
                setQuery("");
                setResult(null);
              }}
              className="block w-full border-t border-white/[0.05] px-3.5 py-3 text-left transition first:border-t-0 hover:bg-white/[0.05]"
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] text-zinc-200">
                  {u.displayName ?? "Tanpa nama"}
                </span>
                {/* Satu-satunya kolom unik di Hoshi. Kecocokan persis di sini adalah identitas;
                    kecocokan di kolom lain cuma kemiripan, dan lencana ini yang memisahkan
                    keduanya buat operator. */}
                {u.exactWalletMatch && (
                  <span className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-emerald-200">
                    wallet cocok persis
                  </span>
                )}
                {u.consignmentCount > 0 && (
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-zinc-400">
                    {u.consignmentCount} titipan
                  </span>
                )}
              </span>
              <span className="mt-1 block break-all font-mono text-[11px] leading-relaxed text-zinc-500">
                {u.walletAddress}
              </span>
              <span className="mt-1 block text-[11px] text-zinc-600">
                {maskEmail(u.email) ?? "tanpa email"} · gabung {joinedAt(u.createdAt)}
                {u.matchedOn.length > 0 && (
                  <> · cocok pada {u.matchedOn.map((m) => MATCHED_ON_LABEL[m] ?? m).join(", ")}</>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Panel "yang dipilih" — dipakai kedua layar supaya kalimat konfirmasinya tidak bercabang.
 *
 * Alamat wallet UTUH, dan kalimat "cocokkan dengan layar pemiliknya" IKUT SELALU: ini layar
 * terakhir sebelum kartu orang tertaut ke sebuah akun.
 */
export function PickedConsignor({
  user,
  onClear,
  lead = "Hasil penjualan kartu ini akan masuk ke akun",
}: {
  user: ConsignorCandidate;
  onClear: () => void;
  lead?: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 text-[12.5px] text-emerald-100">
          {lead} <strong>{user.displayName ?? "tanpa nama"}</strong>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[12px] font-semibold text-emerald-200 underline-offset-2 hover:underline"
        >
          Ganti
        </button>
      </div>
      <p className="mt-1.5 break-all font-mono text-[11.5px] leading-relaxed text-emerald-100/80">
        {user.walletAddress}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-100/70">
        Cocokkan alamat ini dengan yang ada di layar pemilik kartunya sebelum melanjutkan.
      </p>
    </div>
  );
}
