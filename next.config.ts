import type { NextConfig } from "next";

/**
 * Security headers — required to move the Privy app to PRODUCTION.
 *
 *  1. Content-Security-Policy: protects the Privy embedded-wallet iframe
 *     (frame-src/child-src allowlist) and blocks clickjacking (frame-ancestors
 *     'none'). Privy's recommended baseline is EXTENDED with Hoshi's own hosts so
 *     the live site keeps working: backend API + Solana RPC (derived from env so
 *     prod→api.hoshimarket.xyz and staging→its own backend, no hardcoding),
 *     Cloudinary/CollectorCrypt/Irys images, pack videos (Vercel blob), fonts.
 *     script-src keeps 'unsafe-inline'/'unsafe-eval' because Next.js hydration and
 *     the web3/wallet libs need them — harden later with per-request nonces.
 *  2. X-Frame-Options: DENY — legacy clickjacking guard (frame-ancestors is the
 *     modern equivalent; both set for old + new browsers). This restricts who may
 *     frame Hoshi; it does NOT affect Hoshi framing Privy's iframe (that's frame-src).
 *
 * connect-src is derived from the same NEXT_PUBLIC_* env the app reads, so the CSP
 * can never drift from the backend/RPC the build actually talks to.
 */
function originOf(u: string | undefined): string | null {
  if (!u) return null;
  try {
    return new URL(u).origin;
  } catch {
    return null;
  }
}

const envConnect = [
  originOf(process.env.NEXT_PUBLIC_API_URL),
  originOf(process.env.NEXT_PUBLIC_RPC_URL),
].filter((v): v is string => Boolean(v));

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "media-src 'self' blob: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-src 'self' https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
  [
    "connect-src 'self'",
    ...envConnect,
    "https://api.mainnet-beta.solana.com https://api.devnet.solana.com",
    "https://auth.privy.io https://*.privy.io https://*.rpc.privy.systems https://*.privy.systems",
    "https://explorer-api.walletconnect.com wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org",
    "https://gateway.irys.xyz https://*.irys.xyz https://arweave.net",
  ].join(" "),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
