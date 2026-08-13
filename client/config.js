/* ══════════════════════════════════════════════════════════════════════
   InfoStride API config — shared by every page.

   Local dev (server serves this client/ folder itself, same origin):
     leave API_BASE as '/api' — no change needed.

   Deployed (frontend on Vercel, backend on Render — different origins):
     set API_BASE to your Render service's full URL + '/api', e.g.
     'https://infostride-meeting-board-api.onrender.com/api'
   ══════════════════════════════════════════════════════════════════════ */
var API_BASE = '/api';

(function () {
  'use strict';

  var TOKEN_KEY = 'infostride-token';

  function safeGet(store, k) { try { return store.getItem(k); } catch (e) { return null; } }
  function safeSet(store, k, v) { try { store.setItem(k, v); } catch (e) {} }
  function safeRemove(store, k) { try { store.removeItem(k); } catch (e) {} }

  /** Reads the token — checks localStorage ("remember me") then sessionStorage. */
  function getToken() {
    return safeGet(window.localStorage, TOKEN_KEY) || safeGet(window.sessionStorage, TOKEN_KEY);
  }

  /** Stores the token in localStorage (persists across browser restarts) or
   *  sessionStorage (cleared when the tab closes), matching "remember me". */
  function setToken(token, remember) {
    if (remember) {
      safeSet(window.localStorage, TOKEN_KEY, token);
      safeRemove(window.sessionStorage, TOKEN_KEY);
    } else {
      safeSet(window.sessionStorage, TOKEN_KEY, token);
      safeRemove(window.localStorage, TOKEN_KEY);
    }
  }

  function clearToken() {
    safeRemove(window.localStorage, TOKEN_KEY);
    safeRemove(window.sessionStorage, TOKEN_KEY);
  }

  function isLoggedIn() { return Boolean(getToken()); }

  /**
   * Fetch wrapper: adds the auth header, JSON-encodes a plain-object body,
   * parses the JSON response, and throws an Error (with .status) on any
   * non-2xx response so callers can just try/catch instead of checking
   * res.ok everywhere.
   */
  async function apiFetch(path, options) {
    options = options || {};
    var headers = {};
    for (var k in options.headers || {}) headers[k] = options.headers[k];

    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    var res = await fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: body,
    });

    var data = null;
    try { data = await res.json(); } catch (e) { /* empty body, e.g. 204 */ }

    if (!res.ok) {
      var message = (data && data.error) || (res.status + ' ' + res.statusText);
      var err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  window.InfoStrideAPI = {
    API_BASE: API_BASE,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
    isLoggedIn: isLoggedIn,
    apiFetch: apiFetch,
  };
})();
