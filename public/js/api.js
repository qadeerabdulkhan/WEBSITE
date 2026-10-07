export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response.
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

let sitePromise;
export const site = () => (sitePromise ||= api('/site'));

let mePromise;
export const me = () => (mePromise ||= api('/auth/me').then((d) => d.user).catch(() => null));

export async function logout() {
  await api('/auth/logout', { method: 'POST', body: {} });
  location.href = '/login';
}
