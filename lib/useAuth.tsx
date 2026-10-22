"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import {
  login as apiLogin,
  registerUnauthorizedHandler,
  requestNonce,
} from "./api";
import type { LoginResponse } from "./api";

const TOKEN_KEY = "hoshi_jwt";
const USER_KEY = "hoshi_user";

const ADMIN_WALLET = process.env.NEXT_PUBLIC_ADMIN_WALLET ?? null;

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Baca token tanpa bisa melempar — dipanggil juga dari luar React (pemulih 401),
 *  di mana localStorage bisa diblokir (mode privat / storage dipartisi). */
function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): string | null {
  return readStoredToken();
}

function getServerSnapshot(): string | null {
  return null;
}

const noopSubscribe = () => () => {};
function getHydratedClient() { return true; }
function getHydratedServer() { return false; }

function getStoredUserRaw(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

function parseUser(raw: string | null): LoginResponse["user"] | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as LoginResponse["user"]; } catch { return null; }
}

function setStoredToken(token: string | null, user?: LoginResponse["user"] | null) {
  try {
    if (token === null) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  } catch {
    /* storage diblokir — sesi jadi seumur tab saja; jangan sampai melempar ke pemanggil */
  }
  // Dicatat untuk pagar anti-lingkaran di bawah: 401 yang datang TEPAT setelah sebuah
  // token dicetak berarti token BARU-nya pun ditolak — itu bukan sesi kedaluwarsa biasa.
  if (token !== null) lastMintAt = Date.now();
  listeners.forEach((l) => l());
}

/* ---- Privy logout bridge --------------------------------------------------

   A Privy (Google) session outlives our JWT: clearing the JWT alone would make
   <PrivyBridge> immediately re-mint one, so `logout()` must ALSO end the Privy
   session. The bridge registers Privy's logout here, and `logout()` flips
   `suppressAutoLogin` so the bridge doesn't re-login during the tear-down race
   (it clears once Privy reports `authenticated=false`). Module-level so the two
   sides don't need a shared React context. */
let externalLogout: (() => void | Promise<void>) | null = null;
let suppressAutoLogin = false;

/** The bridge registers Privy's logout; returns an unregister for effect cleanup. */
export function registerPrivyLogout(fn: () => void | Promise<void>): () => void {
  externalLogout = fn;
  return () => {
    if (externalLogout === fn) externalLogout = null;
  };
}
/** True right after a manual logout — blocks the bridge from auto-re-logging-in. */
export const isAutoLoginSuppressed = () => suppressAutoLogin;
/** The bridge clears this once Privy has actually signed out. */
export const clearAutoLoginSuppression = () => {
  suppressAutoLogin = false;
};

/* ---- Sesi kedaluwarsa: DUA jalur login, DUA perlakuan --------------------------

   Ada dua cara masuk ke Hoshi, dan cuma SATU yang bisa mencetak sesi baru sendiri:

     • GOOGLE / PRIVY — embedded wallet-nya bisa menandatangani nonce login TANPA
       melibatkan user. <PrivyBridge> mendaftarkan pencetak itu di sini
       (registerPrivyReSignIn), jadi token basi bisa DIGANTI diam-diam. Pembeli tidak
       melakukan apa pun dan tidak pernah melihat modal wallet — ia memang tidak punya
       wallet dan tidak pernah butuh satu.
     • WALLET-ADAPTER / SIWS — tidak ada yang bisa menandatangani selain user; wallet
       harus memunculkan prompt. Pemulihannya WAJIB dipicu tombol.

   Karena itu 401 tidak diperlakukan sama untuk keduanya, dan token basi milik user
   wallet SENGAJA TIDAK DIBUANG. Membuangnya akan mengeluarkan mereka dari seluruh
   aplikasi (nav, vault, /account ikut kosong) padahal tidak ada apa pun yang bisa
   mencetak penggantinya — sementara jalur pulih mereka yang sudah ada (tanda tangan
   ulang saat menekan tombol beli) justru bekerja hari ini. Untuk mereka kita cuma
   MENYALAKAN `needsReauth`, supaya layar bisa mengajak menandatangani ulang dengan
   kalimat yang jelas alih-alih menampilkan "Unauthorized".

   Untuk user Google token lamanya DIGANTI, bukan dikosongkan lebih dulu: mengosongkannya
   membuat seluruh aplikasi berkedip "belum masuk" selama 1-3 detik (nav, gate /open-packs
   yang membaca `activeAddress`, layar yang menyembunyikan isinya saat !isAuthed) tanpa
   manfaat apa pun — <PrivyBridge> dipanggil LANGSUNG di sini, jadi ia tidak perlu
   dipancing lewat perubahan state. Token cuma benar-benar dibuang kalau pencetakan
   ulangnya GAGAL: sejak saat itu token mati tidak boleh lagi menyamar jadi sesi hidup. */

