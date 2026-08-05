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

  const sameSign = venusSign === marsSign;

  // Double-sign framing when Venus == Mars
  if (sameSign) {
    const df = S.get('double_sign_framing');
    if (df) parts.push(fill(df, { sign: venusSign, element: signs.get(venusSign)!.element }));
  }

  if (sameSign) {
    // One combined section — don't duplicate the identity/description twice.
    parts.push(combinedSignBlock(signs, venusSign, gaps));
  } else {
    parts.push(signBlock(signs, venusSign, 'feminine', gaps));
    parts.push(signBlock(signs, marsSign, 'masculine', gaps));
  }

  // Right relationship (+ addon when the person uses He, + same-sign paragraph)
  let rr = S.get('right_relationship') ?? '';
  if (pronoun === 'He') rr += S.get('right_relationship_male_addon') ?? '';
  if (sameSign) {
    const same = S.get('right_relationship_same_sign_addon');
    if (same && same.trim()) rr += `\n\n${fill(same, { feminine_sign: venusSign, masculine_sign: marsSign })}`;
  }
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

/**
 * Used when Venus and Mars are the same sign: one heading and one identity/
 * description (not duplicated), but both archetype lists (they still differ).
 */
function combinedSignBlock(signs: Map<string, any>, sign: string, gaps: string[]): string {
  const data = signs.get(sign)!;
  const lines: string[] = [`## Your feminine & masculine side, in ${sign}`, ''];

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

  for (const polarity of ['feminine', 'masculine'] as const) {
    const arch = parseList(polarity === 'feminine' ? data.feminineArchetypes : data.masculineArchetypes);
    lines.push('');
    if (arch) {
      const label = polarity === 'feminine' ? 'Feminine archetypes' : 'Masculine archetypes';
      lines.push(`**${label}:** ${arch.join(', ')}`);
    } else {
      const gap = `No ${polarity} archetype list on file for ${sign}.`;
      gaps.push(gap);
      lines.push(`*${GAP_MARKER}: ${gap} Fill in a short archetype list here before sending.*`);
    }
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
 * `reflection_questions` structural block) with this person's values, returning
 * one filled question string per template. Qualities are sampled from each
 * sign's `qualities` list; missing pieces are flagged as gaps, never invented.
 */
function fillReflectionQuestions(
  S: Map<string, string>,
  signs: Map<string, any>,
  venusSign: string,
  marsSign: string,
  gaps: string[],
): string[] {
  const template = S.get('reflection_questions');
  if (!template || !template.trim()) return [];

  const vData = signs.get(venusSign);
  const mData = signs.get(marsSign);
  // Masculine skills come from the Mars sign; feminine support from the Venus
  // sign. Each entry is a complete phrase, so we pick ONE (not a joined sample).
  // No cross-fallback: masculine *skills* and feminine *support* are distinct
  // shapes, so a missing one should flag a gap, not borrow the wrong content.
  const marsQ = parseList(mData?.masculineQualities ?? null) ?? [];
  const venusSupport = parseList(vData?.feminineSupport ?? null) ?? [];
  const venusFem = parseList(vData?.feminineArchetypes ?? null) ?? [];
  const marsMasc = parseList(mData?.masculineArchetypes ?? null) ?? [];

  // Pick one phrase, and a distinct second one where available.
  const pick = (arr: string[], i: number) => arr[i] ?? arr[0];

  const needMasc = (i: number): string => {
    const v = pick(marsQ, i);
    if (v) return v;
    gaps.push(`No masculine skills on file for ${marsSign} — needed for the reflection questions.`);
    return `[${GAP_MARKER}: add ${marsSign} masculine skills]`;
  };
  const needSupport = (i: number): string => {
    const v = pick(venusSupport, i);
    if (v) return v;
    gaps.push(`No "feminine support" on file for ${venusSign} — needed for the reflection questions.`);
    return `[${GAP_MARKER}: add ${venusSign} feminine support]`;
  };
  // "The Vision Quest Amazon" -> "Vision Quest Amazon" so the template reads
  // "Is your Vision Quest Amazon serving…", not "Is your The Vision Quest Amazon…".
  const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, '');
  const archOr = (chosen: string | null | undefined, arr: string[], polarity: string, sign: string): string => {
    const chosenPick = chosen && chosen.trim() ? chosen.trim() : arr[0];
    if (chosenPick) return stripArticle(chosenPick);
    gaps.push(`No ${polarity} archetype on file for ${sign} — needed for the reflection questions.`);
    return `[${GAP_MARKER}: add ${sign} ${polarity} archetype]`;
  };

  const feminineSupport = needSupport(0);
  const feminineSupport2 = needSupport(1);
  const masculineQualities = needMasc(0);
  const masculineQualities2 = needMasc(1);
  const vars: Record<string, string> = {
    feminine_sign: venusSign,
    masculine_sign: marsSign,
    masculine_qualities: masculineQualities,
    masculine_qualities_2: masculineQualities2,
    feminine_support: feminineSupport,
    feminine_support_2: feminineSupport2,
    // Legacy tokens, mapped so any un-upgraded custom template still fills.
    feminine_qualities: feminineSupport,
    feminine_qualities_2: feminineSupport2,
    feminine_archetype: archOr(vData?.feminineQuestionArchetype, venusFem, 'feminine', venusSign),
    masculine_archetype: archOr(mData?.masculineQuestionArchetype, marsMasc, 'masculine', marsSign),
  };

  return template
    .split(/\n{2,}/)
    .map((q) => q.trim())
    .filter(Boolean)
    .map((q) => fill(q, vars));
}

function reflectionQuestions(
  S: Map<string, string>,
  signs: Map<string, any>,
  venusSign: string,
  marsSign: string,
  gaps: string[],
): string {
  const filled = fillReflectionQuestions(S, signs, venusSign, marsSign, gaps);
  if (!filled.length) return '';
  return ['## Some questions to sit with', '', ...filled.map((q) => `- ${q}`)].join('\n');
}

/**
 * For the Content → Questions builder: shows how the questions construct for a
 * given Venus×Mars pairing, plus the raw pieces (qualities/archetypes) pulled in,
 * so Amelia can see and tune the phrasing.
 */
export async function previewReflectionQuestions(prisma: PrismaClient, venusSign: string, marsSign: string) {
  const signRows = await prisma.sign.findMany();
  const signs = new Map(signRows.map((s) => [s.name, s]));
  const blockRows = await prisma.structuralBlock.findMany();
  const S = new Map(blockRows.map((b) => [b.key, b.template]));
  const gaps: string[] = [];
  const questions = fillReflectionQuestions(S, signs, venusSign, marsSign, gaps);
  const v = signs.get(venusSign);
  const m = signs.get(marsSign);
  return {
    template: S.get('reflection_questions') ?? '',
    questions,
    gaps,
    venusSupport: parseList(v?.feminineSupport ?? null) ?? [],
    marsQualities: parseList(m?.masculineQualities ?? null) ?? [],
    venusArchetype: (v?.feminineQuestionArchetype?.trim() || (parseList(v?.feminineArchetypes ?? null) ?? [])[0]) ?? null,
    marsArchetype: (m?.masculineQuestionArchetype?.trim() || (parseList(m?.masculineArchetypes ?? null) ?? [])[0]) ?? null,
  };
}
