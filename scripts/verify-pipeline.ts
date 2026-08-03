/**
 * End-to-end smoke test of the whole reading pipeline, no server/UI needed:
 *   geocode -> computeChart -> buildReading -> renderEmail
 * Writes the rendered email to scripts/out/sample-reading.html for eyeballing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { geocodePlace } from '../server/lib/geocode.js';
import { computeChart, PLANETS } from '../server/lib/ephemeris.js';
import { buildReading } from '../server/lib/assemble.js';
import { renderEmail } from '../server/lib/renderEmail.js';

const prisma = new PrismaClient();

async function main() {
  const person = { name: 'Sarah', date: '1990-08-02', time: '06:30', place: 'Los Angeles, California, USA', pronoun: 'She' };

  console.log(`Geocoding "${person.place}"...`);
  const geo = await geocodePlace(person.place);
  console.log(`  -> ${geo.label}  (${geo.latitude}, ${geo.longitude})  tz=${geo.timezone}`);

  const chart = computeChart({ date: person.date, time: person.time, latitude: geo.latitude, longitude: geo.longitude });
  console.log('Chart:');
  for (const p of PLANETS) console.log(`  ${p.padEnd(9)} ${chart.planets[p].sign}${chart.planets[p].retrograde ? ' (R)' : ''}`);
  console.log(`  Rising    ${chart.ascendant}`);
  console.log(`  Midheaven ${chart.midheaven}`);

  const venusSign = chart.planets.Venus.sign;
  const marsSign = chart.planets.Mars.sign;
  const sunSign = chart.planets.Sun.sign;

  const reading = await buildReading(prisma, { name: person.name, venusSign, marsSign, sunSign, pronoun: person.pronoun });
  console.log(`\nAssembled reading: ${reading.text.length} chars, ${reading.gaps.length} gap(s):`);
  for (const g of reading.gaps) console.log(`  - ${g}`);

  const signRows = await prisma.sign.findMany();
  const elementOf = (name: string) => signRows.find((s) => s.name === name)?.element ?? '';

  const html = renderEmail({
    readingText: reading.text,
    customNote: 'Sarah — it was such a joy having you in the Tuesday circle. This pairing is a beautiful one. 🌙',
    chart: {
      venusSign, marsSign,
      venusElement: elementOf(venusSign),
      marsElement: elementOf(marsSign),
      positions: PLANETS.map((p) => ({ label: p, sign: chart.planets[p].sign, retrograde: chart.planets[p].retrograde })),
      ascendant: chart.ascendant,
      midheaven: chart.midheaven,
    },
  });

  mkdirSync('scripts/out', { recursive: true });
  writeFileSync('scripts/out/sample-reading.html', html);
  console.log('\nWrote scripts/out/sample-reading.html');
}

main()
  .catch((e) => { console.error('\nPIPELINE ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
