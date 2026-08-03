import { useState } from 'react';
import { apiClient } from '../api.js';

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await apiClient.login(password);
      onAuthed();
    } catch (e: any) {
      setError(e.message || 'Incorrect password.');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: 'var(--plum)' }}>✦</div>
        <h1 style={{ marginTop: 6 }}>Inner Marriage Tool</h1>
        <p className="muted" style={{ marginBottom: 18 }}>Enter the shared password to continue.</p>
        {error && <div className="error-banner">{error}</div>}
        <input
          type="password"
          value={password}
          autoFocus
          placeholder="Password"
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div style={{ marginTop: 14 }}>
          <button className="gold" onClick={submit} disabled={busy || !password}>{busy ? 'Checking…' : 'Enter'}</button>
        </div>
      </div>
    </div>
  );
}
