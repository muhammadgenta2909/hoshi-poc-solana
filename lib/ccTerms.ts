"use client";

// Contractual gate. The Collaboration Agreement requires users to agree that
// "Gacha Cards are provided and fulfilled solely by Collector Crypt Corp" BEFORE
// interacting with the Gacha Product. This records that acceptance.
//
// The version suffix on the key is deliberate: if CC's required wording ever
// changes, bump it and every user is re-prompted rather than silently treated as
// having agreed to text they never saw.
//
// POC scope, stated honestly: acceptance lives in the browser. A production build
// should record it server-side (user id + timestamp + terms version) so there is
// an auditable trail of who agreed to what and when — a localStorage flag proves
// nothing in a dispute. Tracked as a hardening follow-up.

const KEY = "hoshi-cc-terms-accepted-v1";

/** Read on demand (in click handlers), never during render — avoids a
 *  localStorage-driven hydration mismatch. */
export function hasAcceptedCcTerms(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function acceptCcTerms(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* private mode / storage disabled — the gate simply re-appears next time */
  }
}
