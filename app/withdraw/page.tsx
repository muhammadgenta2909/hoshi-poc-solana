"use client";

// Withdraw / kirim kartu fisik ke rumah (redeem). REAL end-to-end:
//   step 1 alamat kirim (getMyAddresses + addAddress)  ·  step 2 pilih kartu (getMyPacks) ·
//   step 3 review  ·  step 4 submit → requestRedemption per kartu.
//
// Yang bisa dikirim HANYA kartu HASIL PACK (backend memverifikasi kepemilikan lewat ledger
// ccPackPurchase OPENED — kartu beli-marketplace tidak diterima). RECORD-ONLY di server: mencatat
// permintaan + tujuan, TIDAK burn/transfer NFT — jadi aman di staging (mock) maupun prod.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ApiError,
  addAddress,
  getMyAddresses,
  getMyPacks,
  getMyPurchases,
  getMyRedemptions,
  requestRedemption,
  type CardRedemption,
  type NewAddressInput,
  type ShippingAddress,
} from "@/lib/api";
import type { Listing } from "@/lib/market";
import type { GachaPull } from "@/lib/gacha";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import {
  AccountShell,
  Panel,
  SectionTitle,
  StepBar,
  TextInput,
  PrimaryButton,
  GhostButton,
  ModalShell,
  PlusIcon,
  SearchIcon,
} from "@/components/account/ui";
import { Img } from "@/components/packs/ui";

const TOTAL = 4;

const STEP_TITLE: Record<number, string> = {
  1: "Mau dikirim ke mana?",
  2: "Pilih kartu yang mau dikirim",
  3: "Cek dulu pengirimanmu",
  4: "Konfirmasi & kirim",
};

/** Kartu siap-kirim (turunan dari pull yang OPENED + punya nftAddress). */
type PickCard = { nftAddress: string; name: string; image: string | null; set: string | null };

const toPickCard = (p: GachaPull): PickCard => ({
  nftAddress: p.nftAddress as string,
  name: p.ccItemName ?? p.nftName ?? "Kartu",
  image: p.nftImage,
  set: p.ccSet,
});

/** Kartu HASIL-BELI (Listing SOLD milik user) → PickCard. null kalau tak punya alamat NFT. */
const boughtToPickCard = (l: Listing): PickCard | null => {
  const nftAddress = l.nft?.assetAddress ?? l.ccNftAddress;
  if (!nftAddress) return null;
  return { nftAddress, name: l.name, image: l.image, set: l.set ?? l.category ?? null };
};

const addrLine = (a: ShippingAddress) =>
  [a.city, a.state, a.country].filter(Boolean).join(", ");

