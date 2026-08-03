import { useEffect, useState } from 'react';
import { apiClient, type ClassSummary } from '../api.js';
import { useNavigate } from '../App.js';

export function ClassList() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = () => apiClient.listClasses().then(setClasses).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    try {
      const c = await apiClient.createClass(name.trim());
      setName('');
      navigate(`/class/${c.id}`);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="container">
      <h1>Your classes</h1>
      <p className="muted">Each class is a group of participants you generate Inner Marriage readings for.</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="row">
          <div className="grow">
            <label>New class name</label>
            <input value={name} placeholder="e.g. Summer 2026 Level One" onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()} />
          </div>
          <button className="gold" onClick={create}>Create class</button>
        </div>
      </div>

      {classes === null ? (
        <p className="muted">Loading…</p>
      ) : classes.length === 0 ? (
        <p className="empty">No classes yet. Create your first one above.</p>
      ) : (
        classes.map((c) => (
          <div key={c.id} className="card" style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => navigate(`/class/${c.id}`)}>
            <div>
              <h3 style={{ margin: '0 0 3px' }}>{c.name}</h3>
              <span className="muted">{c.participantCount} participant{c.participantCount === 1 ? '' : 's'}</span>
            </div>
            <span className="muted">Open →</span>
          </div>
        ))
      )}
    </div>
  );
}
