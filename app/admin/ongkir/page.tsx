"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   TARIF ONGKIR KIRIM DOMESTIK (stok fisik Hoshi, kurir lokal Indonesia).

   ┌──── KENAPA LAYAR INI MENDESAK ─────────────────────────────────────────────────────────────┐
   │ Rutenya (GET/PUT /admin/shipping/domestic-rates) sudah ada di backend, tapi TIDAK ADA satu  │
   │ pun layar yang memanggilnya. Selama itu, resolusi tarif jatuh ke TIER PENAMPUNG di kode —   │
   │ angka bulat yang sengaja dipilih konservatif dan BELUM diputuskan pemilik produk — dan      │
   │ angka itu SEDANG ditagihkan ke pembeli sungguhan. Tidak ada apa pun di dashboard yang       │
   │ mengatakannya.                                                                              │
   │                                                                                             │
   │ Karena itu layar ini TIDAK dimulai dari tabel. Ia dimulai dari `actionRequired`: daftar     │
   │ keputusan yang belum diambil, dari server, dalam kotak yang tidak bisa dilewatkan. Tabel    │
   │ KOSONG bukan berarti "tidak ada yang perlu dilakukan" — justru sebaliknya.                  │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   MODEL TARIFNYA BERTINGKAT PER WILAYAH, dan TIER-nya DATA:
     • satu baris = satu tier, yang membawa HARGANYA sekaligus DAFTAR PROVINSINYA;
     • menambah tier   = PUT dengan scope baru       → nol deploy, nol migrasi, nol restart;
     • memindah provinsi = edit `provinces` dua baris → sama.

   NOL DANA TREASURY di seluruh layar ini: yang ditetapkan hanyalah nominal RUPIAH yang ditagihkan
   ke pembeli. Tidak ada USDC, tidak ada SOL, tidak ada plafon treasury yang tersentuh.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminDomesticRates,
  setAdminDomesticRate,
  type AdminDomesticRate,
  type AdminDomesticRates,
  type SetDomesticRateInput,
} from "@/lib/admin-api";

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Bentuk form. `provinces` dipegang sebagai TEKS supaya operator bisa menempel daftar apa adanya. */
type Form = {
  scope: string;
  priceIdr: string;
  label: string;
  provincesText: string;
  /** null = "jangan ubah daftar provinsinya" (field tidak dikirim). */
  touchProvinces: boolean;
  fallback: boolean;
  active: boolean;
  note: string;
};

const EMPTY_FORM: Form = {
  scope: "",
  priceIdr: "",
  label: "",
  provincesText: "",
  touchProvinces: false,
  fallback: false,
  active: true,
  note: "",
};

