let unauthorizedHandler = null;
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

const SKIP_AUTH_HANDLER = new Set([
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/password',
  '/api/auth/forgot-password',
  '/api/auth/reset-password'
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
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body || {}) }),
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
  deleteInvite: (id) => api.del(`/api/auth/invites/${id}`),
  forgotPassword: (username) => api.post('/api/auth/forgot-password', { username }),
  resetPassword: (token, new_password) => api.post('/api/auth/reset-password', { token, new_password })
};

export const admin = {
  updateUser: (id, data) => api.patch(`/api/auth/users/${id}`, data),
  toggleSuperadmin: (id, is_superadmin) => api.patch(`/api/auth/users/${id}/superadmin`, { is_superadmin }),
  listAllUsers: () => api.get('/api/auth/users/all'),
  listFamilies: () => api.get('/api/families'),
  renameFamily: (id, name) => api.patch(`/api/families/${id}`, { name }),
  deleteFamily: (id) => api.del(`/api/families/${id}`),
  familyActivity: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.before) qs.set('before', params.before);
    if (params.user_id) qs.set('user_id', params.user_id);
    if (params.item_id) qs.set('item_id', params.item_id);
    const q = qs.toString();
    return api.get(`/api/log/family${q ? '?' + q : ''}`);
  },
};

export const items = {
  list: () => api.get('/api/items'),
  create: (data) => api.post('/api/items', data),
  update: (id, data) => api.patch(`/api/items/${id}`, data),
  remove: (id) => api.del(`/api/items/${id}`),
  adjust: (id, delta, { isGive, giveRecipient } = {}) =>
    api.post(`/api/items/${id}/adjust`, { delta, is_give: isGive || undefined, give_recipient: giveRecipient || undefined })
};

export const notifications = {
  getPreferences: () => api.get('/api/notifications/preferences'),
  updatePreferences: (prefs) => api.put('/api/notifications/preferences', prefs),
  sendTest: () => api.post('/api/notifications/test'),
};

export const logApi = {
  fetch: (days = 365) => api.get(`/api/log?days=${days}`),
  resetRush: () => api.post('/api/log/reset-rush'),
  clearHistory: () => api.post('/api/log/clear'),
  add: (entry) => api.post('/api/log', entry),
  update: (id, data) => api.patch(`/api/log/${id}`, data),
  remove: (id) => api.del(`/api/log/${id}`)
};

export const versionApi = {
  get: () => api.get('/api/version'),
};
