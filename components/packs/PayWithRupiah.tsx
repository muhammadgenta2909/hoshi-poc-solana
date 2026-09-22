"use client";

// Rupiah on-ramp button + modal for buying a pack via IDRX (QRIS / e-wallet / VA).
// Self-contained and INERT unless NEXT_PUBLIC_PAYMENTS_ENABLED=1 (i.e. the backend
// has real IDRX credentials): with payments off it renders nothing, so it's safe
// to mount anywhere today. Drop it beside the "Rip Pack" button:
//
//   <PayWithRupiah packType={selectedMachine.code} onFulfilled={() => ...} />
//
// Flow (HOSTED = widest channel coverage in one page):
//   create order -> open the IDRX hosted payment page -> poll until FULFILLED
//   (the treasury settles on-chain + the card is minted server-side) -> success.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  PAYMENTS_ENABLED,
  ApiError,
  createPackOrder,
  createListingOrder,
  createOfferOrder,
  getPaymentOrder,
  isTerminalPaymentStatus,
  type PaymentOrder,
  type PaymentStatus,
} from "@/lib/api";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/lib/useAuth";
import { useWalletConnect } from "@/lib/useWalletConnect";
import { GOLD_GRADIENT } from "./ui";

const POLL_MS = 4_000;
const idr = new Intl.NumberFormat("id-ID");

/** Pesan untuk status pembayaran terminal yang BUKAN FULFILLED. REFUND_DUE istimewa: rupiah
 *  pembeli SUDAH masuk ke treasury (backend mencatatnya sebagai UTANG, bukan kegagalan) —
 *  jangan pernah menampilkan "gagal, silakan ulangi", karena pembeli bisa membayar LAGI untuk
 *  kartu/pack yang tak akan pernah dikirim. EXPIRED = tak jadi bayar → aman untuk diulang. */
function terminalPaymentMessage(status: PaymentStatus): string {
  if (status === "EXPIRED") return "Pembayaran kedaluwarsa. Silakan ulangi.";
  if (status === "REFUND_DUE")
    return (
      "Pembayaran kamu sudah diterima, tapi barangnya belum bisa dikirim. " +
      "Dananya akan direfund — mohon JANGAN bayar lagi. Hubungi kami kalau perlu bantuan."
    );
  return "Pembayaran gagal. Silakan ulangi.";
}

// Payment resume across the hosted-page redirect. Before leaving to the Duitku/IDRX page
// (same tab) we stash the order id here; when the user is redirected back, the open-packs
// page reads it and re-opens this modal in resume mode to poll + auto-reveal. localStorage
// (not the URL) so it survives whatever the gateway appends and works on a manual return too.
const PENDING_KEY = "hoshi_pending_pay";

function savePendingPayment(
  merchantOrderId: string,
  packType: string,
  listingId?: string,
): void {
  try {
    // listingId disimpan supaya saat balik dari halaman bayar (resume), modal tahu ini
    // pembelian KARTU reseller (bukan pack) → copy sukses/resume ikut benar.
    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify({ merchantOrderId, packType, listingId: listingId ?? null }),
    );
  } catch {
    /* private mode / storage full — resume just won't be available */
  }
}

