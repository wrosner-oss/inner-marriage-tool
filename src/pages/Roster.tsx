import { useEffect, useState } from 'react';
import { apiClient, ApiError, type ClassDetail, type Participant, type Candidate } from '../api.js';
import { useNavigate } from '../App.js';

const PRONOUNS = ['They', 'She', 'He'];
const blankForm = { name: '', birthDate: '', birthTime: '', place: '', pronoun: 'They', email: '' };

export function Roster({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const [cls, setCls] = useState<ClassDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...blankForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [candidateFor, setCandidateFor] = useState<{ participant: Participant; candidates: Candidate[] } | null>(null);
  const [geo, setGeo] = useState<{ kind: 'checking' | 'ok' | 'ambiguous' | 'notfound' | 'error'; label?: string; message?: string; candidates?: Candidate[] } | null>(null);

  const verifyPlace = async () => {
    const q = form.place.trim();
    if (!q) return;
    setGeo({ kind: 'checking' });
    try {
      const r = await apiClient.geocode(q);
      if (r.status === 'ok' && r.place) {
        setForm((f) => ({ ...f, place: r.place!.label }));
        setGeo({ kind: 'ok', label: r.place.label });
      } else if (r.status === 'ambiguous') {
        setGeo({ kind: 'ambiguous', candidates: r.candidates ?? [] });
      } else {
        setGeo({ kind: 'notfound', message: r.message });
      }
    } catch (e: any) {
      setGeo({ kind: 'error', message: e.message });
    }
  };
  const chooseGeo = (c: Candidate) => {
    setForm((f) => ({ ...f, place: c.label }));
    setGeo({ kind: 'ok', label: c.label });
  };

  const load = () => apiClient.getClass(classId).then(setCls).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [classId]);

  const submitForm = async () => {
    setError('');
    try {
      if (editingId) {
        await apiClient.updateParticipant(editingId, form);
      } else {
        await apiClient.addParticipant(classId, form);
      }
      setForm({ ...blankForm });
      setEditingId(null);
      setGeo(null);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const startEdit = (p: Participant) => {
    setEditingId(p.id);
    setForm({ name: p.name, birthDate: p.birthDate, birthTime: p.birthTime ?? '', place: p.place, pronoun: p.pronoun, email: p.email ?? '' });
    setGeo(null);
    window.scrollTo(0, 0);
  };

  const generateOne = async (p: Participant) => {
    setBusy(true); setError('');
    try {
      await apiClient.generateParticipant(p.id);
      await load();
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409 && e.body?.candidates) {
        setCandidateFor({ participant: p, candidates: e.body.candidates });
      } else { setError(e.message); }
    } finally { setBusy(false); }
  };

  const pickCandidate = async (c: Candidate) => {
    if (!candidateFor) return;
    setBusy(true);
    try {
      await apiClient.updateParticipant(candidateFor.participant.id, { place: c.label });
      const updated = await apiClient.generateParticipant(candidateFor.participant.id);
      setCandidateFor(null);
      if (updated) await load();
    } catch (e: any) { setError(e.message); setCandidateFor(null); }
    finally { setBusy(false); }
  };

  const generateAll = async () => {
    setBusy(true); setError('');
    try {
      const { results } = await apiClient.generateClass(classId);
      await load();
      const amb = results.filter((r) => r.status === 'ambiguous');
      const err = results.filter((r) => r.status === 'error');
      if (amb.length || err.length) {
        setError(`${amb.length} need a clearer birthplace, ${err.length} had errors — see the flagged rows below.`);
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const remove = async (p: Participant) => {
    if (!confirm(`Remove ${p.name} from this class? (Their reading is dropped from the active list.)`)) return;
    await apiClient.deleteParticipant(p.id);
    await load();
  };

  if (!cls) return <div className="container">{error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>}</div>;

  return (
    <div className="container">
      <div className="crumb"><a onClick={() => navigate('/')}>Classes</a> › {cls.name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>{cls.name}</h1>
        <button className="gold" onClick={generateAll} disabled={busy || cls.participants.length === 0}>
          {busy ? 'Working…' : 'Generate readings'}
        </button>
      </div>
      <p className="muted">Add participants, then generate. Charts compute locally; readings use your library copy and flag any gaps.</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit participant' : 'Add a participant'}</h3>
        <div className="row">
          <div className="grow" style={{ minWidth: 160 }}>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field-date">
            <label>Birth date</label>
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </div>
          <div className="field-time">
            <label>Birth time</label>
            <input type="time" value={form.birthTime} onChange={(e) => setForm({ ...form, birthTime: e.target.value })} />
          </div>
          <div className="field-pronoun">
            <label>Pronoun</label>
            <select value={form.pronoun} onChange={(e) => setForm({ ...form, pronoun: e.target.value })}>
              {PRONOUNS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="grow" style={{ minWidth: 240 }}>
            <label>Birthplace (city, state/region, country)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ flex: 1 }} value={form.place} placeholder="e.g. Boulder, Colorado, USA"
                onChange={(e) => { setForm({ ...form, place: e.target.value }); setGeo(null); }} />
              <button type="button" className="ghost small" onClick={verifyPlace} disabled={!form.place.trim() || geo?.kind === 'checking'}>
                {geo?.kind === 'checking' ? 'Checking…' : 'Verify'}
              </button>
            </div>
            {geo?.kind === 'ok' && <p className="muted" style={{ color: 'var(--ok)', margin: '6px 0 0' }}>✓ {geo.label}</p>}
            {(geo?.kind === 'notfound' || geo?.kind === 'error') && <p className="muted" style={{ color: 'var(--danger)', margin: '6px 0 0' }}>{geo.message}</p>}
            {geo?.kind === 'ambiguous' && (
              <div style={{ marginTop: 6 }}>
                <p className="muted" style={{ margin: '0 0 4px' }}>Several places match — pick the right one:</p>
                {geo.candidates!.map((c, i) => (
                  <button type="button" key={i} className="candidate" onClick={() => chooseGeo(c)}>{c.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="grow" style={{ minWidth: 180 }}>
            <label>Email</label>
            <input value={form.email} placeholder="for the reading email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <button className="gold" onClick={submitForm}>{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button className="ghost" onClick={() => { setEditingId(null); setForm({ ...blankForm }); setGeo(null); }}>Cancel</button>}
        </div>
        {!form.birthTime && <p className="muted" style={{ marginBottom: 0 }}>No birth time → Rising &amp; Midheaven can't be computed (and the Moon may be approximate).</p>}
      </div>

      {cls.participants.length === 0 ? (
        <p className="empty">No participants yet. Add your first above.</p>
      ) : (
        <div className="card">
          <table className="roster">
            <thead>
              <tr><th>Name</th><th>Born</th><th>Inner marriage</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {cls.participants.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="muted">{p.email || 'no email'}</div>
                  </td>
                  <td className="muted">{p.birthDate}{p.birthTime ? ` ${p.birthTime}` : ''}<br />{p.place}</td>
                  <td>
                    {p.venusSign ? (
                      <span><span className="badge sign">♀ {p.venusSign}</span> <span className="badge sign">♂ {p.marsSign}</span></span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td><StatusBadge p={p} /></td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {p.hasReading && <button className="link" onClick={() => navigate(`/participant/${p.id}/review`)}>Review</button>}
                    <button className="link" onClick={() => generateOne(p)} disabled={busy}>{p.hasReading ? 'Regenerate' : 'Generate'}</button>
                    <button className="link" onClick={() => startEdit(p)}>Edit</button>
                    <button className="link" style={{ color: 'var(--danger)' }} onClick={() => remove(p)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {candidateFor && (
        <div className="modal-backdrop" onClick={() => setCandidateFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Which {candidateFor.participant.name}'s birthplace?</h3>
            <p className="muted">"{candidateFor.participant.place}" matches several places. Pick the right one — a wrong city changes the whole chart.</p>
            {candidateFor.candidates.map((c, i) => (
              <button key={i} className="candidate" onClick={() => pickCandidate(c)}>{c.label}</button>
            ))}
            <div style={{ marginTop: 12 }}><button className="ghost" onClick={() => setCandidateFor(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ p }: { p: Participant }) {
  if (p.error) return <span className="badge err" title={p.error}>Needs attention</span>;
  if (!p.hasReading) return <span className="badge none">Not generated</span>;
  if (p.gaps.length) return <span className="badge warn" title={p.gaps.join('\n')}>{p.gaps.length} gap{p.gaps.length === 1 ? '' : 's'}</span>;
  if (p.needsRegen) return <span className="badge warn">Birth data changed</span>;
  if (p.edited) return <span className="badge ok">Edited</span>;
  return <span className="badge ok">Ready</span>;
}
