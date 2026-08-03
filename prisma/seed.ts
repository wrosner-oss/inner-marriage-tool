/**
 * Seeds the content library (12 signs + shared structural blocks) from the
 * legacy content_library.json — the copy Amelia extracted from ~15+ of her own
 * sent readings. Combinations (per Venus×Mars reflection questions + notes)
 * start empty; Amelia fills them in via the library editor over time.
 *
 * Idempotent: safe to re-run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

type LibSign = {
  element: string;
  identity: string | null;
  identity_fragment?: string | null;
  descriptive: string | null;
  feminine_archetypes: string[] | null;
  masculine_archetypes: string[] | null;
  fuel_keywords: string | null;
};
type Library = {
  structural: Record<string, string>;
  signs: Record<string, LibSign>;
};

// Starter "qualities" for the reflection questions, distilled from Amelia's OWN
// descriptive lines + fuel keywords for each sign (not fresh invented voice).
// Seeded ONLY into signs that have no qualities yet, so Amelia's edits are never
// clobbered. She reviews/edits these under Content → Signs.
const STARTER_QUALITIES: Record<string, string[]> = {
  Aries: ['starting new things', 'adventure and movement', 'courageous action', 'healthy competition', 'following instinct'],
  Taurus: ['savoring the senses', 'beauty and pleasure', 'working with the hands', 'building something solid', 'presence and patience'],
  Gemini: ['fresh experiences and change', 'playful creativity', 'curiosity and ideas', 'communicating and connecting', 'games and imagination'],
  Cancer: ['nurturing what she loves', 'tending what is growing', 'creating a warm home', 'emotional closeness', 'caring for her people'],
  Leo: ['radiant self-expression', 'heartfelt leadership', 'being seen and shining', 'creative performance', 'generous warmth'],
  Virgo: ['dedicated sacred work', 'honoring rhythms and cycles', 'devoted craft and skill', 'being in service', 'care for the details'],
  Libra: ['deep partnership', 'creating harmony and balance', 'seeing all sides', 'relationship as a path', 'beauty and grace'],
  Scorpio: ['going deep into feeling', 'connecting to Source', 'intuition and the unseen', 'transformation through the dark', 'emotional truth'],
  Sagittarius: ['questing for meaning', 'exploring new territory', 'adventure and freedom', 'seeking spiritual truth', 'learning and growth'],
  Capricorn: ['building lasting structure', 'devotion to a goal', 'grounded discipline', 'responsible leadership', 'systems that endure'],
  Aquarius: ['visionary innovation', 'serving the collective', 'original ideas', 'seeing the big picture', 'freedom to experiment'],
  Pisces: ['connecting to the Divine', 'mystical intuition', 'spiritual surrender', 'compassion and Big Love', 'time in the unseen'],
};

async function main() {
  const raw = readFileSync(join(here, 'seed-data', 'content_library.json'), 'utf-8');
  const lib: Library = JSON.parse(raw);

  // Create-if-absent only — never overwrite Amelia's edits on a re-run/restart.
  for (const [key, template] of Object.entries(lib.structural)) {
    const existing = await prisma.structuralBlock.findUnique({ where: { key } });
    if (!existing) await prisma.structuralBlock.create({ data: { key, template } });
  }

  // The standard reflection questions: one editable set of templates with slots
  // filled per-person from their signs. Separated by blank lines (one per line).
  // Tokens: {feminine_sign} {masculine_sign} {feminine_qualities}
  // {masculine_qualities} {feminine_qualities_2} {masculine_qualities_2}
  // {feminine_archetype} {masculine_archetype}
  const reflectionQuestions = [
    'Which of these aspects of you have gotten the most attention in the past? Does your feminine have what she needs?',
    'What would it look like for your {masculine_sign} side to support and serve your {feminine_sign} side with total devotion?',
    'Is she getting enough time questing for {feminine_qualities}?',
    'Is your masculine using his skills ({masculine_qualities}, for example) to provide a situation and life where she can thrive?',
    'Is he using his {masculine_qualities_2} with her (and not just with everyone else) in ways that serve her and give her the {feminine_qualities_2} she desires?',
    'Is your {masculine_archetype} serving your {feminine_archetype}?',
  ].join('\n\n');
  // Only seed if absent, so we never overwrite Amelia's edits on re-seed.
  const existing = await prisma.structuralBlock.findUnique({ where: { key: 'reflection_questions' } });
  if (!existing) {
    await prisma.structuralBlock.create({ data: { key: 'reflection_questions', template: reflectionQuestions } });
  }

  // Signature footer (name + links). Placeholder URLs — Amelia edits under
  // Content → Structural. Links use [text](url); rendered as real links.
  const signature = [
    'Amelia Sunyata Perkins',
    '[Counseling](https://ameliaperkins.com) · [Workshops](https://ameliaperkins.com) · [The Love Experiment](https://ameliaperkins.com)',
  ].join('\n');
  const sigExisting = await prisma.structuralBlock.findUnique({ where: { key: 'signature' } });
  if (!sigExisting) {
    await prisma.structuralBlock.create({ data: { key: 'signature', template: signature } });
  }

  // Create-if-absent only — existing signs keep whatever Amelia has edited.
  for (const [name, s] of Object.entries(lib.signs)) {
    const existing = await prisma.sign.findUnique({ where: { name } });
    if (existing) continue;
    await prisma.sign.create({
      data: {
        name,
        element: s.element,
        identity: s.identity ?? null,
        identityFragment: s.identity_fragment ?? null,
        descriptive: s.descriptive ?? null,
        feminineArchetypes: s.feminine_archetypes ? JSON.stringify(s.feminine_archetypes) : null,
        masculineArchetypes: s.masculine_archetypes ? JSON.stringify(s.masculine_archetypes) : null,
        fuelKeywords: s.fuel_keywords ?? null,
      },
    });
  }

  // Fill starter qualities only where a sign has none yet (never overwrite edits).
  let filled = 0;
  for (const [name, qualities] of Object.entries(STARTER_QUALITIES)) {
    const s = await prisma.sign.findUnique({ where: { name } });
    if (s && !s.qualities) {
      await prisma.sign.update({ where: { name }, data: { qualities: JSON.stringify(qualities) } });
      filled++;
    }
  }

  const signCount = await prisma.sign.count();
  const blockCount = await prisma.structuralBlock.count();
  console.log(`Seeded ${signCount} signs and ${blockCount} structural blocks; filled starter qualities for ${filled} sign(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
