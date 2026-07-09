import type { Metadata } from "next";
import { Geist, Geist_Mono, Jersey_10, Outfit, Press_Start_2P } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import BgmPlayer from "@/components/BgmPlayer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Pixel/arcade display font for placeholder art and section headers.
const pressStart = Press_Start_2P({
  weight: "400",
  variable: "--font-press-start",
  subsets: ["latin"],
  display: "swap",
});

// Primary UI font for the marketplace (nav, panels, body).
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

// Tall pixel display font (Figma: Jersey 10) for the Rip Pack CTA, "HOSHI"
// wordmarks, and drop-rate percentages.
const jersey = Jersey_10({
  weight: "400",
  variable: "--font-jersey",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hoshi POC — Solana devnet",
  description:
    "Connect Phantom, sign a login message, and mint a Metaplex Core NFT on Solana devnet.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${pressStart.variable} ${outfit.variable} ${jersey.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <BgmPlayer />
      </body>
    </html>
  );
}
