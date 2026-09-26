"use client";

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   ONGKIR KIRIM KARTU — layar tempat pemilik toko menetapkan berapa Rupiah yang ditagihkan ke
   pembeli saat kartunya dikirim ke rumah.

   ┌──── KENAPA LAYAR INI DITULIS ULANG DARI NOL ───────────────────────────────────────────────┐
   │ Versi lamanya adalah EDITOR TABEL: ia meminta orang mengisi `scope`, mencentang "tier       │
   │ PENAMPUNG", dan menempel daftar provinsi. Pemilik produk membukanya dan berkata harfiah     │
   │ "bener bener ga paham dgn kata katanya… penampung tier segala, apaan tuh".                  │
   │                                                                                             │
   │ Dan kegagalannya BUKAN teoretis — sudah terjadi: ia menyimpan satu kelompok tarif TANPA     │
   │ daftar provinsi, layar menjawab "Tarif tersimpan", dan angka itu tidak akan pernah dipakai  │
   │ satu kali pun, karena pencocokan tarif dilakukan LEWAT DAFTAR PROVINSI. Nol peringatan.     │
   │                                                                                             │
   │ Jadi ukuran layar ini bukan "lebih ramah". Ukurannya: seorang pemula bisa membukanya dan    │
   │ SELESAI dengan ongkir yang benar-benar berlaku, tanpa bertanya siapa pun — sambil tetap     │
   │ MUSTAHIL menyimpan tarif yang tidak terpakai.                                               │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   ┌──── TIGA KEPUTUSAN YANG MEMBENTUK SELURUH BERKAS INI ──────────────────────────────────────┐
   │ 1. LAYAR INI MENANYAKAN HARGA, BUKAN MEMINTA ISI TABEL. Bagian 1 hanya punya dua kotak      │
   │    ("ke Jawa berapa?", "ke luar Jawa berapa?"). Daftar provinsi Jawa sudah dikirim server   │
   │    (26 cara penulisan) dan dipasang DIAM-DIAM oleh tombol Simpan. Jalur yang dulu melahirkan│
   │    kelompok tanpa provinsi TIDAK DIPERINGATKAN — ia DIHAPUS dari jalur utama.               │
   │                                                                                             │
   │ 2. APA PUN YANG DIKLAIM LAYAR INI DIHITUNG DARI CERMIN RESOLUSI BACKEND, bukan dari isi     │
   │    kotak. `pickTier`/`normKey`/`normalizeScope` di bawah adalah salinan PERSIS dari         │
   │    src/payments/domestic-shipping-rate.ts. Karena itu kalimat "pembeli di Bandung ditagih X"│
   │    tidak bisa berbohong: kalau barisnya mati, resolusinya tidak akan pernah menghasilkan    │
   │    "angka kamu", dan kalimat suksesnya tidak tercetak.                                      │
   │                                                                                             │
   │ 3. ISTILAH MESIN TIDAK MUNCUL DI LAPISAN PERTAMA. tier → kelompok daerah · fallback →       │
   │    daerah lainnya · scope → nama internal (abu-abu, tidak bisa diketik) · placeholder →     │
   │    BELUM KAMU ISI · effective → yang ditagihkan hari ini · actionRequired → yang masih      │
   │    harus kamu beresin. Teks mesin dari server tetap ada, utuh, di balik <details>.          │
   └─────────────────────────────────────────────────────────────────────────────────────────────┘

   NOL PERUBAHAN BACKEND: kontrak GET/PUT /admin/shipping/domestic-rates tidak disentuh sama
   sekali. NOL DANA TREASURY: yang ditetapkan di sini murni nominal RUPIAH yang ditagihkan ke
   pembeli — tidak ada USDC, tidak ada SOL, tidak ada plafon treasury.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { adminStorageKey, useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminDomesticRates,
  setAdminDomesticRate,
  type AdminDomesticEffectiveTier,
  type AdminDomesticRate,
  type AdminDomesticRates,
  type SetDomesticRateInput,
  type SetDomesticRateResult,
} from "@/lib/admin-api";

/* ═══════════════════════════ CERMIN RESOLUSI BACKEND ═══════════════════════════
   Semua di blok ini adalah SALINAN PERSIS dari src/payments/domestic-shipping-rate.ts. Kalau
   salah satunya melenceng, layar ini akan menjanjikan angka yang tidak ditagihkan — kegagalan
   yang paling mahal di halaman ini, karena ia terlihat seperti keberhasilan. */

const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Diakritik Unicode — dibuang supaya "Yogyakartá" = "yogyakarta". */
const COMBINING = /[̀-ͯ]/g;

/** SAMA PERSIS dengan `normalizeRegionKey` (domestic-shipping-rate.ts). */
const normKey = (v?: string | null): string =>
  typeof v !== "string"
    ? ""
    : v
        .normalize("NFD")
        .replace(COMBINING, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

/**
 * Awalan/scope datang DARI SERVER (`stateScopePrefix`, `tierScopePrefix`, `nationwideScope`),
 * bukan diketik ulang di sini: dua salinan konstanta adalah dua konstanta yang bisa melenceng.
 */
type ScopeKit = { nationwide: string; tier: string; state: string };

/** SAMA PERSIS dengan `normalizeScope`. */
const normScope = (s: string, statePrefix: string): string => {
  const t = s.trim();
  return t.toUpperCase().startsWith(statePrefix.toUpperCase())
    ? statePrefix + normKey(t.slice(statePrefix.length))
    : t;
};

type Row = {
  scope: string;
  priceIdr: number;
  provinces: string[];
  fallback: boolean;
  label: string | null;
};

type Region = "STATE" | "TIER" | "FALLBACK_TIER" | "NATIONWIDE";
type Hit = { row: Row; region: Region };
/** "KAMU" = angka dari baris yang kamu simpan. "SISTEM" = angka bawaan yang tidak kamu putuskan. */
type Source = "KAMU" | "SISTEM";
type Resolved = Hit & { source: Source };

/**
 * SAMA PERSIS dengan `pickTier`. JANGAN pernah menggantinya dengan `includes()` atau pencocokan
 * longgar: yang ditiru di sini adalah aturan yang BENAR-BENAR menagih pembeli, dan pencocokan
 * yang lebih longgar akan membuat layar ini menjanjikan tarif yang tidak akan pernah kena.
 */
function pickTier(rows: Row[], province: string, kit: ScopeKit): Hit | null {
  const dearest = (xs: Row[]) => xs.reduce((a, b) => (b.priceIdr > a.priceIdr ? b : a));
  // 1. Harga khusus satu provinsi.
  if (province) {
    const want = normScope(kit.state + province, kit.state);
    const ex = rows.filter((r) => normScope(r.scope, kit.state) === want);
    if (ex.length) return { row: dearest(ex), region: "STATE" };
  }
  // 2. Kelompok yang daftar provinsinya memuat provinsi tujuan.
  if (province) {
    const hits = rows.filter((r) => (r.provinces ?? []).some((p) => normKey(p) === province));
    if (hits.length) return { row: dearest(hits), region: "TIER" };
  }
  // 3. Daerah lainnya (provinsi kosong / tidak dikenal).
  const fb = rows.filter((r) => r.fallback === true);
  if (fb.length) return { row: dearest(fb), region: "FALLBACK_TIER" };
  // 4. Harga sama untuk seluruh Indonesia.
  const nat = rows.filter((r) => r.scope.trim() === kit.nationwide);
  if (nat.length) return { row: dearest(nat), region: "NATIONWIDE" };
  return null;
}

/* ─── KLASIFIKASI BARIS ───────────────────────────────────────────────────────────────────────
   SENGAJA TIDAK bergantung pada awalan `TIER:`. Baris lama atau salah ketik (`JAWA` tanpa
   awalan) tetap harus tertangkap sebagai kelompok daerah — kalau tidak, justru baris paling
   rusak di DB yang lolos dari semua pagar di halaman ini. */
const isState = (r: { scope: string }, kit: ScopeKit) =>
  r.scope.trim().toUpperCase().startsWith(kit.state.toUpperCase());
const isNat = (r: { scope: string }, kit: ScopeKit) => r.scope.trim() === kit.nationwide;
const isGroup = (r: { scope: string }, kit: ScopeKit) => !isState(r, kit) && !isNat(r, kit);

/**
 * "TIDAK PERNAH TERPAKAI" — kelompok daerah yang daftar provinsinya kosong dan bukan penampung
 * daerah lainnya. Tidak ada satu pun alamat yang bisa cocok dengannya. INI kesalahan yang sudah
 * benar-benar terjadi di produksi, dan ia dihitung murni di klien dari field yang SUDAH ada di
 * respons — jadi ia menyala di baris yang sudah rusak begitu halaman dibuka.
 */
const isDead = (
  r: { scope: string; provinces: string[]; fallback: boolean },
  kit: ScopeKit,
) => isGroup(r, kit) && r.provinces.length === 0 && r.fallback === false;

/* ═══════════════════════════ UTILITAS TAMPILAN ═══════════════════════════ */

/**
 * Satu-satunya pembaca angka Rupiah di halaman ini. Titik, koma, spasi, dan "Rp" dibuang, jadi
 * "Rp 25.000" yang ditempel dari WhatsApp tetap terbaca 25000. Orang yang mengetik ongkir
 * mengetiknya dengan titik — menolak titik berarti menyalahkan orang atas kebiasaan yang benar.
 */
const parseRp = (s: string): number => {
  const d = s.replace(/[^\d]/g, "");
  return d === "" ? NaN : Number(d);
};

const parseProvinces = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

const titleCase = (s: string) => s.replace(/(^|\s)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/**
 * Nama internal kelompok dirakit DARI nama yang diketik, tidak pernah diketik langsung. Operator
 * tidak pernah melihat kolom "Scope" yang bisa diisi lagi — itu kolom yang paling mudah diisi
 * salah dan paling sulit dipahami akibatnya.
 */
const slugKelompok = (s: string) =>
  s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 110);

/**
 * Label bawaan sistem TIDAK PERNAH ditampilkan mentah: isinya berbunyi
 * "Jawa — PENAMPUNG, belum diputuskan pemilik produk", dan `label` yang sama juga dibaca PEMBELI
 * lewat taksiran ongkir. Baris bawaan sistem dikenali dari `from`, bukan dari isi teksnya.
 */
const effToRow = (t: AdminDomesticEffectiveTier): Row => ({
  scope: t.scope,
  priceIdr: t.priceIdr,
  provinces: t.provinces,
  fallback: t.fallback,
  label: t.from === "DEFAULT_TIER" ? null : t.label,
});

const toRow = (r: {
  scope: string;
  priceIdr: number;
  provinces: string[];
  fallback: boolean;
  label: string | null;
}): Row => ({
  scope: r.scope,
  priceIdr: r.priceIdr,
  provinces: r.provinces,
  fallback: r.fallback,
  label: r.label,
});

const tanggal = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};

/* ═══════════════════════════ PERINGATAN YANG BISA DITUTUP ═══════════════════════════
   Kartu "daerah lainnya lebih murah dari yang termahal" boleh ditutup — kalau tidak, ia jadi
   spanduk abadi yang melatih orang mengabaikan kotak peringatan, termasuk yang MERAH.

   Dibaca lewat useSyncExternalStore, bukan useEffect: komponen ini ikut dirender di server,
   dan membaca localStorage saat render akan melempar di sana. `getServerSnapshot` mengembalikan
   false, jadi server selalu menggambar kartunya dan hidrasi tidak pernah berselisih. */
