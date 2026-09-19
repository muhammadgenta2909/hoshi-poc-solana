"use client";

// Withdraw / kirim kartu fisik ke rumah (redeem). REAL end-to-end:
//   step 1 alamat kirim (getMyAddresses + shared AddAddressModal)  ·  step 2 pilih kartu ·
//   step 3 review  ·  step 4 submit → requestRedemption per kartu.
//
/* ══════════════════════════════════════════════════════════════════════════════════════════════
   HALAMAN INI MELAYANI DUA RAIL PENGIRIMAN YANG TIDAK BOLEH TERTUKAR.

   ┌──── RAIL CC VAULT — kartu hasil pack / katalog CC / beli antar user ───────────────────────┐
   │ Fisiknya di gudang CollectorCrypt. Pengirimannya: ongkir Rupiah → USDC treasury didanai ke │
   │ wallet user → USER MENANDATANGANI transaksi burn → CC yang mengirim. Digerbang             │
   │ CC_SHIPPING_ENABLED. Dimintanya lewat `requestRedemption({ nftAddress })`.                  │
   └────────────────────────────────────────────────────────────────────────────────────────────┘
   ┌──── RAIL DOMESTIK — kartu STOK HOSHI yang dibeli pembeli ──────────────────────────────────┐
   │ Fisiknya di rak Hoshi, di Indonesia. Pengirimannya paket kurir biasa: bayar ongkir Rupiah, │
   │ selesai. NOL NFT, NOL burn, NOL USDC treasury, NOL CollectorCrypt, NOL tanda tangan wallet, │
   │ dan TIDAK digerbang CC_SHIPPING_ENABLED. Dimintanya lewat                                   │
   │ `requestRedemption({ listingId })` — kartu ini memang TIDAK punya alamat NFT sama sekali    │
   │ (settlement-nya database-only), jadi ia TIDAK BISA diminta lewat `nftAddress`.               │
   └────────────────────────────────────────────────────────────────────────────────────────────┘

   KENAPA ITU DITULIS SEBESAR INI. Sebelum perubahan ini, halaman ini menyaring pemilih kartunya
   dengan `l.nft?.assetAddress ?? l.ccNftAddress; if (!nftAddress) return null;` — dan stok Hoshi
   tidak punya keduanya, jadi ia TIDAK PERNAH masuk daftar. Sementara jalur belinya hidup penuh:
   pembeli bisa membayar kartu stok Hoshi dan lalu tidak punya satu pun tombol di seluruh aplikasi
   untuk memintanya dikirim. Rail-nya diputuskan SERVER dari `listingId`; yang dikerjakan halaman
   ini cuma memastikan pembeli mendarat di jalur yang benar, dan TAHU ia sedang di jalur yang mana.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ApiError,
  CC_SHIPPING_ENABLED,
  cancelRedemption,
  getMyAddresses,
  getMyPacks,
  getMyPurchases,
  getMyRedemptions,
  hoshiListingRef,
  isDomesticRedemption,
  requestRedemption,
  type CardRedemption,
  type ShippingAddress,
  type ShippingRefundDebt,
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
  PlusIcon,
  SearchIcon,
} from "@/components/account/ui";
import AddAddressModal from "@/components/account/AddAddressModal";
import { Img } from "@/components/packs/ui";
import ShippingFlowModal, {
  CANCEL_CONFIRM_FREED,
  CANCEL_CONFIRM_MONEY,
  ShippingCancelDisclosure,
  readPendingShip,
  clearPendingShip,
  isActionableShipStatus,
  isResignShipStatus,
  isTrackingShipStatus,
  isUserCancelableShipStatus,
  STATUS_LABEL,
} from "@/components/packs/ShippingFlowModal";
import DomesticShipModal, {
  clearPendingDomesticShip,
  isDomesticActionableStatus,
  isDomesticOngoingStatus,
  readPendingDomesticShip,
} from "@/components/packs/DomesticShipModal";

const TOTAL = 4;

const STEP_TITLE: Record<number, string> = {
  1: "Where should we ship it?",
  2: "Pilih kartu yang mau dikirim",
  3: "Cek dulu pengirimanmu",
  4: "Konfirmasi & kirim",
};

/** Rail sebuah kartu di pemilih. Ini yang menentukan BENTUK body request & modal mana yang dibuka. */
type PickRail = "CC" | "DOMESTIC";

/**
 * Kartu siap-kirim di pemilih.
 *
 * `key` adalah kunci pilih SEKALIGUS kunci anti-dobel, dan ia sengaja dibuat SAMA dengan kolom
 * `nftAddress` pada baris redemption di backend: alamat NFT untuk rail CC, turunan
 * `hoshi-listing:<id>` untuk rail domestik. Jadi satu himpunan "sedang dikirim" bisa menyaring
 * kedua rail tanpa peta kedua yang bisa ketinggalan satu kasus.
 */
type PickCard = {
  key: string;
  rail: PickRail;
  /** Terisi HANYA untuk rail CC. Inilah yang dikirim sebagai `nftAddress`. */
  nftAddress: string | null;
  /** Terisi HANYA untuk rail DOMESTIK. Inilah yang dikirim sebagai `listingId`. */
  listingId: string | null;
  name: string;
  image: string | null;
  set: string | null;
};

const toPickCard = (p: GachaPull): PickCard => ({
  key: p.nftAddress as string,
  rail: "CC",
  nftAddress: p.nftAddress as string,
  listingId: null,
  name: p.ccItemName ?? p.nftName ?? "Kartu",
  image: p.nftImage,
  set: p.ccSet,
});

