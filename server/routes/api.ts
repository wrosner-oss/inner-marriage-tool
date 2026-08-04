import { Router } from 'express';
import { prisma } from '../db.js';
import {
  regenerateParticipant,
  renderParticipantEmail,
  inputsHash,
  AmbiguousPlaceError,
} from '../lib/reading.js';
import { gmailConfigured, createGmailDraft, DEFAULT_SUBJECT } from '../lib/gmail.js';
import { previewReflectionQuestions } from '../lib/assemble.js';

export const api = Router();

const PRONOUNS = ['They', 'She', 'He'];

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Shape a participant for the client (deserialize JSON blobs).
function participantDTO(p: any) {
  return {
    id: p.id,
    classId: p.classId,
    name: p.name,
    birthDate: p.birthDate,
    birthTime: p.birthTime,
    place: p.place,
    pronoun: p.pronoun,
    email: p.email,
    sunSign: p.sunSign,
    venusSign: p.venusSign,
    marsSign: p.marsSign,
    chart: p.chartJson ? JSON.parse(p.chartJson) : null,
    readingText: p.readingText,
    customNote: p.customNote,
    gaps: parseJsonArray(p.gapsJson),
    error: p.error,
    edited: p.edited,
    draftStatus: p.draftStatus,
    hasReading: Boolean(p.readingText),
    needsRegen: !p.readingText || p.inputsHash !== inputsHash(p),
    updatedAt: p.updatedAt,
  };
}

const wrap = (fn: any) => (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- health ----------
api.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- classes ----------
api.get('/classes', wrap(async (_req: any, res: any) => {
  const classes = await prisma.class.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { participants: true } } },
  });
  res.json(classes.map((c) => ({ id: c.id, name: c.name, participantCount: c._count.participants, updatedAt: c.updatedAt })));
}));

