"use client";

// Tables for the profile tabs: Activity, Active Listings, Offers Made and
// Offers Received. All four share one shell so column rhythm, row height and
// the pager can never drift apart.
//
// Every row here is backed by the database — there is no mock data path.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { Listing } from "@/lib/market";
import {
  ACTIVITY_META,
  formatActivityDate,
  OFFER_STATUS_STYLE,
  type ActivityRecord,
  type OfferParty,
  type OfferRecord,
} from "@/lib/offers";
import { IdrxGlyph, Img } from "@/components/packs/ui";
import {
  GhostButton,
  ModalShell,
  PrimaryButton,
  shortAddr,
  TextInput,
  GOLD,
} from "./ui";

const idr = new Intl.NumberFormat("id-ID");

/* --------------------------------- shell ---------------------------------- */

/** Horizontal scroll lives on the table, never on the page body. */
export function TableShell({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="bg-white/[0.04] text-[12px] font-semibold uppercase tracking-wide text-zinc-400">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-4 py-3.5 font-semibold ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-middle ${className}`}>{children}</td>;
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="border-t border-white/[0.05] bg-[#100e08]/60 transition hover:bg-white/[0.03]">
      {children}
    </tr>
  );
}

/* -------------------------------- row atoms -------------------------------- */

/** Card thumbnail + name + short id. `href` links through to the listing. */
export function ItemCell({
  name,
  image,
  id,
  href,
}: {
  name: string;
  image: string | null;
  id?: string | null;
  href?: string;
}) {
  const body = (
    <span className="flex items-center gap-3">
      {image ? (
        <Img
          src={image}
          alt=""
          aria-hidden
          className="h-[38px] w-[28px] shrink-0 rounded-[3px] object-cover"
        />
      ) : (
        <span aria-hidden className="h-[38px] w-[28px] shrink-0 rounded-[3px] bg-white/[0.06]" />
      )}
      {/* max-w WAJIB: tanpa batas lebar, nama panjang bikin kolom auto-layout melar → tombol Action
          kedorong keluar layar (harus scroll). Dibatasi + `truncate` = elipsis; teks penuh muncul
          saat hover lewat atribut `title` (tooltip native, tak bikin baris/tombol menggendut). */}
      <span className="min-w-0 max-w-[150px] sm:max-w-[220px]">
        <span
          title={name}
          className="block truncate text-[13px] font-semibold text-zinc-100"
        >
          {name}
        </span>
        {id && (
          <span className="block truncate font-mono text-[10px] text-zinc-500">
            {shortAddr(id, 6, 4)}
          </span>
        )}
      </span>
    </span>
  );
  return href ? (
    <Link href={href} className="inline-block transition hover:opacity-80">
      {body}
    </Link>
  ) : (
    body
  );
}

/** A counterparty (From / To). Renders an em dash when there is no other side. */
export function Party({ party }: { party: OfferParty | null }) {
  if (!party) return <span className="text-zinc-600">–</span>;
  return (
    <span className="truncate text-[13px] font-medium text-yellow-400 underline decoration-yellow-400/40 underline-offset-[3px]">
      {party.label}
    </span>
  );
}

/** IDRX amount. A null amount is an event that carries no price → "----". */
export function Amount({ value }: { value: number | null }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] tabular-nums text-zinc-100">
      <IdrxGlyph size={16} />
      {value === null ? (
        <span className="text-zinc-500">----</span>
      ) : (
        <span>
          {idr.format(value)} <span className="text-zinc-400">IDRX</span>
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: OfferRecord["status"] }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${OFFER_STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-white/25 bg-transparent transition checked:border-yellow-400 checked:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/40"
    />
  );
}

/* --------------------------------- pager ---------------------------------- */

export const PAGE_SIZE = 6;

/** Slice `rows` for `page` (1-based) and clamp the page to the row count. */
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, totalPages);
  return { totalPages, page: safe, slice: rows.slice((safe - 1) * size, safe * size) };
}

export function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  return (
    <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Pagination">
      <PagerBtn onClick={() => onPage(page - 1)} disabled={page <= 1} label="Previous page">
        ‹
      </PagerBtn>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPage(p)}
          aria-current={p === page ? "page" : undefined}
          className={`h-8 min-w-8 rounded-md px-2 text-[13px] font-semibold transition ${
            p === page
              ? "bg-white/[0.10] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]"
              : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200"
          }`}
        >
          {p}
        </button>
      ))}
      <PagerBtn onClick={() => onPage(page + 1)} disabled={page >= totalPages} label="Next page">
        ›
      </PagerBtn>
    </nav>
  );
}

function PagerBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-md text-[15px] text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/* -------------------------------- activity -------------------------------- */

export function ActivityTable({ rows }: { rows: ActivityRecord[] }) {
  return (
    <TableShell
      head={
        <>
          <Th>Action</Th>
          <Th>Item</Th>
          <Th>Amount</Th>
          <Th>Category</Th>
          <Th>From</Th>
          <Th>To</Th>
          <Th>Date</Th>
        </>
      }
    >
      {rows.map((a) => {
        const meta = ACTIVITY_META[a.type];
        return (
          <Row key={a.id}>
            <Td>
              <span className="flex items-center gap-2.5 whitespace-nowrap">
                <Img src={meta.icon} alt="" aria-hidden className="h-[18px] w-[18px] object-contain" />
                <span className="text-[13px] font-semibold text-zinc-100">{meta.label}</span>
              </span>
            </Td>
            <Td>
              <ItemCell
                name={a.item.name}
                image={a.item.image}
                id={a.listingId}
                href={a.listingId ? `/marketplace/${a.listingId}` : undefined}
              />
            </Td>
            <Td>
              <Amount value={a.amount} />
            </Td>
            <Td className="whitespace-nowrap text-[13px] text-zinc-300">
              {a.item.category ?? "–"}
            </Td>
            <Td>
              <Party party={a.from} />
            </Td>
            <Td>
              <Party party={a.to} />
            </Td>
            <Td className="whitespace-nowrap text-[12px] text-zinc-400">
              {formatActivityDate(a.createdAt)}
            </Td>
          </Row>
        );
      })}
    </TableShell>
  );
}

/* ----------------------------- active listings ---------------------------- */

export function ActiveListingsTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onEdit,
  onCancel,
  busyId,
}: {
  rows: Listing[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onEdit: (l: Listing) => void;
  onCancel: (l: Listing) => void;
  busyId: string | null;
}) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <TableShell
      head={
        <>
          <Th className="w-10">
            <Checkbox checked={allOn} onChange={onToggleAll} label="Select all listings" />
          </Th>
          <Th>Item</Th>
          <Th>Amount</Th>
          <Th>Date</Th>
          <Th className="text-right">Action</Th>
        </>
      }
    >
      {rows.map((l) => (
        <Row key={l.id}>
          <Td>
            <Checkbox
              checked={selected.has(l.id)}
              onChange={() => onToggle(l.id)}
              label={`Select ${l.name}`}
            />
          </Td>
          <Td>
            <ItemCell name={l.name} image={l.image} id={l.id} href={`/marketplace/${l.id}`} />
          </Td>
          <Td>
            <Amount value={l.price} />
          </Td>
          <Td className="whitespace-nowrap text-[12px] text-zinc-400">
            {formatActivityDate(l.listedAt)}
          </Td>
          <Td>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => onEdit(l)}
                disabled={busyId === l.id}
                className="rounded-lg px-5 py-1.5 text-[13px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                style={{ backgroundImage: GOLD }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onCancel(l)}
                disabled={busyId === l.id}
                className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.09] disabled:opacity-50"
              >
                {busyId === l.id ? "…" : "Cancel"}
              </button>
            </div>
          </Td>
        </Row>
      ))}
    </TableShell>
  );
}

/* ------------------------------- offers made ------------------------------- */

export function OffersMadeTable({
  rows,
  onCancel,
  onPay,
  busyId,
  selfId,
}: {
  rows: OfferRecord[];
  onCancel: (o: OfferRecord) => void;
  /** Offer DITERIMA penjual & listing masih ACTIVE → tombol "Lanjutkan Pembayaran". */
  onPay: (o: OfferRecord) => void;
  busyId: string | null;
  /** id user sekarang → sembunyikan "Lanjutkan Pembayaran" utk offer atas KARTU SENDIRI
   *  (data lama sebelum guard submitOffer; pembayaran tetap diblokir backend). */
  selfId?: string | null;
}) {
  return (
    <TableShell
      head={
        <>
          <Th>Item</Th>
          <Th>To</Th>
          <Th>Amount</Th>
          <Th>Status</Th>
          <Th>Date</Th>
          <Th className="text-right">Action</Th>
        </>
      }
    >
      {rows.map((o) => {
        // Offer atas kartu SENDIRI (data lama). Guard submitOffer sekarang mencegahnya, & backend
        // tetap tolak bayar ("tak bisa beli kartu sendiri") → jangan tampilkan tombol yg menyesatkan.
        const isSelf = !!selfId && o.seller?.id === selfId;
        return (
          <Row key={o.id}>
            <Td>
              <ItemCell
                name={o.item.name}
                image={o.item.image}
                id={o.listingId}
                href={`/marketplace/${o.listingId}`}
              />
            </Td>
            <Td>
              <Party party={o.seller} />
            </Td>
            <Td>
              <Amount value={o.amount} />
            </Td>
            <Td>
              <StatusPill status={o.status} />
            </Td>
            <Td className="whitespace-nowrap text-[12px] text-zinc-400">
              {formatActivityDate(o.createdAt)}
            </Td>
            <Td>
              <div className="flex justify-end">
                {o.actionable ? (
                  <button
                    type="button"
                    onClick={() => onCancel(o)}
                    disabled={busyId === o.id}
                    className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[13px] font-semibold text-zinc-200 transition hover:bg-white/[0.09] disabled:opacity-50"
                  >
                    {busyId === o.id ? "…" : "Cancel"}
                  </button>
                ) : isSelf ? (
                  // Kartu sendiri → tak ada aksi bayar.
                  <span className="whitespace-nowrap text-[12px] text-zinc-600">Kartu sendiri</span>
                ) : o.status === "PAID" ? (
                  // Offer sudah DIBAYAR & settle → kartu jadi milik pembeli.
                  <span className="text-[12px] font-semibold text-emerald-400">✓ Dibeli</span>
                ) : o.status === "ACCEPTED" && o.item.status === "ACTIVE" ? (
                  // Diterima penjual, BELUM dibayar → lanjutkan bayar (di harga offer).
                  <button
                    type="button"
                    onClick={() => onPay(o)}
                    className="whitespace-nowrap rounded-lg px-4 py-1.5 text-[13px] font-bold text-[#171717] transition hover:brightness-105"
                    style={{ backgroundImage: "linear-gradient(180deg,#FBB222,#FFF600)" }}
                  >
                    Lanjutkan Pembayaran →
                  </button>
                ) : o.status === "ACCEPTED" ? (
                  // Diterima & listing sudah SOLD → sudah dibeli.
                  <span className="text-[12px] font-semibold text-emerald-400">✓ Dibeli</span>
                ) : (
                  <span className="text-[12px] text-zinc-600">—</span>
                )}
              </div>
            </Td>
          </Row>
        );
      })}
    </TableShell>
  );
}

/* ----------------------------- offers received ----------------------------- */

export function OffersReceivedTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
  onAccept,
  onReject,
  busyId,
}: {
  rows: OfferRecord[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  onAccept: (o: OfferRecord) => void;
  onReject: (o: OfferRecord) => void;
  busyId: string | null;
}) {
  // Only pending offers can be bulk-declined, so "select all" only covers those.
  const selectable = rows.filter((r) => r.actionable);
  const allOn = selectable.length > 0 && selectable.every((r) => selected.has(r.id));
  return (
    <TableShell
      head={
        <>
          <Th className="w-10">
            <Checkbox checked={allOn} onChange={onToggleAll} label="Select all pending offers" />
          </Th>
          <Th>Item</Th>
          <Th>From</Th>
          <Th>Date</Th>
          <Th>Amount</Th>
          <Th className="text-right">Action</Th>
        </>
      }
    >
      {rows.map((o) => (
        <Row key={o.id}>
          <Td>
            {o.actionable ? (
              <Checkbox
                checked={selected.has(o.id)}
                onChange={() => onToggle(o.id)}
                label={`Select offer on ${o.item.name}`}
              />
            ) : (
              <span aria-hidden className="block h-4 w-4" />
            )}
          </Td>
          <Td>
            <ItemCell
              name={o.item.name}
              image={o.item.image}
              id={o.listingId}
              href={`/marketplace/${o.listingId}`}
            />
          </Td>
          <Td>
            <Party party={o.buyer} />
          </Td>
          <Td className="whitespace-nowrap text-[12px] text-zinc-400">
            {formatActivityDate(o.createdAt)}
          </Td>
          <Td>
            <Amount value={o.amount} />
          </Td>
          <Td>
            <div className="flex items-center justify-end gap-2">
              {o.actionable ? (
                <>
                  <button
                    type="button"
                    onClick={() => onAccept(o)}
                    disabled={busyId === o.id}
                    className="rounded-lg px-6 py-1.5 text-[13px] font-semibold text-[#171717] transition hover:brightness-105 disabled:opacity-50"
                    style={{ backgroundImage: GOLD }}
                  >
                    {busyId === o.id ? "…" : "Accept"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(o)}
                    disabled={busyId === o.id}
                    className="rounded-lg border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[13px] font-semibold text-zinc-300 transition hover:bg-white/[0.09] disabled:opacity-50"
                  >
                    Decline
                  </button>
                </>
              ) : (
                <StatusPill status={o.status} />
              )}
            </div>
          </Td>
        </Row>
      ))}
    </TableShell>
  );
}

/* ----------------------------- edit listing modal -------------------------- */

/**
 * Re-price a live listing. Mirrors Collector Crypt's "update listing": a direct
 * price change, not a cancel + re-list, so views and open offers survive.
 */
export function EditListingModal({
  listing,
  onClose,
  onSave,
}: {
  listing: Listing;
  onClose: () => void;
  onSave: (input: { price: number; expectedValue: number; buyback: number }) => Promise<void>;
}) {
  const [price, setPrice] = useState(String(listing.price));
  const [expectedValue, setExpectedValue] = useState(String(listing.expectedValue));
  const [buyback, setBuyback] = useState(String(listing.buyback));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nPrice = Number(price);
  const nExpected = Number(expectedValue);
  const nBuyback = Number(buyback);
  const valid =
    Number.isFinite(nPrice) &&
    nPrice >= 1 &&
    Number.isFinite(nExpected) &&
    nExpected >= 1 &&
    Number.isFinite(nBuyback) &&
    nBuyback >= 0;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        price: Math.round(nPrice),
        expectedValue: Math.round(nExpected),
        buyback: Math.round(nBuyback),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing.");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Edit listing"
      subtitle={`${listing.name} — the card stays listed, only its price changes. Open offers are kept.`}
    >
      <div className="space-y-4">
        <Field label="Ask price (IDRX)">
          <TextInput
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Expected value (IDRX)">
          <TextInput
            type="number"
            min={1}
            value={expectedValue}
            onChange={(e) => setExpectedValue(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field label="Buyback (IDRX)" hint="0 = not Hoshi-backed.">
          <TextInput
            type="number"
            min={0}
            value={buyback}
            onChange={(e) => setBuyback(e.target.value)}
            className="tabular-nums"
          />
        </Field>

        {error && <p className="text-[12px] text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <GhostButton onClick={onClose} disabled={saving}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={save} disabled={!valid || saving}>
            {saving ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </div>
      </div>
    </ModalShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-wide text-zinc-400">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-600">{hint}</span>}
    </label>
  );
}
