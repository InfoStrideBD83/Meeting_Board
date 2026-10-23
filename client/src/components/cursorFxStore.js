const STORAGE_KEY = 'infostride-cursor-fx';
// localStorage's own 'storage' event only fires in OTHER tabs, never the
// one that called setItem — so the toggle button (same tab as the cursor
// it controls) needs its own event to actually take effect immediately.
export const CURSOR_FX_CHANGE_EVENT = 'infostride-cursor-fx-change';

export function getCursorFxEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function setCursorFxEnabled(on) {
  try { window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CURSOR_FX_CHANGE_EVENT));
}

export function isCursorFxStorageKey(key) {
  return key === STORAGE_KEY;
}