/** Pencetak sesi milik <PrivyBridge>. `manual` = dipicu user (jatah otomatisnya direset). */
export type ReSignIn = (opts?: { manual?: boolean }) => Promise<string>;

let privyReSignIn: ReSignIn | null = null;
/** true = sesi basi butuh TANGAN USER (tidak ada pencetak otomatis, atau pencetaknya gagal). */
let needsReauth = false;
/** Kapan token terakhir dicetak — dipakai mengenali "token yang baru dicetak pun ditolak". */
let lastMintAt = 0;
/** Berapa kali 401 datang atas token yang baru saja dicetak. Pagar anti-lingkaran. */
let freshRejects = 0;
/** true = berhenti mencetak otomatis sampai user sendiri yang memicu login. */
let autoHealBlocked = false;
/** Satu pencetakan otomatis pada satu waktu, dibagi ke semua pemanggil (nol mint ganda). */
let healing: Promise<string | null> | null = null;

/** 401 yang datang dalam jendela ini setelah sebuah mint = token barunya yang ditolak. */
const FRESH_REJECT_WINDOW_MS = 60_000;
/** Sesudah sekian kali token baru ditolak, berhenti: pencetakan berikutnya pasti ditolak juga. */
const MAX_FRESH_REJECTS = 2;

/* Store kecil terpisah untuk kedua fakta di atas. Tidak bisa menumpang `listeners`
   (store token): snapshot-nya token yang nilainya tidak berubah, jadi useSyncExternalStore
   akan membatalkan render-nya dan bendera ini tidak pernah sampai ke layar. */
const flagListeners = new Set<() => void>();
function notifyFlags() {
  flagListeners.forEach((l) => l());
}
function subscribeFlags(cb: () => void) {
  flagListeners.add(cb);
  return () => {
    flagListeners.delete(cb);
  };
}
const getNeedsReauth = () => needsReauth;
const getCanAutoRecover = () => privyReSignIn !== null;
const getFlagServerSnapshot = () => false;

function setNeedsReauth(value: boolean) {
  if (needsReauth === value) return;
  needsReauth = value;
  notifyFlags();
}

/** True = pencetakan OTOMATIS sudah dihentikan (token baru pun ditolak berkali-kali).
 *  <PrivyBridge> ikut mematuhi ini, kalau tidak, sesi yang selalu ditolak akan dicetak
 *  ulang tanpa henti: setiap mint mematikan `needsReauth`, setiap 401 menyalakannya lagi,
 *  dan effect auto-login-nya terpicu oleh bendera itu. Hanya aksi user yang mencabutnya. */
export const isAutoRecoveryBlocked = () => autoHealBlocked;

/** <PrivyBridge> mendaftarkan pencetak sesinya; kembaliannya untuk cleanup effect. */
export function registerPrivyReSignIn(fn: ReSignIn): () => void {
  const had = privyReSignIn !== null;
  privyReSignIn = fn;
  if (!had) notifyFlags();
  return () => {
    if (privyReSignIn !== fn) return;
    privyReSignIn = null;
    notifyFlags();
  };
}

