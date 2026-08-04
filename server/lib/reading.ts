/**
 * Ties the pieces together for one participant: compute the chart, assemble the
 * reading, and render the email. Also owns the "should we regenerate?" logic so
 * reopening a class is cheap and never clobbers Amelia's hand-edits by surprise.
 */
import { createHash } from 'node:crypto';
import type { Participant, PrismaClient } from '@prisma/client';
import { geocodePlace, AmbiguousPlaceError } from './geocode.js';
import { computeChart, PLANETS, type ChartResult } from './ephemeris.js';
import { buildReading } from './assemble.js';
import { renderEmail, type RenderChart } from './renderEmail.js';

export { AmbiguousPlaceError };

/** Fields whose change should trigger a fresh chart + reading. */
export function inputsHash(p: Pick<Participant, 'birthDate' | 'birthTime' | 'place' | 'pronoun'>): string {
  return createHash('sha1')
    .update([p.birthDate, p.birthTime ?? '', p.place, p.pronoun].join('|'))
    .digest('hex');
}

export interface StoredChart {
  planets: Record<string, { sign: string; retrograde: boolean }>;
  ascendant: string | null;
  midheaven: string | null;
  timeAssumed: boolean;
}

function toStored(chart: ChartResult): StoredChart {
  return {
    planets: Object.fromEntries(PLANETS.map((p) => [p, chart.planets[p]])),
    ascendant: chart.ascendant,
    midheaven: chart.midheaven,
    timeAssumed: chart.timeAssumed,
  };
}

/**
 * Recompute chart + reading for a participant and persist it. Throws
 * AmbiguousPlaceError (with candidates) if the birthplace can't be resolved.
 */
export async function regenerateParticipant(prisma: PrismaClient, participant: Participant): Promise<Participant> {
  const geo = await geocodePlace(participant.place); // may throw AmbiguousPlaceError
  const chart = computeChart({
    date: participant.birthDate,
    time: participant.birthTime,
    latitude: geo.latitude,
    longitude: geo.longitude,
  });

  const venusSign = chart.planets.Venus.sign;
  const marsSign = chart.planets.Mars.sign;
  const sunSign = chart.planets.Sun.sign;

  const reading = await buildReading(prisma, {
    name: participant.name,
    venusSign,
    marsSign,
    sunSign,
    pronoun: participant.pronoun,
  });

  return prisma.participant.update({
    where: { id: participant.id },
    data: {
      sunSign,
      venusSign,
      marsSign,
      chartJson: JSON.stringify(toStored(chart)),
      readingText: reading.text,
      gapsJson: JSON.stringify(reading.gaps),
      edited: false,
      error: null,
      inputsHash: inputsHash(participant),
      draftStatus: 'none',
    },
  });
}

/** Build the render-ready chart object (adds element lookups for the panel). */
export async function renderChartFor(prisma: PrismaClient, participant: Participant): Promise<RenderChart | null> {
  if (!participant.chartJson || !participant.venusSign || !participant.marsSign) return null;
  const stored: StoredChart = JSON.parse(participant.chartJson);
  const signs = await prisma.sign.findMany();
  const elementOf = (name: string) => signs.find((s) => s.name === name)?.element ?? '';
  return {
    venusSign: participant.venusSign,
    marsSign: participant.marsSign,
    venusElement: elementOf(participant.venusSign),
    marsElement: elementOf(participant.marsSign),
    positions: PLANETS.map((p) => ({
      label: p,
      sign: stored.planets[p]?.sign ?? '—',
      retrograde: Boolean(stored.planets[p]?.retrograde),
    })),
    ascendant: stored.ascendant,
    midheaven: stored.midheaven,
  };
}

/** Render the current (possibly hand-edited) reading for a participant to email HTML. */
export async function renderParticipantEmail(prisma: PrismaClient, participant: Participant): Promise<string | null> {
  const chart = await renderChartFor(prisma, participant);
  if (!chart || !participant.readingText) return null;
  const sig = await prisma.structuralBlock.findUnique({ where: { key: 'signature' } });
  return renderEmail({
    readingText: participant.readingText,
    chart,
    customNote: participant.customNote,
    signature: sig?.template ?? null,
    birth: { date: participant.birthDate, time: participant.birthTime, place: participant.place },
  });
}
