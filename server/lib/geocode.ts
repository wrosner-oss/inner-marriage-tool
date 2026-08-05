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

async function fetchGeo(name: string): Promise<GeoCandidate[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', name);
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
  return (data.results ?? []).map(toCandidate);
}

// A few common abbreviations Open-Meteo returns in full form.
const HINT_ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  dc: 'district of columbia',
};
function normHint(h: string): string {
  const t = h.toLowerCase().replace(/\./g, '').trim();
  return HINT_ALIASES[t] ?? t;
}
function initials(s: string | undefined): string {
  return (s ?? '')
    .split(/\s+/)
    .filter((w) => w && !['of', 'the', 'and'].includes(w.toLowerCase()))
    .map((w) => w[0])
    .join('')
    .toLowerCase();
}
/** How many of the state/country hints match this candidate. */
function hintScore(c: GeoCandidate, hints: string[]): number {
  const fields = [c.admin1, c.country].filter(Boolean).map((x) => (x as string).toLowerCase());
  const admin1Initials = initials(c.admin1);
  let score = 0;
  for (const raw of hints) {
    const h = normHint(raw);
    if (!h) continue;
    if (fields.some((f) => f.includes(h) || h.includes(f)) || h === admin1Initials) score++;
  }
  return score;
}

/**
 * Resolve a place to a single candidate. Searches by the CITY (first
 * comma-separated part) — Open-Meteo matches city names, not "City, State,
 * Country" strings — then narrows by the state/country hints. Throws
 * AmbiguousPlaceError (with candidates) when nothing matches or several
 * genuinely different cities remain.
 */
export async function geocodePlace(query: string): Promise<GeoCandidate> {
  const q = query.trim();
  if (!q) throw new AmbiguousPlaceError('No birthplace given.', []);

  const parts = q.split(',').map((s) => s.trim()).filter(Boolean);
  const city = parts[0];
  const hints = parts.slice(1);

  let results = await fetchGeo(city);
  // Fallback: if the city part found nothing, try the whole string once.
  if (results.length === 0 && parts.length > 1) results = await fetchGeo(q);
  if (results.length === 0) {
    throw new AmbiguousPlaceError(
      `No place found matching "${q}". Try adding a state or country, e.g. "Denver, Colorado, USA".`,
      [],
    );
  }

  // Prefer populated places (Geonames "PPL*") over landmarks (zoo, airport…).
  const populated = results.filter(
    (r) => (r.featureCode?.startsWith('PPL') ?? false) || (r.population ?? 0) > 0,
  );
  let base = populated.length ? populated : results;

  // Narrow by the state/country hints when the user gave any.
  if (hints.length) {
    const scored = base.map((c) => ({ c, s: hintScore(c, hints) }));
    const maxS = Math.max(...scored.map((x) => x.s));
    if (maxS > 0) base = scored.filter((x) => x.s === maxS).map((x) => x.c);
  }

  // Collapse to distinct cities (name + region + country); keep the most
  // populous representative of each.
  const byCity = new Map<string, GeoCandidate>();
  for (const c of base) {
    const key = cityKey(c);
    const prev = byCity.get(key);
    if (!prev || (c.population ?? 0) > (prev.population ?? 0)) byCity.set(key, c);
  }
  const cities = [...byCity.values()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));

  if (cities.length === 1) return cities[0];

  // Several genuinely different cities: only auto-pick when the top is
  // overwhelmingly larger; otherwise return candidates to choose from.
  const [top, second] = cities;
  const topPop = top.population ?? 0;
  const secondPop = second.population ?? 0;
  if (topPop > 0 && topPop >= secondPop * 20) return top;

  throw new AmbiguousPlaceError(
    `"${q}" is ambiguous — ${cities.length} places match. Pick the right one.`,
    cities.slice(0, 8),
  );
}
