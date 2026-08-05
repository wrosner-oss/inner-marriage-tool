import { useEffect, useState } from 'react';
import { apiClient } from '../api.js';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
type Tab = 'signs' | 'structural' | 'questions' | 'combinations';

export function Library() {
  const [tab, setTab] = useState<Tab>('signs');
  const [lib, setLib] = useState<any>(null);
  const [status, setStatus] = useState('');
  const load = () => apiClient.getLibrary().then(setLib);
  useEffect(() => { load(); }, []);
  const flash = (m: string) => { setStatus(m); setTimeout(() => setStatus(''), 1800); };

  if (!lib) return <div className="container"><p className="muted">Loading library…</p></div>;

  return (
    <div className="container">
      <h1>Content</h1>
      <p className="muted">Your reusable copy. Edit anything here and it applies to every reading you generate afterward. <span style={{ color: 'var(--gold)' }}>{status}</span></p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['signs', 'structural', 'questions', 'combinations'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'gold' : 'ghost'} onClick={() => setTab(t)}>
            {t === 'combinations' ? 'Pairing notes' : t === 'structural' ? 'Structural' : t === 'questions' ? 'Questions' : 'Signs'}
          </button>
        ))}
      </div>
      {tab === 'signs' && <SignsEditor lib={lib} reload={load} flash={flash} />}
      {tab === 'structural' && <StructuralEditor lib={lib} reload={load} flash={flash} />}
      {tab === 'questions' && <QuestionsEditor lib={lib} reload={load} flash={flash} />}
      {tab === 'combinations' && <CombinationsEditor flash={flash} />}
    </div>
  );
}

// Build the dropdown options from a sign's archetype list, keeping a currently-
// selected value even if it's no longer in the (possibly edited) list.
function archetypeOptions(list: string[] | undefined, current: string | null | undefined): string[] {
  const arr = (list || []).map((s) => s.trim()).filter(Boolean);
  const cur = current?.trim();
  return cur && !arr.includes(cur) ? [cur, ...arr] : arr;
}

