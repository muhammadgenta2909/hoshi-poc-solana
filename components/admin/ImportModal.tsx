"use client";

import { useState } from "react";
import { importAdminListings } from "@/lib/admin-api";

type Props = {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  token: string;
};

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
  const [jsonText, setJsonText] = useState("");
  const [sellerOverride, setSellerOverride] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleImport = async () => {
    setError(null);
    setResult(null);
    // Bulk-create listing HOSHI dari JSON yang di-paste. Tab "Fetch URL" dibuang:
    // fetch dari browser ke API pihak ketiga hampir selalu kena CORS dan jarang
    // kepakai. Untuk katalog CC gunakan tombol "Sync CollectorCrypt", bukan ini.
    let items: Record<string, unknown>[];
    try {
      items = JSON.parse(jsonText);
      if (!Array.isArray(items)) throw new Error("Input must be a JSON array");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }

    setImporting(true);
    try {
      const res = await importAdminListings(items, token, sellerOverride || undefined);
      setResult({ imported: res.imported });
      setJsonText("");
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

        <p className="mb-4 text-[13px] text-zinc-500">
          Bulk-create first-party (Hoshi) listings from a JSON array. For the CollectorCrypt
          catalog, use <span className="text-zinc-300">Sync CollectorCrypt</span> instead.
        </p>

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
            disabled={importing || !jsonText.trim()}
            className="rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
          >
            {importing ? "Importing…" : result ? "Import More" : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
