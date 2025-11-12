export function setAccessToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

export function getAccessToken() {
  return localStorage.getItem('token');
}

export function authHeaders() {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: 'Bearer ' + token };
}

export async function apiSilentRefresh() {
  const res = await fetch('/api/refresh', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error('refresh failed');
  const data = await res.json();
  setAccessToken(data.accessToken);
  return data;
}