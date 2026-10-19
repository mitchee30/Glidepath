export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `http_${status}`);
    this.status = status;
    this.code = body?.error || `http_${status}`;
    this.body = body || {};
  }
}

export async function api(method, path, body) {
  const init = { method, headers: { 'X-Glidepath': '1' }, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch('/api' + path, init);
  } catch {
    throw new ApiError(0, { error: 'offline' });
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new CustomEvent('glidepath:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const patch = (p, b = {}) => api('PATCH', p, b);
export const del = (p, b) => api('DELETE', p, b);
