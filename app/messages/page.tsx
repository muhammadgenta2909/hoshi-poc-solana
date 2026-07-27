"use client";

// Messages — dua channel:
//   • Support     : user ↔ tim Hoshi (/support/*)
//   • Marketplace : pembeli ↔ penjual untuk sebuah listing (/marketplace/* messaging)
// Di sinilah PENJUAL menerima & membalas chat dari pembeli (dulu "Message Seller"
// nyasar ke inbox admin — sekarang mendarat di sini).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AccountShell,
  Panel,
  PrimaryButton,
  EmptyState,
  ModalShell,
  TextInput,
  TextArea,
  InboxIcon,
  WarningIcon,
} from "@/components/account/ui";
import { useAuth } from "@/lib/useAuth";
import {
  getSupportThreads,
  getSupportThread,
  createSupportThread,
  postSupportMessage,
  type SupportThreadSummary,
  type SupportThreadDetail,
} from "@/lib/support";
import {
  getMyMarketThreads,
  getMarketThread,
  replyMarketThread,
  type MarketThreadSummary,
  type MarketThreadDetail,
} from "@/lib/marketMessaging";

type Channel = "support" | "marketplace";

export default function MessagesPage() {
  const { token, hydrated, login } = useAuth();
  const [channel, setChannel] = useState<Channel>("support");
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  /* ---------------- Support ---------------- */
  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SupportThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);

  /* -------------- Marketplace -------------- */
  const [mThreads, setMThreads] = useState<MarketThreadSummary[]>([]);
  const [mLoading, setMLoading] = useState(true);
  const [mDetail, setMDetail] = useState<MarketThreadDetail | null>(null);
  const [mReply, setMReply] = useState("");
  const [mSending, setMSending] = useState(false);

  const fetchThreads = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setThreads(await getSupportThreads(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [token]);

  const fetchMThreads = useCallback(async () => {
    if (!token) return;
    setMLoading(true);
    try { setMThreads(await getMyMarketThreads(token)); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setMLoading(false); }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchThreads();
    fetchMThreads();
  }, [token, fetchThreads, fetchMThreads]);

  const openThread = async (id: string) => {
    if (!token) return;
    setError(null); setReply("");
    try { setDetail(await getSupportThread(id, token)); fetchThreads(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to open"); }
  };
  const sendReply = async () => {
    if (!token || !detail || !reply.trim()) return;
    setSending(true); setError(null);
    try {
      await postSupportMessage(detail.id, reply.trim(), token);
      setReply(""); setDetail(await getSupportThread(detail.id, token)); fetchThreads();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send"); }
    finally { setSending(false); }
  };
  const create = async () => {
    if (!token || !body.trim()) return;
    setCreating(true); setError(null);
    try {
      const t = await createSupportThread({ subject: subject.trim() || undefined, body: body.trim() }, token);
      setComposeOpen(false); setSubject(""); setBody(""); await fetchThreads(); setDetail(t);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create"); }
    finally { setCreating(false); }
  };

  const openMThread = async (id: string) => {
    if (!token) return;
    setError(null); setMReply("");
    try { setMDetail(await getMarketThread(id, token)); fetchMThreads(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to open"); }
  };
  const sendMReply = async () => {
    if (!token || !mDetail || !mReply.trim()) return;
    setMSending(true); setError(null);
    try {
      await replyMarketThread(mDetail.id, mReply.trim(), token);
      setMReply(""); setMDetail(await getMarketThread(mDetail.id, token)); fetchMThreads();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to send"); }
    finally { setMSending(false); }
  };

  const signIn = async () => {
    setAuthBusy(true); setError(null);
    try { await login(); } catch (e) { setError(e instanceof Error ? e.message : "Sign-in failed"); }
    finally { setAuthBusy(false); }
  };

  const mUnread = mThreads.reduce((n, t) => n + t.unread, 0);
  const sUnread = threads.reduce((n, t) => n + t.unread, 0);

  const Tab = ({ id, label, badge }: { id: Channel; label: string; badge: number }) => (
    <button
      type="button"
      onClick={() => setChannel(id)}
      className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[14px] font-medium transition ${
        channel === id ? "bg-yellow-400/15 text-yellow-200 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.35)]" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-400 px-1.5 text-[11px] font-bold text-[#171717]">{badge}</span>
      )}
    </button>
  );

  return (
    <AccountShell active="Vault">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Support tim Hoshi &amp; chat dengan pembeli/penjual.</p>
      </div>

      <div className="mb-5 flex gap-2">
        <Tab id="support" label="Support" badge={sUnread} />
        <Tab id="marketplace" label="Marketplace" badge={mUnread} />
      </div>

      {channel === "support" && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5 text-amber-300">
          <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-[13px] leading-relaxed">
            Ini thread support resmi dengan tim Hoshi — kami membalas di sini. Hoshi
            <span className="font-semibold"> tidak akan pernah</span> meminta seed phrase / private key
            atau menyuruh memindahkan dana. Siapa pun yang melakukannya adalah penipu.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-400">{error}</div>
      )}

      {!hydrated ? (
        <p className="py-16 text-center text-sm text-zinc-500">Loading…</p>
      ) : !token ? (
        <div className="mt-5">
          <EmptyState
            icon={<InboxIcon className="h-9 w-9" />}
            title="Masuk untuk melihat pesan"
            sub="Hubungkan wallet untuk membuka support dan chat marketplace-mu."
            action={<PrimaryButton onClick={signIn} disabled={authBusy}>{authBusy ? "Signing in…" : "Sign in"}</PrimaryButton>}
          />
        </div>
      ) : channel === "support" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[260px_1fr]">
          {/* Support list */}
          <Panel className="p-3">
            <PrimaryButton className="w-full" onClick={() => setComposeOpen(true)}>+ New message</PrimaryButton>
            <div className="mt-3 flex flex-col gap-1">
              {loading && threads.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-zinc-500">Loading…</p>
              ) : threads.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-zinc-500">Belum ada thread.</p>
              ) : (
                threads.map((t) => {
                  const on = detail?.id === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => openThread(t.id)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-yellow-400/15 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.35)]" : "hover:bg-white/[0.04]"}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.unread > 0 ? "bg-yellow-400" : "bg-transparent"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[14px] font-medium ${on ? "text-yellow-200" : "text-zinc-200"}`}>{t.subject || "(no subject)"}</p>
                        <p className="truncate text-[12px] text-zinc-500">{t.lastMessage?.body ?? "—"}</p>
                      </div>
                      {t.status === "CLOSED" && <span className="shrink-0 text-[10px] font-semibold text-zinc-500">CLOSED</span>}
                    </button>
                  );
                })
              )}
            </div>
          </Panel>

          {/* Support conversation */}
          <Panel className="flex min-h-[420px] flex-col overflow-hidden">
            {!detail ? (
              <div className="flex flex-1 items-center justify-center p-5">
                <EmptyState icon={<InboxIcon className="h-9 w-9" />} title="Belum ada percakapan dipilih" sub="Pilih thread di kiri, atau mulai baru." />
              </div>
            ) : (
              <>
                <div className="border-b border-white/[0.06] px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-zinc-100">{detail.subject || "(no subject)"}</h2>
                  {detail.status === "CLOSED" && <p className="text-[12px] text-zinc-500">Thread ditutup — kirim pesan untuk membuka lagi.</p>}
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {detail.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.senderType === "USER" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.senderType === "USER" ? "bg-yellow-400/15 text-yellow-100" : "bg-white/[0.05] text-zinc-200"}`}>
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-[10px] text-zinc-500">{m.senderType === "USER" ? "You" : "Hoshi team"} · {new Date(m.createdAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-white/[0.06] p-4">
                  <div className="flex gap-2">
                    <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Tulis pesan…" className="min-h-[52px] flex-1" />
                    <PrimaryButton onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? "…" : "Send"}</PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>
      ) : (
        /* -------------------- Marketplace channel -------------------- */
        <div className="mt-5 grid gap-4 sm:grid-cols-[260px_1fr]">
          <Panel className="p-3">
            <p className="px-1 pb-2 text-[12px] text-zinc-500">Chat dari kartu yang kamu jual/minati. Mulai dari tombol “Message Seller” di halaman kartu.</p>
            <div className="flex flex-col gap-1">
              {mLoading && mThreads.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-zinc-500">Loading…</p>
              ) : mThreads.length === 0 ? (
                <p className="px-3 py-6 text-center text-[13px] text-zinc-500">Belum ada chat marketplace.</p>
              ) : (
                mThreads.map((t) => {
                  const on = mDetail?.id === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => openMThread(t.id)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${on ? "bg-yellow-400/15 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.35)]" : "hover:bg-white/[0.04]"}`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${t.unread > 0 ? "bg-yellow-400" : "bg-transparent"}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[14px] font-medium ${on ? "text-yellow-200" : "text-zinc-200"}`}>{t.listingName}</p>
                        <p className="truncate text-[12px] text-zinc-500">
                          <span className="text-zinc-400">{t.role === "SELLER" ? "Pembeli" : "Penjual"}: {t.counterparty}</span>
                          {t.lastMessage ? ` · ${t.lastMessage.body}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400">
                        {t.role === "SELLER" ? "JUAL" : "BELI"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>

          <Panel className="flex min-h-[420px] flex-col overflow-hidden">
            {!mDetail ? (
              <div className="flex flex-1 items-center justify-center p-5">
                <EmptyState icon={<InboxIcon className="h-9 w-9" />} title="Belum ada percakapan dipilih" sub="Pilih chat di kiri untuk membalas." />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-zinc-100">{mDetail.listingName}</h2>
                    <p className="truncate text-[12px] text-zinc-500">
                      {mDetail.role === "SELLER" ? "Pembeli" : "Penjual"}: {mDetail.counterparty}
                    </p>
                  </div>
                  <Link href={`/marketplace/${mDetail.listingId}`} className="shrink-0 text-[12px] font-medium text-yellow-300 hover:text-yellow-200">
                    Lihat kartu ↗
                  </Link>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-5">
                  {mDetail.messages.map((m) => {
                    const mine = m.senderType === mDetail.role;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "bg-yellow-400/15 text-yellow-100" : "bg-white/[0.05] text-zinc-200"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="mt-1 text-[10px] text-zinc-500">{mine ? "You" : mDetail.counterparty} · {new Date(m.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-white/[0.06] p-4">
                  <div className="flex gap-2">
                    <TextArea value={mReply} onChange={(e) => setMReply(e.target.value)} placeholder="Tulis balasan…" className="min-h-[52px] flex-1" />
                    <PrimaryButton onClick={sendMReply} disabled={mSending || !mReply.trim()}>{mSending ? "…" : "Send"}</PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}

      {/* Compose new SUPPORT thread */}
      <ModalShell open={composeOpen} onClose={() => setComposeOpen(false)} title="New support message" maxWidth={480}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Subject <span className="text-zinc-500">(optional)</span></label>
            <TextInput value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="mis. Pertanyaan penarikan vault" autoComplete="off" />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Message</label>
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ada yang bisa kami bantu?" />
          </div>
          <PrimaryButton className="w-full" disabled={!body.trim() || creating} onClick={create}>{creating ? "Sending…" : "Send"}</PrimaryButton>
        </div>
      </ModalShell>
    </AccountShell>
  );
}
