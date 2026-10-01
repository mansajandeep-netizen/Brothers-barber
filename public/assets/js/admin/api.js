/** Admin API client: JSON, CSRF header, consistent errors, session expiry handling. */

let csrf = '';
let onUnauthenticated = () => {};

export function setCsrf(token) {
  csrf = token || '';
}

export function onSessionExpired(fn) {
  onUnauthenticated = fn;
}

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
    this.code = data.code;
    this.fields = data.fields || {};
  }
}

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = `/api/admin${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v != null && v !== '') params.set(k, v);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('Can’t reach the server. Check your connection.', 0);
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (res.status === 401 && path !== '/login' && path !== '/me') onUnauthenticated();
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

export const get = (path, query) => api(path, { query });
export const post = (path, body = {}) => api(path, { method: 'POST', body });
export const patch = (path, body = {}) => api(path, { method: 'PATCH', body });
export const put = (path, body = {}) => api(path, { method: 'PUT', body });
export const del = (path) => api(path, { method: 'DELETE' });
