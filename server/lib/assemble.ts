/**
 * Assembles the reading's letter body from Amelia's own copy blocks (ported
 * faithfully from legacy/assemble_email.py), now reading the library from the
 * database and pulling reflection questions from the per-combination tier.
 *
 * Guiding rule (unchanged): never invent copy to fill a gap. Where the library
 * has no content, insert a clearly-marked placeholder so Amelia writes it herself.
 *
 * Output is markdown-ish text: `## Heading`, `**bold**`, blank-line-separated
 * paragraphs, and meaningful single newlines. renderEmail.ts turns this into the
 * styled HTML email (and preserves single newlines — see the nl2br note there).
 */
import type { PrismaClient } from '@prisma/client';

export const GAP_MARKER = "⚠️ NEEDS AMELIA'S INPUT";

export interface AssembledReading {
  text: string;
  gaps: string[];
}

export interface AssembleInput {
  name: string;
  venusSign: string;
  marsSign: string;
  sunSign: string | null;
  pronoun: string; // They | She | He
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
}

function parseList(json: string | null): string[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length ? v : null;
  } catch {
    return null;
  }
}

export async function buildReading(
  prisma: PrismaClient,
  input: AssembleInput,
): Promise<AssembledReading> {
  const { name, venusSign, marsSign, sunSign, pronoun } = input;

  const signRows = await prisma.sign.findMany();
  const signs = new Map(signRows.map((s) => [s.name, s]));
  const blockRows = await prisma.structuralBlock.findMany();
  const S = new Map(blockRows.map((b) => [b.key, b.template]));

  if (!signs.has(venusSign)) throw new Error(`Unknown Venus sign: ${venusSign}`);
  if (!signs.has(marsSign)) throw new Error(`Unknown Mars sign: ${marsSign}`);

  const gaps: string[] = [];
  const parts: string[] = [];

  // Opening
  parts.push(fill(S.get('opening') ?? 'Dear {name},', { name }));

  // Small note (Sun sign fuel) + echo if Venus/Mars also in the Sun sign
  if (sunSign && signs.has(sunSign)) {
    const keywords = signs.get(sunSign)!.fuelKeywords;
    const tmpl = keywords ? S.get('small_note_with_keywords') : S.get('small_note_without_keywords');
    if (tmpl) {
      let note = fill(tmpl, { sun_sign: sunSign, keywords: keywords ?? '' });
      const echo = S.get('small_note_echo');
      if (echo && venusSign === sunSign) note += fill(echo, { planet: 'Venus', sun_sign: sunSign });
      else if (echo && marsSign === sunSign) note += fill(echo, { planet: 'Mars', sun_sign: sunSign });
      parts.push(note);
    }
  }

  // Section header naming both signs
  parts.push(fill(S.get('section_header') ?? '', { venus_sign: venusSign, mars_sign: marsSign }));

  // Double-sign framing when Venus == Mars
  if (venusSign === marsSign) {
    const df = S.get('double_sign_framing');
    if (df) parts.push(fill(df, { sign: venusSign, element: signs.get(venusSign)!.element }));
  }

  parts.push(signBlock(signs, venusSign, 'feminine', gaps));
  parts.push(signBlock(signs, marsSign, 'masculine', gaps));

  // Right relationship (+ addon when the person uses He)
  let rr = S.get('right_relationship') ?? '';
  if (pronoun === 'He') rr += S.get('right_relationship_male_addon') ?? '';
  parts.push(`## Right relationship\n\n${rr}`);

  // Optional per-pairing note (kept as an optional touch Amelia can add).
  const combo = await prisma.combination.findUnique({
    where: { venusSign_marsSign: { venusSign, marsSign } },
  });
  if (combo?.note && combo.note.trim()) {
    parts.push(`## About your particular pairing\n\n${combo.note.trim()}`);
  }

  // Reflection questions — the standard editable template set, filled per-person.
  parts.push(reflectionQuestions(S, signs, venusSign, marsSign, gaps));

  // Closing / signature
  const closing = S.get('closing');
  if (closing) parts.push(closing);

  const text = parts.join('\n\n');
  const dedupedGaps = [...new Set(gaps)];
  return { text, gaps: dedupedGaps };
}

