"use client";

// Bridges a Privy (Google/email) login into our own JWT session. Steps, once
// Privy reports authenticated:
//   1. ensure a Solana embedded wallet exists — if createOnLogin didn't produce
//      one, create it EXPLICITLY (with a real error surfaced, not a silent hang);
//   2. run the standard nonce→sign→JWT (useAuth.loginWith) with that wallet.
// So a Google user ends up with the same session a Phantom user has, and the
// backend needs no change. Renders nothing. ONLY mount when PRIVY_ENABLED (it
// calls Privy hooks, which require a <PrivyProvider> ancestor).

import { useCallback, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
  useWallets,
  useSignMessage,
  useCreateWallet,
  useSignTransaction,
} from "@privy-io/react-auth/solana";
import {
  useAuth,
  registerPrivyLogout,
  registerPrivyReSignIn,
  isAutoLoginSuppressed,
  isAutoRecoveryBlocked,
  clearAutoLoginSuppression,
  type ReSignIn,
} from "@/lib/useAuth";
import { registerPrivySigner } from "@/lib/txSigner";
import { registerCcEmbeddedSigner, clearCcSiwsToken } from "@/lib/ccShippingAuth";

/** Percobaan nonce→sign→JWT dalam SATU pencetakan (backend bisa dingin/berkedip). */
const MINT_ATTEMPTS = 4;
const MINT_BACKOFF_MS = 1_500;
/** Berapa pencetakan OTOMATIS beruntun yang boleh gagal sebelum berhenti sendiri.
 *  Tanpa ini, sesi yang selalu ditolak akan dicetak ulang terus-menerus. Dipulihkan
 *  begitu ada satu pencetakan yang berhasil, atau saat user sendiri yang meminta. */
