"use client";

// Withdraw History — "Tracking details". Lists active and completed withdrawal
// shipments. POC: no backend, so everything is local state and empty states.
// Toggle between Active | Complete, search, and an "Export all shipments" action
// that flashes a brief local confirmation (nothing to export yet).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AccountShell,
  Panel,
  EmptyState,
  TextInput,
  GhostButton,
  SearchIcon,
  DepositIcon,
  HistoryIcon,
} from "@/components/account/ui";

type View = "Active" | "Complete";
const VIEWS: readonly View[] = ["Active", "Complete"];

export default function WithdrawHistoryPage() {
  const [view, setView] = useState<View>("Active");
  const [query, setQuery] = useState("");
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending flash timer on unmount (no setState in the effect body).
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const onExport = () => {
    setFlash("No shipments to export yet.");
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 2500);
  };

  const searching = query.trim().length > 0;

  return (
    <AccountShell active="Vault">
      {/* Header: title left, actions (export + Active|Complete toggle) right */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracking details</h1>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            Track live shipments and review your completed withdrawals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <GhostButton
            onClick={onExport}
            className="inline-flex items-center gap-2 !px-4 !py-2 text-[13px]"
          >
            <DepositIcon className="h-4 w-4" />
            Export all shipments
          </GhostButton>

          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            {VIEWS.map((v) => {
              const on = v === view;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
                    on
                      ? "bg-white/[0.08] text-zinc-100 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {v === "Active" && (
                    <span
                      className={`h-1.5 w-1.5 rounded-full transition ${
                        on ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" : "bg-zinc-600"
                      }`}
                    />
                  )}
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Brief local confirmation (POC — no network) */}
      {flash && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[13px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {flash}
        </div>
      )}

      {/* Full-width search with leading icon */}
      <div className="relative mt-5">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
          <SearchIcon className="h-4 w-4" />
        </span>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shipments by card name, cert, or tracking number"
          aria-label="Search shipments"
          className="pl-10"
        />
      </div>

      {/* Empty state — no shipments in the POC */}
      <Panel className="mt-5 p-3 sm:p-4">
        {searching ? (
          <EmptyState
            icon={<SearchIcon className="h-9 w-9" />}
            title="No shipments match your search"
            sub="Try a different card name, cert, or tracking number."
          />
        ) : (
          <EmptyState
            icon={<HistoryIcon className="h-9 w-9" />}
            title={
              view === "Active"
                ? "You don't have any active shipments"
                : "You haven't completed any withdrawal transactions yet"
            }
            sub="Your active and completed shipments will show up here."
            action={
              <Link href="/account">
                <GhostButton>Go to your collection</GhostButton>
              </Link>
            }
          />
        )}
      </Panel>
    </AccountShell>
  );
}
