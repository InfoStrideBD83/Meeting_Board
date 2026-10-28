// Shared localStorage-backed prefs for the Home header's WeatherWidget and
// LiveClock, set from SettingsModal. Same same-tab-reactivity problem as
// cursorFxStore.js (localStorage's own 'storage' event never fires in the
// tab that called setItem), solved the same way: a dedicated window event.
const WEATHER_LOCATION_KEY = 'infostride-weather-location';
const CLOCK_ZONE_KEY = 'infostride-clock-zone';
export const HOME_PREFS_CHANGE_EVENT = 'infostride-home-prefs-change';

export const CLOCK_ZONES = {
  local: { label: 'My device time', tz: null },
  IST: { label: 'IST — India', tz: 'Asia/Kolkata' },
  EST: { label: 'EST — US Eastern', tz: 'America/New_York' },
  CST: { label: 'CST — US Central', tz: 'America/Chicago' },
  MST: { label: 'MST — US Mountain', tz: 'America/Denver' },
  PST: { label: 'PST — US Pacific', tz: 'America/Los_Angeles' },
};

function safeGet(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } }
function safeRemove(k) { try { window.localStorage.removeItem(k); } catch { /* ignore */ } }

/** `null` means "no override — use the browser's own geolocation". */
export function getWeatherLocation() {
  try { return JSON.parse(safeGet(WEATHER_LOCATION_KEY) || 'null'); } catch { return null; }
}

/** `loc` is `{ lat, lon, label }`, or `null` to clear the override. */
export function setWeatherLocation(loc) {
  if (loc) safeSet(WEATHER_LOCATION_KEY, JSON.stringify(loc));
  else safeRemove(WEATHER_LOCATION_KEY);
  window.dispatchEvent(new Event(HOME_PREFS_CHANGE_EVENT));
}

export function getClockZone() {
  const z = safeGet(CLOCK_ZONE_KEY);
  return z && CLOCK_ZONES[z] ? z : 'local';
}

export function setClockZone(zone) {
  safeSet(CLOCK_ZONE_KEY, zone);
  window.dispatchEvent(new Event(HOME_PREFS_CHANGE_EVENT));
}
