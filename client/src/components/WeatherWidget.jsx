import { useEffect, useState } from 'react';
import { getWeatherLocation, HOME_PREFS_CHANGE_EVENT } from '../utils/homePrefsStore.js';
import styles from './WeatherWidget.module.css';

// WMO weather codes (Open-Meteo's `weather_code`) collapsed to a label,
// emoji and a badge color per condition family — like a phone weather
// widget, sunny stays warm/amber, rain/snow stay cool blues regardless of
// the app's own light/dark theme, since real weather icons are always
// colorful rather than theme-reactive. This codebase already uses plain
// emoji as game-tile icons (MemoryMatch), so no icon asset/library needed.
const WEATHER_META = {
  0: { label: 'Sunny', icon: '☀️', color: '#f59e0b, #fbbf24' },
  1: { label: 'Mostly Sunny', icon: '🌤️', color: '#f59e0b, #fcd34d' },
  2: { label: 'Partly Cloudy', icon: '⛅', color: '#60a5fa, #93c5fd' },
  3: { label: 'Cloudy', icon: '☁️', color: '#6b7280, #9ca3af' },
  45: { label: 'Foggy', icon: '🌫️', color: '#94a3b8, #cbd5e1' },
  48: { label: 'Foggy', icon: '🌫️', color: '#94a3b8, #cbd5e1' },
  51: { label: 'Light Drizzle', icon: '🌦️', color: '#3b82f6, #60a5fa' },
  53: { label: 'Drizzle', icon: '🌦️', color: '#3b82f6, #60a5fa' },
  55: { label: 'Heavy Drizzle', icon: '🌦️', color: '#2563eb, #3b82f6' },
  56: { label: 'Freezing Drizzle', icon: '🌦️', color: '#0ea5e9, #7dd3fc' },
  57: { label: 'Freezing Drizzle', icon: '🌦️', color: '#0ea5e9, #7dd3fc' },
  61: { label: 'Light Rain', icon: '🌧️', color: '#2563eb, #3b82f6' },
  63: { label: 'Rainy', icon: '🌧️', color: '#1d4ed8, #2563eb' },
  65: { label: 'Heavy Rain', icon: '🌧️', color: '#1e40af, #1d4ed8' },
  66: { label: 'Freezing Rain', icon: '🌧️', color: '#0ea5e9, #38bdf8' },
  67: { label: 'Freezing Rain', icon: '🌧️', color: '#0ea5e9, #38bdf8' },
  71: { label: 'Light Snow', icon: '🌨️', color: '#93c5fd, #e0f2fe' },
  73: { label: 'Snowy', icon: '🌨️', color: '#93c5fd, #e0f2fe' },
  75: { label: 'Heavy Snow', icon: '🌨️', color: '#60a5fa, #bae6fd' },
  77: { label: 'Snow Grains', icon: '🌨️', color: '#93c5fd, #e0f2fe' },
  80: { label: 'Rain Showers', icon: '🌦️', color: '#3b82f6, #60a5fa' },
  81: { label: 'Rain Showers', icon: '🌦️', color: '#2563eb, #3b82f6' },
  82: { label: 'Violent Showers', icon: '⛈️', color: '#4f46e5, #6366f1' },
  85: { label: 'Snow Showers', icon: '🌨️', color: '#93c5fd, #e0f2fe' },
  86: { label: 'Snow Showers', icon: '🌨️', color: '#60a5fa, #bae6fd' },
  95: { label: 'Thunderstorm', icon: '⛈️', color: '#4f46e5, #6366f1' },
  96: { label: 'Thunderstorm', icon: '⛈️', color: '#4338ca, #4f46e5' },
  99: { label: 'Thunderstorm', icon: '⛈️', color: '#4338ca, #4f46e5' },
};
function describeCode(code) {
  return WEATHER_META[code] || { label: 'Unknown', icon: '🌡️', color: '#6b7280, #9ca3af' };
}

const CACHE_KEY = 'infostride-weather-cache-v3';
const CACHE_MS = 30 * 60 * 1000;

/** A quiet, best-effort weather readout for the Home header's left corner.
 *  Uses SettingsModal's manual city override if one is set; otherwise each
 *  person's own location via the browser (one-time permission prompt). No
 *  account/API key either way: Open-Meteo for the forecast, BigDataCloud's
 *  free client-side reverse-geocode endpoint for the city/state name when
 *  there's no manual override to supply one already (both free, keyless,
 *  CORS-enabled for direct browser use). If location is denied,
 *  unsupported, or a fetch fails, it just doesn't render — this is a
 *  nice-to-have, not something worth showing an error state for. */
export function WeatherWidget() {
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    // Show a recent cached reading instantly while a fresh one loads in
    // the background, instead of a blank gap on every page load.
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.at < CACHE_MS) setWeather(cached.data);
    } catch { /* ignore */ }

    function fetchWeather(lat, lon, labelOverride) {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=celsius`;
      const placeUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

      Promise.all([
        fetch(weatherUrl).then((r) => r.json()),
        // Skip the reverse-geocode round trip entirely when a manual
        // override already supplies its own label.
        labelOverride ? Promise.resolve(null) : fetch(placeUrl).then((r) => r.json()).catch(() => null),
      ]).then(([weatherData, placeData]) => {
        const place = placeData && (placeData.city || placeData.locality);
        const region = placeData && placeData.principalSubdivision;
        const result = {
          temp: Math.round(weatherData.current.temperature_2m),
          code: weatherData.current.weather_code,
          place: labelOverride || place || region || null,
          region: !labelOverride && place && region ? region : null,
        };
        setWeather(result);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: result })); } catch { /* ignore */ }
      }).catch(() => {});
    }

    function load() {
      const override = getWeatherLocation();
      if (override) {
        fetchWeather(override.lat, override.lon, override.label);
        return;
      }
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude, null),
        () => {},
        { timeout: 8000, maximumAge: 600000 }
      );
    }

    load();
    window.addEventListener(HOME_PREFS_CHANGE_EVENT, load);
    return () => window.removeEventListener(HOME_PREFS_CHANGE_EVENT, load);
  }, []);

  if (!weather) return null;

  const { label, icon, color } = describeCode(weather.code);
  const place = weather.place ? (weather.region ? `${weather.place}, ${weather.region}` : weather.place) : null;

  return (
    <span className={styles.card} title={`${label}${place ? ' · ' + place : ''}`}>
      <span className={styles.iconBadge} style={{ backgroundImage: `linear-gradient(135deg, ${color})` }}>
        <span aria-hidden="true">{icon}</span>
      </span>
      <span className={styles.info}>
        <span className={styles.topRow}>
          <span className={styles.temp}>{weather.temp}°C</span>
          <span className={styles.label}>{label}</span>
        </span>
        {place && <span className={styles.place}>{place}</span>}
      </span>
    </span>
  );
}
