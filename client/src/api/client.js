/* Port of client/config.js's window.InfoStrideAPI as ES module exports.
   Same storage key, same header/JSON/throw-on-non-2xx behavior — every
   existing HTML page keeps working unchanged against the same backend. */

export const API_BASE = '/api';

const TOKEN_KEY = 'infostride-token';

function safeGet(store, k) { try { return store.getItem(k); } catch { return null; } }
function safeSet(store, k, v) { try { store.setItem(k, v); } catch { /* ignore */ } }
function safeRemove(store, k) { try { store.removeItem(k); } catch { /* ignore */ } }

/** Reads the token — checks localStorage ("remember me") then sessionStorage. */
export function getToken() {
  return safeGet(window.localStorage, TOKEN_KEY) || safeGet(window.sessionStorage, TOKEN_KEY);
}

/** Stores the token in localStorage (persists across browser restarts) or
 *  sessionStorage (cleared when the tab closes), matching "remember me". */
export function setToken(token, remember) {
  if (remember) {
    safeSet(window.localStorage, TOKEN_KEY, token);
    safeRemove(window.sessionStorage, TOKEN_KEY);
  } else {
    safeSet(window.sessionStorage, TOKEN_KEY, token);
    safeRemove(window.localStorage, TOKEN_KEY);
  }
}

export function clearToken() {
  safeRemove(window.localStorage, TOKEN_KEY);
  safeRemove(window.sessionStorage, TOKEN_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

/**
 * Fetch wrapper: adds the auth header, JSON-encodes a plain-object body,
 * parses the JSON response, and throws an Error (with .status) on any
 * non-2xx response so callers can just try/catch instead of checking
 * res.ok everywhere.
 */
export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers,
    body,
  });

  let data = null;
  try { data = await res.json(); } catch { /* empty body, e.g. 204 */ }

  if (!res.ok) {
    const message = (data && data.error) || (res.status + ' ' + res.statusText);
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}
