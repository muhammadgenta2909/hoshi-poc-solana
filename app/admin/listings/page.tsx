"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import {
  getAdminListings,
  getAdminListingVaults,
  deleteAdminListing,
  updateAdminListing,
  setAdminListingStatus,
  createAdminListing,
  ccSyncListings,
} from "@/lib/admin-api";
import type { AdminListing, CcSyncResult, PaginatedResult } from "@/lib/admin-api";
import ImportModal from "@/components/admin/ImportModal";
import ImageUploader from "@/components/admin/ImageUploader";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";
import Thumb from "@/components/admin/Thumb";
import type { Tier } from "@/lib/packs";
import { TIER_COLOR } from "@/lib/packs";
import { formatIdr } from "@/components/packs/ui";

const statusColor = (s?: string) => {
  switch (s) {
    case "ACTIVE": return "text-green-400";
    case "SOLD": return "text-blue-400";
    case "CANCELLED": return "text-red-400";
    default: return "text-zinc-400";
  }
};

type SortField = "newest" | "price-asc" | "price-desc";

const emptyForm = {
  name: "", set: "", rarity: "", image: "/card1.png",
  price: 0, expectedValue: 0,
  grade: "", grader: "PSA", gradeScore: 0, language: "English",
  era: "Classic", element: "Fire", category: "Special Illustration",
  buyback: 0, certificate: "", vaultLocation: "", cardNumber: "", variant: "",
};