/**
 * Kartu HASIL-BELI (Listing SOLD milik user) → PickCard, dengan RAIL-nya.
 *
 * URUTAN PEMERIKSAANNYA PENTING dan harus tetap begini: `hoshiStock` DULU, baru alamat NFT.
 * Sebuah baris stok Hoshi bisa (dari jalur demo/warisan) punya alamat NFT, dan backend
 * MENORMALKAN baris seperti itu ke identitas domestik apa pun kunci yang kita kirim — jadi kalau
 * di sini ia dibaca sebagai kartu CC, kita akan membuka modal tanda-tangan-wallet untuk baris
 * yang sebenarnya lahir sebagai kiriman kurir. Membalik urutannya = dua identitas untuk satu
 * kartu fisik.
 *
 * `hoshiStock` DITURUNKAN SERVER (marketplace.serialize.ts → isHoshiSellableStock) dan dipakai
 * APA ADANYA. Menebaknya di sini dari `source === "HOSHI"` + tidak punya NFT akan ikut menyapu
 * baris seed/placeholder — lalu menawarkan tombol kirim untuk kartu yang tidak ada di rak.
 */
const boughtToPickCard = (l: Listing): PickCard | null => {
  if (l.hoshiStock === true) {
    return {
      key: hoshiListingRef(l.id),
      rail: "DOMESTIC",
      nftAddress: null,
      listingId: l.id,
      name: l.name,
      image: l.image,
      set: l.set ?? l.category ?? null,
    };
  }
  const nftAddress = l.nft?.assetAddress ?? l.ccNftAddress;
  if (!nftAddress) return null;
  return {
    key: nftAddress,
    rail: "CC",
    nftAddress,
    listingId: null,
    name: l.name,
    image: l.image,
    set: l.set ?? l.category ?? null,
  };
};

/* ─────────────────────── LENCANA RAIL — dipakai di pemilih & di daftar ───────────────────────
   Kalimatnya bukan hiasan. Kedua rail menagih ongkir Rupiah lewat halaman bayar yang SAMA; yang
   berbeda adalah apa yang terjadi SESUDAHNYA (satu selesai, satu meminta tanda tangan wallet dan
   membakar NFT). Tanpa penanda ini, dua alur yang sangat berbeda tampak identik sampai detik
   sebuah prompt wallet muncul — atau tidak pernah muncul. */

const RAIL_BADGE: Record<
  PickRail,
  { label: string; title: string; cls: string }
> = {
  DOMESTIC: {
    label: "Kurir domestik",
    title:
      "Kartu stok Hoshi: fisiknya di gudang Hoshi, Indonesia. Kamu cuma membayar ongkir — tidak " +
      "ada NFT yang dibakar dan tidak ada tanda tangan wallet.",
    cls: "border-[#F2C101]/45 bg-[#F2C101]/[0.12] text-[#F2C101]",
  },
  CC: {
    label: "Vault CollectorCrypt",
    title:
      "Kartu di vault CollectorCrypt: sesudah ongkirnya lunas kamu perlu menandatangani transaksi " +
      "burn di wallet-mu, lalu CollectorCrypt yang mengirimkannya.",
    cls: "border-sky-400/40 bg-sky-400/[0.12] text-sky-300",
  },
};

