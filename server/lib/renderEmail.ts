/**
 * Renders the assembled reading (editable markdown-ish text) + computed chart
 * into the approved "personal letter" HTML email: warm plum/gold/cream, serif,
 * single-column spine, a feminine/masculine "at a glance" panel near the top,
 * and a full "your chart at a glance" positions list near the bottom.
 *
 * IMPORTANT (the handoff's nl2br gotcha): meaningful single newlines inside a
 * block MUST become <br>. Several source blocks (e.g. the section header's
 * "Your feminine is in X / Your masculine is in Y") rely on this — collapse
 * them and the lines run together. We convert single newlines to <br> explicitly.
 *
 * All styles are inline for email-client robustness.
 */
import { PLANETS } from './ephemeris.js';

export interface RenderChart {
  venusSign: string;
  marsSign: string;
  venusElement: string;
  marsElement: string;
  positions: { label: string; sign: string; retrograde: boolean }[];
  ascendant: string | null;
  midheaven: string | null;
}

export interface RenderInput {
  readingText: string;
  chart: RenderChart;
  customNote?: string | null;
  signature?: string | null;
  birth?: { date: string; time: string | null; place: string } | null;
  pps?: { intro: string; items: { label: string; text: string | null }[] } | null;
}

const C = {
  cream: '#fbf4e9',
  ink: '#4a3b32',
  plum: '#5c2a4d',
  gold: '#b8860b',
  goldSoft: '#c49a2e',
  muted: '#a08a6a',
  hair: '#d8c48f',
  panelBg: '#fff8ec',
  panelBorder: '#e3d3b4',
  noteBg: '#f3e8d3',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** inline [links](url), **bold**, *italic*, then single newline -> <br> (nl2br). */
function inline(s: string): string {
  let out = esc(s);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, `<a href="$2" style="color:${C.gold};">$1</a>`);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

const rule = `<hr style="border:none;border-top:1px solid ${C.hair};width:64px;margin:30px auto;">`;

function heading(text: string): string {
  return `<h2 style="font-family:Georgia,serif;font-size:20px;color:${C.plum};font-weight:normal;margin:26px 0 10px;">${inline(text)}</h2>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15.5px;line-height:1.72;color:${C.ink};">${inline(text)}</p>`;
}

function smallNote(text: string): string {
  return `<div style="background:${C.noteBg};border-left:3px solid ${C.goldSoft};padding:12px 16px;font-size:14.5px;font-style:italic;color:#6b543f;line-height:1.6;margin:0 0 22px;border-radius:0 4px 4px 0;">${inline(text)}</div>`;
}

function gapNote(text: string): string {
  // text still wrapped in *...*; strip the outer markers for display
  const inner = text.replace(/^\*/, '').replace(/\*$/, '');
  return `<div style="background:#fde7d6;border:1px dashed #d09a3e;padding:10px 14px;font-size:14px;color:#8a5a1e;line-height:1.55;margin:0 0 18px;border-radius:4px;">${inline(inner)}</div>`;
}

function archetypeList(label: string, items: string[]): string {
  const lis = items
    .map(
      (a) =>
        `<li style="font-size:14.5px;color:#6b4f5f;padding:3px 0;list-style:none;">` +
        `<span style="color:${C.goldSoft};margin-right:8px;">&#10022;</span>${esc(a)}</li>`,
    )
    .join('');
  return (
    `<div style="text-align:center;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.muted};margin-top:14px;">${esc(label)}</div>` +
    `<ul style="padding:0;margin:8px 0 0;text-align:center;">${lis}</ul>`
  );
}

function bulletList(items: string[]): string {
  const lis = items
    .map((q) => `<li style="font-size:15px;color:#5f4a56;padding:5px 0;line-height:1.6;">${inline(q)}</li>`)
    .join('');
  return `<ul style="margin:6px 0 16px;padding-left:20px;">${lis}</ul>`;
}

function glancePanel(c: RenderChart): string {
  const cell = (tag: string, sign: string, el: string) =>
    `<td style="width:50%;background:${C.panelBg};border:1px solid ${C.panelBorder};border-top:3px solid ${C.gold};border-radius:6px;padding:14px 10px 16px;text-align:center;">` +
    `<div style="font-size:10.5px;letter-spacing:2px;text-transform:uppercase;color:#9c6f2e;">${tag}</div>` +
    `<div style="font-family:Georgia,serif;font-size:22px;color:${C.plum};margin:5px 0 2px;">${esc(sign)}</div>` +
    `<div style="font-size:12px;color:${C.muted};letter-spacing:1px;">${esc(cap(el))}</div></td>`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:separate;margin:6px 0 26px;"><tr>` +
    cell('Feminine &#9792; Venus', c.venusSign, c.venusElement) +
    `<td style="width:14px;"></td>` +
    cell('Masculine &#9794; Mars', c.marsSign, c.marsElement) +
    `</tr></table>`
  );
}

