// Tiny typed fetch client for the Inner Marriage API.

export interface ClassSummary { id: string; name: string; participantCount: number; updatedAt: string; }
export interface Candidate { name: string; admin1?: string; country?: string; latitude: number; longitude: number; label: string; }
export interface Participant {
  id: string;
  classId: string;
  name: string;
  birthDate: string;
  birthTime: string | null;
  place: string;
  pronoun: string;
  email: string | null;
  sunSign: string | null;
  venusSign: string | null;
  marsSign: string | null;
  readingText: string | null;
  customNote: string | null;
  gaps: string[];
  error: string | null;
  edited: boolean;
  draftStatus: string;
  hasReading: boolean;
  needsRegen: boolean;
  updatedAt: string;
}
export interface ClassDetail { id: string; name: string; updatedAt: string; participants: Participant[]; }

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: any) { super(message); }
}

async function req<T>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  // A 401 outside the login flow means the session lapsed — tell the app to
  // show the login screen again.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('im-unauthorized'));
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export const apiClient = {
  authStatus: () => req<{ authEnabled: boolean; authed: boolean }>('GET', '/auth/status'),
  login: (password: string) => req<{ ok: boolean }>('POST', '/auth/login', { password }),
  logout: () => req('POST', '/auth/logout'),

  listClasses: () => req<ClassSummary[]>('GET', '/classes'),
  createClass: (name: string) => req<{ id: string; name: string }>('POST', '/classes', { name }),
  getClass: (id: string) => req<ClassDetail>('GET', `/classes/${id}`),
  renameClass: (id: string, name: string) => req('PATCH', `/classes/${id}`, { name }),
  deleteClass: (id: string) => req('DELETE', `/classes/${id}`),

  getParticipant: (id: string) => req<Participant & { className: string }>('GET', `/participants/${id}`),
  addParticipant: (classId: string, p: Partial<Participant>) => req<Participant>('POST', `/classes/${classId}/participants`, p),
  updateParticipant: (id: string, p: Partial<Participant>) => req<Participant>('PATCH', `/participants/${id}`, p),
  deleteParticipant: (id: string) => req('DELETE', `/participants/${id}`),
  saveReading: (id: string, data: { readingText?: string; customNote?: string }) => req<Participant>('PATCH', `/participants/${id}/reading`, data),
  generateParticipant: (id: string) => req<Participant>('POST', `/participants/${id}/generate`),
  generateClass: (id: string, force = false) => req<{ results: any[] }>('POST', `/classes/${id}/generate`, { force }),
  createDraft: (id: string) => req<{ ok: boolean; draftId: string; url: string }>('POST', `/participants/${id}/draft`),

  getLibrary: () => req<any>('GET', '/library'),
  updateSign: (name: string, data: any) => req('PUT', `/library/signs/${encodeURIComponent(name)}`, data),
  updateStructural: (key: string, template: string) => req('PUT', `/library/structural/${encodeURIComponent(key)}`, { template }),
  updateCombination: (data: any) => req('PUT', '/library/combination', data),
  questionsPreview: (venus: string, mars: string) => req<any>('GET', `/library/questions-preview?venus=${encodeURIComponent(venus)}&mars=${encodeURIComponent(mars)}`),
};