/** Cetak ulang sesi lewat Privy. Satu percobaan dibagi ke semua pemanggil, jadi
 *  polling 4 detik yang berkali-kali kena 401 tetap menghasilkan SATU pencetakan. */
function reSignInWithPrivy(manual: boolean): Promise<string | null> {
  if (healing) return healing;
  const fn = privyReSignIn;
  if (!fn) return Promise.resolve(null);
  if (manual) {
    // User sendiri yang meminta → cabut pagar otomatis dan beri kesempatan bersih.
    autoHealBlocked = false;
    freshRejects = 0;
  }
  const run = fn({ manual })
    .then((fresh) => {
      setNeedsReauth(false);
      return fresh;
    })
    .catch((e: unknown) => {
      console.warn("[auth] gagal mencetak sesi baru:", e);
      // Privy-nya sendiri sudah tidak bisa dipakai. Sejak titik ini token mati tidak
      // boleh menyamar jadi sesi hidup — kosongkan, lalu ajak user masuk lagi.
      setStoredToken(null);
      setNeedsReauth(true);
      return null;
    })
    .finally(() => {
      healing = null;
    });
  healing = run;
  return run;
}

/** Satu-satunya reaksi aplikasi terhadap 401 (dipasang ke lib/api di bawah). */
function handleUnauthorized(): void {
  if (typeof window === "undefined") return;
  if (suppressAutoLogin) return; // logout manual sedang berjalan — jangan lawan
  if (!readStoredToken()) return; // tidak ada sesi → layar login biasa yang berlaku
  if (!privyReSignIn || autoHealBlocked) {
    // Wallet/SIWS (atau Privy yang sudah menyerah): hanya user yang bisa memulihkan.
    // Tokennya DIBIARKAN — lihat catatan panjang di atas.
    setNeedsReauth(true);
    return;
  }
  if (Date.now() - lastMintAt < FRESH_REJECT_WINDOW_MS) {
    // Token yang baru saja dicetak pun ditolak. Mencetak lagi hanya akan ditolak lagi.
    freshRejects += 1;
    if (freshRejects >= MAX_FRESH_REJECTS) {
      autoHealBlocked = true;
      setStoredToken(null);
      setNeedsReauth(true);
      return;
    }
  } else {
    freshRejects = 0; // kedaluwarsa biasa (jauh dari mint terakhir) — mulai dari nol
  }
  void reSignInWithPrivy(false);
}

registerUnauthorizedHandler(handleUnauthorized);

/** Signs the raw nonce bytes with whatever wallet the caller controls. */
export type MessageSigner = (message: Uint8Array) => Promise<Uint8Array>;

