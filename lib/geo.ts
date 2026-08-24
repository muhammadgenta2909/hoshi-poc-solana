// Geo data layer — countries / states / cities for the address form.
//
// These hit OUR backend (never countrystatecity.in directly): the backend
// PROXIES api.countrystatecity.in so the CSC_API_KEY stays server-side — no CSP
// change, and the key never reaches the browser. Endpoints live under the global
// /api prefix (already baked into API_BASE from lib/api.ts):
//   GET /geo/countries         -> GeoCountry[]
//   GET /geo/states/:ciso      -> GeoState[]
//   GET /geo/cities/:ciso/:siso -> GeoCity[]
//
// When CSC_API_KEY is UNSET the backend returns HTTP 503, so every call here
// THROWS on a non-2xx response — callers catch that and fall back to plain
// free-text address inputs so the form still works with no geo data.

import { API_BASE, ApiError } from "./api";

export type GeoCountry = {
  iso2: string;
  name: string;
  phonecode: string;
  emoji: string;
};

export type GeoState = {
  iso2: string;
  name: string;
};

export type GeoCity = {
  name: string;
};

/** GET our geo backend, throwing a clean ApiError on any non-2xx (so a 503 —
 *  CSC_API_KEY unset — surfaces to callers as a catchable error → free-text
 *  fallback). Kept local (lib/api.ts's `api` helper is not exported). */
async function geoGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json" },
  });
  if (!res.ok) {
    let msg: string = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message)
        msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch {
      /* non-JSON response — fall back to the status */
    }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

/** Countries are a fixed list — fetch once and memo the in-flight promise so
 *  concurrent callers (and remounts) share a single request. */
let countriesCache: Promise<GeoCountry[]> | null = null;

/** All countries (GET /geo/countries). Cached for the module's lifetime; a
 *  failed fetch is NOT cached, so a later call retries. Throws on non-2xx. */
export function getCountries(): Promise<GeoCountry[]> {
  if (!countriesCache) {
    countriesCache = geoGet<GeoCountry[]>("/geo/countries").catch((e) => {
      countriesCache = null; // let the next call retry (e.g. after key is set)
      throw e;
    });
  }
  return countriesCache;
}

/** States/provinces of a country (GET /geo/states/:ciso). Throws on non-2xx. */
export function getStates(ciso: string): Promise<GeoState[]> {
  return geoGet<GeoState[]>(`/geo/states/${encodeURIComponent(ciso)}`);
}

/** Cities of a state (GET /geo/cities/:ciso/:siso). Throws on non-2xx. */
export function getCities(ciso: string, siso: string): Promise<GeoCity[]> {
  return geoGet<GeoCity[]>(
    `/geo/cities/${encodeURIComponent(ciso)}/${encodeURIComponent(siso)}`,
  );
}