export default function AdminListingsPage() {
  const { token } = useAdminAuth();
  const [result, setResult] = useState<PaginatedResult<AdminListing> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [vaultFilter, setVaultFilter] = useState("");
  const [vaults, setVaults] = useState<string[]>([]);
  const [sort, setSort] = useState<SortField>("newest");
  const limit = 15;

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyForm, sellerAddress: "" });
  const [addSaving, setAddSaving] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  // Provenance of the row being edited. CC rows lock every metadata field
  // (the backend rejects those edits, since a re-sync would overwrite them),
  // so only price/expectedValue/buyback stay editable.
  const [editSource, setEditSource] = useState<AdminListing["source"]>("HOSHI");
  // Buyback CC untuk kartu vault CollectorCrypt tidak punya nominal IDRX; kita
  // hanya punya flag ada/tidak. Disimpan saat buka edit agar bisa dirender sebagai
  // status, bukan angka "0" yang menyesatkan.
  const [editHasBuyback, setEditHasBuyback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminListings(token, {
        page, limit, search: search || undefined,
        status: statusFilter || undefined, vault: vaultFilter || undefined, sort,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listings");
    } finally {
      setLoading(false);
    }
  }, [token, page, search, statusFilter, vaultFilter, sort]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Daftar vault (distinct) untuk dropdown filter — dimuat sekali per sesi admin.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    getAdminListingVaults(token)
      .then((v) => { if (alive) setVaults(v); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  const openEdit = (l: AdminListing) => {
    setEditId(l.id);
    setEditSource(l.source ?? "HOSHI");
    setEditHasBuyback(l.ccHasBuyback);
    setEditForm({
      name: l.name, set: l.set, rarity: l.rarity,
      image: l.image, price: l.priceIdrx, expectedValue: l.expectedValueIdrx,
      grade: l.grade, grader: l.grader, gradeScore: l.gradeScore,
      language: l.language, era: l.era, element: l.element,
      category: l.category, buyback: l.buybackIdrx,
      certificate: l.certificate ?? "", vaultLocation: l.vaultLocation ?? "",
      cardNumber: l.cardNumber ?? "", variant: l.variant ?? "",
    });
  };

  const saveEdit = async () => {
    if (!token || !editId) return;
    setSaving(true);
    try {
      // For CC-synced rows, only send price + expectedValue. Metadata is theirs
      // (re-sync overwrites it) and buyback is meaningless here — the CC buyback
      // signal comes from ccHasBuyback, and the storefront never renders an IDRX
      // buyback amount for CC cards, so a typed number would be a dead promise.
      const payload =
        editSource === "COLLECTORCRYPT"
          ? { price: editForm.price, expectedValue: editForm.expectedValue }
          : editForm;
      await updateAdminListing(editId, payload, token);
      setEditId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!token) return;
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const r: CcSyncResult = await ccSyncListings(
        { categories: "Pokemon", maxPages: 2, step: 50, markBuyback: true },
        token,
      );
      setSyncMsg(
        `Sync CollectorCrypt selesai — ${r.created} baru, ${r.updated} diperbarui, ` +
          `${r.buybackMarked} bertanda buyback (kurs $1=Rp${r.usdIdrRate.toLocaleString("id-ID")}). ` +
          `Dilewati: ${r.skipped.grader + r.skipped.price + r.skipped.invalid}.`,
      );
      // If already on page 1, setPage is a no-op and won't retrigger the fetch
      // effect, so refetch explicitly; otherwise the page-change effect handles
      // it (avoids a redundant fetch of the old page with a stale closure).
      if (page === 1) await fetchData();
      else setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync CollectorCrypt gagal");
    } finally {
      setSyncing(false);
    }
  };

  const handleAdd = async () => {
    if (!token) return;
    setAddSaving(true);
    setError(null);
    try {
      await createAdminListing(addForm, token);
      setAddOpen(false);
      setAddForm({ ...emptyForm, sellerAddress: "" });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setAddSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteId) return;
    setDeleting(true);
    try {
      await deleteAdminListing(deleteId, token);
      setDeleteId(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  // Activate/deactivate: flip ACTIVE ⇄ CANCELLED. Deactivating just hides the
  // listing from the marketplace (row + data kept), so it's reversible — unlike
  // Delete. SOLD listings have no toggle (terminal, set by a purchase).
  const handleToggleStatus = async (l: AdminListing) => {
    if (!token || l.status === "SOLD") return;
    const next = l.status === "ACTIVE" ? "CANCELLED" : "ACTIVE";
    setTogglingId(l.id);
    setError(null);
    try {
      await setAdminListingStatus(l.id, next, token);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Listings</h1>
          <p className="mt-1 text-sm text-zinc-500">Manage all marketplace listings.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { label: "All Status", value: "" },
              { label: "Active", value: "ACTIVE" },
              { label: "Sold", value: "SOLD" },
              { label: "Cancelled", value: "CANCELLED" },
            ]}
            className="w-36"
          />
          {vaults.length > 0 && (
            <Select value={vaultFilter} onChange={(v) => { setVaultFilter(v); setPage(1); }}
              options={[
                { label: "All Vaults", value: "" },
                ...vaults.map((v) => ({ label: v, value: v })),
              ]}
              className="w-44"
            />
          )}
          <Select value={sort} onChange={(v) => { setSort(v as SortField); setPage(1); }}
            options={[
              { label: "Newest", value: "newest" },
              { label: "Price ↑", value: "price-asc" },
              { label: "Price ↓", value: "price-desc" },
            ]}
            className="w-32"
          />
          <input type="text" placeholder="Search listings…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-56 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
          />
          <button onClick={handleSync} disabled={syncing}
            className="rounded-xl border border-[#38E5D0]/30 bg-[#38E5D0]/[0.08] px-4 py-2.5 text-sm font-medium text-[#38E5D0] transition hover:bg-[#38E5D0]/[0.14] disabled:opacity-50"
            title="Tarik katalog CollectorCrypt ke marketplace (metadata mereka, harga kita)"
          >
            {syncing ? "Syncing…" : "Sync CollectorCrypt"}
          </button>
          <button onClick={() => setImportOpen(true)}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
          >
            Import
          </button>
          <button onClick={() => setAddOpen(true)}
            className="rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300"
          >
            + Add Listing
          </button>
        </div>
      </header>

      {syncMsg && (
        <div className="mb-4 rounded-xl border border-[#38E5D0]/20 bg-[#38E5D0]/[0.06] px-4 py-3">
          <p className="text-sm text-[#38E5D0]">{syncMsg}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading listings…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No listings found.</p>
      ) : result ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[13px] font-semibold text-zinc-400">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3 w-14">Card</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Vault</th>
                  <th className="px-4 py-3">Rarity</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Seller</th>
                  <th className="px-4 py-3">Grade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Views</th>
                  <th className="px-4 py-3">Listed</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((l, idx) => (
                  <tr key={l.id} className="border-b border-white/5 transition hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-[12px] tabular-nums text-zinc-500">{(result.page - 1) * limit + idx + 1}</td>
                    <td className="px-4 py-3"><Thumb src={l.image} alt="" /></td>
                    <td className="px-4 py-3 font-medium text-white">{l.name}</td>
                    <td className="px-4 py-3">
                      {(l.source ?? "HOSHI") === "COLLECTORCRYPT" ? (
                        <span className="rounded-md bg-[#38E5D0]/[0.12] px-2 py-0.5 text-[11px] font-semibold text-[#38E5D0]"
                          title={l.ccPriceUsd != null ? `CC list price $${l.ccPriceUsd}` : undefined}
                        >CollectorCrypt{l.ccHasBuyback ? " • BB" : ""}</span>
                      ) : (
                        <span className="rounded-md bg-yellow-400/10 px-2 py-0.5 text-[11px] font-semibold text-yellow-400">Hoshi</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: `${TIER_COLOR[l.rarity as Tier] || "#888"}20`, color: TIER_COLOR[l.rarity as Tier] || "#888" }}
                      >{l.rarity}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-200">{formatIdr(l.priceIdrx)}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-zinc-400">{l.sellerAddress.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-zinc-300">{l.grade}</td>
                    <td className={`px-4 py-3 font-medium ${statusColor(l.status)}`}>{l.status}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-400">{l.views}</td>
                    <td className="px-4 py-3 text-[12px] text-zinc-500">{new Date(l.listedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(l)}
                          className="rounded-lg bg-white/[0.06] px-3 py-1 text-[12px] text-zinc-300 transition hover:bg-white/10"
                        >Edit</button>
                        {l.status !== "SOLD" && (
                          <button
                            onClick={() => handleToggleStatus(l)}
                            disabled={togglingId === l.id}
                            className={
                              l.status === "ACTIVE"
                                ? "rounded-lg bg-amber-500/10 px-3 py-1 text-[12px] text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                                : "rounded-lg bg-green-500/10 px-3 py-1 text-[12px] text-green-400 transition hover:bg-green-500/20 disabled:opacity-50"
                            }
                          >
                            {togglingId === l.id
                              ? "…"
                              : l.status === "ACTIVE"
                                ? "Deactivate"
                                : "Activate"}
                          </button>
                        )}
                        <button onClick={() => setDeleteId(l.id)}
                          className="rounded-lg bg-red-500/10 px-3 py-1 text-[12px] text-red-400 transition hover:bg-red-500/20"
                        >Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="listing" />
        </>
      ) : null}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#171717] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Add New Listing</h2>
              <button onClick={() => setAddOpen(false)} className="text-zinc-500 hover:text-zinc-300">&times;</button>
            </div>

            <div className="space-y-5">
              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Card Info</legend>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Name <span className="text-red-400">*</span></label>
                    <input value={addForm.name} onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Charizard VMAX" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Set <span className="text-red-400">*</span></label>
                      <input value={addForm.set} onChange={(e) => setAddForm((p) => ({ ...p, set: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Classic" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Rarity <span className="text-red-400">*</span></label>
                      <input value={addForm.rarity} onChange={(e) => setAddForm((p) => ({ ...p, rarity: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Legendary Rare" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Era</label>
                      <input value={addForm.era} onChange={(e) => setAddForm((p) => ({ ...p, era: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Sword & Shield" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Element</label>
                      <input value={addForm.element} onChange={(e) => setAddForm((p) => ({ ...p, element: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Fire" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Language</label>
                      <input value={addForm.language} onChange={(e) => setAddForm((p) => ({ ...p, language: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="English" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Category</label>
                      <input value={addForm.category} onChange={(e) => setAddForm((p) => ({ ...p, category: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Special Illustration" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Image</label>
                    <ImageUploader value={addForm.image} onChange={(v) => setAddForm((p) => ({ ...p, image: v }))} token={token ?? ""} />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Card Number</label>
                      <input value={addForm.cardNumber} onChange={(e) => setAddForm((p) => ({ ...p, cardNumber: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="123/XYZ" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Variant</label>
                      <input value={addForm.variant} onChange={(e) => setAddForm((p) => ({ ...p, variant: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Reverse Holo" />
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Grading</legend>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grade <span className="text-red-400">*</span></label>
                      <input value={addForm.grade} onChange={(e) => setAddForm((p) => ({ ...p, grade: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="PSA 10" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grader</label>
                      <Select value={addForm.grader} onChange={(v) => setAddForm((p) => ({ ...p, grader: v }))}
                        options={[
                          { label: "PSA", value: "PSA" },
                          { label: "CGC", value: "CGC" },
                          { label: "BGS", value: "BGS" },
                        ]}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Score</label>
                      <input type="number" value={addForm.gradeScore} onChange={(e) => setAddForm((p) => ({ ...p, gradeScore: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="10" />
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Pricing</legend>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Price (IDRX) <span className="text-red-400">*</span></label>
                      <input type="number" value={addForm.price} onChange={(e) => setAddForm((p) => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="24250000" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Expected Value</label>
                      <input type="number" value={addForm.expectedValue} onChange={(e) => setAddForm((p) => ({ ...p, expectedValue: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="27000000" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Buyback (0 = none)</label>
                    <input type="number" value={addForm.buyback} onChange={(e) => setAddForm((p) => ({ ...p, buyback: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="18000000" />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Certificate & Location</legend>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Certificate</label>
                      <input value={addForm.certificate} onChange={(e) => setAddForm((p) => ({ ...p, certificate: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="PSA 12345678" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Vault Location</label>
                      <input value={addForm.vaultLocation} onChange={(e) => setAddForm((p) => ({ ...p, vaultLocation: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="Vault A-12" />
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Seller</legend>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Seller Address</label>
                  <input value={addForm.sellerAddress} onChange={(e) => setAddForm((p) => ({ ...p, sellerAddress: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" placeholder="x0f3a..91c2" />
                </div>
              </fieldset>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setAddOpen(false)}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
              >Cancel</button>
              <button onClick={handleAdd} disabled={addSaving}
                className="rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
              >{addSaving ? "Creating…" : "Create Listing"}</button>
            </div>
          </div>
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/10 bg-[#171717] p-6">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Edit Listing</h2>
              <button onClick={() => setEditId(null)} className="text-zinc-500 hover:text-zinc-300">&times;</button>
            </div>

            {editSource === "COLLECTORCRYPT" && (
              <div className="mb-5 rounded-xl border border-[#38E5D0]/20 bg-[#38E5D0]/[0.06] px-4 py-3">
                <p className="text-sm text-[#38E5D0]">
                  Listing hasil sync CollectorCrypt. Metadata (nama, gambar, grade, dll)
                  milik CC dan di-refresh tiap sync — hanya <b>harga</b> dan <b>expected value</b>{" "}
                  yang bisa kamu ubah. Buyback kartu CC ditentukan CollectorCrypt, bukan angka manual.
                </p>
              </div>
            )}

            <div className="space-y-5">
              <fieldset
                disabled={editSource === "COLLECTORCRYPT"}
                className={editSource === "COLLECTORCRYPT" ? "pointer-events-none opacity-50" : ""}
              >
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Card Info</legend>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Name</label>
                    <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Set</label>
                      <input value={editForm.set} onChange={(e) => setEditForm((p) => ({ ...p, set: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Rarity</label>
                      <input value={editForm.rarity} onChange={(e) => setEditForm((p) => ({ ...p, rarity: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Era</label>
                      <input value={editForm.era} onChange={(e) => setEditForm((p) => ({ ...p, era: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Element</label>
                      <input value={editForm.element} onChange={(e) => setEditForm((p) => ({ ...p, element: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Language</label>
                      <input value={editForm.language} onChange={(e) => setEditForm((p) => ({ ...p, language: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Category</label>
                      <input value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Image</label>
                    <ImageUploader value={editForm.image} onChange={(v) => setEditForm((p) => ({ ...p, image: v }))} token={token ?? ""} />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Card Number</label>
                      <input value={editForm.cardNumber} onChange={(e) => setEditForm((p) => ({ ...p, cardNumber: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Variant</label>
                      <input value={editForm.variant} onChange={(e) => setEditForm((p) => ({ ...p, variant: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                </div>
              </fieldset>

              <fieldset
                disabled={editSource === "COLLECTORCRYPT"}
                className={editSource === "COLLECTORCRYPT" ? "pointer-events-none opacity-50" : ""}
              >
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Grading</legend>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grade</label>
                    <input value={editForm.grade} onChange={(e) => setEditForm((p) => ({ ...p, grade: e.target.value }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                  </div>
                  <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Grader</label>
                      <Select value={editForm.grader} onChange={(v) => setEditForm((p) => ({ ...p, grader: v }))}
                        options={[
                          { label: "PSA", value: "PSA" },
                          { label: "CGC", value: "CGC" },
                          { label: "BGS", value: "BGS" },
                        ]}
                      />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Score</label>
                    <input type="number" value={editForm.gradeScore} onChange={(e) => setEditForm((p) => ({ ...p, gradeScore: Number(e.target.value) }))}
                      className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Pricing</legend>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Price (IDRX)</label>
                      <input type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Expected Value</label>
                      <input type="number" value={editForm.expectedValue} onChange={(e) => setEditForm((p) => ({ ...p, expectedValue: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">
                      Buyback{editSource === "COLLECTORCRYPT" && " (ditentukan CollectorCrypt)"}
                    </label>
                    {editSource === "COLLECTORCRYPT" ? (
                      editHasBuyback ? (
                        <div className="flex items-center gap-2 rounded-xl border border-green-500/25 bg-green-500/10 px-4 py-2.5 text-sm font-medium text-green-400">
                          <span>✓</span> Buyback aktif di CollectorCrypt
                        </div>
                      ) : (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-zinc-500">
                          Tidak ada buyback aktif di CollectorCrypt
                        </div>
                      )
                    ) : (
                      <input type="number"
                        value={editForm.buyback} onChange={(e) => setEditForm((p) => ({ ...p, buyback: Number(e.target.value) }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
                        placeholder="18000000" />
                    )}
                  </div>
                </div>
              </fieldset>
              <fieldset
                disabled={editSource === "COLLECTORCRYPT"}
                className={editSource === "COLLECTORCRYPT" ? "pointer-events-none opacity-50" : ""}
              >
                <legend className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">Certificate & Location</legend>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Certificate</label>
                      <input value={editForm.certificate} onChange={(e) => setEditForm((p) => ({ ...p, certificate: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                    <div className="flex-1">
                      <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Vault Location</label>
                      <input value={editForm.vaultLocation} onChange={(e) => setEditForm((p) => ({ ...p, vaultLocation: e.target.value }))}
                        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40" />
                    </div>
                  </div>
                </div>
              </fieldset>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setEditId(null)}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
              >Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="rounded-xl bg-yellow-400 px-6 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
              >{saving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={fetchData} token={token ?? ""} />

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-6 text-center">
            <p className="mb-2 text-lg font-bold text-white">Delete Listing</p>
            <p className="mb-6 text-sm text-zinc-400">This action cannot be undone.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteId(null)}
                className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
              >Cancel</button>
              <button onClick={confirmDelete} disabled={deleting}
                className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
              >{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