api.post('/classes', wrap(async (req: any, res: any) => {
  const name = (req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  const c = await prisma.class.create({ data: { name } });
  res.status(201).json({ id: c.id, name: c.name });
}));

api.get('/classes/:id', wrap(async (req: any, res: any) => {
  const c = await prisma.class.findUnique({
    where: { id: req.params.id },
    include: { participants: { orderBy: { createdAt: 'asc' } } },
  });
  if (!c) return res.status(404).json({ error: 'Class not found.' });
  res.json({ id: c.id, name: c.name, updatedAt: c.updatedAt, participants: c.participants.map(participantDTO) });
}));

api.patch('/classes/:id', wrap(async (req: any, res: any) => {
  const name = (req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  const c = await prisma.class.update({ where: { id: req.params.id }, data: { name } });
  res.json({ id: c.id, name: c.name });
}));

api.delete('/classes/:id', wrap(async (req: any, res: any) => {
  await prisma.class.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

// ---------- participants ----------
function validateParticipant(body: any): string | null {
  if (!body?.name?.trim()) return 'Name is required.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.birthDate ?? '')) return 'Birth date must be YYYY-MM-DD.';
  if (body?.birthTime && !/^\d{1,2}:\d{2}$/.test(body.birthTime)) return 'Birth time must be HH:MM.';
  if (!body?.place?.trim()) return 'Birthplace is required.';
  if (body?.pronoun && !PRONOUNS.includes(body.pronoun)) return 'Pronoun must be They, She, or He.';
  return null;
}

api.post('/classes/:id/participants', wrap(async (req: any, res: any) => {
  const err = validateParticipant(req.body);
  if (err) return res.status(400).json({ error: err });
  const p = await prisma.participant.create({
    data: {
      classId: req.params.id,
      name: req.body.name.trim(),
      birthDate: req.body.birthDate,
      birthTime: req.body.birthTime?.trim() || null,
      place: req.body.place.trim(),
      pronoun: req.body.pronoun || 'They',
      email: req.body.email?.trim() || null,
    },
  });
  res.status(201).json(participantDTO(p));
}));

api.get('/participants/:id', wrap(async (req: any, res: any) => {
  const p = await prisma.participant.findUnique({ where: { id: req.params.id } });
  if (!p) return res.status(404).json({ error: 'Participant not found.' });
  const cls = await prisma.class.findUnique({ where: { id: p.classId } });
  res.json({ ...participantDTO(p), className: cls?.name ?? '' });
}));

api.patch('/participants/:id', wrap(async (req: any, res: any) => {
  const err = validateParticipant({ ...(await prisma.participant.findUniqueOrThrow({ where: { id: req.params.id } })), ...req.body });
  if (err) return res.status(400).json({ error: err });
  const data: any = {};
  for (const f of ['name', 'birthDate', 'place', 'pronoun'] as const) if (f in req.body) data[f] = req.body[f]?.trim?.() ?? req.body[f];
  if ('birthTime' in req.body) data.birthTime = req.body.birthTime?.trim() || null;
  if ('email' in req.body) data.email = req.body.email?.trim() || null;
  const p = await prisma.participant.update({ where: { id: req.params.id }, data });
  res.json(participantDTO(p));
}));

api.delete('/participants/:id', wrap(async (req: any, res: any) => {
  // Note: we intentionally do NOT delete any generated artifacts elsewhere;
  // removing from the roster just drops them from the active list.
  await prisma.participant.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

// Save review edits (marks the reading as hand-edited so regen won't clobber it).
api.patch('/participants/:id/reading', wrap(async (req: any, res: any) => {
  const data: any = { edited: true };
  if ('readingText' in req.body) data.readingText = req.body.readingText;
  if ('customNote' in req.body) data.customNote = req.body.customNote?.trim() || null;
  const p = await prisma.participant.update({ where: { id: req.params.id }, data });
  res.json(participantDTO(p));
}));

// Generate/regenerate a single participant.
api.post('/participants/:id/generate', wrap(async (req: any, res: any) => {
  const p = await prisma.participant.findUniqueOrThrow({ where: { id: req.params.id } });
  try {
    const updated = await regenerateParticipant(prisma, p);
    res.json(participantDTO(updated));
  } catch (e) {
    if (e instanceof AmbiguousPlaceError) {
      await prisma.participant.update({ where: { id: p.id }, data: { error: e.message } });
      return res.status(409).json({ error: e.message, candidates: e.candidates });
    }
    const msg = e instanceof Error ? e.message : 'Chart generation failed.';
    await prisma.participant.update({ where: { id: p.id }, data: { error: msg } });
    res.status(500).json({ error: msg });
  }
}));

// Generate everyone in a class who needs it (or force all).
api.post('/classes/:id/generate', wrap(async (req: any, res: any) => {
  const force = Boolean(req.body?.force);
  const participants = await prisma.participant.findMany({ where: { classId: req.params.id } });
  const results: any[] = [];
  for (const p of participants) {
    const needs = force || !p.readingText || p.inputsHash !== inputsHash(p);
    if (!needs) {
      results.push({ id: p.id, name: p.name, status: 'skipped' });
      continue;
    }
    try {
      await regenerateParticipant(prisma, p);
      results.push({ id: p.id, name: p.name, status: 'generated' });
    } catch (e) {
      if (e instanceof AmbiguousPlaceError) {
        await prisma.participant.update({ where: { id: p.id }, data: { error: e.message } });
        results.push({ id: p.id, name: p.name, status: 'ambiguous', error: e.message, candidates: e.candidates });
      } else {
        const msg = e instanceof Error ? e.message : 'failed';
        await prisma.participant.update({ where: { id: p.id }, data: { error: msg } });
        results.push({ id: p.id, name: p.name, status: 'error', error: msg });
      }
    }
  }
  res.json({ results });
}));

// Rendered email preview (HTML).
api.get('/participants/:id/preview', wrap(async (req: any, res: any) => {
  const p = await prisma.participant.findUniqueOrThrow({ where: { id: req.params.id } });
  const html = await renderParticipantEmail(prisma, p);
  if (!html) return res.status(400).send('<p>No reading generated yet.</p>');
  res.type('html').send(html);
}));

// Live preview of in-progress edits (renders provided text without saving).
api.post('/participants/:id/preview', wrap(async (req: any, res: any) => {
  const p = await prisma.participant.findUniqueOrThrow({ where: { id: req.params.id } });
  const merged: any = { ...p };
  if ('readingText' in req.body) merged.readingText = req.body.readingText;
  if ('customNote' in req.body) merged.customNote = req.body.customNote;
  const html = await renderParticipantEmail(prisma, merged);
  if (!html) return res.status(400).send('<p>No reading generated yet.</p>');
  res.type('html').send(html);
}));

// Create a Gmail draft in Amelia's account (drafts, not auto-send).
api.post('/participants/:id/draft', wrap(async (req: any, res: any) => {
  if (!gmailConfigured()) {
    return res.status(501).json({
      error: 'Gmail draft creation is not configured yet. Set GMAIL_SENDER + GOOGLE_SERVICE_ACCOUNT_KEY (see GMAIL_SETUP.md).',
    });
  }
  const p = await prisma.participant.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!p.email) return res.status(400).json({ error: `${p.name} has no email address — add one on the roster first.` });
  const html = await renderParticipantEmail(prisma, p);
  if (!html) return res.status(400).json({ error: 'No reading generated yet.' });
  try {
    const { draftId, url } = await createGmailDraft({ to: p.email, subject: DEFAULT_SUBJECT, html });
    await prisma.participant.update({ where: { id: p.id }, data: { draftStatus: 'draft_created', draftId } });
    res.json({ ok: true, draftId, url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'draft creation failed';
    res.status(502).json({ error: `Couldn't create the Gmail draft: ${msg}` });
  }
}));

// ---------- library editor ----------
api.get('/library', wrap(async (_req: any, res: any) => {
  const [signs, structural, combinations] = await Promise.all([
    prisma.sign.findMany(),
    prisma.structuralBlock.findMany(),
    prisma.combination.findMany(),
  ]);
  res.json({
    signs: signs.map((s) => ({
      name: s.name,
      element: s.element,
      identity: s.identity,
      identityFragment: s.identityFragment,
      descriptive: s.descriptive,
      feminineArchetypes: parseJsonArray(s.feminineArchetypes),
      masculineArchetypes: parseJsonArray(s.masculineArchetypes),
      feminineQuestionArchetype: s.feminineQuestionArchetype,
      masculineQuestionArchetype: s.masculineQuestionArchetype,
      qualities: parseJsonArray(s.qualities),
      fuelKeywords: s.fuelKeywords,
      gaps: [
        s.identity ? null : 'identity',
        s.feminineArchetypes ? null : 'feminine archetypes',
        s.masculineArchetypes ? null : 'masculine archetypes',
        s.qualities ? null : 'qualities',
        s.fuelKeywords ? null : 'fuel keywords',
      ].filter(Boolean),
    })),
    structural,
    combinations: combinations.map((c) => ({ venusSign: c.venusSign, marsSign: c.marsSign, questions: parseJsonArray(c.questions), note: c.note })),
  });
}));

api.put('/library/signs/:name', wrap(async (req: any, res: any) => {
  const b = req.body ?? {};
  const data: any = {};
  for (const f of ['element', 'identity', 'identityFragment', 'descriptive', 'fuelKeywords', 'feminineQuestionArchetype', 'masculineQuestionArchetype'] as const) {
    if (f in b) data[f] = b[f] === '' ? null : b[f];
  }
  if ('feminineArchetypes' in b) data.feminineArchetypes = Array.isArray(b.feminineArchetypes) && b.feminineArchetypes.length ? JSON.stringify(b.feminineArchetypes) : null;
  if ('masculineArchetypes' in b) data.masculineArchetypes = Array.isArray(b.masculineArchetypes) && b.masculineArchetypes.length ? JSON.stringify(b.masculineArchetypes) : null;
  if ('qualities' in b) data.qualities = Array.isArray(b.qualities) && b.qualities.length ? JSON.stringify(b.qualities) : null;
  const s = await prisma.sign.update({ where: { name: req.params.name }, data });
  res.json({ ok: true, name: s.name });
}));

// Live construction of the reflection questions for a Venus×Mars pairing — for
// the Content → Questions builder.
api.get('/library/questions-preview', wrap(async (req: any, res: any) => {
  const venus = String(req.query.venus ?? '');
  const mars = String(req.query.mars ?? '');
  if (!venus || !mars) return res.status(400).json({ error: 'venus and mars are required.' });
  res.json(await previewReflectionQuestions(prisma, venus, mars));
}));

api.put('/library/structural/:key', wrap(async (req: any, res: any) => {
  const template = req.body?.template ?? '';
  const s = await prisma.structuralBlock.upsert({
    where: { key: req.params.key },
    update: { template },
    create: { key: req.params.key, template },
  });
  res.json({ ok: true, key: s.key });
}));

api.put('/library/combination', wrap(async (req: any, res: any) => {
  const { venusSign, marsSign } = req.body ?? {};
  if (!venusSign || !marsSign) return res.status(400).json({ error: 'venusSign and marsSign are required.' });
  const questions = Array.isArray(req.body.questions) && req.body.questions.length ? JSON.stringify(req.body.questions) : null;
  const note = req.body.note?.trim() || null;
  const c = await prisma.combination.upsert({
    where: { venusSign_marsSign: { venusSign, marsSign } },
    update: { questions, note },
    create: { venusSign, marsSign, questions, note },
  });
  res.json({ ok: true, id: c.id });
}));