export default function WithdrawPage() {
  const { token, hydrated, login } = useAuth();
  const { setVisible } = useWalletConnect();

  const [step, setStep] = useState(1);
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddr, setSelectedAddr] = useState<string>("");
  const [cards, setCards] = useState<PickCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ------- load: alamat + kartu pack + redemption aktif (buat exclude yang lagi dikirim) -------
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [addrs, packs, bought, reds] = await Promise.all([
        getMyAddresses(token).catch(() => [] as ShippingAddress[]),
        getMyPacks(token).catch(() => [] as GachaPull[]),
        getMyPurchases(token).catch(() => [] as Listing[]),
        getMyRedemptions(token).catch(() => [] as CardRedemption[]),
      ]);
      setAddresses(addrs);
      setSelectedAddr((cur) =>
        cur && addrs.some((a) => a.id === cur)
          ? cur
          : (addrs.find((a) => a.isDefault) ?? addrs[0])?.id ?? "",
      );
      // Kartu SUDAH punya permintaan kirim aktif → sembunyikan (backend juga menolak dobel).
      const busy = new Set(
        reds.filter((r) => r.status !== "CANCELED").map((r) => r.nftAddress),
      );
      // Gabung kartu HASIL-PACK + HASIL-BELI (keduanya kartu vault yang boleh dikirim), dedupe by
      // nftAddress, buang yang sedang diproses kirim.
      const pickList = [
        ...packs.filter((p) => p.status === "OPENED" && !!p.nftAddress).map(toPickCard),
        ...bought.map(boughtToPickCard).filter((c): c is PickCard => c !== null),
      ];
      const seen = new Set<string>();
      setCards(
        pickList.filter((c) => {
          if (busy.has(c.nftAddress) || seen.has(c.nftAddress)) return false;
          seen.add(c.nftAddress);
          return true;
        }),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Gagal memuat data.");
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

  const back = () => setStep((s) => Math.max(1, s - 1));
  const next = () => setStep((s) => Math.min(TOTAL, s + 1));

  const toggle = (nftAddress: string) =>
    setSelected((prev) => {
      const nextSet = new Set(prev);
      if (nextSet.has(nftAddress)) nextSet.delete(nftAddress);
      else nextSet.add(nftAddress);
      return nextSet;
    });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.set ?? "").toLowerCase().includes(q),
    );
  }, [cards, search]);

  const selectedCards = useMemo(
    () => cards.filter((c) => selected.has(c.nftAddress)),
    [cards, selected],
  );
  const activeAddr = addresses.find((a) => a.id === selectedAddr) ?? null;

  const submit = async () => {
    if (!token || !selectedAddr || selectedCards.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const results = await Promise.allSettled(
      selectedCards.map((c) =>
        requestRedemption({ nftAddress: c.nftAddress, shippingAddressId: selectedAddr }, token),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    setSubmitting(false);
    if (failed.length > 0) {
      const first = failed[0] as PromiseRejectedResult;
      setSubmitError(
        `${results.length - failed.length}/${results.length} kartu terkirim. ` +
          `Sisanya gagal: ${first.reason instanceof Error ? first.reason.message : "coba lagi."}`,
      );
      await load(); // yang sukses hilang dari daftar; sisakan yang gagal untuk dicoba lagi
      setSelected(new Set());
      setStep(2);
      return;
    }
    // Semua sukses → reset + flash.
    setSelected(new Set());
    setStep(1);
    setFlash(`${results.length} kartu diajukan untuk dikirim. Kami proses & kabari statusnya.`);
    window.setTimeout(() => setFlash(""), 3200);
    await load();
  };

  // -------------------------------- gate: butuh login --------------------------------
  if (hydrated && !token) {
    return (
      <AccountShell active="Vault" wide>
        <WithdrawHeader />
        <Panel className="mx-auto mt-8 max-w-md p-8 text-center">
          <p className="mb-4 text-sm text-zinc-400">Masuk dulu untuk mengirim kartumu ke rumah.</p>
          <PrimaryButton
            onClick={() => {
              if (token) return;
              setVisible(true);
              void login().catch(() => {});
            }}
          >
            Hubungkan Wallet
          </PrimaryButton>
        </Panel>
      </AccountShell>
    );
  }

  return (
    <AccountShell active="Vault" wide>
      <WithdrawHeader />

      <div className="mt-5 max-w-[520px]">
        <StepBar step={step} total={TOTAL} />
        <p className="mt-2 text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500">
          Step {step} of {TOTAL}
        </p>
      </div>

      {flash && (
        <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-emerald-300">
          <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20">
            ✓
          </span>
          {flash}
        </div>
      )}

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-white sm:text-xl">{STEP_TITLE[step]}</h2>

        {/* --------------------------- STEP 1: alamat --------------------------- */}
        {step === 1 && (
          <>
            <SectionTitle>Alamat pengiriman</SectionTitle>
            <Panel className="mt-3 p-4 sm:p-5">
              {loading ? (
                <p className="py-8 text-center text-sm text-zinc-500">Memuat alamat…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((a) => {
                    const on = a.id === selectedAddr;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setSelectedAddr(a.id)}
                        className={`group flex flex-col gap-1.5 rounded-2xl border p-4 text-left transition ${
                          on
                            ? "border-emerald-500/50 bg-emerald-500/[0.06]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[15px] font-semibold text-zinc-100">{a.fullName}</span>
                          {a.isDefault && (
                            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                              Utama
                            </span>
                          )}
                        </div>
                        <span className="text-[13px] leading-relaxed text-zinc-400">
                          {a.street}
                          {a.apt ? `, ${a.apt}` : ""} — {addrLine(a)} {a.zip}
                        </span>
                        <span
                          className={`mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium ${
                            on ? "text-emerald-300" : "text-zinc-500"
                          }`}
                        >
                          <span
                            className={`grid h-4 w-4 place-items-center rounded-full border text-[9px] ${
                              on ? "border-emerald-400 bg-emerald-400 text-[#0a0907]" : "border-white/25 text-transparent"
                            }`}
                          >
                            ✓
                          </span>
                          {on ? "Dipilih" : "Kirim ke sini"}
                        </span>
                      </button>
                    );
                  })}

                  <AddAddressButton token={token} onAdded={load} />
                </div>
              )}
              {loadError && <p className="mt-3 text-[13px] text-red-400">{loadError}</p>}
            </Panel>

            <BottomBar
              right={
                <PrimaryButton onClick={next} disabled={!selectedAddr}>
                  Pilih kartu →
                </PrimaryButton>
              }
            />
          </>
        )}

        {/* --------------------------- STEP 2: pilih kartu --------------------------- */}
        {step === 2 && (
          <>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <SearchIcon className="h-4 w-4" />
                </span>
                <TextInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari kartu…"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
              <div>
                {loading ? (
                  <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02]">
                    <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/25 border-t-yellow-400" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-white/[0.05] bg-white/[0.02] px-6 py-16 text-center">
                    <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-600">
                      <SearchIcon className="h-6 w-6" />
                    </div>
                    <p className="text-[15px] font-semibold text-zinc-300">
                      {cards.length === 0 ? "Belum ada kartu yang bisa dikirim." : "Tak ada yang cocok."}
                    </p>
                    <p className="mt-1 max-w-sm text-[13px] text-zinc-500">
                      {cards.length === 0
                        ? "Hanya kartu hasil buka pack yang bisa dikirim fisik. Buka pack dulu di Games."
                        : "Coba kata kunci lain."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filtered.map((c) => {
                      const on = selected.has(c.nftAddress);
                      return (
                        <button
                          key={c.nftAddress}
                          type="button"
                          onClick={() => toggle(c.nftAddress)}
                          className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                            on
                              ? "border-yellow-400/70 bg-yellow-400/[0.06]"
                              : "border-white/10 bg-white/[0.02] hover:border-white/25"
                          }`}
                        >
                          <div className="aspect-[5/7] w-full overflow-hidden bg-white/[0.03]">
                            <Img
                              src={c.image ?? "/card-back.svg"}
                              alt={c.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="p-2.5">
                            <p className="truncate text-[12px] font-semibold text-zinc-100" title={c.name}>
                              {c.name}
                            </p>
                            {c.set && <p className="truncate text-[10px] text-zinc-500">{c.set}</p>}
                          </div>
                          <span
                            className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border text-[11px] font-bold transition ${
                              on
                                ? "border-yellow-400 bg-yellow-400 text-[#171717]"
                                : "border-white/25 bg-black/50 text-transparent group-hover:text-white/40"
                            }`}
                          >
                            ✓
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <Panel className="p-5">
                <SectionTitle>Pengirimanmu</SectionTitle>
                <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
                  {selected.size === 0
                    ? "Ketuk kartu di kiri untuk menambahkannya."
                    : `${selected.size} kartu siap dikirim ke ${activeAddr?.city ?? "alamatmu"}.`}
                </p>
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-zinc-500">Kartu</span>
                    <span className="font-semibold text-zinc-200">{selected.size}</span>
                  </div>
                </div>
              </Panel>
            </div>

            <BottomBar
              left={<GhostButton onClick={back}>Kembali</GhostButton>}
              right={
                <PrimaryButton onClick={next} disabled={selected.size === 0}>
                  Review →
                </PrimaryButton>
              }
            />
          </>
        )}

        {/* --------------------------- STEP 3: review --------------------------- */}
        {step === 3 && (
          <>
            <Panel className="mt-4 p-6">
              <SectionTitle>Ringkasan</SectionTitle>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-[12px] uppercase tracking-wide text-zinc-500">Dikirim ke</p>
                  {activeAddr ? (
                    <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-300">
                      <p className="font-semibold text-zinc-100">{activeAddr.fullName}</p>
                      <p>
                        {activeAddr.street}
                        {activeAddr.apt ? `, ${activeAddr.apt}` : ""}
                      </p>
                      <p>
                        {addrLine(activeAddr)} {activeAddr.zip}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[13px] text-red-400">Alamat belum dipilih.</p>
                  )}
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-wide text-zinc-500">
                    Kartu ({selectedCards.length})
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {selectedCards.map((c) => (
                      <div key={c.nftAddress} className="flex items-center gap-2.5">
                        <Img
                          src={c.image ?? "/card-back.svg"}
                          alt=""
                          className="h-10 w-[30px] shrink-0 rounded object-cover"
                        />
                        <span className="truncate text-[13px] text-zinc-200">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
            <BottomBar
              left={<GhostButton onClick={back}>Kembali</GhostButton>}
              right={<PrimaryButton onClick={next}>Lanjut →</PrimaryButton>}
            />
          </>
        )}

        {/* --------------------------- STEP 4: konfirmasi --------------------------- */}
        {step === 4 && (
          <>
            <Panel className="mt-4 p-6">
              <SectionTitle>Konfirmasi & kirim</SectionTitle>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                Kami akan memproses pengiriman <span className="font-semibold text-zinc-200">{selectedCards.length} kartu</span>{" "}
                ke <span className="font-semibold text-zinc-200">{activeAddr?.city ?? "alamatmu"}</span>. Kartu tetap
                aman di vault sampai kami packing — statusnya bisa kamu pantau di Aktivitas.
              </p>
              {submitError && <p className="mt-3 text-[13px] text-red-400">{submitError}</p>}
            </Panel>
            <BottomBar
              left={<GhostButton onClick={back} disabled={submitting}>Kembali</GhostButton>}
              right={
                <PrimaryButton onClick={submit} disabled={submitting || selectedCards.length === 0}>
                  {submitting ? "Mengirim…" : "Kirim sekarang"}
                </PrimaryButton>
              }
            />
          </>
        )}
      </div>
    </AccountShell>
  );
}

function WithdrawHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-[28px]">Kirim Kartu ke Rumah</h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Minta kartu fisik hasil pack-mu dikirim ke alamatmu.
        </p>
      </div>
      <Link href="/vault" className="text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200">
        ← Kembali ke Vault
      </Link>
    </div>
  );
}

/** Tombol + modal tambah alamat (fullName, negara, kota, jalan, kodepos — field wajib backend). */
function AddAddressButton({ token, onAdded }: { token: string | null; onAdded: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewAddressInput>({
    fullName: "",
    country: "Indonesia",
    street: "",
    city: "",
    zip: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid =
    form.fullName.trim() && form.country.trim() && form.street.trim() && form.city.trim() && form.zip.trim();

  const save = async () => {
    if (!token || !valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await addAddress(
        {
          fullName: form.fullName.trim(),
          country: form.country.trim(),
          street: form.street.trim(),
          city: form.city.trim(),
          zip: form.zip.trim(),
          isDefault: true,
        },
        token,
      );
      setOpen(false);
      setForm({ fullName: "", country: "Indonesia", street: "", city: "", zip: "" });
      await onAdded();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  // Hanya field bertipe string (isDefault boolean tidak lewat sini).
  type StrKey = "fullName" | "country" | "street" | "city" | "zip";
  const field = (label: string, key: StrKey, placeholder: string) => (
    <div>
      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">{label}</label>
      <TextInput
        value={form[key] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.01] p-4 text-zinc-400 transition hover:border-yellow-400/40 hover:text-yellow-300"
      >
        <PlusIcon className="h-5 w-5" />
        <span className="text-[13px] font-semibold">Tambah alamat</span>
      </button>

      <ModalShell open={open} onClose={() => setOpen(false)} title="Tambah alamat" subtitle="Ke mana kartunya dikirim?">
        <div className="space-y-4">
          {field("Nama penerima", "fullName", "mis. Genta Pratama")}
          {field("Jalan / detail", "street", "Jl. Contoh No. 1, RT/RW")}
          <div className="grid grid-cols-2 gap-3">
            {field("Kota", "city", "Tasikmalaya")}
            {field("Kode pos", "zip", "46100")}
          </div>
          {field("Negara", "country", "Indonesia")}
          {err && <p className="text-[13px] text-red-400">{err}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <GhostButton onClick={() => setOpen(false)} disabled={busy}>
              Batal
            </GhostButton>
            <PrimaryButton onClick={save} disabled={!valid || busy}>
              {busy ? "Menyimpan…" : "Simpan alamat"}
            </PrimaryButton>
          </div>
        </div>
      </ModalShell>
    </>
  );
}

/** Baris aksi bawah tiap step. */
function BottomBar({ left, right }: { left?: ReactNode; right: ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}
