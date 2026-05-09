let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

const SKIP_AUTH_HANDLER = new Set([
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/password'
]);

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && unauthorizedHandler && !SKIP_AUTH_HANDLER.has(path)) {
      unauthorizedHandler();
    }
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  del: (path) => request(path, { method: 'DELETE', headers: {} })
};

export const auth = {
  bootstrap: () => api.get('/api/auth/bootstrap'),
  bootstrapAdmin: (family_name, username, password, emoji, email) =>
    api.post('/api/auth/bootstrap', { family_name, username, password, emoji: emoji || undefined, email: email || undefined }),
  login: (username, password) => api.post('/api/auth/login', { username, password }),
  register: (data) => api.post('/api/auth/register', data),
  logout: () => api.post('/api/auth/logout'),
  me: () => api.get('/api/auth/me'),
  updateMe: (data) => api.patch('/api/auth/me', data),
  changePassword: (current_password, new_password) =>
    api.post('/api/auth/password', { current_password, new_password }),
  listUsers: () => api.get('/api/auth/users'),
  createUser: (username, password, is_admin, email, emoji) =>
    api.post('/api/auth/users', { username, password, is_admin, email: email || undefined, emoji: emoji || undefined }),
  deleteUser: (id) => api.del(`/api/auth/users/${id}`),
  listInvites: () => api.get('/api/auth/invites'),
  createInvite: ({ max_uses, expires_hours, is_family_starter } = {}) =>
    api.post('/api/auth/invites', { max_uses, expires_hours, is_family_starter }),
  deleteInvite: (id) => api.del(`/api/auth/invites/${id}`)
};

export const items = {
  list: () => api.get('/api/items'),
  create: (data) => api.post('/api/items', data),
  update: (id, data) => api.patch(`/api/items/${id}`, data),
  remove: (id) => api.del(`/api/items/${id}`),
  adjust: (id, delta) => api.post(`/api/items/${id}/adjust`, { delta })
};

export const logApi = {
  fetch: (days = 365) => api.get(`/api/log?days=${days}`),
  resetRush: () => api.post('/api/log/reset-rush'),
  clearHistory: () => api.post('/api/log/clear')
};