function RailBadge({ rail, className = "" }: { rail: PickRail; className?: string }) {
  const b = RAIL_BADGE[rail];
  return (
    <span
      title={b.title}
      className={`inline-block w-fit rounded-full border px-2 py-0.5 text-[10px] font-bold ${b.cls} ${className}`}
    >
      {b.label}
    </span>
  );
}

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

  // Kirim-fisik REAL (CC_SHIPPING_ENABLED): modal alur estimate→bayar→TTD→lacak untuk 1 redemption.
  // Inert saat flag OFF — di-render hanya di dalam guard CC_SHIPPING_ENABLED.
  const [shipping, setShipping] = useState<
    | {
        redemptionId: string;
        card: { name: string; image: string | null } | null;
        resume: boolean;
        /** Status yang SUDAH diketahui dari /redemptions/me — supaya baris FUNDED langsung membuka
         *  layar tanda-tangan-ulang, bukan layar "mengonfirmasi pembayaran ongkir". */
        status?: CardRedemption["status"] | null;
      }
    | null
  >(null);
  /**
   * KIRIM DOMESTIK (stok Hoshi, kurir lokal) — modal ongkir→bayar→selesai untuk 1 redemption.
   *
   * SENGAJA TIDAK digerbang CC_SHIPPING_ENABLED. Rail ini tidak menyentuh CollectorCrypt sama
   * sekali, jadi ia tidak boleh ikut mati bersama gerbang CC maupun ikut menunggu kredensial CC
   * yang belum turun. Modalnya file TERPISAH (DomesticShipModal), bukan cabang di dalam modal CC —
   * lihat blok kepala file itu.
   */
  const [domestic, setDomestic] = useState<
    | {
        redemptionId: string;
        cardName: string | null;
        resume: boolean;
      }
    | null
  >(null);
  // Redemption milik user (buat panel "Pengiriman berjalan" + resume). Dipakai KEDUA rail.
  const [redemptions, setRedemptions] = useState<CardRedemption[]>([]);
  /* ---- B1: batal-sendiri dari daftar (POST /redemptions/:id/cancel) ----
     Ini tempat KEDUA yang user cari selain modalnya: baris yang invoice-nya tidak jadi dibayar
     mengunci kartunya (permintaan kirim berikutnya ditolak REDEMPTION_ALREADY_ACTIVE), dan daftar
     inilah satu-satunya tempat baris itu kelihatan. Konfirmasi dua langkah, per baris. */
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<{ id: string; message: string } | null>(null);
  /**
   * HASIL pembatalan yang BERHASIL — `warning` + `shippingDebts` dari backend, disimpan supaya
   * bisa DIBACA dan DISALIN, bukan flash sebaris yang hilang.
   *
   * KENAPA. Sesudah pagar backend dipersempit ke [PAID, FULFILLED], pembatalan yang SAH bisa
   * meninggalkan Rupiah ongkir yang sudah mendarat: tagihan yang macet di FULFILLING diubah jadi
   * REFUND_DUE (utang tercatat), yang sudah REFUND_DUE dilaporkan apa adanya. Versi lama halaman
   * ini membuang seluruh respons dan menampilkan satu kalimat tetap ("Permintaan kirim
   * dibatalkan…"), jadi utang itu lahir di antrean operator tanpa user pernah tahu ia ada — dan
   * daftar ini, menurut catatan backend sendiri, adalah satu-satunya tempat baris itu terlihat.
   */
  const [cancelResult, setCancelResult] = useState<{
    redemptionId: string;
    cardName: string;
    warning: string | null;
    debts: ShippingRefundDebt[];
  } | null>(null);


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
      setRedemptions(reds);
      setSelectedAddr((cur) =>
        cur && addrs.some((a) => a.id === cur)
          ? cur
          : (addrs.find((a) => a.isDefault) ?? addrs[0])?.id ?? "",
      );
      // Kartu SUDAH punya permintaan kirim aktif → sembunyikan (backend juga menolak dobel).
      //
      // SATU himpunan untuk KEDUA rail, dan itu bukan kebetulan: backend menulis identitas
      // domestik ke kolom `nftAddress` yang sama (`hoshi-listing:<id>`), jadi kunci di sini
      // (`PickCard.key`) cocok apa adanya untuk kartu ber-NFT maupun kartu stok Hoshi. Peta kedua
      // hanya akan menjadi peta yang ketinggalan satu kasus.
      const busy = new Set(
        reds.filter((r) => r.status !== "CANCELED").map((r) => r.nftAddress),
      );
      // Gabung kartu HASIL-PACK (selalu rail CC) + HASIL-BELI (rail-nya ditentukan `hoshiStock`),
      // dedupe by key, buang yang sedang diproses kirim.
      const pickList = [
        ...packs.filter((p) => p.status === "OPENED" && !!p.nftAddress).map(toPickCard),
        ...bought.map(boughtToPickCard).filter((c): c is PickCard => c !== null),
      ];
      const seen = new Set<string>();
      setCards(
        pickList.filter((c) => {
          if (busy.has(c.key) || seen.has(c.key)) return false;
          seen.add(c.key);
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

  /**
   * Batalkan satu permintaan kirim dari daftar. Pagarnya ADA DI BACKEND (status, tagihan ongkir
   * yang pemenuhannya masih hidup, fundingSignature, refundSafe, plus updateMany berpagar supaya
   * tidak balapan dengan callback pembayaran) — halaman ini hanya mengirim permintaan dan
   * menampilkan jawabannya apa adanya, termasuk penolakannya.
   *
   * RESPONSNYA TIDAK BOLEH DIBUANG. Ia membawa `warning` + `shippingDebts`: pembatalan yang SAH
   * pun bisa meninggalkan Rupiah ongkir yang sudah mendarat, dan backend baru saja mengubahnya
   * jadi utang refund yang tercatat di tagihannya sendiri. Kalau di sini kita cuma menulis
   * "Permintaan kirim dibatalkan", user pergi dengan keyakinan tidak ada uangnya yang tertahan —
   * dan tidak akan pernah menagih utang yang memang ada. Sukses → simpan hasilnya ke panel yang
   * menetap, lalu load() ulang (barisnya hilang dari daftar, kartunya bebas diminta kirim lagi).
   */
  const cancelOne = useCallback(
    async (id: string, cardName: string) => {
      if (!token || cancelingId) return;
      setCancelingId(id);
      setCancelError(null);
      try {
        const res = await cancelRedemption(id, token);
        setCancelConfirmId(null);
        setCancelResult({
          redemptionId: id,
          cardName,
          warning: res.warning ?? null,
          debts: Array.isArray(res.shippingDebts) ? res.shippingDebts : [],
        });
        await load();
      } catch (e) {
        setCancelError({
          id,
          message: e instanceof Error ? e.message : "Permintaan batal tidak bisa diproses.",
        });
      } finally {
        setCancelingId(null);
      }
    },
    [token, cancelingId, load],
  );

  // A new address came back from the shared AddAddressModal: select it, then
  // re-pull the list (load keeps the current selection if it's still present).
  const onAddressAdded = useCallback(
    async (a: ShippingAddress) => {
      setSelectedAddr(a.id);
      await load();
    },
    [load],
  );

  /* Sepulang dari halaman bayar ongkir (IDRX): bersihkan query yang ditempel gateway lalu resume
     modal kirim yang BENAR.

     ┌──── DUA KUNCI PENDING, DAN /withdraw ADALAH TUJUAN SALAH SATUNYA ────────────────────────┐
     │ returnUrl ongkir DOMESTIK dibangun backend dan menunjuk KE SINI (/withdraw), sedangkan   │
     │ returnUrl ongkir CC menunjuk ke /vault. Sebelum ini halaman ini HANYA membaca kunci CC   │
     │ (`hoshi_pending_ship`), jadi pembeli stok Hoshi yang baru saja membayar ongkir mendarat  │
     │ di step 1 tanpa satu pun petunjuk bahwa pembayarannya sedang dikonfirmasi.               │
     │                                                                                          │
     │ DIPERIKSA DOMESTIK DULU, dan itu bukan selera: pendaratan di halaman INI paling mungkin  │
     │ berasal dari rail domestik. Kalau keduanya entah bagaimana ada, membuka modal domestik    │
     │ tidak pernah menyesatkan — ia tidak pernah meminta tanda tangan wallet. Membuka modal CC  │
     │ untuk baris domestik akan melakukan sebaliknya.                                          │
     │                                                                                          │
     │ Pembersihan query-nya UNGATED sekarang: gateway menempelkan parameter yang sama untuk    │
     │ kedua rail, dan rail domestik hidup walau CC_SHIPPING_ENABLED mati.                       │
     └──────────────────────────────────────────────────────────────────────────────────────────┘ */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("merchantOrderId") || params.has("resultCode") || params.has("reference")) {
      window.history.replaceState(null, "", "/withdraw");
    }
    const pendingDomestic = readPendingDomesticShip();
    if (pendingDomestic) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setDomestic({
        redemptionId: pendingDomestic.redemptionId,
        cardName: null,
        resume: true,
      });
      return;
    }
    if (!CC_SHIPPING_ENABLED) return;
    const pending = readPendingShip();
    if (pending) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setShipping({ redemptionId: pending.redemptionId, card: null, resume: true });
    }
  }, []);

  const back = () => setStep((s) => Math.max(1, s - 1));
  const next = () => setStep((s) => Math.min(TOTAL, s + 1));

  /**
   * Pilih kartu.
   *
   * SEBUAH KARTU DOMESTIK SELALU EKSKLUSIF — apa pun keadaan CC_SHIPPING_ENABLED. Alasannya
   * bukan kosmetik: jalur record-only lama (flag OFF) mengirim SATU `requestRedemption` per kartu
   * terpilih dengan body `{ nftAddress }`, dan kartu stok Hoshi tidak punya alamat NFT — ia butuh
   * `{ listingId }` DAN satu modal ongkir per pengiriman. Mencampurnya dalam satu batch berarti
   * mengarang body yang salah untuk separuh pilihan.
   */
  const toggle = (key: string) =>
    setSelected((prev) => {
      const card = cards.find((c) => c.key === key);
      // Rail domestik, atau alur kirim REAL CC (1 kartu per pengiriman) → pilih tunggal (radio).
      if (card?.rail === "DOMESTIC" || CC_SHIPPING_ENABLED) {
        return prev.has(key) ? new Set<string>() : new Set([key]);
      }
      // Record-only (flag CC OFF): boleh banyak kartu CC sekaligus — tapi pilihan domestik yang
      // mungkin tertinggal dari klik sebelumnya DIBUANG, karena ia tidak bisa ikut batch ini.
      const nextSet = new Set(
        [...prev].filter((k) => cards.find((c) => c.key === k)?.rail !== "DOMESTIC"),
      );
      if (nextSet.has(key)) nextSet.delete(key);
      else nextSet.add(key);
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
    () => cards.filter((c) => selected.has(c.key)),
    [cards, selected],
  );
  const activeAddr = addresses.find((a) => a.id === selectedAddr) ?? null;

  /** Kartu domestik yang sedang dipilih (kalau ada). Ia selalu sendirian — lihat `toggle`. */
  const domesticPick = useMemo(
    () => selectedCards.find((c) => c.rail === "DOMESTIC") ?? null,
    [selectedCards],
  );

  // Alur kirim REAL CC (flag ON): buat redemption untuk 1 kartu terpilih, lalu buka modal
  // estimate→bayar→TTD→lacak. Kartu tetap aman di vault sampai user menandatangani burn.
  const startShipping = async () => {
    if (!token || !selectedAddr || selectedCards.length !== 1 || submitting) return;
    const card = selectedCards[0];
    // Sabuk kedua. `submit` sudah mengarahkan kartu domestik ke jalurnya sendiri; ini memastikan
    // tidak ada pemanggil baru yang bisa menjatuhkan kartu tanpa NFT ke body `{ nftAddress }`.
    if (card.rail !== "CC" || !card.nftAddress) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const red = await requestRedemption(
        { nftAddress: card.nftAddress, shippingAddressId: selectedAddr },
        token,
      );
      setShipping({ redemptionId: red.id, card, resume: false });
    } catch (e) {
      setSubmitError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Gagal membuat permintaan.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Alur kirim DOMESTIK (stok Hoshi, kurir lokal). TIDAK digerbang CC_SHIPPING_ENABLED.
   *
   * BENTUK BODY-nya BEDA dari rail CC, dan itu seluruh intinya: backend menolak 400
   * HOSHI_DOMESTIC_TARGET_REQUIRED kalau `nftAddress` dan `listingId` sama-sama kosong ATAU
   * sama-sama terisi — karena kedua field itu MEMILIH RAIL, dan rail adalah keputusan server.
   * Jadi di sini `listingId` dikirim SENDIRIAN.
   */
  const startDomesticShipping = async (card: PickCard) => {
    if (!token || !selectedAddr || submitting) return;
    if (card.rail !== "DOMESTIC" || !card.listingId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const red = await requestRedemption(
        { listingId: card.listingId, shippingAddressId: selectedAddr },
        token,
      );
      setDomestic({ redemptionId: red.id, cardName: card.name, resume: false });
    } catch (e) {
      setSubmitError(
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Gagal membuat permintaan.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    // RAIL DULU, gerbang belakangan. Kartu stok Hoshi punya jalurnya sendiri yang hidup walau
    // CC_SHIPPING_ENABLED mati — ia tidak menyentuh CollectorCrypt sama sekali.
    if (domesticPick) {
      await startDomesticShipping(domesticPick);
      return;
    }
    // Flag ON → alur berbayar+burn CC (1 kartu). Flag OFF → record-only lama (byte-for-byte).
    if (CC_SHIPPING_ENABLED) {
      await startShipping();
      return;
    }
    if (!token || !selectedAddr || selectedCards.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const results = await Promise.allSettled(
      selectedCards.map((c) =>
        requestRedemption(
          { nftAddress: c.nftAddress as string, shippingAddressId: selectedAddr },
          token,
        ),
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

      {/* HASIL PEMBATALAN — MENETAP sampai ditutup sendiri, karena isinya bisa berupa uang.
          Sengaja BUKAN `flash`: flash itu satu kalimat tetap yang dulu berbunyi "Permintaan kirim
          dibatalkan. Kartunya bisa diminta kirim lagi." dan membuang seluruh respons backend —
          termasuk `shippingDebts`, satu-satunya tempat user bisa melihat ongkir yang tertahan.
          Nomor tagihannya harus bisa dibaca dan disalin, jadi panel ini tidak pernah hilang
          sendiri dan tidak ikut tersapu load(). */}
      {cancelResult && (
        <div className="mt-5 rounded-xl border border-white/12 bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-zinc-100">
                Permintaan kirim {cancelResult.cardName} dibatalkan
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-400">
                Kartunya kembali bebas dan bisa diminta kirim lagi kapan saja.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCancelResult(null)}
              className="shrink-0 rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-zinc-300 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </div>
          <div className="mt-3">
            <ShippingCancelDisclosure
              redemptionId={cancelResult.redemptionId}
              warning={cancelResult.warning}
              debts={cancelResult.debts}
            />
          </div>
        </div>
      )}

      {/* ══════════ KIRIM DOMESTIK yang sedang berjalan (stok Hoshi, kurir lokal) ══════════
          PANEL TERPISAH dari panel CC di bawah, dan SENGAJA TIDAK digerbang CC_SHIPPING_ENABLED.

          Ini juga jalur resume cadangan: kalau localStorage hilang (mode privat, perangkat lain,
          URL balik yang beda), inilah satu-satunya tempat baris AWAITING_PAYMENT yang ongkirnya
          belum dibayar masih bisa ditemukan — dan tanpa jalan masuk itu, baris tersebut mengunci
          kartunya (permintaan kirim berikutnya ditolak REDEMPTION_ALREADY_ACTIVE). */}
      {(() => {
        const activeDomestic = redemptions.filter(
          (r) => isDomesticRedemption(r) && isDomesticOngoingStatus(r.status),
        );
        if (activeDomestic.length === 0) return null;
        return (
          <Panel className="mt-5 p-4 sm:p-5">
            <SectionTitle>Kiriman kurir domestik</SectionTitle>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
              Kartu stok Hoshi. Kamu hanya membayar ongkir — tidak ada NFT yang dibakar dan tidak
              ada tanda tangan wallet.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {activeDomestic.map((r) => {
                // Di rail ini "perlu aksi" HANYA berarti ongkirnya belum lunas. Sesudah itu
                // backend memindahkan barisnya ke PACKING sendiri dan user tidak punya langkah
                // tersisa — tidak ada READY_TO_FUND, tidak ada tanda tangan.
                const needsAction = isDomesticActionableStatus(r.status);
                const cancelable = isUserCancelableShipStatus(r.status);
                const confirming = cancelConfirmId === r.id;
                const rowError = cancelError?.id === r.id ? cancelError.message : null;
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-[#F2C101]/25 bg-[#F2C101]/[0.04] p-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <Img
                        src={r.cardImage ?? "/card-back.svg"}
                        alt=""
                        className="h-12 w-[36px] shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-100">
                          {r.cardName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <RailBadge rail="DOMESTIC" />
                          <span className="truncate text-[11px] text-zinc-500">
                            {needsAction ? "Ongkir belum dibayar" : STATUS_LABEL[r.status]}
                          </span>
                        </div>
                        {(r.trackingIds?.length ?? 0) > 0 && (
                          <p className="mt-0.5 truncate font-mono text-[11px] text-emerald-300/80">
                            Resi: {r.trackingIds?.join(", ")}
                          </p>
                        )}
                      </div>
                      {needsAction ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDomestic({
                              redemptionId: r.id,
                              cardName: r.cardName,
                              // resume=false: modal membuka layar ongkir (nol uang, nol order) dan
                              // menerbitkan/memakai ulang tagihannya saat user menekan bayar.
                              resume: false,
                            })
                          }
                          className="shrink-0 rounded-xl border border-[#F2C101]/45 bg-[#F2C101]/[0.12] px-3 py-2 text-[12px] font-semibold text-[#F2C101] transition hover:bg-[#F2C101]/[0.2]"
                        >
                          Bayar ongkir
                        </button>
                      ) : (
                        <span className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-zinc-400">
                          {STATUS_LABEL[r.status]}
                        </span>
                      )}
                    </div>

                    {cancelable &&
                      (confirming ? (
                        <div className="mt-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                          <p className="text-[12px] leading-relaxed text-zinc-300">
                            Batalkan permintaan kirim {r.cardName}? {CANCEL_CONFIRM_FREED}
                          </p>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                            {CANCEL_CONFIRM_MONEY}
                          </p>
                          {rowError && (
                            <p className="mt-2 text-[12px] leading-relaxed text-amber-200/90">
                              {rowError}
                            </p>
                          )}
                          <div className="mt-2.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void cancelOne(r.id, r.cardName)}
                              disabled={cancelingId === r.id}
                              className="flex-1 rounded-lg border border-red-400/30 bg-red-500/[0.10] px-3 py-2 text-[12px] font-semibold text-red-200 transition hover:bg-red-500/[0.18] disabled:opacity-60"
                            >
                              {cancelingId === r.id ? "Membatalkan…" : "Ya, batalkan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmId(null)}
                              disabled={cancelingId === r.id}
                              className="flex-1 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.10] disabled:opacity-60"
                            >
                              Jangan batalkan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelError(null);
                            setCancelConfirmId(r.id);
                          }}
                          className="mt-1.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300"
                        >
                          Batalkan permintaan ini
                        </button>
                      ))}
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })()}

      {/* Pengiriman yang sedang berjalan (flag ON): lanjutkan yang belum lunas/ttd, atau lacak yang
          sudah dikirim. Juga jalur resume kalau localStorage hilang (mode privat / URL balik beda). */}
      {CC_SHIPPING_ENABLED &&
        (() => {
          const active = redemptions.filter(
            (r) =>
              r.status !== "CANCELED" &&
              // Baris DOMESTIK punya panel sendiri di atas. Membiarkannya masuk ke sini akan
              // menawarkan "Tanda tangani"/"Lanjutkan" ke alur CC untuk kartu yang tidak punya
              // NFT — dan setiap rutenya akan menjawab 400 WRONG_RAIL.
              !isDomesticRedemption(r) &&
              // isResignShipStatus (FUNDED) WAJIB ikut: itu baris yang ongkirnya sudah didanai
              // treasury tapi belum ditandatangani. Kalau tidak muncul di sini, satu prompt wallet
              // yang ditolak = uang sudah keluar dan user tidak punya jalan untuk melanjutkan.
              (isActionableShipStatus(r.status) ||
                isResignShipStatus(r.status) ||
                isTrackingShipStatus(r.status)),
          );
          if (active.length === 0) return null;
          return (
            <Panel className="mt-5 p-4 sm:p-5">
              <SectionTitle>Kiriman vault CollectorCrypt</SectionTitle>
              <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                Kartu yang fisiknya di gudang CollectorCrypt. Sesudah ongkirnya lunas kamu perlu
                menandatangani transaksi burn di wallet-mu, lalu CollectorCrypt yang mengirim.
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                {active.map((r) => {
                  // FUNDED = uang sudah berpindah, tanda tangan belum → tombolnya harus MENGAJAK
                  // menandatangani, bukan "Lacak"; dan barisnya tidak boleh berbunyi "Sedang
                  // dikirim" karena tidak ada apa pun yang sedang dikirim.
                  const needsSignature = isResignShipStatus(r.status);
                  const needsAction = isActionableShipStatus(r.status) || needsSignature;
                  // Batal-sendiri hanya untuk baris yang NOL uangnya bergerak. Backend tetap yang
                  // memutuskan (ia juga memagari order ongkir yang sudah mendarat, fundingSignature
                  // dan refundSafe — hal yang tidak kelihatan dari status saja); ini cuma soal
                  // menampilkan tombolnya di tempat yang masuk akal.
                  const cancelable = isUserCancelableShipStatus(r.status);
                  const confirming = cancelConfirmId === r.id;
                  const rowError = cancelError?.id === r.id ? cancelError.message : null;
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                    >
                    <div className="flex items-center gap-3">
                      <Img
                        src={r.cardImage ?? "/card-back.svg"}
                        alt=""
                        className="h-12 w-[36px] shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-100">
                          {r.cardName}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {/* Lencana rail: dua panel ini terlihat mirip, dan yang membedakannya
                              adalah apa yang terjadi SESUDAH ongkirnya lunas. */}
                          <RailBadge rail="CC" />
                          <span className="truncate text-[11px] text-zinc-500">
                            {/* JANGAN menulis "kartumu aman" di sini. Daftar ini di-fetch hanya saat
                                mount dan saat onFinished, jadi status FUNDED yang dipakainya bisa
                                sudah berjam-jam umurnya — perangkat lain bisa saja sudah menuntaskan
                                burn-nya. Yang tersisa di bawah adalah fakta yang MELEKAT pada status
                                FUNDED itu sendiri (ongkirnya memang sudah lunas untuk sampai ke
                                situ) plus aksi yang diminta. Klaim soal keadaan kartu hanya boleh
                                muncul setelah dibaca ulang — lihat layar `resign` di
                                ShippingFlowModal, yang memverifikasinya sendiri. */}
                            {needsSignature
                              ? "Ongkir lunas — tinggal tanda tangan"
                              : needsAction
                                ? "Perlu dilanjutkan"
                                : STATUS_LABEL[r.status]}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setShipping({
                            redemptionId: r.id,
                            card: { name: r.cardName, image: r.cardImage },
                            resume: true,
                            status: r.status,
                          })
                        }
                        className={`shrink-0 rounded-xl border px-3 py-2 text-[12px] font-semibold transition ${
                          needsAction
                            ? "border-yellow-400/40 bg-yellow-400/[0.1] text-yellow-200 hover:bg-yellow-400/[0.18]"
                            : "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08]"
                        }`}
                      >
                        {needsSignature ? "Tanda tangani" : needsAction ? "Lanjutkan" : "Lacak"}
                      </button>
                    </div>

                    {/* JALAN KELUAR untuk baris yang belum menyentuh uang. Tanpa ini, permintaan
                        yang invoice-nya tidak jadi dibayar mengunci kartunya: barisnya tetap aktif
                        dan permintaan kirim berikutnya ditolak REDEMPTION_ALREADY_ACTIVE, sementara
                        daftar ini satu-satunya tempat baris itu terlihat. */}
                    {cancelable &&
                      (confirming ? (
                        <div className="mt-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                          {/* Copy dari SATU sumber bersama dengan modal kirim (CANCEL_CONFIRM_* di
                              ShippingFlowModal). Versi lama menulis "Belum ada ongkir yang kami
                              terima untuk permintaan ini, jadi tidak ada yang perlu direfund — dan
                              kalau pembayaranmu ternyata sudah masuk, pembatalannya otomatis
                              ditolak." DUA-DUANYA tidak bisa dipegang dari sini: status baris ini
                              dibaca saat halaman dimuat (bisa berjam-jam basi) dan status
                              redemption memang tidak memuat posisi tagihan ongkirnya; lagi pula
                              backend hanya menolak untuk tagihan PAID/FULFILLED — yang macet di
                              FULFILLING atau sudah REFUND_DUE justru LOLOS, dengan uang yang sudah
                              mendarat. Jadi layar ini berhenti mengklaim arah mana pun, dan
                              jawaban sebenarnya ditampilkan sesudah backend menjawab. */}
                          <p className="text-[12px] leading-relaxed text-zinc-300">
                            Batalkan permintaan kirim {r.cardName}? {CANCEL_CONFIRM_FREED}
                          </p>
                          <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-400">
                            {CANCEL_CONFIRM_MONEY}
                          </p>
                          {rowError && (
                            <p className="mt-2 text-[12px] leading-relaxed text-amber-200/90">
                              {rowError}
                            </p>
                          )}
                          <div className="mt-2.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void cancelOne(r.id, r.cardName)}
                              disabled={cancelingId === r.id}
                              className="flex-1 rounded-lg border border-red-400/30 bg-red-500/[0.10] px-3 py-2 text-[12px] font-semibold text-red-200 transition hover:bg-red-500/[0.18] disabled:opacity-60"
                            >
                              {cancelingId === r.id ? "Membatalkan…" : "Ya, batalkan"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelConfirmId(null)}
                              disabled={cancelingId === r.id}
                              className="flex-1 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-2 text-[12px] font-semibold text-zinc-200 transition hover:bg-white/[0.10] disabled:opacity-60"
                            >
                              Jangan batalkan
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCancelError(null);
                            setCancelConfirmId(r.id);
                          }}
                          className="mt-1.5 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-300"
                        >
                          Batalkan permintaan ini
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </Panel>
          );
        })()}

      <div className="mt-6">
        <h2 className="text-lg font-semibold text-white sm:text-xl">{STEP_TITLE[step]}</h2>

        {/* --------------------------- STEP 1: alamat --------------------------- */}
        {step === 1 && (
          <>
            <SectionTitle>Shipping address</SectionTitle>
            <Panel className="mt-3 p-4 sm:p-5">
              {loading ? (
                <p className="py-8 text-center text-sm text-zinc-500">Loading addresses…</p>
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
                              Default
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
                          {on ? "Selected" : "Ship here"}
                        </span>
                      </button>
                    );
                  })}

                  <AddAddressButton token={token} onAdded={onAddressAdded} />
                </div>
              )}
              {loadError && <p className="mt-3 text-[13px] text-red-400">{loadError}</p>}
            </Panel>

            <BottomBar
              right={
                <PrimaryButton onClick={next} disabled={!selectedAddr}>
                  Select cards →
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
                        ? "Yang bisa dikirim fisik adalah kartu hasil buka pack, kartu hasil beli di marketplace, dan kartu stok Hoshi yang sudah kamu beli. Buka pack dulu di Games, atau beli kartu di Marketplace."
                        : "Coba kata kunci lain."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {filtered.map((c) => {
                      const on = selected.has(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => toggle(c.key)}
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
                            {/* Lencana rail DI KARTU, bukan cuma di ringkasan: dua kartu yang
                                tampak identik bisa berakhir di dua alur yang sangat berbeda
                                (satu selesai sesudah bayar, satu meminta tanda tangan wallet dan
                                membakar NFT-nya). Perbedaan itu harus terlihat SEBELUM dipilih. */}
                            <RailBadge rail={c.rail} className="mt-1.5" />
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
                      <div key={c.key} className="flex items-center gap-2.5">
                        <Img
                          src={c.image ?? "/card-back.svg"}
                          alt=""
                          className="h-10 w-[30px] shrink-0 rounded object-cover"
                        />
                        <span className="truncate text-[13px] text-zinc-200">{c.name}</span>
                        <RailBadge rail={c.rail} className="ml-auto shrink-0" />
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
              {/* TIGA KALIMAT BERBEDA untuk TIGA jalur yang benar-benar berbeda. Kalimat rail
                  domestik SENGAJA menyebut apa yang TIDAK terjadi ("tanpa tanda tangan wallet"),
                  karena satu-satunya cara user tahu ia tidak akan dimintai tanda tangan adalah
                  kalau ada yang mengatakannya sebelum ia membayar. */}
              {domesticPick ? (
                <>
                  <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                    Kamu akan meminta{" "}
                    <span className="font-semibold text-zinc-200">{domesticPick.name}</span> dikirim
                    ke{" "}
                    <span className="font-semibold text-zinc-200">
                      {activeAddr?.city ?? "alamatmu"}
                    </span>{" "}
                    lewat <span className="font-semibold text-[#F2C101]">kurir domestik</span>.
                    Langkah berikutnya cuma satu:{" "}
                    <span className="text-zinc-200">bayar ongkir</span> — setelah itu Hoshi yang
                    mengemas dan mengirim.
                  </p>
                  <p className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-4 py-3 text-[12px] leading-relaxed text-emerald-200">
                    Kartu ini ada di gudang Hoshi di Indonesia, jadi tidak ada NFT yang dibakar,
                    tidak ada tanda tangan wallet, dan tidak ada langkah on-chain sama sekali.
                  </p>
                </>
              ) : CC_SHIPPING_ENABLED ? (
                <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                  Kamu akan mengirim{" "}
                  <span className="font-semibold text-zinc-200">
                    {selectedCards[0]?.name ?? "1 kartu"}
                  </span>{" "}
                  ke <span className="font-semibold text-zinc-200">{activeAddr?.city ?? "alamatmu"}</span>{" "}
                  dari <span className="font-semibold text-sky-300">vault CollectorCrypt</span>.
                  Langkah berikutnya: <span className="text-zinc-200">hitung ongkir → bayar ongkir →
                  tanda tangani pengiriman</span>. Kartu tetap aman di vault sampai kamu tanda tangan.
                </p>
              ) : (
                <p className="mt-3 text-[14px] leading-relaxed text-zinc-400">
                  Kami akan memproses pengiriman <span className="font-semibold text-zinc-200">{selectedCards.length} kartu</span>{" "}
                  ke <span className="font-semibold text-zinc-200">{activeAddr?.city ?? "alamatmu"}</span>. Kartu tetap
                  aman di vault sampai kami packing — statusnya bisa kamu pantau di Aktivitas.
                </p>
              )}
              {submitError && <p className="mt-3 text-[13px] text-red-400">{submitError}</p>}
            </Panel>
            <BottomBar
              left={<GhostButton onClick={back} disabled={submitting}>Kembali</GhostButton>}
              right={
                <PrimaryButton onClick={submit} disabled={submitting || selectedCards.length === 0}>
                  {submitting
                    ? domesticPick || CC_SHIPPING_ENABLED
                      ? "Menyiapkan…"
                      : "Mengirim…"
                    : domesticPick || CC_SHIPPING_ENABLED
                      ? "Lanjut ke ongkir →"
                      : "Kirim sekarang"}
                </PrimaryButton>
              }
            />
          </>
        )}
      </div>

      {/* Modal alur kirim REAL (flag ON): estimate → bayar ongkir → tanda tangan → lacak. Saat OFF
          `shipping` selalu null (submit tetap record-only) → tak pernah ter-render. */}
      {CC_SHIPPING_ENABLED && shipping && (
        <ShippingFlowModal
          redemptionId={shipping.redemptionId}
          card={shipping.card}
          resume={shipping.resume}
          initialStatus={shipping.status ?? null}
          onFinished={() => void load()}
          onClose={() => {
            clearPendingShip();
            setShipping(null);
            setSelected(new Set());
            setStep(1);
            void load();
          }}
        />
      )}

      {/* Modal alur kirim DOMESTIK (stok Hoshi): ongkir → bayar → selesai. TIDAK digerbang
          CC_SHIPPING_ENABLED — rail ini tidak menyentuh CollectorCrypt, jadi ia tidak boleh ikut
          mati bersama gerbang CC maupun ikut menunggu kredensial CC yang belum turun. */}
      {domestic && (
        <DomesticShipModal
          redemptionId={domestic.redemptionId}
          cardName={domestic.cardName}
          resume={domestic.resume}
          onFinished={() => void load()}
          onClose={() => {
            clearPendingDomesticShip();
            setDomestic(null);
            setSelected(new Set());
            setStep(1);
            void load();
          }}
        />
      )}
    </AccountShell>
  );
}

function WithdrawHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-white sm:text-[28px]">Kirim Kartu ke Rumah</h1>
        <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-zinc-500">
          Minta kartu fisikmu dikirim ke alamatmu — hasil pack, hasil beli di marketplace, maupun
          kartu stok Hoshi. Kartu stok Hoshi dikirim kurir domestik (cukup bayar ongkir); kartu
          vault CollectorCrypt butuh tanda tangan wallet-mu.
        </p>
      </div>
      <Link href="/vault" className="text-[13px] font-medium text-zinc-400 transition hover:text-zinc-200">
        ← Kembali ke Vault
      </Link>
    </div>
  );
}

/** Dashed "+ Add new address" grid tile + the SHARED AddAddressModal (the same
 *  component Settings uses — full geo cascade + phone picker). On success the
 *  parent's onAdded selects the new address and refreshes the list. */
function AddAddressButton({
  token,
  onAdded,
}: {
  token: string | null;
  onAdded: (a: ShippingAddress) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[124px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.01] p-4 text-zinc-400 transition hover:border-yellow-400/40 hover:text-yellow-300"
      >
        <PlusIcon className="h-5 w-5" />
        <span className="text-[13px] font-semibold">Add new address</span>
      </button>

      <AddAddressModal
        open={open}
        onClose={() => setOpen(false)}
        onAdded={(a) => {
          setOpen(false);
          void onAdded(a);
        }}
        token={token}
      />
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
