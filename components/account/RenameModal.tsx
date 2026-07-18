"use client";

// Edit-display-name modal, opened by the pencil in the profile banner. Shared
// by the Profile and Settings pages — the caller owns the PATCH via `onSave`,
// so each page updates its own local state after a successful rename.

import { useState } from "react";
import {
  ModalShell,
  TextInput,
  PrimaryButton,
  GhostButton,
} from "@/components/account/ui";

export default function RenameModal({
  current,
  onClose,
  onSave,
}: {
  current: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const save = async () => {
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Edit display name"
      subtitle="This is the name other collectors see on your listings, offers and activity."
    >
      <TextInput
        autoFocus
        value={name}
        maxLength={32}
        onChange={(e) => setName(e.target.value)}
        placeholder="Satoshi"
        onKeyDown={(e) => e.key === "Enter" && void save()}
      />
      {error && <p className="mt-2 text-[12px] text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <GhostButton onClick={onClose} disabled={saving}>
          Cancel
        </GhostButton>
        <PrimaryButton onClick={save} disabled={!trimmed || saving}>
          {saving ? "Saving…" : "Save"}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}
