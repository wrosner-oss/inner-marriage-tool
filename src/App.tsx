import { useEffect, useState, createContext, useContext } from 'react';
import { apiClient } from './api.js';
import { ClassList } from './pages/ClassList.js';
import { Roster } from './pages/Roster.js';
import { Review } from './pages/Review.js';
import { Library } from './pages/Library.js';
import { Login } from './pages/Login.js';

// --- minimal client-side router (no dependency) ---
const NavContext = createContext<(path: string) => void>(() => {});
export const useNavigate = () => useContext(NavContext);

export function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [authed, setAuthed] = useState<boolean | null>(null); // null = still checking

  // Check session on load, and drop back to login if any request 401s.
  useEffect(() => {
    apiClient.authStatus().then((s) => setAuthed(s.authed)).catch(() => setAuthed(true));
    const onUnauth = () => setAuthed(false);
    window.addEventListener('im-unauthorized', onUnauth);
    return () => window.removeEventListener('im-unauthorized', onUnauth);
  }, []);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const logout = async () => {
    try { await apiClient.logout(); } catch { /* ignore */ }
    setAuthed(false);
  };

  if (authed === null) return null; // brief blank while checking session
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;

  const navigate = (to: string) => {
    window.history.pushState({}, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  };

  let page;
  let m;
  if (path === '/' || path === '') page = <ClassList />;
  else if ((m = path.match(/^\/class\/([^/]+)$/))) page = <Roster classId={m[1]} />;
  else if ((m = path.match(/^\/participant\/([^/]+)\/review$/))) page = <Review participantId={m[1]} />;
  else if (path === '/library') page = <Library />;
  else page = <div className="container"><p className="empty">Page not found. <a onClick={() => navigate('/')}>Go home</a></p></div>;

  return (
    <NavContext.Provider value={navigate}>
      <div className="topbar">
        <span className="brand" onClick={() => navigate('/')}>✦ Inner Marriage Tool</span>
        <a onClick={() => navigate('/')}>Classes</a>
        <a onClick={() => navigate('/library')}>Content</a>
        <a style={{ marginLeft: 'auto' }} onClick={logout}>Log out</a>
      </div>
      {page}
    </NavContext.Provider>
  );
}