export default function AdminOngkirPage() {
  const { token } = useAdminAuth();
  const [data, setData] = useState<AdminDomesticRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [result, setResult] = useState<{ scope: string; warnings: string[] } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminDomesticRates(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat tarif ongkir.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Angka DARI SERVER kalau ada (`placeholderCount`/`usingDefaults`/`limits`); turunan lokal
  // hanya jaring untuk respons backend lama. JANGAN mengetik ulang batasnya di sini: batas yang
  // ditegakkan service adalah batas mint IDRX, dan salinan yang menyimpang akan meloloskan tarif
  // yang baru ditolak di depan pembeli.
  const placeholderCount =
    data?.placeholderCount ?? data?.effective.filter((t) => t.placeholder).length ?? 0;
  const limits = data?.limits;
  /** true = tabelnya kosong dan jalur bayar sedang memakai tier penampung DI KODE. */
  const usingDefaults =
    data?.usingDefaults ?? (data ? data.effective.every((t) => t.from === "DEFAULT_TIER") : false);

  /** Muat satu baris DB ke form (ubah harga/label tanpa mengarang ulang daftar provinsinya). */
  const editRow = (r: AdminDomesticRate) => {
    setResult(null);
    setForm({
      scope: r.scope,
      priceIdr: String(r.priceIdr),
      label: r.label ?? "",
      provincesText: r.provinces.join(", "),
      touchProvinces: false,
      fallback: r.fallback,
      active: r.active,
      note: r.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** Isi form dari contoh siap-tempel yang DISERAHKAN SERVER (bukan angka yang diketik di sini). */
  const useExample = (kind: "jawa" | "luarJawa" | "satuProvinsi") => {
    if (!data) return;
    setResult(null);
    if (kind === "jawa") {
      const ex = data.example.jawa;
      setForm({
        ...EMPTY_FORM,
        scope: ex.scope,
        priceIdr: String(ex.priceIdr),
        label: ex.label,
        provincesText: ex.provinces.join(", "),
        touchProvinces: true,
      });
      return;
    }
    if (kind === "luarJawa") {
      const ex = data.example.luarJawa;
      setForm({
        ...EMPTY_FORM,
        scope: ex.scope,
        priceIdr: String(ex.priceIdr),
        label: ex.label,
        fallback: ex.fallback,
      });
      return;
    }
    const ex = data.example.satuProvinsi;
    setForm({
      ...EMPTY_FORM,
      scope: ex.scope,
      priceIdr: String(ex.priceIdr),
      label: ex.label,
    });
  };

  const save = async () => {
    if (!token || saving) return;
    const priceIdr = Number(form.priceIdr);
    if (!Number.isInteger(priceIdr)) {
      setError("Harga ongkir harus bilangan bulat Rupiah (tanpa titik/koma).");
      return;
    }
    // BATASNYA DARI SERVER (`limits`), bukan angka yang diketik ulang di sini. Ia ditegakkan
    // service (assertSaneRate) dan batas bawahnya BUKAN karangan: ia minimum mint IDRX — tarif di
    // bawahnya melahirkan baris yang kelihatan benar di dashboard tapi invoice-nya ditolak
    // gateway, kegagalan yang baru terlihat saat pembeli pertama menekan "Bayar ongkir".
    // Divalidasi di depan operator supaya ia tidak baru tahu sesudah menekan Simpan.
    if (limits && (priceIdr < limits.minPriceIdr || priceIdr > limits.maxPriceIdr)) {
      setError(
        `Ongkir harus antara ${rp(limits.minPriceIdr)} dan ${rp(limits.maxPriceIdr)} ` +
          "(batas mint IDRX yang ditegakkan server) — diberikan " +
          `${rp(priceIdr)}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const input: SetDomesticRateInput = {
        ...(form.scope.trim() ? { scope: form.scope.trim() } : {}),
        priceIdr,
        ...(form.label.trim() ? { label: form.label.trim() } : {}),
        // TIDAK DISEBUT = daftar lama TIDAK diubah (kontrak backend). Sebuah PUT yang cuma
        // membetulkan harga tidak boleh diam-diam mengosongkan daftar provinsi tiernya.
        ...(form.touchProvinces
          ? {
              provinces: form.provincesText
                .split(/[,\n]/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0),
            }
          : {}),
        fallback: form.fallback,
        active: form.active,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
      };
      const res = await setAdminDomesticRate(input, token);
      setResult({ scope: res.rate.scope, warnings: res.warnings ?? [] });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan tarif.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Ongkir Kirim Domestik</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">
          Tarif kirim kartu <b>stok Hoshi</b> lewat kurir lokal. Berlaku untuk tagihan{" "}
          <b>berikutnya</b> — tagihan yang sudah terbit memakai nominal yang di-snapshot di baris
          pembayarannya. Nol dana treasury: yang ditetapkan di sini hanya nominal Rupiah yang
          ditagihkan ke pembeli.
        </p>
      </header>

      {/* ╔═══ YANG MASIH HARUS DIPUTUSKAN ═══╗
          Ditaruh PALING ATAS dan bergaya alarm dengan sengaja. Isinya bukan "saran": selama
          daftar ini tidak kosong, ada pembeli sungguhan yang sedang ditagih angka sementara. */}
      {data && data.actionRequired.length > 0 && (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-500/[0.10] p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/25 text-[15px]">
              ⚠️
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-rose-200">
                Ongkirnya belum selesai diputuskan — dan angkanya SEDANG ditagihkan ke pembeli
              </h2>
              {/* `usingDefaults` adalah boolean TERSENDIRI dari server, bukan disimpulkan dari
                  "tabelnya kosong". Sebuah tabel kosong tidak boleh bisa terbaca sebagai "beres". */}
              {usingDefaults && (
                <p className="mt-2 rounded-xl border border-rose-400/30 bg-black/30 px-3.5 py-2.5 text-[13px] leading-relaxed text-rose-100">
                  Belum ada <b>satu pun</b> baris tarif aktif, jadi jalur bayar memakai tier
                  penampung <b>di kode</b>
                  {data?.placeholderPricesIdr && (
                    <>
                      {" "}
                      — Jawa {rp(data.placeholderPricesIdr.jawa)}, luar Jawa{" "}
                      {rp(data.placeholderPricesIdr.luarJawa)}
                    </>
                  )}
                  . Itulah yang ditagihkan ke pembeli sungguhan sampai kamu menetapkan tarifnya di
                  bawah.
                </p>
              )}
              <ul className="mt-2.5 flex flex-col gap-2">
                {data.actionRequired.map((a) => (
                  <li
                    key={a}
                    className="rounded-xl border border-rose-400/20 bg-black/25 px-3.5 py-2.5 text-[13px] leading-relaxed text-rose-100/90"
                  >
                    {a}
                  </li>
                ))}
              </ul>
              {placeholderCount > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => useExample("jawa")}
                    className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                  >
                    Isi form: tier Jawa
                  </button>
                  <button
                    type="button"
                    onClick={() => useExample("luarJawa")}
                    className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                  >
                    Isi form: tier Luar Jawa (penampung)
                  </button>
                  <button
                    type="button"
                    onClick={() => useExample("satuProvinsi")}
                    className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                  >
                    Isi form: harga satu provinsi
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {data && data.actionRequired.length === 0 && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-5 py-4 text-[13px] text-emerald-200">
          Konfigurasi ongkirnya lengkap: semua tier yang berlaku sudah punya angka yang ditetapkan
          manusia, dan ada tepat satu tier penampung.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-[13px] text-emerald-200">
          <p className="font-semibold">
            Tarif untuk scope <span className="font-mono">{result.scope}</span> tersimpan.
          </p>
          <p className="mt-1 text-[12px] text-emerald-200/80">
            Berlaku untuk tagihan ongkir berikutnya. Tagihan yang sudah terbit tidak berubah —
            nominalnya di-snapshot di baris pembayarannya sendiri.
          </p>
          {result.warnings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {result.warnings.map((w) => (
                <li
                  key={w}
                  className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200"
                >
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ─────────────── TIER YANG SEDANG BERLAKU ───────────────
          Bukan isi tabel, tapi apa yang BENAR-BENAR dipakai jalur bayar hari ini — termasuk saat
          tabelnya kosong dan resolusinya jatuh ke penampung di kode. */}
      <section>
        <h2 className="text-[15px] font-bold text-white">Tier yang sedang berlaku</h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Inilah angka yang jalur bayar pakai saat ini. Baris ber-label <b>PENAMPUNG</b> belum
          pernah ditetapkan manusia.
        </p>
        {loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Memuat…</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-semibold">Scope</th>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Ongkir</th>
                  <th className="px-4 py-3 font-semibold">Provinsi</th>
                  <th className="px-4 py-3 font-semibold">Penampung</th>
                  <th className="px-4 py-3 font-semibold">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {(data?.effective ?? []).map((t) => (
                  <tr
                    key={t.scope}
                    className={`border-t border-white/[0.05] ${
                      t.placeholder ? "bg-rose-500/[0.06]" : "bg-[#100e08]/60"
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-200">{t.scope}</td>
                    <td className="px-4 py-3 text-[13px] text-zinc-300">
                      {t.label ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold tabular-nums text-white">
                        {rp(t.priceIdr)}
                      </span>
                      {t.placeholder && (
                        <span className="ml-2 rounded-md border border-rose-400/40 bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                          PENAMPUNG
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">
                      {t.provinces.length > 0 ? (
                        <span title={t.provinces.join(", ")}>{t.provinces.length} ejaan</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px]">
                      {t.fallback ? (
                        <span className="rounded-md bg-amber-400/15 px-2 py-0.5 font-bold text-amber-300">
                          ya
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">
                      {t.from === "DB" ? "baris tarif" : "penampung di kode"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.resolution && (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{data.resolution}</p>
        )}
        {data?.note && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">{data.note}</p>
        )}
      </section>

      {/* ─────────────── EDITOR SATU TIER ─────────────── */}
      <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5">
        <h2 className="text-[15px] font-bold text-white">Tetapkan / ubah satu tier</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
          Kuncinya <b>scope</b> (upsert). <span className="font-mono">TIER:&lt;NAMA&gt;</span> = tier
          wilayah (pakai daftar provinsi), <span className="font-mono">STATE:&lt;provinsi&gt;</span>{" "}
          = harga khusus satu provinsi, <span className="font-mono">*</span> = flat nasional.
          Scope baru = tier baru: tidak perlu deploy, migrasi, atau restart.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-300">Scope</span>
            <input
              value={form.scope}
              onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
              placeholder={data?.example.jawa.scope ?? "TIER:JAWA"}
              className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
            <span className="text-[11px] text-zinc-600">
              Kosong = <span className="font-mono">{data?.nationwideScope ?? "*"}</span> (flat
              nasional).
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-300">Ongkir (Rupiah utuh)</span>
            <input
              value={form.priceIdr}
              onChange={(e) => setForm((f) => ({ ...f, priceIdr: e.target.value }))}
              inputMode="numeric"
              placeholder="22000"
              className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] tabular-nums text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
            <span className="text-[11px] leading-relaxed text-zinc-600">
              {limits
                ? `Harus antara ${rp(limits.minPriceIdr)} dan ${rp(limits.maxPriceIdr)} — batas mint IDRX yang ditegakkan server.`
                : "Harus di dalam batas mint IDRX yang ditegakkan server."}{" "}
              Tarif di bawah minimum menghasilkan tagihan yang tidak akan pernah bisa terbit, dan
              itu baru ketahuan saat pembeli pertama menekan “Bayar ongkir” — jadi ditolak di sini,
              di depanmu.
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-300">Label (dilihat pembeli)</span>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="Jawa"
              className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-zinc-300">Catatan operator</span>
            <input
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="flat JNE REG 2026 Q4"
              className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
            />
          </label>
        </div>

        <div className="mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.touchProvinces}
              onChange={(e) => setForm((f) => ({ ...f, touchProvinces: e.target.checked }))}
              className="h-4 w-4 accent-[#F2C101]"
            />
            <span className="text-[12px] font-semibold text-zinc-300">
              Ubah daftar provinsi tier ini
            </span>
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
            Tidak dicentang = daftar lamanya <b>tidak disentuh</b> (aman untuk sekadar membetulkan
            harga). Dicentang dengan kotak kosong = daftarnya dikosongkan. Boleh banyak ejaan per
            provinsi — kolom provinsi di alamat pembeli bisa berisi nama Inggris (“West Java”) atau
            ketikan bebas (“Jabar”, “Jogja”), dan daftar yang cuma memuat nama resmi akan melempar
            separuh pembeli Jawa ke tier yang lebih mahal.
          </p>
          <textarea
            value={form.provincesText}
            onChange={(e) => setForm((f) => ({ ...f, provincesText: e.target.value }))}
            disabled={!form.touchProvinces}
            rows={3}
            placeholder="jakarta, dki jakarta, jawa barat, jabar, west java, jawa tengah, …"
            className="mt-2 w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25 disabled:opacity-40"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-5">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.fallback}
              onChange={(e) => setForm((f) => ({ ...f, fallback: e.target.checked }))}
              className="h-4 w-4 accent-[#F2C101]"
            />
            <span className="text-[12px] font-semibold text-zinc-300">
              Tier PENAMPUNG (provinsi tak dikenal / alamat tanpa provinsi)
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 accent-[#F2C101]"
            />
            <span className="text-[12px] font-semibold text-zinc-300">Aktif</span>
          </label>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
          Penampung seharusnya <b>tepat satu</b>, dan sebaiknya yang <b>termahal</b>: provinsi yang
          belum terdaftar tidak akan pernah ditagih kurang. Menyalakannya di sini otomatis
          mematikannya di tier lain.
        </p>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !form.priceIdr.trim()}
            className="rounded-xl bg-[#F2C101] px-5 py-2.5 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Menyimpan…" : "Simpan tarif"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(EMPTY_FORM);
              setResult(null);
            }}
            disabled={saving}
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
          >
            Bersihkan
          </button>
        </div>
      </section>

      {/* ─────────────── SEMUA BARIS TARIF DI DB ─────────────── */}
      <section>
        <h2 className="text-[15px] font-bold text-white">Semua baris tarif</h2>
        <p className="mt-1 text-[12px] text-zinc-500">
          Termasuk yang nonaktif. Klik <b>Ubah</b> untuk memuatnya ke form di atas.
        </p>
        {!loading && (data?.data.length ?? 0) === 0 ? (
          <p className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center text-[13px] text-zinc-500">
            Belum ada satu pun baris tarif. Jalur bayar sedang memakai tier penampung di kode —
            lihat kotak merah di atas.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-semibold">Scope</th>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Ongkir</th>
                  <th className="px-4 py-3 font-semibold">Provinsi</th>
                  <th className="px-4 py-3 font-semibold">Penampung</th>
                  <th className="px-4 py-3 font-semibold">Aktif</th>
                  <th className="px-4 py-3 font-semibold">Catatan</th>
                  <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(data?.data ?? []).map((r) => (
                  <tr key={r.scope} className="border-t border-white/[0.05] bg-[#100e08]/60">
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-200">{r.scope}</td>
                    <td className="px-4 py-3 text-[13px] text-zinc-300">
                      {r.label ?? <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-white">
                      {rp(r.priceIdr)}
                      {r.placeholder && (
                        <span className="ml-2 rounded-md border border-rose-400/40 bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                          PENAMPUNG
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-[12px] text-zinc-500"
                      title={r.provinces.join(", ")}
                    >
                      {r.provinces.length > 0 ? `${r.provinces.length} ejaan` : "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-400">
                      {r.fallback ? "ya" : "—"}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-zinc-400">
                      {r.active ? "ya" : "tidak"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-[12px] text-zinc-500">
                      {r.note ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => editRow(r)}
                        className="rounded-lg bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Ubah
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
