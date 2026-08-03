/**
 * Turns a birthplace string into coordinates using the Open-Meteo geocoding
 * API (free, no API key, simple JSON — unlike the old scraper there is no bot
 * detection to fight).
 *
 * Honors the handoff's hard rule: a city name is often ambiguous ("Denver"
 * matches many places), and a wrong city silently corrupts the whole chart.
 * So we NEVER silently pick one — if the result is ambiguous or not found, we
 * surface the candidate list and let the caller (ultimately Amelia) disambiguate.
 */

export interface GeoCandidate {
  name: string;
  admin1?: string; // state / region
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  population?: number;
  featureCode?: string; // Geonames feature code; "PPL*" = populated place
  label: string; // human-readable "City, Region, Country"
}

export class AmbiguousPlaceError extends Error {
  constructor(
    message: string,
    public candidates: GeoCandidate[],
  ) {
    super(message);
    this.name = 'AmbiguousPlaceError';
  }
}

function toCandidate(r: any): GeoCandidate {
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return {
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
    population: r.population,
    featureCode: r.feature_code,
    label: parts.join(', '),
  };
}

/** identity of a place as a city: name + region + country (ignores POIs vs city) */
function cityKey(c: GeoCandidate): string {
  return [c.name, c.admin1, c.country].join('|').toLowerCase();
}

/**
 * Resolve a place to a single candidate. Throws AmbiguousPlaceError (with
 * candidates) when the name matches nothing, or matches several places that
 * aren't obviously the same spot.
 */
export async function geocodePlace(query: string): Promise<GeoCandidate> {
  const q = query.trim();
  if (!q) throw new AmbiguousPlaceError('No birthplace given.', []);

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  let data: any;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`geocoding service returned ${res.status}`);
    data = await res.json();
  } catch (err: any) {
    throw new Error(`Could not reach the geocoding service: ${err.message}`);
  }

  const results: GeoCandidate[] = (data.results ?? []).map(toCandidate);

  if (results.length === 0) {
    throw new AmbiguousPlaceError(
      `No place found matching "${q}". Try adding a state or country, e.g. "Denver, Colorado, USA".`,
      [],
    );
  }

  // Birthplaces are cities/towns, not landmarks. Prefer populated places
  // (Geonames feature codes starting "PPL") so a query like "Los Angeles"
  // isn't drowned out by the zoo, the airport, and downtown districts.
  const populated = results.filter(
    (r) => (r.featureCode?.startsWith('PPL') ?? false) || (r.population ?? 0) > 0,
  );
  const base = populated.length ? populated : results;

  // Collapse to distinct cities (name + region + country). Same city appearing
  // multiple times (e.g. a district within it) counts once — keep the most
  // populous instance as its representative.
  const byCity = new Map<string, GeoCandidate>();
  for (const c of base) {
    const key = cityKey(c);
    const prev = byCity.get(key);
    if (!prev || (c.population ?? 0) > (prev.population ?? 0)) byCity.set(key, c);
  }
  const cities = [...byCity.values()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));

  if (cities.length === 1) return cities[0];

  // Multiple genuinely different cities (Denver CO vs Denver PA): only auto-pick
  // when the top is overwhelmingly larger; otherwise fail loudly with candidates.
  const [top, second] = cities;
  const topPop = top.population ?? 0;
  const secondPop = second.population ?? 0;
  if (topPop > 0 && topPop >= secondPop * 20) return top;

  throw new AmbiguousPlaceError(
    `"${q}" is ambiguous — ${cities.length} places match. Add a state/region or country to be specific.`,
    cities.slice(0, 8),
  );
}