type AuthContextValue = {
  token: string | null;
  isAuthed: boolean;
  hydrated: boolean;
  user: LoginResponse["user"] | null;
  isAdmin: boolean;
  login: () => Promise<string>;
  /** Nonce→sign→JWT for ANY signer (wallet-adapter, or a Privy embedded wallet
   *  once Google/email login is wired). Backend /auth/* accept any address whose
   *  signature verifies, so no backend change is needed for a new login method. */
  loginWith: (address: string, signMessage: MessageSigner) => Promise<string>;
  /** The address to DISPLAY as "connected": the wallet-adapter key when a wallet
   *  is connected, else the signed-in user's wallet from the JWT. This is what
   *  lets a Privy/Google user (who has no wallet-adapter publicKey) still read as
   *  connected across the nav / vault / settings. Prefer this over
   *  `useWallet().publicKey` for DISPLAY; keep `useWallet()` for signing. */
  activeAddress: string | null;
  /** true = sesi sudah basi DAN tidak ada yang bisa mencetak penggantinya sendiri.
   *  Layar memakai ini untuk MENGAJAK menandatangani ulang, bukan menampilkan
   *  "Unauthorized". Padam sendiri begitu ada login yang berhasil. */
  needsReauth: boolean;
  /** true = sesi basi bisa diganti DIAM-DIAM (user Google/Privy; <PrivyBridge> siap).
   *  Layar memakai ini untuk memilih: pulihkan sendiri, atau tampilkan tombol. */
  canAutoRecover: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage } = useWallet();
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(noopSubscribe, getHydratedClient, getHydratedServer);
  const userRaw = useSyncExternalStore(subscribe, getStoredUserRaw, getServerSnapshot);
  const user = parseUser(userRaw);
  const needsReauth = useSyncExternalStore(
    subscribeFlags,
    getNeedsReauth,
    getFlagServerSnapshot,
  );
  const canAutoRecover = useSyncExternalStore(
    subscribeFlags,
    getCanAutoRecover,
    getFlagServerSnapshot,
  );

  const walletAddress = publicKey?.toBase58() ?? null;
  // Wallet-adapter key wins; otherwise fall back to the JWT user's wallet (a
  // Google/Privy user is authed with a real address but no wallet-adapter key).
  const activeAddress = walletAddress ?? (token ? user?.walletAddress ?? null : null);

  const isAdmin =
    user?.role === "ADMIN" ||
    (!!activeAddress && !!ADMIN_WALLET && activeAddress === ADMIN_WALLET);

  // The provider-agnostic core: nonce → sign → JWT for a given address + signer.
  const loginWith = useCallback<AuthContextValue["loginWith"]>(async (address, signMessageFn) => {
    const { message } = await requestNonce(address);
    const sig = await signMessageFn(new TextEncoder().encode(message));
    const { accessToken, user: userData } = await apiLogin(address, bs58.encode(sig));
    setStoredToken(accessToken, userData);
    // Sesi yang sah lagi → ajakan "tanda tangani ulang" dicabut di SEMUA layar sekaligus.
    // `freshRejects` SENGAJA tidak direset di sini: jalur Privy juga lewat sini, dan
    // meresetnya di setiap mint akan membuat pagar mint→401→mint tidak pernah tercapai.
    setNeedsReauth(false);
    return accessToken;
  }, []);

  const login = useCallback(async () => {
    // TIDAK ADA wallet-adapter yang bisa diminta tanda tangan → ini user Google/Privy.
    // Minta <PrivyBridge> mencetak sesi baru (diam-diam, nol modal wallet). Inilah yang
    // membuat setiap layar yang sudah berbunyi `catch 401 -> login()` — beli di
    // marketplace, rip pack, jual, vault — ikut pulih untuk mereka, tanpa satu pun dari
    // layar itu perlu tahu soal Privy. Sebelum ini `login()` langsung melempar
    // "Connect a wallet first." dan di situlah jalan buntunya: pesan tentang wallet
    // untuk orang yang tidak punya wallet.
    if (!publicKey || !signMessage) {
      if (privyReSignIn) {
        const fresh = await reSignInWithPrivy(true);
        if (fresh) return fresh;
        throw new Error(
          "Sesi kamu sudah berakhir dan kami belum berhasil memperbaruinya. Coba muat ulang halaman, lalu masuk lagi.",
        );
      }
    }
    if (!publicKey) throw new Error("Hubungkan wallet atau masuk dengan Google dulu.");
    if (!signMessage)
      throw new Error("Wallet ini tidak mendukung tanda tangan pesan.");
    return loginWith(publicKey.toBase58(), signMessage);
  }, [publicKey, signMessage, loginWith]);

  const logout = useCallback(() => {
    suppressAutoLogin = true; // block <PrivyBridge> from re-minting a session
    void externalLogout?.(); // end the Privy session too (no-op for wallet users)
    setStoredToken(null);
    // Keluar atas kemauan sendiri BUKAN sesi kedaluwarsa: jangan tinggalkan ajakan
    // "tanda tangani ulang" menyala, dan kembalikan jatah pemulihan otomatis.
    setNeedsReauth(false);
    autoHealBlocked = false;
    freshRejects = 0;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthed: !!token,
        hydrated,
        user,
        isAdmin,
        login,
        loginWith,
        activeAddress,
        needsReauth,
        canAutoRecover,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>.");
  return ctx;
}
