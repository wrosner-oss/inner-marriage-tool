/**
 * Local natal-chart computation — replaces the old Playwright scraper.
 *
 * Uses circular-natal-horoscope-js (pure JS, no native deps, no data files).
 * The library takes LOCAL birth wall-clock time plus lat/lng and derives the
 * timezone (including historical DST) from the coordinates itself, so we only
 * need to geocode the place to lat/lng (see geocode.ts).
 *
 * Verified against known charts: Jan 1 1990 -> Sun Capricorn; Aug 2 1990 -> Sun
 * Leo; Ascendant is correctly time/location sensitive.
 */
// The package is CommonJS; import the default and destructure for ESM safety.
import pkg from 'circular-natal-horoscope-js';
const { Origin, Horoscope } = pkg as any;

export const PLANETS = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
] as const;
export type Planet = (typeof PLANETS)[number];

export interface Placement {
  sign: string;
  retrograde: boolean;
}

export interface ChartResult {
  /** planet name -> placement */
  planets: Record<Planet, Placement>;
  /** Rising sign; null when birth time is unknown */
  ascendant: string | null;
  /** Midheaven sign; null when birth time is unknown */
  midheaven: string | null;
  /** true when birth time was missing (planets computed at noon; angles unavailable) */
  timeAssumed: boolean;
  /** notes worth surfacing to the user (e.g. missing-time caveats) */
  notes: string[];
}

export interface BirthInput {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM (local) or null/empty if unknown
  latitude: number;
  longitude: number;
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) throw new Error(`Invalid birth date "${date}" (expected YYYY-MM-DD)`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseTime(time: string | null): { hour: number; minute: number } | null {
  if (!time || !time.trim()) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) throw new Error(`Invalid birth time "${time}" (expected HH:MM)`);
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) throw new Error(`Invalid birth time "${time}"`);
  return { hour, minute };
}

export function computeChart(input: BirthInput): ChartResult {
  const { year, month, day } = parseDate(input.date);
  const t = parseTime(input.time);
  const timeAssumed = t === null;
  const hour = t ? t.hour : 12; // noon when unknown — keeps most planet signs valid
  const minute = t ? t.minute : 0;

  const origin = new Origin({
    year,
    month: month - 1, // library is 0-indexed (Jan = 0)
    date: day,
    hour,
    minute,
    latitude: input.latitude,
    longitude: input.longitude,
  });

  const horoscope = new Horoscope({
    origin,
    houseSystem: 'placidus',
    zodiac: 'tropical',
    aspectPoints: [],
    aspectWithPoints: [],
    aspectTypes: [],
    language: 'en',
  });

  const byLabel: Record<string, any> = {};
  for (const body of horoscope.CelestialBodies.all) byLabel[body.label] = body;

  const planets = {} as Record<Planet, Placement>;
  for (const p of PLANETS) {
    const body = byLabel[p];
    planets[p] = {
      sign: body?.Sign?.label ?? 'Unknown',
      retrograde: Boolean(body?.isRetrograde),
    };
  }

  const notes: string[] = [];
  let ascendant: string | null = null;
  let midheaven: string | null = null;

  if (timeAssumed) {
    notes.push(
      'Birth time is missing, so Rising and Midheaven cannot be determined, and the Moon sign may be approximate.',
    );
  } else {
    ascendant = horoscope.Ascendant?.Sign?.label ?? null;
    midheaven = horoscope.Midheaven?.Sign?.label ?? null;
  }

  return { planets, ascendant, midheaven, timeAssumed, notes };
}
