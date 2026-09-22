"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   KLAIM KODE TITIPAN — halaman untuk orang yang baru saja menyerahkan kartunya dan pulang
   membawa selembar kode.

   SIAPA YANG SAMPAI DI SINI. Bukan pengguna lama yang sedang menjelajah. Kemungkinan besar ini
   kunjungan PERTAMANYA ke Hoshi, dan alasan ia datang adalah kode itu sendiri — tim Hoshi baru
   saja pergi dari rumahnya membawa kartunya. Jadi halaman ini tidak boleh berbunyi seperti
   formulir internal: ia harus menjelaskan apa yang sedang terjadi pada barangnya, bahkan sebelum
   orangnya punya akun.

   ┌──── KENAPA HARUS MASUK DULU ──────────────────────────────────────────────────────────────┐
   │ Kode saja TIDAK cukup untuk menyambungkan kartu ke seseorang — yang disambungkan adalah    │
   │ AKUN, dan akun di Hoshi berarti wallet yang menandatangani SIWS. Menerima klaim tanpa login │
   │ berarti kartunya tersambung ke "siapa pun yang membuka tautan ini", dan tautan WhatsApp     │
   │ bisa diteruskan ke siapa saja. Jadi urutannya: masuk dulu, klaim kemudian — dan kodenya     │
   │ TIDAK hilang selama menunggu.                                                               │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   KODE DIBERSIHKAN DARI URL setelah dibaca. Ia rahasia sekali-pakai; membiarkannya di address bar
   berarti menitipkannya ke riwayat browser, ke tangkapan layar, dan ke tab yang lupa ditutup.

   SATU KALIMAT UNTUK SEMUA PENOLAKAN, dan itu sudah dijamin SERVER: rute penukaran menjawab
   bentuk-salah, tidak-ada, kedaluwarsa, dan sudah-dipakai dengan objek yang sama persis. Kalimat
   itu ditampilkan apa adanya — memecahnya lagi di sini (berdasarkan status HTTP, misalnya) akan
   mengembalikan alat penebak kode yang susah payah ditutup di sana.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import {
  claimCodeInput,
  formatClaimCode,
  isCompleteClaimCode,
  ownerStatusLine,
  redeemClaimCode,
  statusUi,
  ThrottledError,
  type MyConsignment,
} from "@/lib/consignment";
import TopNav from "@/components/packs/TopNav";
import { ACCOUNT_BG } from "@/lib/theme";
import { GhostButton, PrimaryButton } from "@/components/account/ui";
import { claimCodeSupportDraft, supportComposeHref } from "@/lib/supportLink";

