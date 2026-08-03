import { useEffect, useRef, useState } from 'react';
import { apiClient, type Participant } from '../api.js';
import { useNavigate } from '../App.js';

export function Review({ participantId }: { participantId: string }) {
  const navigate = useNavigate();
  const [p, setP] = useState<(Participant & { className?: string }) | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [draftUrl, setDraftUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const debounce = useRef<any>(null);

  useEffect(() => {
    apiClient.getParticipant(participantId)
      .then((data) => { setP(data); setText(data.readingText ?? ''); setNote(data.customNote ?? ''); })
      .catch((e) => setError(e.message));
  }, [participantId]);

  // Debounced live preview of the current (unsaved) editor content.
  useEffect(() => {
    if (!p) return;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/participants/${participantId}/preview`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ readingText: text, customNote: note }),
        });
        setPreviewHtml(await res.text());
      } catch { /* ignore preview errors */ }
    }, 400);
    return () => debounce.current && clearTimeout(debounce.current);
  }, [text, note, p, participantId]);

  const save = async () => {
    setStatus('Saving…'); setError('');
    try {
      const updated = await apiClient.saveReading(participantId, { readingText: text, customNote: note });
      setP(updated as any);
      setDirty(false);
      setStatus('Saved ✓');
      setTimeout(() => setStatus(''), 1800);
    } catch (e: any) { setError(e.message); setStatus(''); }
  };

  const createDraft = async () => {
    setError(''); setStatus(''); setDraftUrl('');
    if (dirty && !confirm('You have unsaved edits. Create the draft from the last saved version?')) return;
    try {
      const r = await apiClient.createDraft(participantId);
      setStatus('Gmail draft created ✓');
      setDraftUrl(r.url);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Copy the fully-formatted email to the clipboard as rich HTML, so it can be
  // pasted straight into Gmail's compose window with styling intact.
  const copyEmail = async () => {
    setError(''); setStatus('');
    try {
      const res = await fetch(`/api/participants/${participantId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readingText: text, customNote: note }),
      });
      const full = await res.text();
      // Paste the body content (not the <html>/<head> wrapper) for clean results.
      const htmlFragment = full.replace(/^[\s\S]*<body[^>]*>/i, '').replace(/<\/body>[\s\S]*$/i, '');
      const plain = htmlFragment.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();

      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlFragment], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
        setStatus('Copied — paste into Gmail ✓');
      } else {
        await navigator.clipboard.writeText(plain);
        setStatus('Copied as plain text ✓');
      }
      setTimeout(() => setStatus(''), 3000);
    } catch {
      setError('Copy failed — your browser may have blocked clipboard access. Try again.');
    }
  };

  if (!p) return <div className="container">{error ? <div className="error-banner">{error}</div> : <p className="muted">Loading…</p>}</div>;

  return (
    <div className="container">
      <div className="crumb">
        <a onClick={() => navigate('/')}>Classes</a> › <a onClick={() => navigate(`/class/${p.classId}`)}>{p.className || 'Class'}</a> › {p.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0 }}>Review — {p.name}</h1>
        <div>
          {p.venusSign && <span className="badge sign">♀ {p.venusSign}</span>}{' '}
          {p.marsSign && <span className="badge sign">♂ {p.marsSign}</span>}{' '}
          {p.sunSign && <span className="badge sign">☉ {p.sunSign}</span>}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {p.gaps.length > 0 && (
        <div className="gap-list">
          <strong>Gaps to fill before sending:</strong>
          <ul>{p.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}

      <div className="review-grid">
        <div>
          <div className="card">
            <label>Personal note (optional — appears near the top, in your voice)</label>
            <textarea style={{ minHeight: 90 }} value={note} placeholder="A line or two just for this person…"
              onChange={(e) => { setNote(e.target.value); setDirty(true); }} />
          </div>
          <div className="card">
            <label>Reading text</label>
            <p className="muted" style={{ margin: '0 0 8px' }}>Edit freely. <code>## Heading</code>, <code>**bold**</code>, and <code>- list items</code> render as styled sections. Blank lines separate paragraphs.</p>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setDirty(true); }} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="gold" onClick={save} disabled={!dirty}>Save changes</button>
            <button onClick={copyEmail} title="Copy the formatted email to paste into Gmail">Copy formatted email</button>
            <button className="ghost" onClick={createDraft} title="Creates a Gmail draft for Amelia to review and send">Create Gmail draft</button>
            <span className="muted">{status}</span>
            {draftUrl && <a href={draftUrl} target="_blank" rel="noreferrer">Open in Gmail →</a>}
          </div>
        </div>

        <div>
          <label>Live preview {dirty && <span className="muted">(unsaved)</span>}</label>
          <iframe className="preview-frame" title="Email preview" srcDoc={previewHtml} />
        </div>
      </div>
    </div>
  );
}
