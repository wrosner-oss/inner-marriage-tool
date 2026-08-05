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

// Third-person "Creation Team" copy for each sign — a faithful rewrite of each
// sign's own identity paragraph out of first person (Aries text is Amelia's
// verbatim example). Seeded only where empty; Amelia edits in Content → Signs.
const STARTER_CREATION_TEAM: Record<string, string> = {
  Aries:
    'Aries teaches the meaning of individuation. Aries are active, high spirited, and energetic. They love excitement, adventure, play, and competition. As a sacred warrior, they will fight to defend their belief and protect what they value in life. They like to go first, birth the new, get something started, and lead the way. They are courageous, trusting, decisive, inspired and spontaneous.',
  Taurus:
    'Taurus teaches the value of enjoying the earthly realm of matter. Taurus delight in all that looks beautiful, tastes delicious, and feels pleasurable. They love receiving all the exquisite things and gratifications the physical realm has to offer. They know how to take solid steps to fulfill their desires for possessions, wealth, and security. They connect to the divine when they savor and enjoy intimacy through the body and senses.',
  Gemini:
    'Gemini teaches the importance of the mind and ideas. Gemini crave fresh experiences, change, fun, games, and imagination. They are versatile and curious and often play the comedian and perpetual youth. They are self-expressive through writing, speaking, or connecting to the divine muse through their many creative pursuits. They like to communicate, network, and bring news and information.',
  Cancer:
    'Cancer teaches the meaning of nurturing. Cancer are the devoted caregiver — to their family, their people, their creations. They love home. They love comfort. They love what is close and meaningful. They are sensitive to vulnerability, and they create safe emotional space for what is tender, young, and growing.',
  Leo:
    'Leo teaches the value of radiance. Leo use the key of self-love to turn up their light — and the brighter they shine, the more they inspire others. They are natural leaders, performers, stars, directors, and creators: self-confident, dramatic, regal, openhearted, generous, creative, expansive, powerful, and outgoing. They celebrate life from the center stage of their own heart.',
  Virgo:
    'Virgo teaches the significance of dedicated work. Virgo understand and honor patterns, timings, rhythms, and cycles. They access the Priest/ess within to honor the sacred in the natural world through ceremony and ritual. They are organized, practical, dependable, productive, and hard-working, with a tremendous capacity for handling the details of the earthly realm. They are dedicated to doing their sacred work by being in service to the world around them.',
  Libra:
    'Libra teaches the importance of balanced relationships. Libra have the capacity to see things from all sides, honor each person’s point of view, balance opposites, consider options, and mediate well. They create safe space for all the gates of awareness to be valued. Their cooperative social skills make them a good partner, hostess, and companion. Relationship is their spiritual path.',
  Scorpio:
    'Scorpio teaches the power of feelings. Scorpio fully experience the complete range of feelings, from icy and frozen to hot and steamy, and everything in-between; their training is to master their response to them. They are intense and passionate about discovering what lies well beneath the surface of current awareness. They travel deep into their feeling waters to connect to Source, and use the treasures they discover there to generate life force in themselves and in others. They possess a potent intuition, or sixth sense, and an ability to travel into other realms of consciousness.',
  Sagittarius:
    'Sagittarius teaches the significance of expansion. Sagittarius are the dynamic, outgoing, truth-seeking explorer. They constantly quest for expansion by physically and energetically seeking out new ideas and territories. They bring their expanded awareness and discoveries back to share with others as a teacher of philosophy and of evolving states of consciousness. They passionately search for the meaning of life through freedom, growth, and development.',
  Capricorn:
    'Capricorn teaches the value of structure and form. Capricorn are the administrator, the mature and wise one, the disciplined teacher, the hard-working leader, the good provider, and the practical businessperson. They are ambitious, responsible, effective, efficient, and goal-oriented as they bring new structures into earthly form. They create organizations and systems designed to last and support generations to come.',
  Aquarius:
    'Aquarius teaches the importance of innovation. Aquarius have a cosmic perspective on life and bring radical new ideas to humanity. They are the free-spirited visionary, exploring unconventional territory. They are here for truth, for evolution, for a better world.',
  Pisces:
    'Pisces teaches the way of the mystic. Pisces are deeply spiritual and intuitive, connected to Big Love, Source, and the Divine. (Placeholder from the rising-sign note — worth expanding with Amelia’s full Pisces copy.)',
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

  // Extra final paragraph in "Right relationship" when Venus and Mars share a sign.
  // {feminine_sign} and {masculine_sign} both resolve to that same sign.
  const sameSignAddon =
    'This is true in terms of your generalized or archetypal masculine and feminine as well as the special flavor you bring in through your birth chart. The generalized masculine is the part that puts your energy and ideas out into the world and also the part that holds space for your generalized feminine — your intuition and life force energy — to flow. Since your masculine and feminine are both in {feminine_sign}, you might find it easier to think of this in terms of the generalized masculine and feminine… AND your {masculine_sign} side is huge and key to everything.';
  const sameSignExisting = await prisma.structuralBlock.findUnique({ where: { key: 'right_relationship_same_sign_addon' } });
  if (!sameSignExisting) {
    await prisma.structuralBlock.create({ data: { key: 'right_relationship_same_sign_addon', template: sameSignAddon } });
  }

  // Intro sentence for the P.P.S. (creation-team) section.
  const ppsIntro = 'P.P.S. These planets make up a key part of your creation team, which we’ll discuss more in class.';
  const ppsExisting = await prisma.structuralBlock.findUnique({ where: { key: 'pps_intro' } });
  if (!ppsExisting) {
    await prisma.structuralBlock.create({ data: { key: 'pps_intro', template: ppsIntro } });
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

  // Fill starter Creation Team copy only where a sign has none yet.
  let ctFilled = 0;
  for (const [name, creationTeam] of Object.entries(STARTER_CREATION_TEAM)) {
    const s = await prisma.sign.findUnique({ where: { name } });
    if (s && !s.creationTeam) {
      await prisma.sign.update({ where: { name }, data: { creationTeam } });
      ctFilled++;
    }
  }
  if (ctFilled) console.log(`Filled starter Creation Team copy for ${ctFilled} sign(s).`);

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
