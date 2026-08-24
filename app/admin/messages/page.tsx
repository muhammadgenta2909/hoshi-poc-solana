"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/lib/adminAuth";
import Select from "@/components/admin/Select";
import Pagination from "@/components/admin/Pagination";
import {
  getAdminSupportThreads,
  getAdminSupportThread,
  adminReplySupport,
  setAdminSupportStatus,
  type SupportThreadSummary,
  type SupportThreadDetail,
  type PaginatedResult,
} from "@/lib/support";

/* ============================== Support (2-way) ============================== */

function SupportTab({ token }: { token: string }) {
  const [result, setResult] = useState<PaginatedResult<SupportThreadSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const [detail, setDetail] = useState<SupportThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const res = await getAdminSupportThreads(token, {
        page, limit: 20,
        search: search || undefined,
        status: status || undefined,
        unread: unreadOnly || undefined,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally { setLoading(false); }
  }, [token, page, search, status, unreadOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // REALTIME: poll daftar thread tiap 12 dtk TANPA flicker loading (silent) → pesan/thread baru
  // muncul otomatis tanpa refresh manual.
  useEffect(() => {
    if (!token) return;
    const tick = async () => {
      try {
        const res = await getAdminSupportThreads(token, {
          page, limit: 20,
          search: search || undefined,
          status: status || undefined,
          unread: unreadOnly || undefined,
        });
        setResult(res);
      } catch { /* jaringan gagal — pertahankan data terakhir */ }
    };
    const id = window.setInterval(() => void tick(), 12_000);
    return () => window.clearInterval(id);
  }, [token, page, search, status, unreadOnly]);

  // REALTIME: poll thread yang SEDANG dibuka tiap 8 dtk → balasan user baru muncul otomatis.
  const openId = detail?.id;
  useEffect(() => {
    if (!token || !openId) return;
    const id = window.setInterval(async () => {
      try { setDetail(await getAdminSupportThread(openId, token)); } catch { /* keep */ }
    }, 8_000);
    return () => window.clearInterval(id);
  }, [token, openId]);

  const openThread = async (id: string) => {
    setDetailLoading(true); setError(null); setReply("");
    try {
      setDetail(await getAdminSupportThread(id, token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open thread");
    } finally { setDetailLoading(false); }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) return;
    setSending(true); setError(null);
    try {
      await adminReplySupport(detail.id, reply.trim(), token);
      setReply("");
      setDetail(await getAdminSupportThread(detail.id, token));
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reply");
    } finally { setSending(false); }
  };

  const toggleStatus = async () => {
    if (!detail) return;
    setBusy(true); setError(null);
    try {
      const next = detail.status === "OPEN" ? "CLOSED" : "OPEN";
      await setAdminSupportStatus(detail.id, next, token);
      setDetail({ ...detail, status: next });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-2 text-[13px] text-zinc-400">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} className="accent-yellow-400" />
          Unread only
        </label>
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }}
          options={[{ label: "All", value: "" }, { label: "Open", value: "OPEN" }, { label: "Closed", value: "CLOSED" }]}
          className="w-32"
        />
        <input type="text" placeholder="Search subject / wallet…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-56 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-yellow-400/40"
        />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3"><p className="text-sm text-red-400">{error}</p></div>}

      {loading && !result ? (
        <p className="py-12 text-center text-sm text-zinc-500">Loading threads…</p>
      ) : result && result.data.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No support threads.</p>
      ) : result ? (
        <>
          <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
            {result.data.map((t, idx) => (
              <button key={t.id} onClick={() => openThread(t.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
              >
                <span className="w-6 shrink-0 text-[11px] tabular-nums text-zinc-600">{(result.page - 1) * 20 + idx + 1}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${t.unread > 0 ? "bg-yellow-400" : "bg-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-white">{t.subject || "(no subject)"}</p>
                    {t.status === "CLOSED" && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">CLOSED</span>}
                    {t.unread > 0 && <span className="rounded-full bg-yellow-400/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-300">{t.unread} new</span>}
                  </div>
                  <p className="truncate text-[12px] text-zinc-500">
                    {t.user?.label ?? "—"} · {t.lastMessage ? `${t.lastMessage.senderType === "ADMIN" ? "You: " : ""}${t.lastMessage.body}` : "no messages"}
                  </p>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-zinc-600">{new Date(t.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} onPage={setPage} unit="thread" />
        </>
      ) : null}

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDetail(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#171717]" onClick={(e) => e.stopPropagation()}>
            {detailLoading || !detail ? (
              <p className="p-10 text-center text-sm text-zinc-500">Loading…</p>
            ) : (
              <>
                <div className="flex items-start justify-between border-b border-white/10 p-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-white">{detail.subject || "(no subject)"}</h2>
                    <p className="truncate text-[12px] text-zinc-500">{detail.user?.displayName ?? detail.user?.walletAddress ?? detail.userId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={toggleStatus} disabled={busy}
                      className="rounded-lg border border-white/10 px-3 py-1 text-[12px] font-medium text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-40"
                    >{detail.status === "OPEN" ? "Close" : "Reopen"}</button>
                    <button onClick={() => setDetail(null)} className="text-zinc-500 hover:text-zinc-300">&times;</button>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {detail.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderType === "ADMIN" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.senderType === "ADMIN" ? "bg-yellow-400/15 text-yellow-100" : "bg-white/[0.05] text-zinc-200"}`}>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">{m.senderType === "ADMIN" ? "You" : "User"} · {new Date(m.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 p-4">
                  <div className="flex items-end gap-2">
                    <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Tulis balasan…"
                      className="flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-yellow-400/40"
                    />
                    <button onClick={sendReply} disabled={sending || !reply.trim()}
                      className="shrink-0 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-bold text-[#171717] transition hover:bg-yellow-300 disabled:opacity-50"
                    >{sending ? "…" : "Balas"}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================== Page ================================== */

export default function AdminMessagesPage() {
  const { token } = useAdminAuth();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white">Messages</h1>
        <p className="mt-1 text-sm text-zinc-500">Support threads (2-way) with users.</p>
      </header>

      {token && <SupportTab token={token} />}
    </div>
  );
}
