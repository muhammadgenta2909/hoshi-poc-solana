"use client";

// The consent gate the Collaboration Agreement requires before a user interacts
// with the Gacha Product. The English paragraph below is the EXACT disclaimer from
// the contract — "substantially similar" wording would need CollectorCrypt's
// approval, so we use theirs verbatim. A short Indonesian lead-in makes the point
// plain for the audience without altering the binding text.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GOLD_GRADIENT } from "./ui";

export default function TermsGate({
  onAccept,
  onClose,
}: {
  onAccept: () => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Syarat sebelum membuka pack"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141206]"
        style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-[17px] font-semibold text-white">Sebelum membuka pack</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/12 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-zinc-400">
          <p className="mb-3 text-zinc-300">
            Kartu gacha disediakan &amp; dipenuhi <span className="font-semibold">sepenuhnya oleh
            CollectorCrypt</span> — bukan oleh Hoshi. Baca &amp; setujui dulu:
          </p>
          <p>
            You acknowledge and agree that Gacha Cards are provided and fulfilled solely by
            Collector Crypt Corp. (&ldquo;Collector Crypt&rdquo;), and not by us. By purchasing or
            interacting with a Gacha Card, you agree to be bound by Collector Crypt&rsquo;s terms and
            conditions, available at{" "}
            <a
              href="https://collectorcrypt.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-yellow-300 underline underline-offset-2 hover:brightness-110"
            >
              collectorcrypt.com
            </a>
            , as may be amended from time to time. We do not control and bear no responsibility or
            liability for the underlying RWAs or Gacha Cards, including but not limited to: (i) the
            authenticity, grading, or condition of any RWA; (ii) the storage or safekeeping of RWAs or
            Gacha Cards; (iii) the buyback offers, redemption, delivery, or shipping of RWAs; or (iv)
            any related taxes, duties, or customs compliance. All such matters are exclusively between
            you and Collector Crypt. Any claims or disputes regarding Gacha Cards or underlying RWAs
            must be directed to Collector Crypt. We may facilitate communications between you and
            Collector Crypt through our customer support channels, but such assistance is provided
            solely for convenience and does not create any obligation or liability on our part.
          </p>
        </div>

        <div className="border-t border-white/[0.06] px-5 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-zinc-300">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-yellow-400"
            />
            <span>
              Saya sudah membaca dan menyetujui syarat di atas serta terms CollectorCrypt.
            </span>
          </label>
          <button
            type="button"
            disabled={!checked}
            onClick={onAccept}
            className="mt-3 w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-[#171717] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundImage: GOLD_GRADIENT }}
          >
            Setuju &amp; lanjutkan
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
