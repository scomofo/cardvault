// Token stored in localStorage under key 'cv_session_token'
const TOKEN_KEY = 'cv_session_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// Auth API calls (use fetch directly, don't use the api.js wrapper since it might be circular)
const BASE = () => {
  // Same logic as apiBase.js - use window.location.origin in browser
  if (typeof window !== 'undefined') {
    const port = window.location.port === '3000' ? '3001' : window.location.port;
    return `${window.location.protocol}//${window.location.hostname}:${port}/api`;
  }
  return '/api';
};

async function authRequest(path, options = {}) {
  const { method = 'GET', body } = options;
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE()}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export async function fetchMe() { return authRequest('/auth/me'); }
export async function login(password) { return authRequest('/auth/login', { method: 'POST', body: { password } }); }
export async function logout() { return authRequest('/auth/logout', { method: 'POST' }); }
export async function setupPassword(password) { return authRequest('/auth/setup', { method: 'POST', body: { password } }); }
export async function submitEarlyAccess(data) { return authRequest('/early-access', { method: 'POST', body: data }); }