function signBlock(
  signs: Map<string, any>,
  sign: string,
  polarity: 'feminine' | 'masculine',
  gaps: string[],
): string {
  const data = signs.get(sign)!;
  const planetLabel = polarity === 'feminine' ? 'Venus' : 'Mars';
  const lines: string[] = [`## Your ${polarity} side, in ${sign}  (${planetLabel})`, ''];

  if (data.identity) {
    lines.push(data.identity);
  } else {
    const gap = `No full ${sign} identity paragraph on file — only a short fragment exists.`;
    gaps.push(gap);
    lines.push(`*${GAP_MARKER}: ${gap} Write the full "I am ${sign}..." paragraph here before sending.*`);
    if (data.identityFragment) lines.push(`\n(Fragment on file, for reference: "${data.identityFragment}")`);
  }

  if (data.descriptive) {
    lines.push('');
    lines.push(data.descriptive);
  }

  const archetypes = parseList(polarity === 'feminine' ? data.feminineArchetypes : data.masculineArchetypes);
  lines.push('');
  if (archetypes) {
    const label = polarity === 'feminine' ? 'Feminine archetypes' : 'Masculine archetypes';
    lines.push(`**${label}:** ${archetypes.join(', ')}`);
  } else {
    const gap = `No ${polarity} archetype list on file for ${sign}.`;
    gaps.push(gap);
    lines.push(`*${GAP_MARKER}: ${gap} Fill in a short archetype list here before sending.*`);
  }

  return lines.join('\n');
}

/** "a, b, and c" */
function joinNice(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Fill the standard reflection-question templates (stored, editable, in the
 * `reflection_questions` structural block) with this person's values.
 * Qualities are sampled from each sign's `qualities` list; missing pieces are
 * flagged as gaps rather than invented.
 */
function reflectionQuestions(
  S: Map<string, string>,
  signs: Map<string, any>,
  venusSign: string,
  marsSign: string,
  gaps: string[],
): string {
  const template = S.get('reflection_questions');
  if (!template || !template.trim()) return '';

  const venusQ = parseList(signs.get(venusSign)?.qualities) ?? [];
  const marsQ = parseList(signs.get(marsSign)?.qualities) ?? [];
  const venusFem = parseList(signs.get(venusSign)?.feminineArchetypes) ?? [];
  const marsMasc = parseList(signs.get(marsSign)?.masculineArchetypes) ?? [];

  // Two distinct-ish samples per sign for the "…" and "additional …" slots.
  const femA = venusQ.slice(0, 3);
  const femB = venusQ.slice(3, 5).length ? venusQ.slice(3, 5) : venusQ.slice(0, 2);
  const mascA = marsQ.slice(0, 3);
  const mascB = marsQ.slice(3, 5).length ? marsQ.slice(3, 5) : marsQ.slice(0, 2);

  const need = (arr: string[], what: string, sign: string): string => {
    if (arr.length) return joinNice(arr);
    gaps.push(`No qualities on file for ${sign} — needed for the reflection questions (${what}).`);
    return `[${GAP_MARKER}: add ${sign} qualities]`;
  };
  // "The Vision Quest Amazon" -> "Vision Quest Amazon" so the template reads
  // "Is your Vision Quest Amazon serving…", not "Is your The Vision Quest Amazon…".
  const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, '');
  const archOr = (arr: string[], polarity: string, sign: string): string => {
    if (arr.length) return stripArticle(arr[0]);
    gaps.push(`No ${polarity} archetype on file for ${sign} — needed for the reflection questions.`);
    return `[${GAP_MARKER}: add ${sign} ${polarity} archetype]`;
  };

  const vars: Record<string, string> = {
    feminine_sign: venusSign,
    masculine_sign: marsSign,
    feminine_qualities: need(femA, 'feminine qualities', venusSign),
    feminine_qualities_2: need(femB, 'more feminine qualities', venusSign),
    masculine_qualities: need(mascA, 'masculine qualities', marsSign),
    masculine_qualities_2: need(mascB, 'more masculine qualities', marsSign),
    feminine_archetype: archOr(venusFem, 'feminine', venusSign),
    masculine_archetype: archOr(marsMasc, 'masculine', marsSign),
  };

  const questions = template
    .split(/\n{2,}/)
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => `- ${fill(q, vars)}`);

  return ['## Some questions to sit with', '', ...questions].join('\n');
}
