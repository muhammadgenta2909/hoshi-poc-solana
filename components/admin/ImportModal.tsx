"use client";

import { useState } from "react";
import { importAdminListings } from "@/lib/admin-api";

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  token: string;
};

type Tab = "paste" | "url";

const samplePayload = JSON.stringify([
  {
    name: "Charizard VMAX",
    set: "Darkness Ablaze",
    rarity: "Hyper Rare",
    image: "https://example.com/charizard.png",
    price: 25000000,
    expectedValue: 27000000,
    grade: "PSA 10",
    grader: "PSA",
    gradeScore: 10,
    language: "English",
    element: "Fire",
    category: "Special Illustration",
  },
], null, 2);

export default function ImportModal({ open, onClose, onDone, token }: Props) {
  const [tab, setTab] = useState<Tab>("paste");
  const [jsonText, setJsonText] = useState("");
  const [url, setUrl] = useState("");
  const [sellerOverride, setSellerOverride] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleImport = async () => {
    setError(null);
    setResult(null);
    let items: Record<string, unknown>[];

    if (tab === "paste") {
      try {
        items = JSON.parse(jsonText);
        if (!Array.isArray(items)) throw new Error("Input must be a JSON array");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid JSON");
        return;
      }
    } else {
      setImporting(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching URL`);
        items = await res.json();
        if (!Array.isArray(items)) throw new Error("Response must be a JSON array");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch URL");
        setImporting(false);
        return;
      }
      setImporting(false);
    }

    setImporting(true);
    try {
      const res = await importAdminListings(items, token, sellerOverride || undefined);
      setResult({ imported: res.imported });
      setJsonText("");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#171717] p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Import Listings</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">&times;</button>
        </div>

        <div className="mb-4 flex gap-4 border-b border-white/10">
          <button
            onClick={() => { setTab("paste"); setError(null); setResult(null); }}
            className={`pb-2 text-sm font-medium transition ${tab === "paste" ? "border-b-2 border-yellow-400 text-yellow-400" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Paste JSON
          </button>
          <button
            onClick={() => { setTab("url"); setError(null); setResult(null); }}
            className={`pb-2 text-sm font-medium transition ${tab === "url" ? "border-b-2 border-yellow-400 text-yellow-400" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            Fetch URL
          </button>
        </div>

        {tab === "paste" ? (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
              JSON Array of Listings
            </label>
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={12}
              className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-[13px] text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
              placeholder={samplePayload}
            />
            <p className="mt-1 text-[12px] text-zinc-500">
              Each item requires at least: name, set, rarity, image, price, grade, grader, gradeScore
            </p>
          </div>
        ) : (
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
              External API URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
              placeholder="https://api.example.com/listings"
            />
            <p className="text-[12px] text-zinc-500">
              The endpoint must return a JSON array of listing objects with the same fields as Paste mode.
            </p>
          </div>
        )}

        <div className="mt-4">
          <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
            Seller Address Override <span className="text-zinc-500">(optional)</span>
          </label>
          <input
            value={sellerOverride}
            onChange={(e) => setSellerOverride(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
            placeholder="Leave empty to use default 'admin'"
          />
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3">
            <p className="text-sm text-green-400">
              Successfully imported {result.imported} listing{result.imported !== 1 ? "s" : ""}!
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
          >Cancel</button>
          <button
            onClick={handleImport}
            disabled={importing || (tab === "paste" && !jsonText.trim()) || (tab === "url" && !url.trim())}
            className="rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
          >
            {importing ? "Importing…" : result ? "Import More" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
