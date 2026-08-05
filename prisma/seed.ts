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

// Masculine skills per Mars sign (the "(...)" parenthetical). Each line is a
// complete phrase; the question samples one. From Amelia's email sweep.
// Aquarius omitted on purpose — no sourced email where Mars was in Aquarius.
const STARTER_MASCULINE_QUALITIES: Record<string, string[]> = {
  Aries: ['energy, courage, and spontaneity', 'taking risks'],
  Taurus: ['creating security, beauty, and a sensuous experience of the earthly realm'],
  Gemini: ['creativity and imagination'],
  Cancer: ['nurturing, protecting, and creating emotional safety', 'showing up as a devoted protector and partner'],
  Leo: ['leadership, courage, and King-like steadiness', 'confidence, leadership, and radiance', 'creating the container', 'warmth and self-love'],
  Virgo: ['being organized, practical, dependable, and productive, with a capacity for handling the details of the earthly realm', 'creating sacred space', 'dedicated work and honoring the cycles', 'nurturance'],
  Libra: ['creating balance, creating safe space, making sure everyone gets a chance to be heard, fairness, and working as a team', 'diplomacy and care', 'balance, fairness, and collaboration'],
  Scorpio: ['going deep, intuition, and the full range of emotion', 'sorcerer-magic and mastery over his emotions'],
  Sagittarius: ['questing for spirit, knowledge, exploration, and growth', 'his love of exploration, learning, and growth', 'devotion'],
  Capricorn: ['responsibility, effectiveness, and efficiency', 'creating structures and goals'],
  Pisces: ['deep spirituality and intuition', 'big love and compassion'],
};

// What each Venus (feminine) sign is "supported to." Fills "…support her to {X}".
// Virgo, Capricorn, Pisces omitted — no sourced email had them as Venus.
const STARTER_FEMININE_SUPPORT: Record<string, string[]> = {
  Aries: ['birth the new and protect what she values', 'be courageous and spontaneous, and have adventure, excitement, and play', 'explore, play, and follow her impulses'],
  Taurus: ['feel secure — and to fully enjoy life', 'have more room for her pleasure and expression'],
  Gemini: ['have more play, novelty, and creative stimulation', 'express her curiosity and creative voice'],
  Cancer: ['grow what she longs to grow'],
  Leo: ['blossom', 'flourish in her creativity, expansiveness, and joy'],
  Libra: ['create balanced relationships where she can thrive and feel secure'],
  Scorpio: ['truly shine and enter the depths of her emotions and the mysteries of life', 'go deep and master her emotions so she can bring her medicine to the world'],
  Sagittarius: ['live a life where she can truly thrive', 'have the freedom and experiences she desires'],
  Aquarius: ['play in the expanded spaces she so loves and needs', 'shine and bring her medicine to the world', 'be as original, expansive, and unconventional as she truly is'],
};

// The reflection-question defaults. If a DB still has the OLD default verbatim
// (i.e. Amelia hasn't customized it), we upgrade it to the NEW shape.
const OLD_DEFAULT_QUESTIONS = [
  'Which of these aspects of you have gotten the most attention in the past? Does your feminine have what she needs?',
  'What would it look like for your {masculine_sign} side to support and serve your {feminine_sign} side with total devotion?',
  'Is she getting enough time questing for {feminine_qualities}?',
  'Is your masculine using his skills ({masculine_qualities}, for example) to provide a situation and life where she can thrive?',
  'Is he using his {masculine_qualities_2} with her (and not just with everyone else) in ways that serve her and give her the {feminine_qualities_2} she desires?',
  'Is your {masculine_archetype} serving your {feminine_archetype}?',
].join('\n\n');

const NEW_DEFAULT_QUESTIONS = [
  'Which of these aspects of you have gotten the most attention in the past? Does your feminine have what she needs?',
  'What would it look like for your {masculine_sign} side to support and serve your {feminine_sign} side with total devotion?',
  'Is your masculine using his skills ({masculine_qualities}) in ways that support her to {feminine_support}?',
  'Is he extending those gifts to her specifically — and not just to everyone else?',
  'Is he creating a situation for her to {feminine_support_2}?',
  'Is your {masculine_archetype} serving your {feminine_archetype}?',
].join('\n\n');

async function main() {
  const raw = readFileSync(join(here, 'seed-data', 'content_library.json'), 'utf-8');
  const lib: Library = JSON.parse(raw);

  // Create-if-absent only — never overwrite Amelia's edits on a re-run/restart.
  for (const [key, template] of Object.entries(lib.structural)) {
    const existing = await prisma.structuralBlock.findUnique({ where: { key } });
    if (!existing) await prisma.structuralBlock.create({ data: { key, template } });
  }

  // Reflection questions: create with the new default if absent. If a DB still
  // has the OLD default verbatim (never customized), upgrade it to the new
  // "…support her to {feminine_support}" shape. Leave any customized text alone.
  const existing = await prisma.structuralBlock.findUnique({ where: { key: 'reflection_questions' } });
  if (!existing) {
    await prisma.structuralBlock.create({ data: { key: 'reflection_questions', template: NEW_DEFAULT_QUESTIONS } });
  } else if (existing.template.trim() === OLD_DEFAULT_QUESTIONS.trim()) {
    await prisma.structuralBlock.update({ where: { key: 'reflection_questions' }, data: { template: NEW_DEFAULT_QUESTIONS } });
    console.log('Upgraded reflection_questions to the new support-based template.');
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

  // Seed the real masculine qualities (per Mars sign) and feminine support (per
  // Venus sign) from Amelia's email sweep. Masculine overwrites the earlier
  // placeholder (which equals `qualities`) but never a genuine edit; feminine
  // support is a new field, seeded where empty.
  for (const s of await prisma.sign.findMany()) {
    const data: any = {};
    const realMasc = STARTER_MASCULINE_QUALITIES[s.name];
    if (realMasc && (!s.masculineQualities || s.masculineQualities === s.qualities)) {
      data.masculineQualities = JSON.stringify(realMasc);
    } else if (!realMasc && s.masculineQualities && s.masculineQualities === s.qualities) {
      // No sourced masculine content for this Mars sign (Aquarius): clear the
      // earlier placeholder so it flags as a gap rather than borrowing qualities.
      data.masculineQualities = null;
    }
    const realFem = STARTER_FEMININE_SUPPORT[s.name];
    if (realFem && !s.feminineSupport) {
      data.feminineSupport = JSON.stringify(realFem);
    }
    if (Object.keys(data).length) await prisma.sign.update({ where: { name: s.name }, data });
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