const rp = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export default function KlaimTitipanPage() {
  const { token, hydrated, login } = useAuth();
  const { setVisible } = useWalletConnect();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<MyConsignment | null>(null);
  /* Detik tersisa sampai rem percobaan lepas. 0 = tidak sedang direm. Lihat efek di bawah. */
  const [cooldown, setCooldown] = useState(0);

  /* ── HITUNG MUNDUR YANG BENAR-BENAR BERJALAN ────────────────────────────────────────────────
     "Tunggu 42 detik" yang dicetak sekali lalu diam memaksa orangnya menghitung sendiri sambil
     menebak kapan tombolnya hidup lagi — dan tebakan yang meleset berarti ia menabrak rem yang
     sama sekali lagi. Angkanya turun di label tombol, jadi tidak ada yang perlu ditebak.
     setState-nya terjadi di dalam callback interval (bukan saat efek dijalankan), jadi ia tidak
     melanggar `react-hooks/set-state-in-effect`. */
  const cooling = cooldown > 0;
  useEffect(() => {
    if (!cooling) return;
    const id = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooling]);

  /* Kode dari tautan (?kode=…). Client-only lewat window.location — BUKAN useSearchParams —
     supaya halaman ini tidak butuh Suspense boundary, konvensi yang sama dengan /messages dan
     /marketplace. Query-nya langsung dihapus: kode rahasia tidak menetap di riwayat browser. */
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const fromLink = sp.get("kode") ?? sp.get("code");
      if (!fromLink) return;
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setCode(claimCodeInput(fromLink));
      sp.delete("kode");
      sp.delete("code");
      const qs = sp.toString();
      window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    } catch {
      /* URL aneh / API tidak tersedia — halaman tetap bisa dipakai dengan mengetik manual. */
    }
  }, []);

  const submit = async () => {
    if (!token || busy || cooling || !isCompleteClaimCode(code)) return;
    setBusy(true);
    setError(null);
    try {
      setClaimed(await redeemClaimCode(code, token));
    } catch (e) {
      // ── REM PERCOBAAN: KEGAGALAN SATU-SATUNYA DI LAYAR INI YANG BUKAN TENTANG KODENYA ───────
      //
      // Lima salah ketik dalam semenit bukan penyerang — itu orang yang menyalin 10 simbol dari
      // tulisan tangan ke layar ponsel. Yang dulu muncul di sini adalah `ThrottlerException: Too
      // Many Requests` apa adanya. `ThrottledError` membawa lama tunggunya, jadi tombolnya bisa
      // ikut menghitung mundur alih-alih menyuruh orangnya menebak.
      if (e instanceof ThrottledError) {
        setCooldown(e.retryAfterSeconds);
        setError(e.message);
        return;
      }
      // Sisanya: pesan server dipakai APA ADANYA. Ia sudah satu kalimat untuk semua sebab
      // penolakan kode, dan ia menyebut masa berlaku serta jalan keluarnya (penerbitan ulang) —
      // dua hal yang dibutuhkan orang yang sedang berdiri dengan kertas di tangan.
      setError(e instanceof Error ? e.message : "Gagal mengklaim kode.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen text-zinc-100"
      style={{ background: ACCOUNT_BG, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
    >
      <TopNav active="Vault" />
      <main className="mx-auto max-w-[680px] px-4 py-8 sm:px-6">
        <header className="mb-6">
          <Link
            href="/titipan"
            className="text-[13px] text-zinc-500 transition hover:text-zinc-300"
          >
            ← Titipan Saya
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Klaim kode titipan
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            Kalau kamu menyerahkan kartu ke tim Hoshi dan diberi sebuah kode, masukkan kode itu di
            sini. Kartunya akan tersambung ke akun ini — kamu bisa melihat foto dan catatan
            kondisinya, harga yang kalian sepakati, dan memintanya kembali kapan saja selama belum
            terjual.
          </p>
        </header>

        {/* ── BERHASIL ───────────────────────────────────────────────────────────────────────
            Yang ditampilkan adalah apa yang BARU SAJA menjadi miliknya di catatan Hoshi — nama
            kartu dan status sebenarnya, bukan kalimat penyemangat. Status dibaca apa adanya:
            kartu yang baru diklaim biasanya belum dipajang, dan halaman ini tidak boleh
            memberi kesan sebaliknya. */}
        {claimed && (
          <section className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] p-5">
            <h2 className="text-[16px] font-semibold text-emerald-100">
              Kartumu tersambung ke akun ini
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-emerald-100/80">
              Mulai sekarang catatan titipannya bisa kamu buka sendiri kapan saja — termasuk foto
              saat serah terima, catatan kondisi, dan seluruh riwayatnya.
            </p>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-3">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-white">
                  {claimed.cardName}
                </span>
                <span className="text-[12px] text-zinc-400">
                  harga yang disepakati {rp(claimed.askPriceIdr)}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                  statusUi(claimed.status).cls
                }`}
              >
                {statusUi(claimed.status).label}
              </span>
            </div>

            {/* Status dibaca APA ADANYA dari baris yang baru tertaut — tidak pernah dikarang.
                Kartu yang baru diklaim hampir selalu BELUM dipajang, dan mengatakan sebaliknya di
                layar kemenangan adalah kebohongan pertama yang akan diingat orangnya. */}
            <p className="mt-3 text-[12.5px] leading-relaxed text-emerald-100/75">
              {ownerStatusLine(claimed)}
            </p>

            <Link
              href="/titipan"
              className="mt-4 inline-block rounded-xl px-5 py-2.5 text-[14px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
            >
              Lihat titipanku
            </Link>
          </section>
        )}

        {/* ── BELUM MASUK ────────────────────────────────────────────────────────────────────
            Kodenya TIDAK dibuang: kolomnya tetap terisi selama proses masuk, jadi orang yang
            baru pertama kali datang tidak perlu mencari lagi kertas/WhatsApp-nya sesudah login. */}
        {!claimed && hydrated && !token && (
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
            <h2 className="text-[15px] font-semibold text-zinc-100">Masuk dulu, sebentar saja</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
              Kartunya disambungkan ke sebuah akun, jadi kami perlu tahu akun mana. Kalau kamu
              belum punya akun Hoshi, menghubungkan wallet sekaligus membuatkannya untukmu.
            </p>
            {code && (
              <p className="mt-3 rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-2.5 text-[12.5px] text-zinc-300">
                Kodemu sudah kami simpan di halaman ini:{" "}
                <span className="font-mono text-[13px] tracking-widest text-zinc-100">
                  {formatClaimCode(code)}
                </span>
                . Tidak perlu diketik ulang setelah masuk.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <PrimaryButton
                onClick={() => {
                  login().catch(() => setVisible(true));
                }}
              >
                Masuk
              </PrimaryButton>
              <GhostButton onClick={() => setVisible(true)}>Hubungkan wallet</GhostButton>
            </div>
          </section>
        )}

        {/* ── FORMULIR KODE ── */}
        {!claimed && hydrated && token && (
          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                Kode klaim
              </span>
              <input
                value={formatClaimCode(code)}
                onChange={(e) => setCode(claimCodeInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
                placeholder="mis. H7K2-9MQ4"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-center font-mono text-[20px] tracking-[0.2em] text-zinc-100 placeholder-zinc-600 outline-none transition focus:border-yellow-400/40"
              />
              <span className="mt-2 block text-[11.5px] leading-relaxed text-zinc-500">
                Huruf besar-kecil tidak masalah, dan tanda hubung boleh kamu tulis atau tidak.
              </span>
            </label>

            {/* ── PENOLAKAN YANG TIDAK BOLEH MENJADI JALAN BUNTU ────────────────────────────
                Kalimatnya sengaja SATU untuk semua sebab (bentuk salah, tidak ada, kedaluwarsa,
                sudah dipakai) supaya tidak bisa dipakai menebak kode orang — dan justru karena
                layar ini tidak boleh menjelaskan lebih jauh, ia wajib punya pintu ke manusia.
                Tanpa itu, orang yang kartunya sudah dibawa pergi berdiri di depan kalimat yang
                menolak dan tidak menyebut ke mana harus bertanya. Kodenya TIDAK ikut ke dalam
                draft: ia rahasia sekali-pakai. */}
            {error && (
              <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3">
                {/* `whitespace-pre-line`: kalimat rem percobaan sengaja dua paragraf — "tunggu
                    sekian detik" dan "cocokkan lagi dari struk" adalah dua instruksi berbeda, dan
                    menempelkannya jadi satu blok membuat yang kedua tidak terbaca. */}
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-red-200">
                  {error}
                </p>
                <Link
                  href={supportComposeHref(claimCodeSupportDraft())}
                  className="mt-3 inline-block rounded-lg border border-red-300/30 bg-red-400/10 px-3.5 py-2 text-[12.5px] font-semibold text-red-100 transition hover:bg-red-400/20"
                >
                  Hubungi tim Hoshi soal kode ini
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || cooling || !isCompleteClaimCode(code)}
              className="mt-4 w-full rounded-xl px-5 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundImage: "linear-gradient(180deg, #FBB222 0%, #FFF600 100%)" }}
            >
              {busy
                ? "Mengklaim…"
                : cooling
                  ? `Bisa dicoba lagi dalam ${cooldown} detik`
                  : "Klaim kartu saya"}
            </button>
          </section>
        )}

        {!hydrated && <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>}

        {/* ── Yang perlu diketahui orang yang baru pertama kali sampai di sini ── */}
        {!claimed && (
          <section className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
            <h2 className="text-[14px] font-semibold text-zinc-200">Tentang kode ini</h2>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-zinc-400">
              <li>
                <strong className="text-zinc-200">Kode ini pribadi.</strong> Siapa pun yang
                memegangnya bisa menyambungkan kartu itu ke akunnya sendiri, jadi jangan
                meneruskannya ke orang lain.
              </li>
              <li>
                <strong className="text-zinc-200">Kartunya tetap milikmu.</strong> Mengklaim kode
                tidak menjual apa pun dan tidak memindahkan kepemilikan ke Hoshi — ia hanya
                menyambungkan catatan titipannya ke akunmu.
              </li>
              <li>
                <strong className="text-zinc-200">Kalau kodenya hilang atau kedaluwarsa,</strong>{" "}
                tim Hoshi bisa menerbitkan kode baru; kode lama langsung berhenti berlaku saat itu
                juga. Minta lewat{" "}
                <Link
                  href={supportComposeHref(claimCodeSupportDraft())}
                  className="font-semibold text-yellow-300 hover:underline"
                >
                  pesan ke tim Hoshi
                </Link>
                .
              </li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