function SignsEditor({ lib, reload, flash }: any) {
  const [sel, setSel] = useState('Aries');
  const s = lib.signs.find((x: any) => x.name === sel);
  const [f, setF] = useState<any>(s);
  useEffect(() => { setF(lib.signs.find((x: any) => x.name === sel)); }, [sel, lib]);
  if (!f) return null;

  const save = async () => {
    await apiClient.updateSign(sel, {
      element: f.element,
      identity: f.identity,
      creationTeam: f.creationTeam,
      identityFragment: f.identityFragment,
      descriptive: f.descriptive,
      fuelKeywords: f.fuelKeywords,
      feminineArchetypes: (f.feminineArchetypes || []).filter(Boolean),
      masculineArchetypes: (f.masculineArchetypes || []).filter(Boolean),
      feminineQuestionArchetype: f.feminineQuestionArchetype ?? '',
      masculineQuestionArchetype: f.masculineQuestionArchetype ?? '',
      qualities: (f.qualities || []).filter(Boolean),
    });
    flash(`${sel} saved ✓`); reload();
  };

  return (
    <div className="card">
      <label>Signs {'—'} pick one to edit ({'⚠'} = has a gap)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {SIGNS.map((n) => {
          const gaps = lib.signs.find((x: any) => x.name === n)?.gaps ?? [];
          return (
            <button key={n} className={sel === n ? 'gold small' : 'ghost small'} onClick={() => setSel(n)}>
              {n}{gaps.length ? ' ⚠' : ''}
            </button>
          );
        })}
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="field-pronoun" style={{ flexBasis: 200 }}>
          <label>Element (for {sel})</label>
          <input value={f.element ?? ''} onChange={(e) => setF({ ...f, element: e.target.value })} />
        </div>
      </div>
      {f.gaps?.length > 0 && <div className="gap-list">Missing: {f.gaps.join(', ')}</div>}
      <label>Identity paragraph ("I am {sel}…")</label>
      <textarea style={{ minHeight: 150 }} value={f.identity ?? ''} onChange={(e) => setF({ ...f, identity: e.target.value })} />
      <div style={{ height: 12 }} />
      <label>Creation Team ("{sel} teaches…") — third-person version, used in the P.P.S.</label>
      <textarea style={{ minHeight: 130 }} value={f.creationTeam ?? ''} onChange={(e) => setF({ ...f, creationTeam: e.target.value })} />
      <div style={{ height: 12 }} />
      <label>Descriptive line</label>
      <textarea style={{ minHeight: 70 }} value={f.descriptive ?? ''} onChange={(e) => setF({ ...f, descriptive: e.target.value })} />
      <div style={{ height: 12 }} />
      <div className="row">
        <div className="grow">
          <label>Feminine archetypes (one per line)</label>
          <textarea style={{ minHeight: 120 }} value={(f.feminineArchetypes || []).join('\n')} onChange={(e) => setF({ ...f, feminineArchetypes: e.target.value.split('\n') })} />
        </div>
        <div className="grow">
          <label>Masculine archetypes (one per line)</label>
          <textarea style={{ minHeight: 120 }} value={(f.masculineArchetypes || []).join('\n')} onChange={(e) => setF({ ...f, masculineArchetypes: e.target.value.split('\n') })} />
        </div>
      </div>
      <div style={{ height: 12 }} />
      <div className="row">
        <div className="grow">
          <label>Archetype used in the question (feminine)</label>
          <select value={f.feminineQuestionArchetype ?? ''} onChange={(e) => setF({ ...f, feminineQuestionArchetype: e.target.value })}>
            <option value="">(first in list — default)</option>
            {archetypeOptions(f.feminineArchetypes, f.feminineQuestionArchetype).map((a: string) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="grow">
          <label>Archetype used in the question (masculine)</label>
          <select value={f.masculineQuestionArchetype ?? ''} onChange={(e) => setF({ ...f, masculineQuestionArchetype: e.target.value })}>
            <option value="">(first in list — default)</option>
            {archetypeOptions(f.masculineArchetypes, f.masculineQuestionArchetype).map((a: string) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <p className="muted" style={{ margin: '4px 0 0' }}>These pick which single archetype appears in "Is your ___ serving your ___?" — the full lists above still show in the email.</p>
      <div style={{ height: 12 }} />
      <label>Qualities (one per line) — sampled into the reflection questions, e.g. "questing for…"</label>
      <textarea style={{ minHeight: 110 }} value={(f.qualities || []).join('\n')} placeholder={'spiritual truth\nadventure\nexploring new territory\nfreedom'} onChange={(e) => setF({ ...f, qualities: e.target.value.split('\n') })} />
      <div style={{ height: 12 }} />
      <label>Fuel keywords (Sun-sign "small note")</label>
      <input value={f.fuelKeywords ?? ''} onChange={(e) => setF({ ...f, fuelKeywords: e.target.value })} />
      <div style={{ marginTop: 14 }}><button className="gold" onClick={save}>Save {sel}</button></div>
    </div>
  );
}

function StructuralEditor({ lib, reload, flash }: any) {
  const [sel, setSel] = useState(lib.structural[0]?.key ?? '');
  const block = lib.structural.find((b: any) => b.key === sel);
  const [tmpl, setTmpl] = useState(block?.template ?? '');
  useEffect(() => { setTmpl(lib.structural.find((b: any) => b.key === sel)?.template ?? ''); }, [sel, lib]);

  const save = async () => { await apiClient.updateStructural(sel, tmpl); flash(`${sel} saved ✓`); reload(); };

  return (
    <div className="card">
      <label>Block</label>
      <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ maxWidth: 340 }}>
        {lib.structural.map((b: any) => <option key={b.key} value={b.key}>{b.key}</option>)}
      </select>
      <p className="muted" style={{ marginBottom: 6 }}>Placeholders like <code>{'{name}'}</code>, <code>{'{sun_sign}'}</code>, <code>{'{venus_sign}'}</code> get filled in automatically.</p>
      {sel === 'reflection_questions' && (
        <div className="gap-list" style={{ background: '#eef0f6', border: '1px solid #cdd3e6', color: '#4a4f6a' }}>
          One question per block (separate with a blank line). Available fill-ins:{' '}
          <code>{'{feminine_sign}'}</code> <code>{'{masculine_sign}'}</code> <code>{'{feminine_qualities}'}</code> <code>{'{masculine_qualities}'}</code> <code>{'{feminine_qualities_2}'}</code> <code>{'{masculine_qualities_2}'}</code> <code>{'{feminine_archetype}'}</code> <code>{'{masculine_archetype}'}</code>
        </div>
      )}
      <textarea style={{ minHeight: 260 }} value={tmpl} onChange={(e) => setTmpl(e.target.value)} />
      <div style={{ marginTop: 12 }}><button className="gold" onClick={save}>Save block</button></div>
    </div>
  );
}

const Q_TOKENS = ['{feminine_sign}', '{masculine_sign}', '{feminine_qualities}', '{masculine_qualities}', '{feminine_qualities_2}', '{masculine_qualities_2}', '{feminine_archetype}', '{masculine_archetype}'];

function QuestionsEditor({ lib, reload, flash }: any) {
  const [tmpl, setTmpl] = useState(lib.structural.find((b: any) => b.key === 'reflection_questions')?.template ?? '');
  const [venus, setVenus] = useState('Cancer');
  const [mars, setMars] = useState('Taurus');
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setTmpl(lib.structural.find((b: any) => b.key === 'reflection_questions')?.template ?? ''); }, [lib]);

  const loadPreview = () => {
    setLoading(true);
    apiClient.questionsPreview(venus, mars).then((p) => { setPreview(p); setLoading(false); });
  };
  useEffect(() => { loadPreview(); }, [venus, mars]);

  const save = async () => {
    await apiClient.updateStructural('reflection_questions', tmpl);
    flash('Questions saved ✓');
    await reload();
    loadPreview();
  };

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Question templates</h3>
        <p className="muted" style={{ marginBottom: 6 }}>One question per block (leave a blank line between them). The tokens below get filled from each person's own signs when a reading is generated.</p>
        <div className="gap-list" style={{ background: '#eef0f6', border: '1px solid #cdd3e6', color: '#4a4f6a' }}>
          Fill-ins: {Q_TOKENS.map((t) => <code key={t} style={{ marginRight: 8 }}>{t}</code>)}
        </div>
        <textarea style={{ minHeight: 240 }} value={tmpl} onChange={(e) => setTmpl(e.target.value)} />
        <div style={{ marginTop: 12 }}><button className="gold" onClick={save}>Save questions</button></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>See how they read</h3>
        <p className="muted">Pick a sample pairing to preview exactly how the questions construct — this is where wording like "questing for…" shows itself, so you can spot anything that doesn't read right.</p>
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="field-pronoun" style={{ flexBasis: 190 }}>
            <label>Feminine ♀ (Venus)</label>
            <select value={venus} onChange={(e) => setVenus(e.target.value)}>{SIGNS.map((n) => <option key={n}>{n}</option>)}</select>
          </div>
          <div className="field-pronoun" style={{ flexBasis: 190 }}>
            <label>Masculine ♂ (Mars)</label>
            <select value={mars} onChange={(e) => setMars(e.target.value)}>{SIGNS.map((n) => <option key={n}>{n}</option>)}</select>
          </div>
        </div>
        {loading || !preview ? <p className="muted">Loading…</p> : (
          <>
            <ol style={{ paddingLeft: 20, margin: '0 0 8px' }}>
              {preview.questions.map((q: string, i: number) => (
                <li key={i} style={{ marginBottom: 12, fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink)' }}>{q}</li>
              ))}
            </ol>
            <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, borderTop: '1px solid var(--hair)', paddingTop: 10 }}>
              <strong>{venus} qualities (feminine slots):</strong> {preview.venusQualities.join(', ') || '—'}<br />
              <strong>{mars} qualities (masculine slots):</strong> {preview.marsQualities.join(', ') || '—'}<br />
              <strong>Archetypes used:</strong> {preview.venusArchetype ?? '—'} (♀) · {preview.marsArchetype ?? '—'} (♂)
            </div>
            {preview.gaps?.length > 0 && <div className="gap-list" style={{ marginTop: 10 }}>{preview.gaps.join(' ')}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function CombinationsEditor({ flash }: any) {
  const [venus, setVenus] = useState('Aries');
  const [mars, setMars] = useState('Aries');
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    apiClient.getLibrary().then((lib) => {
      const c = lib.combinations.find((x: any) => x.venusSign === venus && x.marsSign === mars);
      setNote(c?.note ?? '');
      setLoaded(true);
    });
  }, [venus, mars]);

  const save = async () => {
    await apiClient.updateCombination({ venusSign: venus, marsSign: mars, note: note.trim(), questions: [] });
    flash(`${venus} × ${mars} saved ✓`);
  };

  return (
    <div className="card">
      <p className="muted">The reflection questions are standard now (see the Structural tab). This is just an <em>optional</em> extra note about how a specific Venus (feminine) × Mars (masculine) pairing plays together, if you ever want to add one. Most pairings can be left blank.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="field-pronoun" style={{ flexBasis: 180 }}>
          <label>Feminine ♀ (Venus)</label>
          <select value={venus} onChange={(e) => setVenus(e.target.value)}>{SIGNS.map((n) => <option key={n}>{n}</option>)}</select>
        </div>
        <div className="field-pronoun" style={{ flexBasis: 180 }}>
          <label>Masculine ♂ (Mars)</label>
          <select value={mars} onChange={(e) => setMars(e.target.value)}>{SIGNS.map((n) => <option key={n}>{n}</option>)}</select>
        </div>
      </div>
      {!loaded ? <p className="muted">Loading…</p> : (
        <>
          <label>Optional note about this pairing</label>
          <textarea style={{ minHeight: 100 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave blank unless you want to say something specific about this pairing." />
          <div style={{ marginTop: 12 }}><button className="gold" onClick={save}>Save {venus} × {mars}</button></div>
        </>
      )}
    </div>
  );
}