const pendengarTutup = new Set<() => void>();
const langganTutup = (cb: () => void) => {
  pendengarTutup.add(cb);
  return () => {
    pendengarTutup.delete(cb);
  };
};
const bacaTutup = (key: string): boolean => {
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    // Mode privat / penyimpanan diblokir: peringatannya tetap tampil. Arah gagal yang benar.
    return false;
  }
};
const tulisTutup = (key: string) => {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* tidak bisa diingat — kartunya akan muncul lagi, dan itu tidak merusak apa pun */
  }
  pendengarTutup.forEach((l) => l());
};

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   CANGKANG: memuat data, lalu menyerahkan data yang SUDAH PASTI ADA ke layarnya.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

export default function AdminOngkirPage() {
  const { token } = useAdminAuth();
  const [data, setData] = useState<AdminDomesticRates | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  /* ═══ KENAPA INI PAKAI .then(), BUKAN await ═══
     Efek di bawah memanggil `load`. Kalau `load` menulis keadaan secara SINKRON di badannya —
     `setMemuat(true)` sebagai baris pertama, misalnya — efeknya memicu render berantai, dan
     react-hooks/set-state-in-effect benar menolaknya. Di sini SEMUA penulisan keadaan duduk di
     dalam callback janji, jadi tidak satu pun terjadi saat efek dijalankan.
     Penanda "memuat" sudah true sejak awal; pemuatan ulang manual menyalakannya di `muatUlang`. */
  const load = useCallback(
    () =>
      token
        ? getAdminDomesticRates(token).then(
            (next) => {
              setData(next);
              setGalatMuat(null);
              setMemuat(false);
            },
            (e: unknown) => {
              setGalatMuat(
                e instanceof Error ? e.message : "Gagal memuat data ongkir. Coba lagi.",
              );
              setMemuat(false);
            },
          )
        : Promise.resolve(),
    [token],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const muatUlang = () => {
    setMemuat(true);
    setGalatMuat(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight text-white">Ongkir Kirim Kartu</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">
          Berapa Rupiah yang ditagihkan ke pembeli saat kartunya dikirim ke rumahnya.
        </p>
      </header>

      {memuat && !data && <p className="py-10 text-center text-sm text-zinc-500">Memuat…</p>}

      {galatMuat && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300">
          <p>Gagal memuat data ongkir. Coba lagi.</p>
          <p className="mt-1 text-[12px] text-red-300/70">{galatMuat}</p>
          <button
            type="button"
            onClick={muatUlang}
            className="mt-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
          >
            Muat ulang
          </button>
        </div>
      )}

      {data && token && (
        <LayarOngkir data={data} token={token} reload={load} memuat={memuat} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   LAYARNYA
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Hasil satu kali tekan Simpan di Bagian 1. Sengaja bukan string: tiap bentuk punya tombolnya. */
type HasilSimpan =
  | { kind: "SUKSES"; bandung: string; makassar: string }
  | { kind: "SUKSES_TANPA_ANGKA" }
  | { kind: "SEPARUH"; jawa: number; pesan: string }
  | { kind: "GAGAL"; pesan: string }
  | { kind: "BELUM_BERES" };

type PanelUbah = {
  scope: string;
  harga: string;
  label: string;
  note: string;
  fallback: boolean;
  active: boolean;
  /** false = daftar daerahnya TIDAK dikirim sama sekali, jadi tidak mungkin tersentuh. */
  ubahDaftar: boolean;
  provincesText: string;
  lihatDaftar: boolean;
  akuiKosong: boolean;
};

function LayarOngkir({
  data,
  token,
  reload,
  memuat,
}: {
  data: AdminDomesticRates;
  token: string;
  reload: () => Promise<void>;
  memuat: boolean;
}) {
  /* ─────────── NILAI TURUNAN: semuanya dari respons, nol angka yang dihardcode ─────────── */

  const kit: ScopeKit = {
    nationwide: data.nationwideScope,
    tier: data.tierScopePrefix,
    state: data.stateScopePrefix,
  };
  const limits = data.limits;
  const MIN = limits?.minPriceIdr ?? null;
  const MAX = limits?.maxPriceIdr ?? null;
  const MAX_PROV = limits?.maxProvincesPerTier ?? null;

  /* ANGKA BAWAAN SISTEM — yang SEDANG ditagihkan selama tabelnya kosong.
     WAJIB dari `placeholderPricesIdr` (25.000 / 50.000), TIDAK PERNAH dari `example.priceIdr`
     (22.000 / 45.000). Keduanya berbeda, dan tombol isi-cepat versi lama memakai yang kedua —
     artinya satu klik "isi otomatis" diam-diam MENURUNKAN ongkir Rp 3.000–5.000 per kiriman
     tanpa mengatakan apa pun. `example.priceIdr` tidak dipakai di mana pun di berkas ini. */
  const phDefault = data.effective.filter((t) => t.from === "DEFAULT_TIER");
  const PH: { jawa: number; luarJawa: number } | null =
    data.placeholderPricesIdr ??
    (phDefault.length > 0
      ? {
          jawa: (phDefault.find((t) => !t.fallback) ?? phDefault[0]).priceIdr,
          luarJawa: (phDefault.find((t) => t.fallback) ?? phDefault[0]).priceIdr,
        }
      : null);
  const phJawaTeks = PH ? rp(PH.jawa) : "angka bawaan sistem";
  const phLuarTeks = PH ? rp(PH.luarJawa) : "angka bawaan sistem";

  const up = (s: string) => s.trim().toUpperCase();
  const JAWA_SCOPE = data.example.jawa.scope;
  const LUAR_SCOPE = data.example.luarJawa.scope;
  const JAWA = up(JAWA_SCOPE);
  const LUAR = up(LUAR_SCOPE);

  const all = data.data;
  const act = all.filter((r) => r.active);
  const activeRows: Row[] = act.map(toRow);

  /* Baris rujukan dicari di SELURUH baris, aktif maupun tidak. Baris Jawa yang dimatikan tetap
     harus ketemu — kalau tidak, Simpan akan membuat baris kedua dengan scope yang sama (upsert
     menimpanya) sambil menampilkan prefill yang salah di layar. */
  const rowJawa = all.find((r) => up(r.scope) === JAWA) ?? null;
  const rowLuar = all.find((r) => up(r.scope) === LUAR) ?? null;

  /* ═══ KAPAN BAGIAN 1 BERUBAH BENTUK — PREDIKATNYA PASTI, BUKAN KIRA-KIRA ═══
     Dua kotak hanya jujur selama dunianya memang cuma Jawa dan luar Jawa. Begitu ada kelompok
     buatan sendiri, atau penampung dipindahkan ke kelompok lain, dua kotak akan menyembunyikan
     baris yang sebenarnya menentukan tagihan — jadi bentuknya berubah jadi daftar.

     Baris "harga satu daerah" dan "seluruh Indonesia" TIDAK mengubah bentuk: keduanya duduk di
     lapis lain dan tidak pernah membuat dua kotak jadi bohong. Keberadaannya cukup disebut
     satu kalimat (lihat di bawah). */
  const extraGroups = act.filter(
    (r) => isGroup(r, kit) && up(r.scope) !== JAWA && up(r.scope) !== LUAR,
  );
  const strayFallback = act.some((r) => r.fallback && up(r.scope) !== LUAR);
  const MODE: "SEDERHANA" | "DAFTAR" =
    extraGroups.length === 0 && !strayFallback ? "SEDERHANA" : "DAFTAR";
  const lainnyaAktif = act.filter((r) => isState(r, kit) || isNat(r, kit)).length;

  /* Baris bawaan sistem direkonstruksi persis seperti yang dipakai jalur bayar (lapis 6). */
  const SEED: Row[] = PH
    ? [
        {
          scope: JAWA_SCOPE,
          priceIdr: PH.jawa,
          provinces: data.example.jawa.provinces,
          fallback: false,
          label: "Jawa",
        },
        { scope: LUAR_SCOPE, priceIdr: PH.luarJawa, provinces: [], fallback: true, label: "Luar Jawa" },
      ]
    : [];

  /**
   * Satu alamat → satu angka, DAN dari mana angka itu datang. Inilah satu-satunya sumber setiap
   * angka yang dijanjikan halaman ini.
   *
   * Lapis 0 (tarif kurir Biteship) dan lapis 5 (env HOSHI_DOMESTIC_SHIPPING_FLAT_IDR) TIDAK
   * dicerminkan — tidak ada datanya di respons, dan menebaknya dari potongan kalimat `resolution`
   * akan melahirkan klaim yang salah. Keduanya diakui satu kali, terang-terangan, di bawah tabel
   * "Yang ditagihkan hari ini" dan di Bagian 3e.
   */
  const resolve = (rows: Row[], raw: string): Resolved | null => {
    const p = normKey(raw);
    const db = pickTier(rows, p, kit);
    if (db) return { ...db, source: "KAMU" };
    const sd = pickTier(SEED, p, kit);
    return sd ? { ...sd, source: "SISTEM" } : null;
  };

  /** Nama sebuah aturan sebagaimana dibaca manusia. Nama internal hanya dipakai kalau tak ada label. */
  const namaBaris = (r: { scope: string; label: string | null }): string => {
    if (isState(r, kit)) {
      const p = r.scope.trim().slice(kit.state.length).trim();
      return `Khusus ${titleCase(p)}`;
    }
    if (isNat(r, kit)) return "Seluruh Indonesia";
    const l = r.label?.trim();
    return l && l.length > 0 ? l : r.scope.trim();
  };

  /* ─────────── KEADAAN LAYAR ─────────── */

  const [draftJawa, setDraftJawa] = useState<string | null>(null);
  const [draftLuar, setDraftLuar] = useState<string | null>(null);
  const [draftDaftar, setDraftDaftar] = useState<Record<string, string>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [galatB1, setGalatB1] = useState<string | null>(null);
  const [pagarTerbalik, setPagarTerbalik] = useState(false);
  const [hasil, setHasil] = useState<HasilSimpan | null>(null);

  const [cek, setCek] = useState("");

  const [lanjutanBuka, setLanjutanBuka] = useState(false);
  const [kenapaBuka, setKenapaBuka] = useState(false);
  const [pesanLanjutan, setPesanLanjutan] = useState<string | null>(null);
  const [galatLanjutan, setGalatLanjutan] = useState<string | null>(null);

  const [f3a, setF3a] = useState({ prov: "", harga: "", label: "" });
  const [f3b, setF3b] = useState({
    nama: "",
    harga: "",
    provincesText: "",
    note: "",
    fallback: false,
    active: true,
  });
  const [f3c, setF3c] = useState({ harga: "" });

  const [ubahHarga, setUbahHarga] = useState<{ scope: string; teks: string } | null>(null);
  const [panel, setPanel] = useState<PanelUbah | null>(null);

  const refBagian1 = useRef<HTMLDivElement | null>(null);
  const refLanjutan = useRef<HTMLDetailsElement | null>(null);
  const refProv3b = useRef<HTMLTextAreaElement | null>(null);
  const refProvPanel = useRef<HTMLTextAreaElement | null>(null);

  const keBagian1 = () => refBagian1.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const keLanjutan = () => {
    setLanjutanBuka(true);
    requestAnimationFrame(() =>
      refLanjutan.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  /* ─────────── BAGIAN 1: dua kotak ─────────── */

  const prefillJawa = rowJawa?.priceIdr ?? PH?.jawa ?? null;
  const prefillLuar = rowLuar?.priceIdr ?? PH?.luarJawa ?? null;
  const teksAwalJawa = prefillJawa == null ? "" : String(prefillJawa);
  const teksAwalLuar = prefillLuar == null ? "" : String(prefillLuar);
  const teksJawa = draftJawa ?? teksAwalJawa;
  const teksLuar = draftLuar ?? teksAwalLuar;
  const valJawa = parseRp(teksJawa);
  const valLuar = parseRp(teksLuar);
  const ubahJawaBox = draftJawa !== null && draftJawa !== teksAwalJawa;
  const ubahLuarBox = draftLuar !== null && draftLuar !== teksAwalLuar;
  const adaKetikan = ubahJawaBox || ubahLuarBox;

  /* ═══ "PERLU DITULIS?" — KENAPA BUKAN SEKADAR "ADA YANG DIKETIK?" ═══
     Baris Jawa yang ADA di DB tapi daftar provinsinya KOSONG adalah baris mati: harganya
     tersimpan dan tidak pernah dipakai. Kalau tombol Simpan hanya aktif saat angkanya diubah,
     baris rusak itu tidak akan pernah sembuh — pemiliknya harus tahu ia rusak dulu.

     Maka "perlu ditulis" juga benar ketika barisnya belum ada, sedang dimatikan, atau daftarnya
     kosong. Efeknya: membuka halaman dan menekan SATU tombol menyembuhkan baris yang sudah
     rusak di DB hari ini, tanpa pemiliknya perlu tahu ada yang rusak. */
  const needJawa =
    ubahJawaBox ||
    !rowJawa ||
    !rowJawa.active ||
    (rowJawa.provinces.length === 0 && !rowJawa.fallback);
  const needLuar = ubahLuarBox || !rowLuar || !rowLuar.active || !rowLuar.fallback;
  const akanPasangFallback = !rowLuar || rowLuar.fallback !== true;

  /** Keadaan DB SEANDAINYA tombol Simpan ditekan sekarang — dasar seluruh pratinjau. */
  const rowsAfter: Row[] = (() => {
    const peta = new Map<string, Row>();
    activeRows.forEach((r) => peta.set(up(r.scope), r));
    if (Number.isFinite(valJawa)) {
      const dasar = rowJawa ? toRow(rowJawa) : null;
      peta.set(JAWA, {
        scope: JAWA_SCOPE,
        priceIdr: valJawa,
        // Daftar lama dipertahankan kalau ada isinya: ejaan yang ditambahkan sendiri lewat
        // Pengaturan lanjutan TIDAK BOLEH tertimpa oleh simpan mingguan di Bagian 1.
        provinces:
          dasar && dasar.provinces.length > 0 ? dasar.provinces : data.example.jawa.provinces,
        fallback: dasar?.fallback ?? false,
        label: dasar?.label ?? "Jawa",
      });
    }
    if (Number.isFinite(valLuar)) {
      const dasar = rowLuar ? toRow(rowLuar) : null;
      if (akanPasangFallback) {
        // Backend mematikan penampung di baris lain dalam satu transaksi — pratinjaunya harus
        // menirukan itu, atau ia akan menunjukkan dua penampung yang tidak akan pernah ada.
        peta.forEach((v, k) => peta.set(k, { ...v, fallback: false }));
      }
      peta.set(LUAR, {
        scope: LUAR_SCOPE,
        priceIdr: valLuar,
        provinces: dasar?.provinces ?? [],
        fallback: true,
        label: dasar?.label ?? "Luar Jawa",
      });
    }
    return [...peta.values()];
  })();

  const pratinjauJabar = resolve(rowsAfter, "jawa barat");
  const pratinjauSulsel = resolve(rowsAfter, "sulawesi selatan");
  const ekor = (r: Resolved | null) =>
    r && r.source === "SISTEM" ? "  (angka bawaan sistem, bukan angkamu)" : "";

  /* ─────────── KARTU "YANG MASIH HARUS KAMU BERESIN" ─────────── */

  const usingDefaults =
    data.usingDefaults ?? data.effective.every((t) => t.from === "DEFAULT_TIER");
  const barisMati = act.filter((r) => isDead(r, kit));
  const adaFallback = act.some((r) => r.fallback);
  const adaNasional = act.some((r) => isNat(r, kit));
  const fallbackAktif = act.filter((r) => r.fallback);
  const hargaTermahal = act.length > 0 ? Math.max(...act.map((r) => r.priceIdr)) : 0;
  const barisTermahal = act.reduce<AdminDomesticRate | null>(
    (a, r) => (!a || r.priceIdr > a.priceIdr ? r : a),
    null,
  );

  const kartuA = usingDefaults;
  const kartuB = barisMati.length > 0;
  const kartuC = !adaFallback && !adaNasional;
  const kartuDMentah = fallbackAktif.length === 1 && fallbackAktif[0].priceIdr < hargaTermahal;
  const kunciD = kartuDMentah
    ? adminStorageKey(
        `ongkir-tahu-fallback-murah:${fallbackAktif[0].scope}:${fallbackAktif[0].priceIdr}:${hargaTermahal}`,
        token,
      )
    : "";
  const dTertutup = useSyncExternalStore(
    langganTutup,
    () => bacaTutup(kunciD),
    () => false,
  );
  const kartuD = kartuDMentah && !dTertutup;

  /* ═══ KARTU E — JARING ANTI-HILANG YANG STRUKTURAL, BUKAN COCOK-COCOKAN PROSA ═══
     Halaman ini menerjemahkan `actionRequired` jadi kalimat berakibat. Kalau backend kelak
     menambah kondisi keempat, terjemahannya tidak ada — dan tanpa jaring ini kondisi itu akan
     HILANG DIAM-DIAM dari layar, yang persis kegagalan yang sedang kita perbaiki.

     Jaringnya menghitung ulang KETIGA predikat backend dari `effective` dan membandingkan
     JUMLAHNYA dengan panjang `actionRequired`. Tidak ada satu pun string yang dicocokkan, jadi
     perubahan kata di backend tidak bisa memalsukan kelulusan. */
  const effPlaceholder = data.effective.filter((t) => t.placeholder).length;
  const effFallback = data.effective.filter((t) => t.fallback).length;
  const predikatBackend =
    (effPlaceholder > 0 ? 1 : 0) + (effFallback === 0 ? 1 : 0) + (effFallback > 1 ? 1 : 0);
  const kartuE = data.actionRequired.length !== predikatBackend;

  const adaMerah = kartuA || kartuB || kartuC;
  const adaKuning = kartuD || kartuE;

  /* ─────────── PENGIRIMAN ─────────── */

  const cekHarga = (teks: string, val: number): string | null => {
    if (teks.trim() === "") return "Isi dulu kedua kolomnya.";
    if (!Number.isFinite(val)) return "Tulis angkanya saja. Contoh: 25000.";
    if (MIN !== null && val < MIN)
      return (
        `Ongkir minimal ${rp(MIN)}. Di bawah itu tagihannya tidak bisa terbit dan pembeli akan ` +
        "gagal bayar. Ditolak di sini supaya kamu tidak baru tahu setelah ada pembeli yang gagal."
      );
    if (MAX !== null && val > MAX) return `Ongkir maksimal ${rp(MAX)}.`;
    return null;
  };

  /** Satu pintu untuk semua PUT di Bagian 3, supaya pesan sukses/gagalnya tidak pernah berbeda. */
  const kirim = async (input: SetDomesticRateInput, sukses: string): Promise<boolean> => {
    if (menyimpan) return false;
    setMenyimpan(true);
    setPesanLanjutan(null);
    setGalatLanjutan(null);
    try {
      await setAdminDomesticRate(input, token);
      setPesanLanjutan(sukses);
      await reload();
      return true;
    } catch (e) {
      setGalatLanjutan(
        `Gagal menyimpan: ${
          e instanceof Error ? e.message : "Tidak ada yang berubah. Coba lagi sebentar lagi."
        }`,
      );
      return false;
    } finally {
      setMenyimpan(false);
    }
  };

  /** Empat pemeriksaan SESUDAH simpan. Kotak hijau tidak boleh muncul kalau salah satu gagal. */
  const periksaSesudahSimpan = (res: SetDomesticRateResult): HasilSimpan => {
    const eff = res.effective;
    // Backend lama tidak mengirim keadaan sesudahnya. Tidak bisa diperiksa ≠ lulus: yang
    // diklaim cuma "tersimpan", tanpa menyebut siapa ditagih berapa.
    if (!eff) return { kind: "SUKSES_TANPA_ANGKA" };
    const rows = eff.map(effToRow);
    const jabar = resolve(rows, "jawa barat");
    const sisanya = resolve(rows, "zzz belum terdaftar");
    const lulus =
      res.usingDefaults === false &&
      !rows.some((r) => isDead(r, kit)) &&
      rows.filter((r) => r.fallback).length === 1 &&
      jabar?.source === "KAMU" &&
      sisanya?.source === "KAMU";
    if (!lulus) return { kind: "BELUM_BERES" };
    const makassar = resolve(rows, "sulawesi selatan");
    return {
      kind: "SUKSES",
      bandung: jabar ? rp(jabar.row.priceIdr) : "—",
      makassar: makassar ? rp(makassar.row.priceIdr) : "—",
    };
  };

  /**
   * ═══ URUTAN PUT-nya PROPERTI KEAMANAN, BUKAN SELERA ═══
   * JAWA DULU, LUAR JAWA BELAKANGAN. Kalau PUT kedua gagal, tidak ada baris "daerah lainnya" —
   * pembeli di luar Jawa jatuh ke angka bawaan sistem Rp 50.000, yaitu LEBIH MAHAL dari yang
   * dimaksud: tidak ada yang rugi, dan uangnya bisa dikembalikan. Dibalik urutannya, PUT kedua
   * yang gagal berarti baris "daerah lainnya" sudah berdiri sendirian dan SETIAP pembeli Jakarta
   * ditagih Rp 50.000. Urutan ini jangan pernah ditukar.
   */
  const simpanBagian1 = async (opts?: { hanyaLuar?: boolean }) => {
    if (menyimpan) return;
    const hanyaLuar = opts?.hanyaLuar === true;
    setGalatB1(null);
    setHasil(null);

    if (!hanyaLuar) {
      const e1 = cekHarga(teksJawa, valJawa);
      if (e1) {
        setGalatB1(e1);
        return;
      }
    }
    const e2 = cekHarga(teksLuar, valLuar);
    if (e2) {
      setGalatB1(e2);
      return;
    }

    // Pagar arah salah: dilewati kalau cuma baris Jawa yang gagal tadi (angkanya sudah disetujui).
    if (!hanyaLuar && valLuar < valJawa && !pagarTerbalik) {
      setPagarTerbalik(true);
      return;
    }

    const antrean: { kunci: "JAWA" | "LUAR"; input: SetDomesticRateInput }[] = [];
    if (!hanyaLuar && needJawa) {
      antrean.push({
        kunci: "JAWA",
        input: {
          scope: JAWA_SCOPE,
          priceIdr: valJawa,
          /* PROVINSI HANYA DIKIRIM SAAT BARISNYA BELUM ADA ATAU DAFTARNYA KOSONG.
             Dua akibat yang dua-duanya penting: (a) baris yang sudah rusak sembuh sendiri;
             (b) ejaan yang kelak ditambahkan sendiri lewat Pengaturan lanjutan TIDAK PERNAH
             tertimpa oleh tombol yang tidak menanyakannya. */
          ...(!rowJawa || rowJawa.provinces.length === 0
            ? { provinces: data.example.jawa.provinces }
            : {}),
          /* Label ditulis literal, tidak diwarisi dari server: label bawaan berbunyi
             "Jawa — PENAMPUNG, belum diputuskan pemilik produk", dan label itu ikut DIBACA
             PEMBELI di taksiran ongkirnya. */
          ...(!rowJawa || !rowJawa.label?.trim() ? { label: "Jawa" } : {}),
          ...(rowJawa && !rowJawa.active ? { active: true } : {}),
        },
      });
    }
    if (needLuar || hanyaLuar) {
      antrean.push({
        kunci: "LUAR",
        input: {
          scope: LUAR_SCOPE,
          priceIdr: valLuar,
          // `provinces` TIDAK PERNAH dikirim untuk baris ini: kosongnya memang BENAR, dan
          // mengirim [] akan membuat baris ini terbaca sebagai "kelompok yang dikosongkan".
          ...(!rowLuar || rowLuar.fallback !== true ? { fallback: true } : {}),
          ...(!rowLuar || !rowLuar.label?.trim() ? { label: "Luar Jawa" } : {}),
          ...(rowLuar && !rowLuar.active ? { active: true } : {}),
        },
      });
    }
    if (antrean.length === 0) return;

    setMenyimpan(true);
    let terakhir: SetDomesticRateResult | null = null;
    let jawaBeres = false;
    try {
      for (const p of antrean) {
        try {
          terakhir = await setAdminDomesticRate(p.input, token);
          if (p.kunci === "JAWA") jawaBeres = true;
        } catch (e) {
          const pesan =
            e instanceof Error ? e.message : "Tidak ada yang berubah. Coba lagi sebentar lagi.";
          setHasil(
            p.kunci === "LUAR" && jawaBeres
              ? { kind: "SEPARUH", jawa: valJawa, pesan }
              : { kind: "GAGAL", pesan },
          );
          await reload();
          return;
        }
      }
      setHasil(terakhir ? periksaSesudahSimpan(terakhir) : null);
      setDraftJawa(null);
      setDraftLuar(null);
      setPagarTerbalik(false);
      await reload();
    } finally {
      setMenyimpan(false);
    }
  };

  /** MODE DAFTAR: hanya `{scope, priceIdr}` untuk baris yang angkanya benar-benar berubah. */
  const simpanDaftar = async () => {
    if (menyimpan) return;
    setGalatB1(null);
    setHasil(null);
    const berubah: { scope: string; val: number }[] = [];
    for (const r of act) {
      const t = draftDaftar[r.scope];
      if (t === undefined) continue;
      const v = parseRp(t);
      if (v === r.priceIdr) continue;
      // Pesan "Isi dulu KEDUA kolomnya" hanya benar di bentuk dua-kotak. Di sini kolomnya banyak,
      // jadi yang disebut adalah baris mana yang kosong — kalimat yang salah menyuruh orang
      // mencari kesalahan di tempat yang tidak ada.
      if (t.trim() === "") {
        setGalatB1(`${namaBaris(r)}: isi dulu angkanya, atau kosongkan perubahannya.`);
        return;
      }
      const e = cekHarga(t, v);
      if (e) {
        setGalatB1(`${namaBaris(r)}: ${e}`);
        return;
      }
      berubah.push({ scope: r.scope, val: v });
    }
    if (berubah.length === 0) return;
    setMenyimpan(true);
    let terakhir: SetDomesticRateResult | null = null;
    try {
      for (const b of berubah) {
        try {
          terakhir = await setAdminDomesticRate({ scope: b.scope, priceIdr: b.val }, token);
        } catch (e) {
          setHasil({
            kind: "GAGAL",
            pesan: e instanceof Error ? e.message : "Tidak ada yang berubah. Coba lagi sebentar lagi.",
          });
          await reload();
          return;
        }
      }
      setHasil(terakhir ? periksaSesudahSimpan(terakhir) : null);
      setDraftDaftar({});
      await reload();
    } finally {
      setMenyimpan(false);
    }
  };

  /** Satu klik: jadikan baris termahal sebagai harga untuk daerah yang belum diatur. */
  const jadikanFallback = async (r: AdminDomesticRate) => {
    // `priceIdr` WAJIB ikut: DTO-nya @IsInt() dan bukan opsional, jadi PUT tanpa harga ditolak.
    await kirim(
      { scope: r.scope, priceIdr: r.priceIdr, fallback: true },
      `Tersimpan. Daerah yang belum kamu atur sekarang memakai “${namaBaris(r)}” (${rp(r.priceIdr)}).`,
    );
  };

  /* ─────────── PANEL UBAH ─────────── */

  const bukaPanel = (r: AdminDomesticRate) => {
    setPanel({
      scope: r.scope,
      harga: String(r.priceIdr),
      label: r.label ?? "",
      note: r.note ?? "",
      fallback: r.fallback,
      active: r.active,
      ubahDaftar: false,
      provincesText: r.provinces.join(", "),
      lihatDaftar: false,
      akuiKosong: false,
    });
    keLanjutan();
  };

  const panelBaris = panel ? (all.find((r) => r.scope === panel.scope) ?? null) : null;
  const panelProvAkan = panel
    ? panel.ubahDaftar
      ? parseProvinces(panel.provincesText)
      : (panelBaris?.provinces ?? [])
    : [];
  /* ═══ PAGAR "ATURAN INI TIDAK AKAN PERNAH TERPAKAI" ═══
     Dihitung dari keadaan AKHIR baris (gabungan yang diketik + yang sudah ada), bukan dari
     formnya saja. Karena `panelProvAkan` mewarisi daftar lama ketika "Ubah daftar daerah" tidak
     ditekan, membetulkan HARGA SAJA tidak pernah terblokir — dan mematikan baris juga tidak. */
  const panelTerkunci =
    !!panel &&
    isGroup({ scope: panel.scope }, kit) &&
    panelProvAkan.length === 0 &&
    !panel.fallback &&
    panel.active;
  const panelMengosongkan =
    !!panel &&
    !panelTerkunci &&
    !panel.akuiKosong &&
    panel.ubahDaftar &&
    parseProvinces(panel.provincesText).length === 0 &&
    (panelBaris?.provinces.length ?? 0) > 0 &&
    isGroup({ scope: panel.scope }, kit) &&
    !panel.fallback;

  const akibatPengosongan = (() => {
    if (!panelMengosongkan || !panelBaris) return null;
    const contoh = panelBaris.provinces[0];
    const tanpa = activeRows.filter((r) => r.scope !== panelBaris.scope);
    const h = resolve(tanpa, contoh);
    if (!h) return `Daerah seperti “${titleCase(contoh)}” tidak akan cocok ke aturan mana pun.`;
    return (
      `Pembeli di daerah seperti “${titleCase(contoh)}” akan pindah ke aturan ` +
      `“${namaBaris(h.row)}” dan ditagih ${rp(h.row.priceIdr)}` +
      (h.source === "SISTEM" ? " (angka bawaan sistem, bukan angkamu)." : ".")
    );
  })();

  const simpanPanel = async () => {
    if (!panel || panelTerkunci) return;
    const v = parseRp(panel.harga);
    const e = cekHarga(panel.harga, v);
    if (e) {
      setGalatLanjutan(e);
      return;
    }
    const prov = parseProvinces(panel.provincesText);
    if (panel.ubahDaftar && MAX_PROV !== null && prov.length > MAX_PROV) {
      setGalatLanjutan(`Maksimal ${MAX_PROV} cara penulisan per kelompok.`);
      return;
    }
    const ok = await kirim(
      {
        scope: panel.scope,
        priceIdr: v,
        // Selama "Ubah daftar daerah" tidak ditekan, `provinces` TIDAK IKUT DIKIRIM sama sekali.
        ...(panel.ubahDaftar ? { provinces: prov } : {}),
        label: panel.label.trim(),
        note: panel.note.trim(),
        fallback: panel.fallback,
        active: panel.active,
      },
      "Tersimpan. Berlaku untuk tagihan berikutnya.",
    );
    if (ok) setPanel(null);
  };

  /* ─────────── BAGIAN 2: baris tabel = TUJUAN, bukan baris DB ─────────── */

  type Tujuan = { key: string; tampil: string; provinsi: string; asal: Row | null };
  const tujuan: Tujuan[] = [];
  act.forEach((r) => {
    if (isState(r, kit)) {
      const p = r.scope.trim().slice(kit.state.length).trim();
      if (p) tujuan.push({ key: `s:${r.scope}`, tampil: titleCase(p), provinsi: p, asal: toRow(r) });
    } else if (isGroup(r, kit) && r.provinces.length > 0) {
      const p = r.provinces[0];
      tujuan.push({ key: `g:${r.scope}`, tampil: titleCase(p), provinsi: p, asal: toRow(r) });
    }
  });
  tujuan.push({
    key: "sisanya",
    tampil: "Daerah yang belum kamu atur",
    provinsi: "zzz belum terdaftar",
    asal: null,
  });

  const cekHasil = cek.trim() ? resolve(activeRows, cek) : null;

  /* ─────────── "BERLAKU UNTUK" di tabel Pengaturan lanjutan ─────────── */
  const berlakuUntuk = (r: AdminDomesticRate) => {
    if (isState(r, kit))
      return <span>Satu daerah: {titleCase(r.scope.trim().slice(kit.state.length).trim())}</span>;
    if (isNat(r, kit)) return <span>Seluruh Indonesia</span>;
    if (r.fallback) return <span>Semua daerah lainnya</span>;
    if (r.provinces.length > 0)
      return (
        <span title={r.provinces.join(", ")}>
          {up(r.scope) === JAWA
            ? `Jawa dan sekitarnya (${r.provinces.length} cara penulisan)`
            : `${r.provinces.length} cara penulisan`}
        </span>
      );
    // DUA KEADAAN BERLAWANAN BERHENTI MEMAKAI LAMBANG "—" YANG SAMA. Kosong yang BENAR (baris
    // "daerah lainnya", satu daerah, nasional) sudah tertangani di atas; yang sampai ke sini
    // adalah kosong yang FATAL.
    return <span className="font-semibold text-rose-300">⚠ Belum ada daerahnya — tidak pernah terpakai</span>;
  };

  /* ══════════════════════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════════════════════ */

  /* Awalan "Rp" dicetak DI DALAM kotak dan gema hidup "= Rp 25.000" di bawahnya: orang yang
     mengetik ongkir mengetiknya dengan titik, dan satu-satunya cara membuktikan bahwa titiknya
     benar-benar diterima adalah memperlihatkan hasil bacaannya sambil ia mengetik. */
  const kotakHarga = (nilai: string, ubah: (v: string) => void) => (
    <div>
      <div className="flex items-center rounded-lg border border-white/12 bg-black/30 focus-within:border-white/25">
        <span className="pl-3 text-[13px] text-zinc-500">Rp</span>
        <input
          value={nilai}
          onChange={(e) => ubah(e.target.value)}
          inputMode="numeric"
          className="w-full bg-transparent px-2 py-2 text-[15px] font-semibold tabular-nums text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </div>
      <p className="mt-1 text-[12px] tabular-nums text-zinc-500">
        {Number.isFinite(parseRp(nilai)) ? `= ${rp(parseRp(nilai))}` : "= —"}
      </p>
    </div>
  );

  return (
    <>
      {/* ╔═══════════════ KOTAK STATUS ═══════════════╗
          Isinya BUKAN cetakan `actionRequired`. Tiap kondisi dihitung ulang di klien jadi kalimat
          BERAKIBAT ("pembeli di sana ditagih X"), karena kalimat mesin yang tidak berakibat
          adalah kalimat yang dilewati — dan yang dilewati di sini adalah uang sungguhan. */}
      {(adaMerah || adaKuning) && (
        <div
          className={`rounded-2xl border p-5 ${
            adaMerah
              ? "border-rose-400/40 bg-rose-500/[0.10]"
              : "border-amber-400/35 bg-amber-400/[0.08]"
          }`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[15px] ${
                adaMerah ? "bg-rose-500/25" : "bg-amber-400/25"
              }`}
            >
              ⚠️
            </span>
            <div className="min-w-0 flex-1">
              {kartuA && (
                <h2 className="text-[15px] font-bold text-rose-200">
                  Ongkirnya belum kamu tentukan — dan pembeli sudah ditagih angka tebakan sistem
                </h2>
              )}
              {!kartuA && (kartuB || kartuC) && (
                <h2 className="text-[15px] font-bold text-rose-200">
                  Ongkirmu sudah tersimpan, tapi ada yang tidak dipakai
                </h2>
              )}
              <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
                Yang masih harus kamu beresin
              </p>

              <div className="mt-2 flex flex-col gap-2">
                {/* ── KARTU A ── */}
                {kartuA && (
                  <div className="rounded-xl border border-rose-400/30 bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-rose-100">
                    Sekarang pembeli di Jawa ditagih {phJawaTeks} dan di luar Jawa {phLuarTeks}.
                    Angka itu bawaan sistem, bukan keputusanmu. Isi dua kolom di bawah, tekan
                    Simpan — selesai.
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={keBagian1}
                        className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                      >
                        Isi sekarang
                      </button>
                    </div>
                  </div>
                )}

                {/* ── KARTU B: satu per baris yang tidak pernah terpakai ── */}
                {barisMati.map((r) => {
                  /* "Pembeli yang kamu maksud" tidak bisa dihitung dari baris ini — ia TIDAK
                     punya daftar daerah, itu justru masalahnya. Jadi yang dipakai adalah
                     resolusi untuk alamat yang tidak cocok ke aturan mana pun, karena secara
                     definisi ke situlah semua pembeli yang dimaksud baris ini jatuh. */
                  const jatuhKe = resolve(activeRows, "zzz belum terdaftar");
                  return (
                    <div
                      key={r.scope}
                      className="rounded-xl border border-rose-400/30 bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-rose-100"
                    >
                      “{namaBaris(r)}” harganya {rp(r.priceIdr)}, tapi belum punya satu pun daerah
                      — jadi tidak ada alamat yang bisa kena harga itu. Pembeli yang kamu maksud
                      sekarang ditagih{" "}
                      {jatuhKe ? rp(jatuhKe.row.priceIdr) : "angka bawaan sistem"} (
                      {jatuhKe?.source === "KAMU" ? "angka kamu" : "angka bawaan sistem"}).
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => bukaPanel(r)}
                          className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                        >
                          Betulkan
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* ── KARTU C ── */}
                {kartuC && (
                  <div className="rounded-xl border border-rose-400/30 bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-rose-100">
                    Daerah yang belum kamu atur belum punya harga. Pembeli di sana ditagih{" "}
                    {phLuarTeks} bawaan sistem, bukan angkamu.
                    <div className="mt-2">
                      {barisTermahal ? (
                        <button
                          type="button"
                          onClick={() => void jadikanFallback(barisTermahal)}
                          disabled={menyimpan}
                          className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
                        >
                          Pakai “{namaBaris(barisTermahal)}” ({rp(barisTermahal.priceIdr)}) untuk
                          daerah lainnya
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={keBagian1}
                          className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                        >
                          Isi ongkir sekarang
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── KARTU D (kuning, bisa ditutup) ──
                    Server hanya mengirim peringatan ini di respons PUT, jadi dulu ia lenyap
                    begitu halaman di-refresh. Di sini ia dihitung ulang SETIAP MUAT. */}
                {kartuD && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-3 text-[13px] leading-relaxed text-amber-100">
                    Harga untuk daerah lainnya ({rp(fallbackAktif[0].priceIdr)}) lebih murah
                    daripada harga termahalmu ({rp(hargaTermahal)}). Daerah yang belum kamu
                    daftarkan jadi bayar lebih murah daripada daerah termahal yang sudah kamu
                    daftarkan. Kalau memang itu maumu, tutup saja pesan ini.
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => tulisTutup(kunciD)}
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Ya, saya tahu
                      </button>
                    </div>
                  </div>
                )}

                {/* ── KARTU E ── */}
                {kartuE && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-3 text-[13px] leading-relaxed text-amber-100">
                    Sistem mengirim pesan yang belum diterjemahkan halaman ini. Ini teks aslinya:
                    <ul className="mt-2 flex flex-col gap-1.5">
                      {data.actionRequired.map((a) => (
                        <li key={a} className="rounded-lg bg-black/25 px-3 py-2 text-[12px] text-amber-100/90">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {data.actionRequired.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12px] text-zinc-400 hover:text-zinc-200">
                    Keterangan asli dari sistem (bahasa mesin)
                  </summary>
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    Tidak perlu dibaca kalau semua kartu di atas sudah beres.
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {data.actionRequired.map((a) => (
                      <li
                        key={a}
                        className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-zinc-500"
                      >
                        {a}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {!adaMerah && !adaKuning && (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-5 py-4 text-[13px] text-emerald-200">
          Beres. Ongkir yang ditagihkan ke pembeli sekarang angka yang kamu tentukan sendiri.
        </div>
      )}

      {/* ╔═══════════════ BAGIAN 1 ═══════════════╗ */}
      <section
        ref={refBagian1}
        className="scroll-mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
      >
        <h2 className="text-[15px] font-bold text-white">Berapa ongkir kirim kartu?</h2>

        {MODE === "SEDERHANA" ? (
          <>
            <p className="mt-1 text-[13px] text-zinc-400">
              Cukup dua angka ini. Daftar daerahnya sudah diatur otomatis.
            </p>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">Kirim ke Pulau Jawa</p>
                <p className="mb-2 mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Jakarta, Banten, Jawa Barat, Jawa Tengah, Jawa Timur, Yogyakarta — termasuk semua
                  cara penulisannya (“Jabar”, “West Java”, “Jogja”). Kamu tidak perlu mengetiknya.
                </p>
                {kotakHarga(teksJawa, setDraftJawa)}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-zinc-200">Kirim ke luar Jawa</p>
                <p className="mb-2 mt-1 text-[11px] leading-relaxed text-zinc-500">
                  Sumatera, Bali, Kalimantan, Sulawesi, NTB, NTT, Maluku, Papua — dan daerah apa pun
                  yang belum kamu atur sendiri.
                </p>
                {kotakHarga(teksLuar, setDraftLuar)}
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
              Tulis angkanya saja. Titik dan koma dibuang otomatis.
              {MIN !== null && MAX !== null ? ` Paling murah ${rp(MIN)}, paling mahal ${rp(MAX)}.` : ""}
            </p>

            {lainnyaAktif > 0 && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                Kamu juga punya {lainnyaAktif} pengaturan khusus (harga satu daerah / harga seluruh
                Indonesia). Semuanya ada di Pengaturan lanjutan di bawah.
              </p>
            )}

            {/* ── PRATINJAU ──
                Dihitung dari keadaan DB SEANDAINYA Simpan ditekan sekarang, lewat cermin
                resolusi — bukan dari isi kotak. Kalau hasilnya masih angka bawaan sistem, ia
                MENGATAKANNYA. Inilah mekanisasi "kalimat sukses tidak bisa berbohong". */}
            <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3">
              <p className="text-[12px] font-semibold text-zinc-300">Kalau disimpan, begini jadinya</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-[13px] tabular-nums text-zinc-200">
                <li>
                  Pembeli di Bandung, Jawa Barat → {pratinjauJabar ? rp(pratinjauJabar.row.priceIdr) : "—"}
                  <span className="text-[12px] text-amber-300">{ekor(pratinjauJabar)}</span>
                </li>
                <li>
                  Pembeli di Makassar, Sulawesi Selatan →{" "}
                  {pratinjauSulsel ? rp(pratinjauSulsel.row.priceIdr) : "—"}
                  <span className="text-[12px] text-amber-300">{ekor(pratinjauSulsel)}</span>
                </li>
              </ul>
              <button
                type="button"
                onClick={() => {
                  setKenapaBuka(true);
                  keLanjutan();
                }}
                className="mt-2 text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
              >
                Kenapa bisa beda?
              </button>
            </div>

            {/* ── PAGAR ARAH SALAH (dua tombol, bisa dilanjutkan) ── */}
            {pagarTerbalik && (
              <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
                ⚠ Ongkir luar Jawa lebih murah daripada ongkir Jawa. Daerah yang belum kamu atur
                ikut memakai angka luar Jawa, jadi setiap daerah jauh yang belum terdaftar akan
                ditagih terlalu murah dan selisihnya kamu yang tanggung.
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void simpanBagian1()}
                    disabled={menyimpan}
                    className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
                  >
                    Ya, memang begitu — simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagarTerbalik(false)}
                    className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                  >
                    Perbaiki dulu
                  </button>
                </div>
              </div>
            )}

            {galatB1 && (
              <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
                {galatB1}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void simpanBagian1()}
                disabled={menyimpan || (!needJawa && !needLuar)}
                className="rounded-xl bg-[#F2C101] px-5 py-2.5 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {menyimpan
                  ? "Menyimpan…"
                  : !needJawa && !needLuar
                    ? "Belum ada yang diubah."
                    : adaKetikan
                      ? "Simpan ongkir"
                      : "Ya, pakai angka ini"}
              </button>
              {adaKetikan && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftJawa(null);
                    setDraftLuar(null);
                    setGalatB1(null);
                    setPagarTerbalik(false);
                  }}
                  disabled={menyimpan}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
                >
                  Batalkan perubahan
                </button>
              )}
            </div>
            {/* Tombol yang berbunyi "Ya, pakai angka ini" bukan basa-basi: saat tidak ada yang
                diketik tapi barisnya masih perlu ditulis, yang sebenarnya terjadi adalah
                PERSETUJUAN atas angka yang sekarang dipakai — dan itu memang keputusan. */}
            {!adaKetikan && (needJawa || needLuar) && (
              <p className="mt-2 text-[11px] text-zinc-500">
                Kamu menyetujui angka yang sekarang dipakai: Jawa{" "}
                {Number.isFinite(valJawa) ? rp(valJawa) : "—"}, luar Jawa{" "}
                {Number.isFinite(valLuar) ? rp(valLuar) : "—"}.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
              Kamu sudah membuat pengaturan sendiri, jadi semuanya ditampilkan di sini. Ubah
              angkanya langsung, lalu simpan.
            </p>
            <div className="mt-4 flex flex-col gap-3">
              {[...act.filter((r) => !r.fallback), ...act.filter((r) => r.fallback)].map((r) => (
                <div
                  key={r.scope}
                  className="grid items-center gap-3 rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3 sm:grid-cols-[1fr_180px]"
                >
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-200">
                      {r.fallback
                        ? "Daerah lainnya — semua daerah yang tidak masuk daftar mana pun"
                        : namaBaris(r)}
                    </p>
                    {!r.fallback && isGroup(r, kit) && (
                      <p className="mt-0.5 text-[11px] text-zinc-500" title={r.provinces.join(", ")}>
                        {r.provinces.length > 0
                          ? `${r.provinces.length} cara penulisan`
                          : "⚠ Belum ada daerahnya — tidak pernah terpakai"}
                      </p>
                    )}
                    {r.fallback && (
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {namaBaris(r)} · dipakai untuk daerah yang belum diatur
                      </p>
                    )}
                  </div>
                  {kotakHarga(draftDaftar[r.scope] ?? String(r.priceIdr), (v) =>
                    setDraftDaftar((d) => ({ ...d, [r.scope]: v })),
                  )}
                </div>
              ))}

              {!adaFallback && (
                <div className="rounded-xl border border-rose-400/35 bg-rose-500/[0.08] px-4 py-3 text-[13px] text-rose-100">
                  Belum ada harga untuk daerah lainnya
                  {barisTermahal && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => void jadikanFallback(barisTermahal)}
                        disabled={menyimpan}
                        className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
                      >
                        Pakai “{namaBaris(barisTermahal)}” ({rp(barisTermahal.priceIdr)}) untuk
                        daerah lainnya
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {galatB1 && (
              <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
                {galatB1}
              </p>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void simpanDaftar()}
                disabled={menyimpan}
                className="rounded-xl bg-[#F2C101] px-5 py-2.5 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
              >
                {menyimpan ? "Menyimpan…" : "Simpan semua"}
              </button>
              <p className="text-[11px] text-zinc-500">
                Hanya harga yang kamu ubah yang disimpan. Daftar daerahnya tidak disentuh.
              </p>
            </div>
          </>
        )}

        {/* ── HASIL SIMPAN ── */}
        {hasil?.kind === "SUKSES" && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-[13px] leading-relaxed text-emerald-200">
            <p className="font-semibold">Sudah berlaku.</p>
            <p className="mt-1">
              Mulai sekarang pembeli di Bandung ditagih {hasil.bandung} dan pembeli di Makassar{" "}
              {hasil.makassar}. Tagihan yang sudah terbit tidak ikut berubah — nominalnya sudah
              tercetak di tagihan itu.
            </p>
          </div>
        )}
        {hasil?.kind === "SUKSES_TANPA_ANGKA" && (
          <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-[13px] leading-relaxed text-emerald-200">
            Sudah berlaku. Angka yang benar-benar ditagihkan ada di tabel “Yang ditagihkan ke
            pembeli hari ini” di bawah.
          </div>
        )}
        {hasil?.kind === "SEPARUH" && (
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
            <p>Ongkir Jawa sudah tersimpan ({rp(hasil.jawa)}).</p>
            <p className="mt-1">Ongkir luar Jawa GAGAL tersimpan: {hasil.pesan}</p>
            <p className="mt-1">
              Untuk sementara pembeli di luar Jawa masih ditagih {phLuarTeks} bawaan sistem.
            </p>
            <button
              type="button"
              onClick={() => void simpanBagian1({ hanyaLuar: true })}
              disabled={menyimpan}
              className="mt-2 rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
            >
              Coba simpan yang gagal saja
            </button>
          </div>
        )}
        {hasil?.kind === "GAGAL" && (
          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
            <p>Belum ada yang tersimpan: {hasil.pesan}</p>
            <button
              type="button"
              onClick={() => void simpanBagian1()}
              disabled={menyimpan}
              className="mt-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12] disabled:opacity-40"
            >
              Coba lagi
            </button>
          </div>
        )}
        {hasil?.kind === "BELUM_BERES" && (
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3 text-[13px] text-amber-100">
            Tersimpan, tapi hasilnya belum beres — lihat kotak merah di atas halaman.
          </div>
        )}
      </section>

      {/* ╔═══════════════ BAGIAN 2 ═══════════════╗
          Baris tabel ini adalah TUJUAN, bukan baris DB. Versi lamanya men-dump baris apa adanya,
          jadi kolom "Sumber" bisa berbunyi "baris tarif" tepat di atas baris yang tidak pernah
          dipakai siapa pun. Di sini tiap baris DIJALANKAN lewat cermin resolusi dulu. */}
      <section>
        <h2 className="text-[15px] font-bold text-white">Yang ditagihkan ke pembeli hari ini</h2>
        <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-zinc-400">
          Ini bukan isi tabelmu — ini angka yang benar-benar keluar di halaman pembayaran pembeli.
          Perhatikan kolom terakhir.
        </p>
        {memuat ? (
          <p className="py-10 text-center text-sm text-zinc-500">Memuat…</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-white/[0.07]">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                  <th className="px-4 py-3 font-semibold">Tujuan</th>
                  <th className="px-4 py-3 font-semibold">Ongkir</th>
                  <th className="px-4 py-3 font-semibold">Aturan yang dipakai</th>
                  <th className="px-4 py-3 font-semibold">Ditentukan oleh</th>
                </tr>
              </thead>
              <tbody>
                {tujuan.map((t) => {
                  const h = resolve(activeRows, t.provinsi);
                  const mati = !!t.asal && !!h && up(h.row.scope) !== up(t.asal.scope);
                  return (
                    <tr key={t.key} className="border-t border-white/[0.05] bg-[#100e08]/60">
                      <td className="px-4 py-3 text-[13px] text-zinc-200">{t.tampil}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-white">
                        {h ? rp(h.row.priceIdr) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-zinc-300">
                        {h ? namaBaris(h.row) : "—"}
                        {mati && t.asal && (
                          <>
                            <span
                              title="Kelompok ini belum berisi daerah mana pun, jadi tidak ada satu pun alamat yang bisa cocok dengannya. Harganya tersimpan, tapi tidak pernah dipakai."
                              className="ml-2 rounded-md border border-rose-400/40 bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-200"
                            >
                              TIDAK PERNAH TERPAKAI
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const asli = all.find((r) => r.scope === t.asal?.scope);
                                if (asli) bukaPanel(asli);
                              }}
                              className="ml-2 rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                            >
                              Betulkan
                            </button>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px]">
                        {h?.source === "KAMU" ? (
                          <span className="text-zinc-300">Kamu</span>
                        ) : (
                          <span className="font-semibold text-amber-300">Angka bawaan sistem</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Lapis 0 diakui SEKALI, terang-terangan — bukan sebagai catatan kaki di jalur bahagia,
            dan bukan ditebak dari potongan kalimat server. Status kurir yang SEBENARNYA hanya ada
            di teks server, dan teks itu dicetak utuh di Bagian 3e. */}
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-zinc-500">
          Belum termasuk ongkir otomatis dari kurir. Kalau kurirnya aktif dan berhasil menjawab,
          angka kurir yang dipakai. Status kurir yang sebenarnya ada di “Kenapa harganya bisa beda
          dari yang kamu tulis” di Pengaturan lanjutan.
        </p>

        {/* ── CEK SATU ALAMAT ── */}
        <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[13px] font-semibold text-zinc-200">Cek satu alamat</p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Ketik nama provinsi, lalu lihat pembeli di sana ditagih berapa.
          </p>
          <input
            value={cek}
            onChange={(e) => setCek(e.target.value)}
            placeholder="jabar"
            className="mt-2 w-full max-w-sm rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
          />
          {cekHasil && (
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">
              {cekHasil.source === "KAMU" ? (
                <>
                  Alamat “{cek.trim()}” ditagih {rp(cekHasil.row.priceIdr)} — kena aturan “
                  {namaBaris(cekHasil.row)}”.
                </>
              ) : (
                <>
                  Alamat “{cek.trim()}” ditagih {rp(cekHasil.row.priceIdr)} — TIDAK kena satu pun
                  aturanmu, jadi yang dipakai angka bawaan sistem.
                </>
              )}
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Yang dicocokkan cuma provinsinya, dan huruf besar-kecil tidak berpengaruh.
          </p>
        </div>
      </section>

      {/* ╔═══════════════ BAGIAN 3 — PENGATURAN LANJUTAN ═══════════════╗ */}
      <details
        ref={refLanjutan}
        open={lanjutanBuka}
        onToggle={(e) => setLanjutanBuka(e.currentTarget.open)}
        className="scroll-mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
      >
        <summary className="cursor-pointer text-[15px] font-bold text-white">
          Pengaturan lanjutan — harga khusus satu daerah, kelompok buatanmu, dan mematikan harga
        </summary>
        <p className="mt-1 text-[12px] text-zinc-500">
          Tidak perlu dibuka kalau dua angka di atas sudah cukup.
        </p>

        {pesanLanjutan && (
          <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-[13px] text-emerald-200">
            {pesanLanjutan}
          </p>
        )}
        {galatLanjutan && (
          <p className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-300">
            {galatLanjutan}
          </p>
        )}

        {/* ── 3a ── */}
        <div className="mt-5 rounded-xl border border-white/[0.07] bg-black/20 p-4">
          <h3 className="text-[14px] font-bold text-white">Harga khusus satu daerah</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
            Ada satu provinsi yang ongkirnya jauh berbeda? Beri harga sendiri. Harga ini menang atas
            semua pengaturan lain di halaman ini.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-zinc-300">Nama provinsi</span>
              <input
                value={f3a.prov}
                onChange={(e) => setF3a((f) => ({ ...f, prov: e.target.value }))}
                placeholder="Papua"
                className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
              />
              <span className="text-[11px] leading-relaxed text-zinc-600">
                Tulis satu provinsi saja, apa adanya. Sistem sudah menganggap “Papua”, “papua”, dan
                “PAPUA” sebagai daerah yang sama.
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] font-semibold text-zinc-300">Ongkir</span>
              {kotakHarga(f3a.harga, (v) => setF3a((f) => ({ ...f, harga: v })))}
            </div>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[12px] font-semibold text-zinc-300">
                Nama yang dilihat pembeli (boleh dikosongkan)
              </span>
              <input
                value={f3a.label}
                onChange={(e) => setF3a((f) => ({ ...f, label: e.target.value }))}
                placeholder="Papua"
                className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
              />
            </label>
          </div>
          <p className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
            ⚠ Harga ini hanya kena kalau alamat pembeli persis provinsi ini. Kalau daerah ini sering
            ditulis dengan nama lain, pakai “Kelompok daerah buatanmu” di bawah supaya semua cara
            penulisannya ikut tertangkap.
          </p>
          <button
            type="button"
            disabled={menyimpan || !f3a.prov.trim()}
            onClick={() => {
              const v = parseRp(f3a.harga);
              const e = cekHarga(f3a.harga, v);
              if (e) {
                setGalatLanjutan(e);
                return;
              }
              void kirim(
                {
                  // Nama internal dirakit di belakang layar; server yang menormalkan isinya.
                  scope: kit.state + f3a.prov.trim(),
                  priceIdr: v,
                  ...(f3a.label.trim() ? { label: f3a.label.trim() } : {}),
                },
                `Tersimpan. Pembeli di ${titleCase(f3a.prov.trim())} sekarang ditagih ${rp(v)}.`,
              ).then((ok) => {
                if (ok) setF3a({ prov: "", harga: "", label: "" });
              });
            }}
            className="mt-3 rounded-xl bg-[#F2C101] px-4 py-2 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
          >
            Simpan harga daerah ini
          </button>
        </div>

        {/* ── 3b ── */}
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
          <h3 className="text-[14px] font-bold text-white">Kelompok daerah buatanmu</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
            Kalau pembagian Jawa / luar Jawa kurang cocok, buat kelompok sendiri — misalnya
            “Sumatera” atau “Indonesia Timur”.
          </p>
          {(() => {
            const slug = slugKelompok(f3b.nama);
            const scope3b = kit.tier + slug;
            const bentrok = slug !== "" && all.some((r) => up(r.scope) === up(scope3b));
            const prov3b = parseProvinces(f3b.provincesText);
            /* PAGAR: kelompok tanpa daerah = harga yang tersimpan dan diam saja. Diblokir DI
               PEMBUATAN, dengan dua tombol yang MENYELESAIKAN — bukan dengan peringatan yang
               bisa ditekan lewat. */
            const terkunci = prov3b.length === 0 && !f3b.fallback && f3b.active;
            return (
              <>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold text-zinc-300">
                      Nama kelompok (dilihat pembeli)
                    </span>
                    <input
                      value={f3b.nama}
                      onChange={(e) => setF3b((f) => ({ ...f, nama: e.target.value }))}
                      placeholder="Indonesia Timur"
                      className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                    />
                    <span className="font-mono text-[11px] text-zinc-600">
                      Nama internal: {scope3b} — dipakai sistem, tidak dilihat pembeli.
                    </span>
                    {bentrok && (
                      <span className="text-[11px] leading-relaxed text-amber-300">
                        Sudah ada kelompok dengan nama internal yang sama. Kalau disimpan, kelompok
                        yang lama diganti dengan yang ini.
                      </span>
                    )}
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-semibold text-zinc-300">Ongkir</span>
                    {kotakHarga(f3b.harga, (v) => setF3b((f) => ({ ...f, harga: v })))}
                  </div>
                </div>

                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Daerah yang masuk kelompok ini
                  </span>
                  <textarea
                    ref={refProv3b}
                    value={f3b.provincesText}
                    onChange={(e) => setF3b((f) => ({ ...f, provincesText: e.target.value }))}
                    rows={3}
                    placeholder="jawa barat, jabar, west java"
                    className="w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                  />
                  <span className="text-[11px] leading-relaxed text-zinc-600">
                    Satu per baris, atau dipisah koma. Tulis SEMUA cara orang mengetik nama daerah
                    itu — termasuk singkatan dan nama Inggrisnya — karena kolom provinsi di alamat
                    pembeli isinya ketikan bebas. Untuk Jawa Barat misalnya: jawa barat, jabar, west
                    java. Daftar yang cuma memuat nama resmi akan melempar sebagian pembeli ke
                    kelompok yang lebih mahal.
                  </span>
                </label>

                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Catatan untuk diri sendiri (tidak dilihat pembeli)
                  </span>
                  <input
                    value={f3b.note}
                    onChange={(e) => setF3b((f) => ({ ...f, note: e.target.value }))}
                    placeholder="JNE REG, harga Oktober 2026"
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-white/25"
                  />
                </label>

                <div className="mt-3 flex flex-col gap-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={f3b.fallback}
                      onChange={(e) => setF3b((f) => ({ ...f, fallback: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-[#F2C101]"
                    />
                    <span>
                      <span className="text-[12px] font-semibold text-zinc-300">
                        Pakai harga ini untuk daerah yang belum diatur
                      </span>
                      <span className="block text-[11px] leading-relaxed text-zinc-600">
                        Hanya boleh satu. Menyalakannya di sini otomatis mematikannya di kelompok
                        lain. Sebaiknya pilih kelompok yang PALING MAHAL, supaya daerah yang belum
                        sempat kamu daftarkan tidak pernah ditagih kurang.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={f3b.active}
                      onChange={(e) => setF3b((f) => ({ ...f, active: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 accent-[#F2C101]"
                    />
                    <span>
                      <span className="text-[12px] font-semibold text-zinc-300">Sedang dipakai</span>
                      <span className="block text-[11px] text-zinc-600">
                        Matikan kalau mau menyimpan aturannya tapi belum mau memakainya.
                      </span>
                    </span>
                  </label>
                </div>

                {terkunci && (
                  <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/[0.10] px-4 py-3 text-[13px] leading-relaxed text-rose-100">
                    <p className="font-bold">Tunggu — aturan ini tidak akan pernah terpakai</p>
                    <p className="mt-1">
                      Kelompok daerah cuma kena kalau alamat pembeli ada di daftarnya, dan daftar
                      ini kosong. Harganya akan tersimpan dan diam saja: tidak ada satu pun alamat
                      yang bisa cocok dengannya, dan pembeli tetap ditagih angka yang lama. Pilih
                      salah satu:
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => refProv3b.current?.focus()}
                        className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                      >
                        Tulis daerahnya sekarang
                      </button>
                      <button
                        type="button"
                        onClick={() => setF3b((f) => ({ ...f, fallback: true }))}
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Jadikan harga untuk daerah yang belum diatur
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={menyimpan || terkunci || slug === ""}
                  onClick={() => {
                    const v = parseRp(f3b.harga);
                    const e = cekHarga(f3b.harga, v);
                    if (e) {
                      setGalatLanjutan(e);
                      return;
                    }
                    if (MAX_PROV !== null && prov3b.length > MAX_PROV) {
                      setGalatLanjutan(`Maksimal ${MAX_PROV} cara penulisan per kelompok.`);
                      return;
                    }
                    void kirim(
                      {
                        scope: scope3b,
                        priceIdr: v,
                        provinces: prov3b,
                        label: f3b.nama.trim(),
                        ...(f3b.note.trim() ? { note: f3b.note.trim() } : {}),
                        fallback: f3b.fallback,
                        active: f3b.active,
                      },
                      `Tersimpan. Kelompok “${f3b.nama.trim()}” sekarang ${rp(v)}.`,
                    ).then((ok) => {
                      if (ok)
                        setF3b({
                          nama: "",
                          harga: "",
                          provincesText: "",
                          note: "",
                          fallback: false,
                          active: true,
                        });
                    });
                  }}
                  className="mt-3 rounded-xl bg-[#F2C101] px-4 py-2 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Simpan kelompok
                </button>
              </>
            );
          })()}
        </div>

        {/* ── 3c ── */}
        <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
          <h3 className="text-[14px] font-bold text-white">Harga sama untuk seluruh Indonesia</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
            Satu angka untuk semua alamat. Hanya dipakai kalau tidak ada pengaturan lain yang cocok.
          </p>
          <div className="mt-3 max-w-[220px]">
            <span className="text-[12px] font-semibold text-zinc-300">Ongkir</span>
            {kotakHarga(f3c.harga, (v) => setF3c({ harga: v }))}
          </div>
          <button
            type="button"
            disabled={menyimpan}
            onClick={() => {
              const v = parseRp(f3c.harga);
              const e = cekHarga(f3c.harga, v);
              if (e) {
                setGalatLanjutan(e);
                return;
              }
              void kirim(
                { scope: kit.nationwide, priceIdr: v },
                `Tersimpan. Harga seluruh Indonesia sekarang ${rp(v)}.`,
              ).then((ok) => {
                if (ok) setF3c({ harga: "" });
              });
            }}
            className="mt-3 rounded-xl bg-[#F2C101] px-4 py-2 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:opacity-40"
          >
            Simpan harga nasional
          </button>
        </div>

        {/* ── 3d ── */}
        <div className="mt-4">
          <h3 className="text-[14px] font-bold text-white">Semua pengaturan ongkir</h3>
          <p className="mt-1 text-[12px] text-zinc-500">
            Termasuk yang sedang dimatikan. Klik angkanya untuk mengganti harga.
          </p>

          {all.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center text-[13px] leading-relaxed text-zinc-500">
              Belum ada satu pun pengaturan ongkir. Pembeli sedang ditagih angka bawaan sistem —
              lihat kotak merah di atas halaman.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl border border-white/[0.07]">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-white/[0.04] text-[12px] uppercase tracking-wide text-zinc-400">
                    <th className="px-4 py-3 font-semibold">Nama</th>
                    <th className="px-4 py-3 font-semibold">Ongkir</th>
                    <th className="px-4 py-3 font-semibold">Berlaku untuk</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Terakhir diubah</th>
                    <th className="px-4 py-3 font-semibold">Catatan</th>
                    <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((r) => (
                    <tr key={r.scope} className="border-t border-white/[0.05] bg-[#100e08]/60">
                      <td className="px-4 py-3">
                        <div className="text-[13px] text-zinc-200">{namaBaris(r)}</div>
                        <div className="font-mono text-[11px] text-zinc-600">
                          Nama internal: {r.scope} — dipakai sistem, tidak dilihat pembeli.
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {ubahHarga?.scope === r.scope ? (
                          <div
                            className="flex items-center gap-1.5"
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setUbahHarga(null);
                              if (e.key === "Enter") {
                                const v = parseRp(ubahHarga.teks);
                                const err = cekHarga(ubahHarga.teks, v);
                                if (err) {
                                  setGalatLanjutan(err);
                                  return;
                                }
                                void kirim(
                                  { scope: r.scope, priceIdr: v },
                                  `Tersimpan. “${namaBaris(r)}” sekarang ${rp(v)}.`,
                                ).then((ok) => {
                                  if (ok) setUbahHarga(null);
                                });
                              }
                            }}
                          >
                            <span className="text-[12px] text-zinc-500">Rp</span>
                            <input
                              value={ubahHarga.teks}
                              autoFocus
                              onChange={(e) =>
                                setUbahHarga({ scope: r.scope, teks: e.target.value })
                              }
                              className="w-24 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-[13px] tabular-nums text-zinc-100 outline-none focus:border-white/30"
                            />
                            <button
                              type="button"
                              disabled={menyimpan}
                              onClick={() => {
                                const v = parseRp(ubahHarga.teks);
                                const err = cekHarga(ubahHarga.teks, v);
                                if (err) {
                                  setGalatLanjutan(err);
                                  return;
                                }
                                void kirim(
                                  { scope: r.scope, priceIdr: v },
                                  `Tersimpan. “${namaBaris(r)}” sekarang ${rp(v)}.`,
                                ).then((ok) => {
                                  if (ok) setUbahHarga(null);
                                });
                              }}
                              className="rounded-md bg-[#F2C101] px-2 py-1 text-[11px] font-bold text-[#171717] disabled:opacity-40"
                            >
                              Simpan
                            </button>
                            <button
                              type="button"
                              onClick={() => setUbahHarga(null)}
                              className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] font-semibold text-zinc-300"
                            >
                              Batal
                            </button>
                            <span className="ml-1 text-[10px] text-zinc-600">
                              Enter untuk simpan, Esc untuk batal. Yang berubah cuma harganya.
                            </span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setUbahHarga({ scope: r.scope, teks: String(r.priceIdr) })}
                            className="font-semibold tabular-nums text-white underline decoration-white/20 underline-offset-4 hover:decoration-white/60"
                          >
                            {rp(r.priceIdr)}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[12px] text-zinc-400">{berlakuUntuk(r)}</td>
                      <td className="px-4 py-3 text-[12px]">
                        <span className={r.active ? "text-emerald-300" : "text-zinc-500"}>
                          {r.active ? "Dipakai" : "Dimatikan"}
                        </span>
                        {r.placeholder && (
                          <span className="ml-2 rounded-md border border-rose-400/40 bg-rose-400/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                            BELUM KAMU ISI
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-zinc-500">
                        {tanggal(r.updatedAt)}
                        {r.updatedBy ? ` oleh ${r.updatedBy}` : ""}
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-[12px] text-zinc-500">
                        {r.note ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => bukaPanel(r)}
                          className="rounded-lg bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                        >
                          Ubah
                        </button>
                        <button
                          type="button"
                          disabled={menyimpan}
                          onClick={() =>
                            void kirim(
                              { scope: r.scope, priceIdr: r.priceIdr, active: !r.active },
                              r.active
                                ? `“${namaBaris(r)}” dimatikan.`
                                : `“${namaBaris(r)}” dipakai lagi.`,
                            )
                          }
                          className="ml-2 rounded-lg bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12] disabled:opacity-40"
                        >
                          {r.active ? "Matikan" : "Nyalakan"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── PANEL UBAH ── */}
          {panel && panelBaris && (
            <div className="mt-4 rounded-xl border border-white/12 bg-black/30 p-4">
              <h4 className="text-[13px] font-bold text-white">Ubah “{namaBaris(panelBaris)}”</h4>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-600">
                Nama internal: {panel.scope} — dipakai sistem, tidak dilihat pembeli.
              </p>

              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-zinc-300">Ongkir</span>
                  {kotakHarga(panel.harga, (v) => setPanel((p) => (p ? { ...p, harga: v } : p)))}
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Nama yang dilihat pembeli
                  </span>
                  <input
                    value={panel.label}
                    onChange={(e) => setPanel((p) => (p ? { ...p, label: e.target.value } : p))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-white/25"
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Catatan untuk diri sendiri (tidak dilihat pembeli)
                  </span>
                  <input
                    value={panel.note}
                    onChange={(e) => setPanel((p) => (p ? { ...p, note: e.target.value } : p))}
                    className="rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 outline-none focus:border-white/25"
                  />
                </label>
              </div>

              {isGroup(panel, kit) && (
                <div className="mt-3">
                  <p className="text-[12px] text-zinc-300">
                    Daerah yang masuk kelompok ini: {panelBaris.provinces.length} cara penulisan
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel((p) => (p ? { ...p, lihatDaftar: !p.lihatDaftar } : p))}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                    >
                      Lihat daftarnya
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPanel((p) => (p ? { ...p, ubahDaftar: true } : p));
                        requestAnimationFrame(() => refProvPanel.current?.focus());
                      }}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                    >
                      Ubah daftar daerah
                    </button>
                  </div>
                  {/* Dua kalimat, bukan lima. Yang perlu diketahui orang yang cuma mau membetulkan
                      harga adalah: daftarnya aman. */}
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-600">
                    Selama tombol “Ubah daftar daerah” tidak kamu tekan, daftarnya tidak berubah
                    sama sekali — jadi aman untuk sekadar membetulkan harganya.
                  </p>
                  {panel.lihatDaftar && !panel.ubahDaftar && (
                    <p className="mt-2 rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                      {panelBaris.provinces.length > 0 ? panelBaris.provinces.join(", ") : "—"}
                    </p>
                  )}
                  {panel.ubahDaftar && (
                    <textarea
                      ref={refProvPanel}
                      value={panel.provincesText}
                      onChange={(e) =>
                        setPanel((p) => (p ? { ...p, provincesText: e.target.value } : p))
                      }
                      rows={3}
                      className="mt-2 w-full rounded-lg border border-white/12 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-zinc-100 outline-none focus:border-white/25"
                    />
                  )}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={panel.fallback}
                    onChange={(e) =>
                      setPanel((p) => (p ? { ...p, fallback: e.target.checked } : p))
                    }
                    className="mt-0.5 h-4 w-4 accent-[#F2C101]"
                  />
                  <span className="text-[12px] font-semibold text-zinc-300">
                    Pakai harga ini untuk daerah yang belum diatur
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={panel.active}
                    onChange={(e) => setPanel((p) => (p ? { ...p, active: e.target.checked } : p))}
                    className="mt-0.5 h-4 w-4 accent-[#F2C101]"
                  />
                  <span className="text-[12px] font-semibold text-zinc-300">Sedang dipakai</span>
                </label>
              </div>

              {panelMengosongkan && (
                <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-400/[0.08] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
                  <p>Kamu mengosongkan daftar daerahnya. {akibatPengosongan}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPanel((p) =>
                          p
                            ? { ...p, provincesText: panelBaris.provinces.join(", "), ubahDaftar: false }
                            : p,
                        )
                      }
                      className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                    >
                      Batalkan pengosongan
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanel((p) => (p ? { ...p, akuiKosong: true } : p))}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                    >
                      Saya paham, tetap kosongkan
                    </button>
                  </div>
                </div>
              )}

              {panelTerkunci && (
                <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/[0.10] px-4 py-3 text-[13px] leading-relaxed text-rose-100">
                  <p className="font-bold">Tunggu — aturan ini tidak akan pernah terpakai</p>
                  <p className="mt-1">
                    Kelompok daerah cuma kena kalau alamat pembeli ada di daftarnya, dan daftar ini
                    kosong. Harganya akan tersimpan dan diam saja: tidak ada satu pun alamat yang
                    bisa cocok dengannya, dan pembeli tetap ditagih angka yang lama. Pilih salah
                    satu:
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPanel((p) => (p ? { ...p, ubahDaftar: true } : p));
                        requestAnimationFrame(() => refProvPanel.current?.focus());
                      }}
                      className="rounded-lg bg-[#F2C101] px-3 py-1.5 text-[12px] font-bold text-[#171717] transition hover:brightness-105"
                    >
                      Tulis daerahnya sekarang
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanel((p) => (p ? { ...p, fallback: true } : p))}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                    >
                      Jadikan harga untuk daerah yang belum diatur
                    </button>
                    {up(panel.scope) === JAWA && (
                      <button
                        type="button"
                        onClick={() =>
                          setPanel((p) =>
                            p
                              ? {
                                  ...p,
                                  ubahDaftar: true,
                                  provincesText: data.example.jawa.provinces.join(", "),
                                }
                              : p,
                          )
                        }
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Pakai daftar daerah Jawa bawaan ({data.example.jawa.provinces.length} cara
                        penulisan)
                      </button>
                    )}
                    {panelBaris.provinces.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPanel((p) =>
                            p
                              ? {
                                  ...p,
                                  ubahDaftar: false,
                                  provincesText: panelBaris.provinces.join(", "),
                                }
                              : p,
                          )
                        }
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.12]"
                      >
                        Batalkan pengosongan
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={menyimpan || panelTerkunci}
                  onClick={() => void simpanPanel()}
                  className="rounded-xl bg-[#F2C101] px-4 py-2 text-[13px] font-bold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {menyimpan ? "Menyimpan…" : "Simpan perubahan"}
                </button>
                <button
                  type="button"
                  onClick={() => setPanel(null)}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/[0.08]"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── 3e ── */}
        <details
          open={kenapaBuka}
          onToggle={(e) => setKenapaBuka(e.currentTarget.open)}
          className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4"
        >
          <summary className="cursor-pointer text-[14px] font-bold text-white">
            Kenapa harganya bisa beda dari yang kamu tulis
          </summary>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
            Kalau satu alamat cocok ke beberapa pengaturan sekaligus, sistem memilih yang paling
            khusus, berurutan dari atas:
          </p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12px] leading-relaxed text-zinc-400">
            <li>Harga asli dari kurir, kalau kurirnya bisa menghitungnya saat itu juga</li>
            <li>Harga khusus untuk provinsi itu</li>
            <li>Harga kelompok yang memuat provinsi itu</li>
            <li>Harga untuk daerah lainnya</li>
            <li>Harga sama untuk seluruh Indonesia</li>
            <li>Angka bawaan sistem — kalau semua di atas kosong</li>
          </ol>
          <p className="mt-1.5 text-[12px] text-zinc-400">Yang pertama ketemu, itu yang dipakai.</p>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
            Nomor 1 tidak selalu jalan. Kalau saldo akun kurir habis, kuotanya lewat, atau layanannya
            sedang mati, sistem langsung turun ke nomor 2. Karena itu angka di halaman ini tetap
            harus diisi walaupun kurirnya sudah terhubung — justru di saat kurirnya bermasalah,
            halaman inilah yang menentukan tagihan.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">
            Satu lagi yang tidak kelihatan dari halaman ini: kalau ongkir flat dipasang lewat setelan
            server, ia dipakai sebelum angka bawaan sistem. Kalau angka di kotak “Cek satu alamat”
            terasa aneh, cek setelan server itu dulu.
          </p>
          {(data.resolution || data.note) && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-zinc-600 hover:text-zinc-400">
                Keterangan apa adanya dari sistem
              </summary>
              {/* TANPA DIUBAH. Kalimat inilah satu-satunya yang tahu kurirnya sedang hidup atau
                  mati — menebaknya dari potongan teks di klien akan melahirkan klaim yang salah. */}
              {data.resolution && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{data.resolution}</p>
              )}
              {data.note && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{data.note}</p>
              )}
            </details>
          )}
        </details>

        {/* ── 3f ── */}
        <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-4">
          <summary className="cursor-pointer text-[14px] font-bold text-white">
            Hal kecil yang sering ditanyakan
          </summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[12px] leading-relaxed text-zinc-400">
            <li>
              Perubahan berlaku untuk tagihan berikutnya. Tagihan yang sudah terbit tidak berubah —
              nominalnya sudah tercetak di tagihan itu.
            </li>
            <li>
              Menyimpan dengan nama yang sama akan menimpa pengaturan lama, bukan membuat yang baru.
              Jadi menekan Simpan dua kali tidak menggandakan apa pun.
            </li>
            <li>
              Alamat di luar Indonesia tidak ditagih ongkir di sini — permintaan kirimnya ditolak
              lebih dulu.
            </li>
            <li>
              Alamat Indonesia yang kolom provinsinya kosong tetap dilayani, dan ikut harga “daerah
              lainnya”.
            </li>
            <li>
              Huruf besar-kecil, titik, dan spasi ganda tidak berpengaruh. “D.K.I. Jakarta” dan “dki
              jakarta” dianggap sama.
            </li>
            <li>
              Tidak ada uang Hoshi yang tersentuh di halaman ini. Yang kamu atur murni angka Rupiah
              yang ditagihkan ke pembeli.
            </li>
          </ul>
        </details>
      </details>
    </>
  );
}
