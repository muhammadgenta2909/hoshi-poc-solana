"use client";

// Messages — POC inbox. No backend: folders + compose are local React state.
// Anyone can message anyone on-chain, so the page leads with a scam-safety
// banner and keeps every folder as a calm empty state until real threads land.

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  AccountShell,
  Panel,
  PrimaryButton,
  EmptyState,
  ModalShell,
  TextInput,
  TextArea,
  InboxIcon,
  MessageIcon,
  WarningIcon,
} from "@/components/account/ui";

type IconProps = { className?: string };

const FOLDERS = ["Inbox", "Sent", "Other"] as const;
type Folder = (typeof FOLDERS)[number];

const META: Record<Folder, { icon: ComponentType<IconProps>; empty: string }> = {
  Inbox: { icon: InboxIcon, empty: "Your inbox is empty." },
  Sent: { icon: MessageIcon, empty: "You haven't sent any messages yet." },
  Other: { icon: WarningIcon, empty: "Filtered and low-priority messages land here." },
};

export default function MessagesPage() {
  const [active, setActive] = useState<Folder>("Inbox");
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const canSend = recipient.trim().length > 0 && body.trim().length > 0;

  function handleSend() {
    if (!canSend) return;
    setComposeOpen(false);
    setRecipient("");
    setBody("");
    setSent(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSent(false), 2500);
  }

  return (
    <AccountShell active="Vault">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Direct messages from other collectors on Hoshi.
        </p>
      </div>

      {/* Scam-safety notice — anyone can DM anyone, so lead with the warning. */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3.5 text-amber-300">
        <WarningIcon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="text-[13px] leading-relaxed">
          Anyone can send messages on Hoshi. The Hoshi team will never contact you through in-app
          messages. If someone claims to be from Hoshi, they are a scammer. Do not open any links.
          You did not win anything.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[220px_1fr]">
        {/* Left — compose + folder list */}
        <Panel className="p-3">
          <PrimaryButton className="w-full" onClick={() => setComposeOpen(true)}>
            + Send message
          </PrimaryButton>
          <div className="mt-3 flex flex-col gap-1">
            {FOLDERS.map((folder) => {
              const on = folder === active;
              const Icon = META[folder].icon;
              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setActive(folder)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition ${
                    on
                      ? "bg-yellow-400/15 text-yellow-300 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.35)]"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {folder}
                </button>
              );
            })}
          </div>
        </Panel>

        {/* Right — folder view */}
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-zinc-100">{active}</h2>
            <span className="text-[13px] text-zinc-500">0 messages</span>
          </div>

          {sent && (
            <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-2.5 text-[13px] font-medium text-emerald-300">
              Message sent
            </div>
          )}

          <div className="p-4 sm:p-5">
            <EmptyState
              icon={<InboxIcon className="h-9 w-9" />}
              title="No messages"
              sub={META[active].empty}
            />
          </div>
        </Panel>
      </div>

      {/* Compose */}
      <ModalShell
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        title="Send a message"
        maxWidth={480}
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Recipient</label>
            <TextInput
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient wallet address"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-zinc-300">Message</label>
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
            />
          </div>
          <PrimaryButton className="w-full" disabled={!canSend} onClick={handleSend}>
            Send
          </PrimaryButton>
        </div>
      </ModalShell>
    </AccountShell>
  );
}