const MAX_AUTO_CYCLES = 2;
/** Batas menunggu embedded wallet muncul di useWallets() setelah createWallet(). */
const WALLET_WAIT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PrivyBridge() {
  const { ready, authenticated, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { createWallet } = useCreateWallet();
  const { signTransaction } = useSignTransaction();
  const { token, user, needsReauth, loginWith } = useAuth();
  // Pencetakan yang SEDANG berjalan — dibagi ke semua pemanggil (effect di bawah DAN
  // pemulih 401 di lib/useAuth), jadi tidak pernah ada dua nonce/login berbarengan.
  // Dulu perannya dipegang `busyRef` boolean yang TIDAK PERNAH dikembalikan ke false
  // setelah login berhasil: sekali sesi tercetak, bridge ini lumpuh sampai halaman
  // dimuat ulang — jadi "kosongkan token, nanti bridge mencetak sendiri" pun tidak akan
  // terjadi di tab yang sesinya baru saja dicetak. Promise ini selalu dilepas di finally.
  const inFlightRef = useRef<Promise<string> | null>(null);
  // Jatah pencetakan OTOMATIS yang sudah terpakai (lihat MAX_AUTO_CYCLES).
  const autoCyclesRef = useRef(0);

  // The embedded wallet CC has to sign with, and its address.
  const ccWallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
  const ccAddress = ccWallet?.address ?? null;

  // Latest wallet + signMessage via refs so the CC registration effect below can key on the
  // ADDRESS ALONE (same reason as <CcShippingBridge>): `wallets` and `signMessage` get new
  // identities on renders where nothing actually changed, and re-running that effect on the
  // churn would clear the cached `cca_…` token and force the user to sign a fresh SIWS
  // message every time.
  const ccWalletRef = useRef(ccWallet);
  const ccSignMessageRef = useRef(signMessage);
  useEffect(() => {
    ccWalletRef.current = ccWallet;
    ccSignMessageRef.current = signMessage;
  }, [ccWallet, signMessage]);

  // Bahan pencetak sesi, dibaca lewat ref DENGAN ALASAN YANG SAMA: `wallets`,
  // `signMessage` dan `createWallet` berganti identitas di render yang sebenarnya tidak
  // mengubah apa pun. Dengan ref, `mintSession` di bawah jadi STABIL — kalau tidak, ia
  // akan mendaftar-ulang ke lib/useAuth dan membongkar-pasang effect-nya di setiap churn.
  const walletsRef = useRef(wallets);
  const signMessageRef = useRef(signMessage);
  const createWalletRef = useRef(createWallet);
  useEffect(() => {
    walletsRef.current = wallets;
    signMessageRef.current = signMessage;
    createWalletRef.current = createWallet;
  }, [wallets, signMessage, createWallet]);

  // Let our logout() end the Privy session too.
  useEffect(() => registerPrivyLogout(privyLogout), [privyLogout]);

  // Publish this wallet's transaction signer so non-Privy code (the buyback flow)
  // can use it without importing Privy hooks — those would crash wherever Privy
  // is disabled. Re-registers whenever the wallet changes, and unregisters on
  // logout so a stale signer can't fail mid-buyback.
  useEffect(() => {
    const wallet = wallets.find((w) => w.standardWallet?.name === "Privy") ?? wallets[0];
    if (!wallet) return;
    return registerPrivySigner(async (tx) => {
      const { signedTransaction } = await signTransaction({ transaction: tx, wallet });
      return signedTransaction;
    });
  }, [wallets, signTransaction]);

  // Publish this embedded wallet as a CollectorCrypt SIWS signer. CC accepts ONE
  // credential for a Solana redemption — a `cca_…` token minted by signing a SIWS
  // message with the wallet that OWNS the card (their API key is EVM-only, and a
  // Privy identity token is not a CC credential at all: that was our 401). A
  // Google user's cards are minted to this embedded wallet, so this is the wallet
  // that has to sign — and it is the same address our own JWT is issued for,
  // which is what lib/ccShippingAuth keys the handshake on. Registered only while
  // authenticated; keyed on the ADDRESS alone (the signer is read through refs), so
  // the cleanup — and the token wipe it does — only runs when the address actually
  // changes or the user logs out, never on signMessage/wallets identity churn.
  useEffect(() => {
    if (!authenticated || !ccAddress) return;
    const unregister = registerCcEmbeddedSigner({
      address: ccAddress,
      signMessage: async (message) => {
        const wallet = ccWalletRef.current;
        if (!wallet) throw new Error("Dompet Privy belum siap untuk menandatangani.");
        const { signature } = await ccSignMessageRef.current({ message, wallet });
        return signature;
      },
    });
    return () => {
      unregister();
      // Address changed / logged out → drop THIS wallet's CC token so it can't be
      // attached to a request for a different identity.
      clearCcSiwsToken(ccAddress);
    };
  }, [authenticated, ccAddress]);

  // Cetak SATU sesi Hoshi dari embedded wallet: pastikan wallet-nya ada → nonce → sign →
  // JWT. Dipakai oleh DUA pemanggil: effect auto-login di bawah (Privy baru selesai login)
  // dan pemulih 401 di lib/useAuth (sesi 7 hari yang habis di tengah jalan). Keduanya
  // berbagi satu promise, jadi pembeli yang menekan tombol beli saat polling juga sedang
  // kena 401 tetap hanya menandatangani satu nonce.
  const mintSession = useCallback<ReSignIn>(
    async (opts) => {
      const manual = opts?.manual === true;
      const inFlight = inFlightRef.current;
      if (inFlight) return inFlight;
      // Permintaan user mengembalikan jatah otomatis: ia menekan tombol, bukan loop.
      if (manual) autoCyclesRef.current = 0;
      if (autoCyclesRef.current >= MAX_AUTO_CYCLES)
        throw new Error("Sesi baru gagal dicetak berkali-kali — berhenti mencoba sendiri.");
      autoCyclesRef.current += 1;

      const pick = () => {
        const list = walletsRef.current;
        return list.find((w) => w.standardWallet?.name === "Privy") ?? list[0];
      };

      const run = (async () => {
        let wallet = pick();
        // 1) Belum ada embedded wallet → buat eksplisit. createOnLogin bisa gagal/menggantung;
        //    membuatnya di sini memunculkan error aslinya di console.
        if (!wallet) {
          try {
            console.debug("[privy-bridge] creating embedded Solana wallet…");
            const created = await createWalletRef.current();
            console.debug("[privy-bridge] wallet created ✓", created?.wallet?.address);
          } catch (e) {
            // "already has an embedded wallet" itu wajar — ia akan muncul di `wallets`.
            console.warn("[privy-bridge] createWallet returned:", e);
          }
          // Tunggu useWallets() memantulkannya. (Dulu di sini alurnya BERHENTI dan
          // menggantungkan diri pada effect yang dijalankan ulang; sebagai fungsi yang
          // mengembalikan token, ia harus menyelesaikan urusannya sendiri.)
          const deadline = Date.now() + WALLET_WAIT_MS;
          while (!wallet && Date.now() < deadline) {
            await sleep(400);
            wallet = pick();
          }
        }
        if (!wallet) throw new Error("Dompet Privy belum siap.");
        const w = wallet;

        // 2) Sudah ada wallet → nonce→sign→JWT, diulang untuk backend yang dingin.
        let lastError: unknown;
        for (let attempt = 1; attempt <= MINT_ATTEMPTS; attempt++) {
          try {
            console.debug(`[privy-bridge] sign-in attempt ${attempt} for ${w.address}`);
            const fresh = await loginWith(w.address, async (message) => {
              console.debug("[privy-bridge] signing login nonce…");
              const { signature } = await signMessageRef.current({ message, wallet: w });
              console.debug("[privy-bridge] nonce signed ✓");
              return signature;
            });
            console.debug("[privy-bridge] signed in ✓ (JWT stored)");
            return fresh;
          } catch (e) {
            lastError = e;
            console.error(`[privy-bridge] sign-in attempt ${attempt} failed:`, e);
            if (attempt < MINT_ATTEMPTS) await sleep(MINT_BACKOFF_MS);
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      })();

      inFlightRef.current = run;
      try {
        const fresh = await run;
        autoCyclesRef.current = 0; // sesi hidup lagi → jatah otomatis pulih
        return fresh;
      } finally {
        inFlightRef.current = null;
      }
    },
    [loginWith],
  );

  // Umumkan pencetak sesi ke lib/useAuth selama sesi Privy hidup. SEJAK SAAT INI seluruh
  // aplikasi tahu bahwa 401 milik user INI bisa dipulihkan tanpa melibatkan dia, dan
  // `login()` punya jalan untuk user yang tidak punya wallet-adapter sama sekali.
  useEffect(() => {
    if (!ready || !authenticated) return;
    return registerPrivyReSignIn(mintSession);
  }, [ready, authenticated, mintSession]);

  useEffect(() => {
    if (!authenticated) {
      // Signed out of Privy → a manual logout is fully done; re-arm.
      clearAutoLoginSuppression();
      autoCyclesRef.current = 0;
      return;
    }
    // Sesi kosong = cetak (perilaku lama). TAMBAHANNYA: token yang masih tersimpan tapi
    // sudah TERBUKTI DITOLAK (`needsReauth`) juga tidak boleh menghalangi — itu persis
    // keadaan "pembeli kembali di hari ke-9": token basinya masih ada, dan dulu justru
    // token itulah yang membuat bridge ini diam.
    //
    // Tapi hanya kalau token basi itu MILIK embedded wallet ini. Kalau ia milik wallet lain
    // (Phantom yang kedaluwarsa, sementara sesi Google kebetulan ikut hidup di browser yang
    // sama), mencetak di sini akan diam-diam MEMINDAHKAN orang ke akun yang berbeda — vault
    // dan riwayatnya ikut berganti. Untuk kasus itu, biarkan user yang memilih.
    const staleIsOurs =
      needsReauth && (!user?.walletAddress || user.walletAddress === ccAddress);
    if (
      !ready ||
      (token && !staleIsOurs) ||
      isAutoLoginSuppressed() ||
      isAutoRecoveryBlocked() // sudah menyerah — tunggu user, jangan berputar
    )
      return;
    void mintSession().catch((e: unknown) => {
      console.error("[privy-bridge] auto sign-in failed:", e);
    });
  }, [
    ready,
    authenticated,
    token,
    needsReauth,
    user?.walletAddress,
    ccAddress,
    mintSession,
  ]);

  return null;
}