const PLANET_SYMBOLS: Record<string, string> = {
  Sun: '&#9737;', Moon: '&#9789;', Mercury: '&#9791;', Venus: '&#9792;', Mars: '&#9794;',
  Jupiter: '&#9795;', Saturn: '&#9796;', Uranus: '&#9797;', Neptune: '&#9798;', Pluto: '&#9799;',
};

function chartList(c: RenderChart): string {
  const row = (sym: string, name: string, sign: string, angle = false) =>
    `<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dotted #dcc9a8;padding:7px 2px;">` +
    `<span style="color:#6b543f;font-size:14.5px;"><span style="color:${angle ? '#9c4a2e' : C.gold};margin-right:8px;">${sym}</span>${name}</span>` +
    `<span style="color:${C.plum};font-size:14.5px;">${esc(sign)}</span></div>`;

  const planetRows = PLANETS.map((p) => {
    const pos = c.positions.find((x) => x.label === p);
    const sign = pos ? pos.sign + (pos.retrograde ? ' ℞' : '') : '—';
    return row(PLANET_SYMBOLS[p] ?? '•', p, sign);
  }).join('');

  const angleRows =
    `<div style="margin-top:10px;padding-top:10px;border-top:1px solid ${C.hair};">` +
    row('Asc', 'Rising', c.ascendant ?? 'birth time needed', true) +
    row('MC', 'Midheaven', c.midheaven ?? 'birth time needed', true) +
    `</div>`;

  return (
    rule +
    `<h2 style="font-family:Georgia,serif;text-align:center;color:${C.plum};font-weight:normal;font-size:20px;margin:0 0 4px;">P.S. — Your chart at a glance</h2>` +
    `<div style="text-align:center;font-size:12.5px;color:${C.muted};font-style:italic;margin-bottom:16px;">A little bonus: all your placements, from your birth chart.</div>` +
    `<div style="max-width:430px;margin:0 auto;">${planetRows}${angleRows}</div>`
  );
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Classify and render one block of the reading body. */
function renderBlock(block: string): string {
  const t = block.trim();
  if (!t) return '';

  // Section heading (single "## ..." line)
  if (/^##\s+/.test(t) && !t.includes('\n')) return heading(t.replace(/^##\s+/, ''));

  // Gap placeholder
  if (t.startsWith('*⚠️') || t.startsWith('⚠️')) return gapNote(t);

  // Small note callout
  if (/^small note:/i.test(t)) return smallNote(t);

  // Archetype line
  const arch = /^\*\*(Feminine|Masculine) archetypes:\*\*\s*(.+)$/s.exec(t);
  if (arch) {
    const items = arch[2].split(',').map((x) => x.trim()).filter(Boolean);
    return archetypeList(`${arch[1]} archetypes`, items);
  }

  // Bullet list (every line "- ...")
  const lines = t.split('\n');
  if (lines.length && lines.every((l) => /^-\s+/.test(l.trim()))) {
    return bulletList(lines.map((l) => l.trim().replace(/^-\s+/, '')));
  }

  return paragraph(t);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "August 2, 1990 at 6:30 AM · Los Angeles, CA" (time omitted if unknown). */
function formatBirth(birth: { date: string; time: string | null; place: string }): string {
  let dateStr = birth.date;
  const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth.date);
  if (md) dateStr = `${MONTHS[Number(md[2]) - 1]} ${Number(md[3])}, ${md[1]}`;
  let timeStr = '';
  const mt = birth.time && /^(\d{1,2}):(\d{2})$/.exec(birth.time);
  if (mt) {
    const hh = Number(mt[1]);
    const ampm = hh < 12 ? 'AM' : 'PM';
    const h12 = ((hh + 11) % 12) + 1;
    timeStr = ` at ${h12}:${mt[2]} ${ampm}`;
  }
  return `${dateStr}${timeStr} &middot; ${esc(birth.place)}`;
}

/** The P.P.S. "creation team" section: intro + one entry per available planet. */
function ppsSection(pps: { intro: string; items: { label: string; text: string | null }[] }): string {
  const rows = pps.items
    .filter((it) => it.text && it.text.trim())
    .map(
      (it) =>
        `<h3 style="font-family:Georgia,serif;font-size:16.5px;color:${C.plum};font-weight:normal;margin:18px 0 6px;">${esc(it.label)}</h3>` +
        `<p style="margin:0 0 8px;font-size:15px;line-height:1.7;color:${C.ink};">${inline(it.text!.trim())}</p>`,
    )
    .join('');
  if (!rows) return '';
  return (
    rule +
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${C.ink};">${inline(pps.intro.trim())}</p>` +
    rows
  );
}

export function renderEmail(input: RenderInput): string {
  const { readingText, chart, customNote, signature, birth, pps } = input;
  const blocks = readingText.split(/\n{2,}/);

  const body: string[] = [];
  let panelInserted = false;

  for (let i = 0; i < blocks.length; i++) {
    const t = blocks[i].trim();
    if (!t) continue;

    // Insert the at-a-glance panel just before the feminine sign block.
    if (!panelInserted && /^##\s+Your feminine/.test(t)) {
      body.push(glancePanel(chart));
      body.push(rule);
      panelInserted = true;
    }

    body.push(renderBlock(blocks[i]));
  }

  const personal = customNote && customNote.trim()
    ? `<div style="background:${C.panelBg};border:1px solid ${C.panelBorder};border-radius:6px;padding:14px 18px;font-size:15px;line-height:1.7;color:${C.ink};font-style:italic;margin:0 0 22px;">${inline(customNote.trim())}</div>`
    : '';

  // Splice the personal note in right after the first (opening) block.
  if (personal && body.length) body.splice(1, 0, personal);

  // Signature footer (name + her links), editable in Content → Structural.
  const sig = signature && signature.trim()
    ? `<div style="border-top:1px solid ${C.hair};margin-top:30px;padding-top:18px;text-align:center;font-size:14px;color:${C.plum};line-height:1.8;">${inline(signature.trim())}</div>`
    : '';
  if (sig) body.push(sig);

  // The full chart goes at the very bottom, as a P.S. after the signature.
  body.push(chartList(chart));

  // The creation-team section follows as a P.P.S. below the P.S.
  if (pps && pps.intro && pps.items.some((i) => i.text && i.text.trim())) body.push(ppsSection(pps));

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#efe6d8;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#efe6d8;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.cream};border-radius:6px;">
        <tr><td style="padding:44px 46px;font-family:Georgia,'Times New Roman',serif;">
          <h1 style="font-size:28px;color:${C.plum};text-align:center;margin:0 0 4px;font-weight:normal;letter-spacing:.5px;">Your Inner Marriage</h1>
          <div style="text-align:center;color:${C.gold};font-style:italic;font-size:14px;margin-bottom:${birth ? '18' : '28'}px;">according to Shamanic Astrology</div>
          ${birth ? `<div style="text-align:center;font-size:12.5px;color:${C.muted};background:${C.panelBg};border:1px solid ${C.panelBorder};border-radius:6px;padding:9px 14px;margin:0 0 26px;"><span style="text-transform:uppercase;letter-spacing:1.5px;font-size:10.5px;color:#9c6f2e;">Based on your birth</span><br>${formatBirth(birth)}</div>` : ''}
          ${body.join('\n          ')}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