export function clearPendingPayment(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function readPendingPayment(): {
  merchantOrderId: string;
  packType: string;
  listingId: string | null;
} | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      merchantOrderId?: string;
      packType?: string;
      listingId?: string | null;
    };
    return parsed?.merchantOrderId
      ? {
          merchantOrderId: parsed.merchantOrderId,
          packType: parsed.packType ?? "",
          listingId: parsed.listingId ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

export default function PayWithRupiah({
  packType,
  onFulfilled,
  className = "",
}: {
  packType: string;
  /** Called once the order reaches FULFILLED (card minted). e.g. refresh the Vault. */
  onFulfilled?: (order: PaymentOrder) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Feature flag: the whole entry point disappears until IDRX is wired.
  if (!PAYMENTS_ENABLED) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 py-3 text-[15px] font-semibold text-zinc-100 transition hover:bg-white/10 ${className}`}
      >
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[#2f6bff] text-xs font-bold text-white">
          Rp
        </span>
        Bayar via QRIS / e-wallet
      </button>
      {open && (
        <PayModal packType={packType} onFulfilled={onFulfilled} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** `expired` = sesi 7 hari-nya habis dan TIDAK bisa dipulihkan diam-diam (user wallet, atau
 *  user Google yang pencetakan ulangnya gagal). Layar tersendiri, bukan "error": tidak ada
 *  yang rusak dan tidak ada uang yang bergerak — pembeli cuma perlu diajak masuk lagi. */
type Stage =
  | "creating"
  | "checking"
  | "awaiting"
  | "fulfilling"
  | "done"
  | "error"
  | "expired";

// Exported so the Rip Pack payment-method chooser can open the rupiah flow
// directly (mounting this creates the IDRX order). The default-export button
// wrapper above stays for standalone use.
export function PayModal({
  packType,
  onFulfilled,
  onClose,
  demo = false,
  resumeOrderId,
  listingId,
  offerId,
  successHref,
}: {
  packType: string;
  onFulfilled?: (order: PaymentOrder) => void;
  onClose: () => void;
  /** Demo/test mode (?demo=1): no real order, no real IDRX redirect, no money. A fake
   *  QRIS + "Bayar (Demo)" button drives the SAME stages so the payment UX can be tried. */
  demo?: boolean;
  /** Resume an existing order after returning from the hosted payment page — instead of
   *  creating a new one, poll this id until FULFILLED and auto-reveal. */
  resumeOrderId?: string;
  /** MARKETPLACE reseller: kalau di-set, buat order untuk BELI kartu katalog CC ini
   *  (createListingOrder) — pembeli bayar harga kita via IDRX — BUKAN order pack gacha. */
  listingId?: string;
  /** OFFER: kalau di-set, bayar offer yang sudah diterima penjual (createOfferOrder) di HARGA
   *  OFFER — settlement P2P mengirim kartu & mengkredit penjual. Prioritas di atas listingId. */
  offerId?: string;
  /** Kalau di-set, layar SUKSES menampilkan tombol "Lihat Kartu" yang mengarah ke sini (detail
   *  kartu yang baru dibeli), bukan sekadar menutup modal. */
  successHref?: string;
}) {
  const { token, login, user, needsReauth, canAutoRecover } = useAuth();
  const { setVisible } = useWalletConnect();
  const { publicKey } = useWallet();
  const router = useRouter();
  // Resume (balik dari halaman bayar) mulai di "checking" — BUKAN "fulfilling" — supaya TIDAK
  // flash "Pembayaran diterima ✓" padahal statusnya belum tentu PAID (mis. user klik Back tanpa
  // membayar). "checking" cuma spinner netral; resume effect di bawah langsung mengoreksi ke stage
  // yang benar (awaiting kalau PENDING, fulfilling kalau PAID/FULFILLING) begitu order ter-fetch.
  const [stage, setStage] = useState<Stage>(
    resumeOrderId ? "checking" : "creating",
  );
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);
  // Simpan callback terbaru di ref. Parent (open-packs) meneruskan onFulfilled INLINE (fungsi
  // baru tiap render), jadi kalau ia jadi dependency effect polling, tiap re-render parent
  // membongkar+memasang ulang interval → clock 4 detik tak pernah selesai → order tak pernah
  // dipoll sampai FULFILLED (cuma reconciler ~2 menit yang menyelamatkan). Ref memutus itu.
  const onFulfilledRef = useRef(onFulfilled);
  useEffect(() => {
    onFulfilledRef.current = onFulfilled;
  }, [onFulfilled]);

  // MARKETPLACE (listingId) / OFFER (offerId) beli SATU kartu, bukan pack — copy modal menyesuaikan
  // supaya tidak menjanjikan "animasi pack" / "pack berhasil" untuk kartu.
  const isListing = !!listingId || !!offerId;

  // Token disimpan di ref supaya effect pembuat-order (once-only, dijaga startedRef) TIDAK
  // dibongkar-pasang saat login() membalik token null→jwt di tengah pembuatan order. Kalau
  // ikut jadi dependency, pembalikan token itu men-teardown run yang sedang jalan (alive=false
  // sebelum setOrder) lalu re-run-nya langsung mentok startedRef → modal nyangkut selamanya di
  // "Membuat tagihan…". login() sendiri stabil (tak berubah saat token berubah), jadi aman.
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);
  // Wallet terhubung + user JWT tersimpan — dibaca via ref (sama alasan dgn tokenRef: jangan
  // jadikan dependency effect biar ganti-wallet di tengah pembuatan order tidak men-teardown-nya).
  // Dipakai untuk mendeteksi "JWT milik akun LAIN daripada wallet yang sekarang terhubung".
  const walletPkRef = useRef(publicKey);
  useEffect(() => {
    walletPkRef.current = publicKey;
  }, [publicKey]);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  // Jaga agar re-auth-on-401 OTOMATIS hanya sekali (hindari loop kalau login pun tetap
  // ditolak). Tombol pemulihan di layar TIDAK dibatasi ini: setiap klik = keputusan user.
  const reauthedRef = useRef(false);
  // Hidup selama modal terpasang. Menggantikan flag `alive` lokal milik effect, karena
  // pemulihan sekarang juga bisa dipicu dari TOMBOL — di luar effect itu.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Satu alur (buat order / resume order) pada satu waktu. Tanpa ini, sesi baru yang
  // mendarat saat tombol pemulihan sedang jalan bisa menembakkan alur KEDUA — dan untuk
  // jalur "buat order" itu berarti DUA tagihan untuk satu pembelian.
  const flowBusyRef = useRef(false);
  // Token yang sudah terbukti ditolak / sudah dipakai mencoba. Dipakai effect "lanjut
  // otomatis" di bawah supaya ia hanya bereaksi pada sesi yang BENAR-BENAR baru.
  const staleTokenRef = useRef<string | null>(null);
  const [reauthBusy, setReauthBusy] = useState(false);

  // PULIH-SENDIRI vs HARUS-DITANDATANGANI — ini pembeda dua jalur login itu, dan semua
  // keputusan modal ini bergantung padanya:
  //   • Google/Privy  → `canAutoRecover` (embedded wallet-nya bisa menandatangani nonce
  //     tanpa user) DAN tidak punya publicKey wallet-adapter → pulih diam-diam.
  //   • wallet-adapter → publicKey ada, tidak ada yang bisa menandatangani selain user →
  //     pemulihan lewat tombol, dengan kalimat yang jelas.
  // publicKey diperiksa DULU: kalau wallet-nya terhubung, tanda tangan memang miliknya —
  // dan `login()` pun akan memakai wallet itu, bukan embedded wallet Privy.
  const autoRecover = !publicKey && canAutoRecover;
  const autoRecoverRef = useRef(autoRecover);
  useEffect(() => {
    autoRecoverRef.current = autoRecover;
  }, [autoRecover]);
  /** Bentuk ajakan yang pas untuk user ini saat sesinya habis. */
  const reauthMode: "sign" | "retry" | "signin" = publicKey
    ? "sign" // wallet terhubung → tanda tangan ulang
    : canAutoRecover
      ? "retry" // Google/Privy → coba cetak lagi (tanpa wallet sama sekali)
      : "signin"; // tidak ada sesi yang bisa dipakai → masuk lagi

  // Hangatkan rute tujuan "Lihat Kartu" segera saat modal punya successHref → begitu diklik,
  // bundle route-nya sudah ter-prefetch (navigasi terasa satset, bukan nunggu unduh route).
  useEffect(() => {
    if (successHref) router.prefetch(successHref);
  }, [successHref, router]);

  /** Terbitkan tagihan sesuai konteks modal: OFFER > LISTING > pack. */
  const buildOrder = useCallback(
    (t: string) =>
      offerId
        ? createOfferOrder(offerId, t)
        : listingId
          ? createListingOrder(listingId, t)
          : createPackOrder({ packType, method: "HOSTED" }, t),
    [offerId, listingId, packType],
  );

  /** Buat tagihan baru → layar bayar. */
  const startOrder = useCallback(
    async (t: string) => {
      staleTokenRef.current = t; // token ini SUDAH dipakai mencoba
      const created = await buildOrder(t);
      if (!mountedRef.current) return;
      setOrder(created);
      setStage("awaiting");
    },
    [buildOrder],
  );

  /** Balik dari halaman bayar: poll order yang SUDAH ada, jangan bikin yang baru. */
  const resumeOrder = useCallback(async (t: string, id: string) => {
    staleTokenRef.current = t; // token ini SUDAH dipakai mencoba
    const existing = await getPaymentOrder(id, t);
    if (!mountedRef.current) return;
    setOrder(existing);
    if (existing.status === "FULFILLED") {
      clearPendingPayment();
      setStage("done");
      onFulfilledRef.current?.(existing);
    } else if (isTerminalPaymentStatus(existing.status)) {
      clearPendingPayment();
      setErrorMsg(terminalPaymentMessage(existing.status));
      setStage("error");
    } else if (existing.status === "PAID" || existing.status === "FULFILLING") {
      // Genuinely paid, settlement in flight → "menyiapkan"; the poll drives it to FULFILLED.
      setStage("fulfilling");
    } else {
      // PENDING = order dibuat tapi BELUM dibayar (mis. user klik "Back" dari halaman Duitku
      // tanpa menuntaskan bayar, atau VA belum ditransfer). JANGAN klaim "Pembayaran
      // diterima ✓" — tampilkan layar bayar (awaiting) supaya user bisa menyelesaikan. Re-open
      // memakai order.paymentUrl yang SAMA (bukan order baru) → nol risiko bayar dobel; poll
      // tetap menangkap begitu lunas.
      setStage("awaiting");
    }
  }, []);

  /** Alur modal ini dengan sebuah token: resume kalau ada order, kalau tidak buat baru.
   *  Pemanggilnya WAJIB memegang `flowBusyRef` (lihat komentar di ref itu). */
  const runFlow = useCallback(
    async (t: string) => {
      if (resumeOrderId) await resumeOrder(t, resumeOrderId);
      else await startOrder(t);
    },
    [resumeOrderId, resumeOrder, startOrder],
  );

  /** SATU-SATUNYA tempat modal ini memutuskan apa yang terjadi sesudah alurnya gagal.
   *
   *  HANYA 401 yang dianggap sesi basi. 403 SENGAJA tidak ikut: itu "kamu login, tapi tidak
   *  berhak" — menyegarkan/membuang sesi di situ akan melempar orang keluar gara-gara satu
   *  tombol yang memang bukan haknya. (Dulu 401 dan 403 diperlakukan sama di sini, dan
   *  keduanya berakhir dengan membuka modal sambungkan-wallet.) */
  const handleFlowFailure = useCallback(
    async (e: unknown) => {
      const unauthorized = e instanceof ApiError && e.status === 401;
      if (unauthorized) {
        // Pemulihan OTOMATIS cuma untuk 401 yang pertama; 401 berikutnya langsung ke layar
        // ajakan. Yang penting: pembeli TIDAK PERNAH lagi mendarat di "Unauthorized".
        const firstTry = !reauthedRef.current;
        reauthedRef.current = true;
        if (firstTry && autoRecoverRef.current) {
          // USER GOOGLE: <PrivyBridge> mencetak sesi baru diam-diam. Nol tanda tangan, nol
          // modal wallet — ia memang tidak punya wallet — dan layar tetap di "Membuat tagihan…".
          let fresh: string | null = null;
          try {
            fresh = await login();
          } catch (e2) {
            console.warn("[bayar] pemulihan sesi otomatis gagal:", e2);
          }
          if (fresh) {
            staleTokenRef.current = fresh;
            try {
              await runFlow(fresh);
              return;
            } catch (e3) {
              if (!mountedRef.current) return;
              // Sesi barunya sah tapi alurnya tetap gagal → tampilkan sebab ASLINYA,
              // jangan menyamarkannya sebagai masalah sesi.
              if (!(e3 instanceof ApiError && e3.status === 401)) {
                setErrorMsg(e3 instanceof Error ? e3.message : String(e3));
                setStage("error");
                return;
              }
            }
          }
        }
        if (!mountedRef.current) return;
        // `staleTokenRef` TIDAK disentuh di sini: ia ditandai oleh startOrder/resumeOrder
        // dengan token yang BENAR-BENAR dipakai. Menimpanya dengan isi `tokenRef` (yang
        // baru menyusul satu render kemudian) bisa membuat effect "lanjut otomatis"
        // menyangka ada sesi baru dan menembakkan alur — di jalur buat-order itu tagihan kedua.
        setErrorMsg(null);
        setStage("expired");
        return;
      }
      if (!mountedRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage("error");
    },
    [login, runFlow],
  );

  /** Tombol di layar "sesi berakhir": ambil sesi baru, lalu lanjutkan alur yang tadi gagal. */
  const reauthAndContinue = useCallback(async () => {
    if (flowBusyRef.current) return;
    flowBusyRef.current = true;
    setReauthBusy(true);
    try {
      const fresh = await login(); // wallet → prompt tanda tangan; Google → diam-diam
      staleTokenRef.current = fresh; // tandai SEBELUM render berikutnya, biar tidak dobel
      if (!mountedRef.current) return;
      setErrorMsg(null);
      setStage(resumeOrderId ? "checking" : "creating");
      await runFlow(fresh);
    } catch (e) {
      if (!mountedRef.current) return;
      // Tetap di layar ajakan: tombolnya masih ada dan sebabnya tertulis.
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStage("expired");
    } finally {
      flowBusyRef.current = false;
      if (mountedRef.current) setReauthBusy(false);
    }
  }, [login, runFlow, resumeOrderId]);

  /** Ajakan kecil saat tagihannya SUDAH ada (menunggu bayar / sedang diproses): cukup
   *  perbarui sesinya, JANGAN jalankan ulang alurnya — di jalur "buat order" itu berarti
   *  tagihan KEDUA untuk satu pembelian. Polling menyambung sendiri begitu `token` berganti. */
  const reauthOnly = useCallback(async () => {
    setReauthBusy(true);
    try {
      const fresh = await login();
      staleTokenRef.current = fresh;
      if (mountedRef.current) setErrorMsg(null);
    } catch (e) {
      if (mountedRef.current) setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setReauthBusy(false);
    }
  }, [login]);

  /** Modal masuk — HANYA dari klik user. Isinya Phantom DAN tombol "Lanjut dengan Google",
   *  jadi ia bukan jalan buntu bagi yang tak punya wallet; tapi ia tidak boleh pernah
   *  terbuka sendiri, karena itu persis yang dulu terjadi pada pembeli Google. */
  const openSignIn = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  // Create the order once on mount (needs a JWT — sign in first if needed).
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    flowBusyRef.current = true;
    void (async () => {
      try {
        if (demo) {
          // No backend, no money: a fake order so the "awaiting" screen renders.
          if (!mountedRef.current) return;
          setOrder({
            merchantOrderId: "demo-order",
            packType,
            priceIdr: 450000,
            priceUsdc: 25_000_000,
            paymentMethod: "QRIS",
            status: "PENDING",
            qrContent: null,
            virtualAccountNo: null,
            paymentUrl: null,
            packMemo: null,
            expiresAt: null,
            createdAt: new Date().toISOString(),
            paidAt: null,
            fulfilledAt: null,
          });
          setStage("awaiting");
          return;
        }
        if (resumeOrderId) {
          // Returned from the payment page — poll the existing order, don't make a new one.
          let rt = tokenRef.current;
          if (!rt) rt = await login();
          await resumeOrder(rt, resumeOrderId);
          return;
        }
        let t = tokenRef.current;
        // JWT harus milik wallet yang SEDANG terhubung. Kalau belum sign-in (tak ada token) ATAU
        // token tersimpan milik akun LAIN (mis. berpindah wallet 8P5i↔kNwt di browser yang sama),
        // tanda tangani ulang untuk wallet sekarang — kalau tidak, backend menolak 401
        // ("Unauthorized") atau, lebih parah, tagihan dibuat atas nama akun yang SALAH.
        const connected = walletPkRef.current?.toBase58() ?? null;
        const tokenAccount = userRef.current?.walletAddress ?? null;
        if (!t || (connected && tokenAccount && connected !== tokenAccount)) {
          // login() sekarang punya DUA jalur: wallet terhubung → prompt tanda tangan;
          // tanpa wallet-adapter (user Google) → <PrivyBridge> mencetak sesi diam-diam.
          t = await login();
        }
        // OFFER (offerId) → bayar di harga offer; MARKETPLACE (listingId) → beli kartu; else pack.
        // Sisa alurnya (bayar hosted, poll) identik untuk semua.
        await startOrder(t);
      } catch (e) {
        await handleFlowFailure(e);
      } finally {
        flowBusyRef.current = false;
      }
    })();
    // `token` sengaja TIDAK di sini — dibaca via tokenRef (lihat komentar tokenRef di atas)
    // supaya login()-nya-membalik-token tidak men-teardown pembuatan order yang sedang jalan.
  }, [
    demo,
    packType,
    login,
    resumeOrderId,
    resumeOrder,
    startOrder,
    handleFlowFailure,
  ]);

  // Sesi baru mendarat SEMENTARA layar "sesi berakhir" tampil — dari <PrivyBridge> yang
  // akhirnya berhasil, atau dari modal masuk yang barusan dipakai user. Lanjutkan sendiri:
  // pembeli tidak perlu menekan tombol untuk sesuatu yang sudah beres.
  useEffect(() => {
    if (stage !== "expired") return;
    if (!token || token === staleTokenRef.current) return;
    if (flowBusyRef.current) return;
    flowBusyRef.current = true;
    staleTokenRef.current = token;
    setErrorMsg(null);
    setStage(resumeOrderId ? "checking" : "creating");
    void (async () => {
      try {
        await runFlow(token);
      } catch (e) {
        await handleFlowFailure(e);
      } finally {
        flowBusyRef.current = false;
      }
    })();
  }, [stage, token, resumeOrderId, runFlow, handleFlowFailure]);

  // Poll the order until it settles. Skipped in demo — the fake payment drives the stages.
  useEffect(() => {
    if (demo) return;
    if (stage !== "awaiting" && stage !== "fulfilling") return;
    if (!order || !token) return;
    let alive = true;
    const id = setInterval(async () => {
      try {
        const next = await getPaymentOrder(order.merchantOrderId, token);
        if (!alive) return;
        setOrder(next);
        if (next.status === "PAID" || next.status === "FULFILLING") setStage("fulfilling");
        if (isTerminalPaymentStatus(next.status)) {
          clearInterval(id);
          clearPendingPayment(); // resolved either way — don't resume it again
          if (next.status === "FULFILLED") {
            setStage("done");
            onFulfilledRef.current?.(next);
          } else {
            setErrorMsg(terminalPaymentMessage(next.status));
            setStage("error");
          }
        }
      } catch {
        /* transient — keep polling; a real failure surfaces via terminal status.
           401 di sini pun BUKAN kegagalan pembayaran: uangnya sudah/masih di jalurnya dan
           backend tetap memenuhi order lewat callback + rekonsiliasi. Penanganannya sudah
           terpusat — lib/api memberi tahu lib/useAuth, yang untuk user Google mencetak sesi
           baru (effect ini ber-dependency `token`, jadi ia menyambung sendiri) dan untuk user
           wallet menyalakan `needsReauth` → ajakan tanda tangan ulang muncul di bawah. */
      }
    }, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [stage, order, token, demo]);

  const openHostedPage = useCallback(() => {
    if (!order?.paymentUrl) return;
    // Stash the order so the return trip can resume it, then go to the payment page in the
    // SAME tab — so after paying, Duitku/IDRX redirects back here (returnUrl) and the
    // open-packs page auto-resumes + reveals. No second tab to get lost in.
    savePendingPayment(order.merchantOrderId, packType, listingId);
    window.location.href = order.paymentUrl;
  }, [order, packType, listingId]);

  // Demo "payment": walk the same stages a real settlement does (awaiting → fulfilling →
  // done) with fake timing, then fire onFulfilled so the caller runs its post-payment flow.
  const payDemo = useCallback(() => {
    setStage("fulfilling");
    window.setTimeout(() => {
      setStage("done");
      onFulfilledRef.current?.(order ?? ({ merchantOrderId: "demo-order", packType } as PaymentOrder));
    }, 1800);
  }, [order, packType]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isListing ? "Bayar kartu via rupiah" : "Bayar pack via rupiah"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/10 bg-[#141206] p-5"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-white">Bayar dengan Rupiah</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        {stage === "creating" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Membuat tagihan…</p>
          </Center>
        )}

        {stage === "checking" && (
          <Center>
            <Spinner />
            <p className="text-sm text-zinc-400">Memeriksa status pembayaran…</p>
          </Center>
        )}

        {stage === "awaiting" && order && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-center">
              <p className="text-sm text-zinc-300">
                Total{" "}
                <span className="font-semibold text-white">Rp {idr.format(order.priceIdr)}</span>
              </p>
              {/* Kejelasan harga: total = harga tertera + biaya layanan pembayaran (QRIS 0,7%),
                  supaya user tidak bingung kenapa nominalnya sedikit lebih tinggi dari harga kartu. */}
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Sudah termasuk biaya layanan pembayaran (QRIS/e-wallet ~0,7%).
              </p>
            </div>
            {demo ? (
              <>
                <span className="rounded-full border border-dashed border-emerald-400/40 bg-emerald-400/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                  Mode Demo — tanpa uang asli
                </span>
                {/* Fake QRIS placeholder — no real code, purely to mimic the real screen. */}
                <div className="grid h-40 w-40 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xs text-zinc-500">
                  QRIS (demo)
                </div>
                <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
                  Ini simulasi. Pencet tombol di bawah untuk pura-pura bayar & lihat apa yang
                  terjadi setelahnya.
                </p>
                <button
                  type="button"
                  onClick={payDemo}
                  className="w-full rounded-xl border border-emerald-400/40 bg-emerald-400/[0.1] px-4 py-3 text-[15px] font-semibold text-emerald-300 transition hover:bg-emerald-400/20"
                >
                  💳 Bayar (Demo)
                </button>
              </>
            ) : (
              <>
                <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
                  Klik tombol di bawah untuk membuka halaman pembayaran IDRX (QRIS, e-wallet,
                  atau virtual account). Setelah bayar, jendela ini otomatis update.
                </p>
                <button
                  type="button"
                  onClick={openHostedPage}
                  className="w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
                  style={{ backgroundImage: GOLD_GRADIENT }}
                >
                  Buka Halaman Pembayaran ↗
                </button>
                <p className="flex items-center gap-2 text-xs text-zinc-500">
                  <Spinner small /> Menunggu pembayaran…
                </p>
              </>
            )}
          </div>
        )}

        {stage === "fulfilling" && (
          <Center>
            <Spinner />
            <p className="text-sm font-medium text-emerald-400">Pembayaran diterima ✓</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              Lagi dikonfirmasi di jaringan blockchain — biasanya{" "}
              <span className="font-semibold text-zinc-200">1–3 menit</span>. Tunggu
              sebentar ya
              {isListing
                ? ", kartunya bakal langsung dikirim ke wallet-mu. ✨"
                : ", animasi pack-nya bakal main otomatis di sini. 🎬"}
            </p>
            <p className="text-[11px] text-zinc-500">Jangan tutup halaman ini.</p>
          </Center>
        )}

        {stage === "expired" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-amber-500/15 text-2xl">
              ⏳
            </div>
            <p className="text-base font-semibold text-white">Sesi kamu sudah berakhir</p>
            <p className="max-w-[18rem] text-[13px] leading-relaxed text-zinc-400">
              {reauthMode === "sign"
                ? "Demi keamanan, sesi login cuma berlaku 7 hari. Tanda tangani sekali lagi di wallet-mu untuk melanjutkan. "
                : reauthMode === "retry"
                  ? "Kami sedang memperbarui sesimu. Tekan tombol di bawah untuk mencoba sekali lagi. "
                  : "Masuk lagi untuk melanjutkan. Pakai Google kalau kamu tidak punya wallet — tombolnya ada di jendela yang terbuka nanti. "}
              {/* Jaminan yang benar untuk KONTEKSNYA. Di alur resume, uangnya bisa saja SUDAH
                  dibayar; menulis "belum ada uang yang keluar" di situ = berbohong ke pembeli. */}
              {resumeOrderId
                ? "Pembayaranmu aman dan tetap diproses — sesi yang berlaku cuma dibutuhkan untuk menampilkan statusnya di sini."
                : "Belum ada uang yang keluar dan belum ada tagihan yang terbuat."}
            </p>
            {errorMsg && (
              <p className="max-w-[18rem] text-[12px] leading-relaxed text-red-300">{errorMsg}</p>
            )}
            <button
              type="button"
              onClick={reauthMode === "signin" ? openSignIn : () => void reauthAndContinue()}
              disabled={reauthBusy}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-60"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              {reauthBusy
                ? "Menyiapkan sesi…"
                : reauthMode === "sign"
                  ? "Tanda tangani ulang"
                  : reauthMode === "retry"
                    ? "Coba lagi"
                    : "Masuk lagi"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-[15px] font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </Center>
        )}

        {/* Sesi habis saat tagihannya SUDAH ada. Jangan mengubah layar (uangnya mungkin
            sudah di jalan) — cukup ajak menandatangani ulang supaya pemantauan statusnya
            nyambung lagi. Tidak pernah membuka modal apa pun sendiri. */}
        {needsReauth && (stage === "awaiting" || stage === "fulfilling") && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3 text-left">
            <p className="text-[12px] leading-relaxed text-amber-200">
              {/* Kalimatnya mengikuti TAHAPNYA: di "awaiting" belum ada uang yang dibayar,
                  jadi jangan menjanjikan "pembayaranmu tetap diproses" di situ. */}
              {stage === "fulfilling"
                ? "Sesi kamu sudah berakhir. Pembayaranmu aman dan tetap diproses — masuk lagi supaya jendela ini bisa memantau statusnya."
                : "Sesi kamu sudah berakhir. Tagihannya tetap berlaku dan tombol bayar di atas tetap bisa dipakai — masuk lagi supaya jendela ini bisa memantau statusnya."}
            </p>
            {errorMsg && (
              <p className="mt-1 text-[12px] leading-relaxed text-red-300">{errorMsg}</p>
            )}
            <button
              type="button"
              onClick={reauthMode === "signin" ? openSignIn : () => void reauthOnly()}
              disabled={reauthBusy}
              className="mt-2 w-full rounded-lg border border-amber-400/40 bg-amber-400/[0.12] px-3 py-2 text-[13px] font-semibold text-amber-100 transition hover:bg-amber-400/20 disabled:opacity-60"
            >
              {reauthBusy
                ? "Menyiapkan sesi…"
                : reauthMode === "sign"
                  ? "Tanda tangani ulang"
                  : reauthMode === "retry"
                    ? "Perbarui sesi"
                    : "Masuk lagi"}
            </button>
          </div>
        )}

        {stage === "done" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <p className="text-base font-semibold text-white">
              {isListing ? "Kartu berhasil dibeli!" : "Pack berhasil dibeli!"}
            </p>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              {successHref
                ? "Kartu sudah jadi milikmu — lihat detailnya."
                : "Kartu sudah dikirim ke wallet-mu. Cek di Vault."}
            </p>
            <button
              type="button"
              onClick={successHref ? () => router.push(successHref) : onClose}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105"
              style={{ backgroundImage: GOLD_GRADIENT }}
            >
              {successHref ? "Lihat Kartu →" : "Selesai"}
            </button>
          </Center>
        )}

        {stage === "error" && (
          <Center>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-red-500/15 text-2xl text-red-400">
              !
            </div>
            <p className="max-w-[18rem] text-[13px] text-zinc-400">
              {errorMsg ?? "Terjadi kesalahan."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-[15px] font-semibold text-zinc-200 transition hover:bg-white/10"
            >
              Tutup
            </button>
          </Center>
        )}
      </div>
    </div>,
    document.body,
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center gap-3 py-4 text-center">{children}</div>;
}

function Spinner({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`animate-spin rounded-full border-2 border-white/25 border-t-yellow-400 ${
        small ? "h-3.5 w-3.5" : "h-8 w-8"
      }`}
    />
  );
}
