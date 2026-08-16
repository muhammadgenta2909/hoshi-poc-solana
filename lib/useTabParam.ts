"use client";

// Tab aktif yang PERSISTEN di URL (?tab=X) → refresh/back tetap di tab yang sama. Dipakai di semua
// halaman ber-tab (account, settings, dll). Sengaja pakai window/history (client-only), BUKAN
// next/navigation useSearchParams — supaya tak butuh Suspense boundary & tak bikin build error di
// halaman yang di-prerender statis. Nilai default TIDAK ditulis ke URL (biar URL bersih).

import { useCallback, useEffect, useState } from "react";

export function useTabParam<T extends string>(
  defaultTab: T,
  valid: readonly T[],
  key = "tab",
): [T, (t: T) => void] {
  const [tab, setTabState] = useState<T>(defaultTab);

  // Restore dari URL sekali saat mount (client-only). Ada kedip singkat ke defaultTab sebelum
  // sinkron — dapat diterima demi menghindari kebutuhan Suspense.
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get(key);
      if (raw && (valid as readonly string[]).includes(raw)) {
        /* eslint-disable-next-line react-hooks/set-state-in-effect */
        setTabState(raw as T);
      }
    } catch {
      /* akses URL gagal — biarkan default */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = useCallback(
    (t: T) => {
      setTabState(t);
      try {
        const sp = new URLSearchParams(window.location.search);
        if (t === defaultTab) sp.delete(key);
        else sp.set(key, t);
        const qs = sp.toString();
        // replaceState → ganti tab tak menumpuk history & tak reload; refresh tetap di tab ini.
        window.history.replaceState(
          null,
          "",
          qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
        );
      } catch {
        /* history gagal — state tetap berubah, cuma URL tak update */
      }
    },
    [defaultTab, key],
  );

  return [tab, setTab];
}
