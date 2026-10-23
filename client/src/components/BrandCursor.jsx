import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'infostride-cursor-fx';

// Elements where losing the native cursor would break something functional
// (the text-insertion beam, a resize handle, a select's own affordance) —
// the custom cursor hides and the real one shows through instead.
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
// Elements worth calling out as clickable, now that hovering them no longer
// shows the OS's own pointer-hand icon — the dot itself grows instead.
const INTERACTIVE_SELECTOR = 'a, button, [role="button"], summary, label, .btn, [tabindex]:not([tabindex="-1"])';

export function getCursorFxEnabled() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function setCursorFxEnabled(on) {
  try { window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
}

function themeColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  const css = getComputedStyle(document.documentElement);
  const tok = (name, fallback) => (css.getPropertyValue(name).trim() || fallback);
  return light
    ? { sparks: [tok('--warn', '#b45309'), tok('--accent', '#4f46e5'), tok('--success', '#059669')], ray: tok('--accent', '#4f46e5') }
    : { sparks: [tok('--accent', '#818cf8'), tok('--success', '#34d399'), tok('--warn', '#fbbf24')], ray: tok('--accent', '#818cf8') };
}

// A soft radial-gradient "glow" pre-rendered once per color and reused via
// drawImage — canvas's own shadowBlur does the same glow but re-runs a
// software blur on every particle, every frame, which is what was making
// the cursor lag. A cached sprite turns each draw into a cheap image copy.
const spriteCache = new Map();
function getGlowSprite(color) {
  let sprite = spriteCache.get(color);
  if (sprite) return sprite;
  const size = 32;
  sprite = document.createElement('canvas');
  sprite.width = size; sprite.height = size;
  const g = sprite.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.45, color);
  grad.addColorStop(1, 'transparent');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  spriteCache.set(color, sprite);
  return sprite;
}

/** A branded cursor (the InfoStride chevron mark) that trails sparkles and
 *  light-rays as it moves, colored from the live theme tokens so it reads
 *  right in both themes. Renders nothing visible on its own — a fixed-
 *  position dot plus a full-viewport canvas for the particle trail, both
 *  `pointer-events: none` so they never affect clicks/hover/drag.
 *
 *  Auto-disables for touch devices (no real cursor to replace), reduced-
 *  motion and forced-colors preferences (the OS cursor stays put, as those
 *  settings intend), and whenever someone turns it off via
 *  CursorEffectsToggle.jsx — persisted so the choice sticks. It also backs
 *  off to the native cursor over text inputs/selects (so the text-insertion
 *  beam and resize handles keep working) and grows over clickable elements
 *  as its own substitute for the OS's pointer-hand affordance. */
export function BrandCursor() {
  const dotRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const dot = dotRef.current;
    const canvas = canvasRef.current;
    if (!dot || !canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerMq = window.matchMedia('(pointer: fine)');
    const forcedColorsMq = window.matchMedia('(forced-colors: active)');

    const state = {
      active: false, interactive: false, particles: [], last: { x: -100, y: -100 }, raf: null,
      palette: themeColors(),
    };
    const themeObserver = new MutationObserver(() => { state.palette = themeColors(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function computeActive() {
      return getCursorFxEnabled() && finePointerMq.matches && !reducedMotionMq.matches && !forcedColorsMq.matches;
    }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setActive(active) {
      state.active = active;
      document.documentElement.classList.toggle('cursor-fx-active', active);
      dot.classList.toggle('is-hidden', !active);
      if (!active) {
        state.particles = [];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
      }
    }

    function spawn(x, y, speed) {
      const palette = state.palette;
      const count = Math.min(3, 1 + Math.floor(speed / 10));
      for (let i = 0; i < count; i++) {
        state.particles.push({
          kind: 'spark',
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2 - 0.3,
          life: 0,
          maxLife: 420 + Math.random() * 220,
          size: 0.6 + Math.random() * 0.9,
          color: palette.sparks[Math.floor(Math.random() * palette.sparks.length)],
        });
      }
      if (speed > 6) {
        state.particles.push({
          kind: 'ray', x: state.last.x, y: state.last.y, x2: x, y2: y,
          life: 0, maxLife: 160 + Math.min(speed, 40) * 3, color: palette.ray,
        });
      }
      if (state.particles.length > 140) state.particles.splice(0, state.particles.length - 140);
    }

    function frame() {
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      state.particles = state.particles.filter((p) => {
        p.life += 16;
        if (p.life >= p.maxLife) return false;
        const alpha = 1 - p.life / p.maxLife;
        if (p.kind === 'spark') {
          p.x += p.vx; p.y += p.vy;
          const radius = p.size * 2.2 * (1 - (p.life / p.maxLife) * 0.6);
          ctx.globalAlpha = alpha;
          ctx.drawImage(getGlowSprite(p.color), p.x - radius, p.y - radius, radius * 2, radius * 2);
        } else {
          ctx.globalAlpha = alpha * 0.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
        }
        return true;
      });
      ctx.globalAlpha = 1;
      state.raf = state.particles.length > 0 ? requestAnimationFrame(frame) : null;
    }

    function onMove(e) {
      if (!state.active) return;
      const { clientX: x, clientY: y } = e;
      const target = e.target;
      const textLike = Boolean(target && target.closest && target.closest(TEXT_SELECTOR));
      state.interactive = Boolean(target && target.closest && target.closest(INTERACTIVE_SELECTOR));

      dot.classList.toggle('is-hidden', textLike);
      dot.classList.toggle('is-interactive', state.interactive);
      dot.style.transform = `translate3d(${x - 9}px, ${y - 9}px, 0) scale(${state.interactive ? 1.3 : 1})`;

      const speed = Math.min(60, Math.hypot(x - state.last.x, y - state.last.y));
      spawn(x, y, speed);
      state.last = { x, y };
      if (state.raf == null) state.raf = requestAnimationFrame(frame);
    }

    function onLeaveDoc() { dot.classList.add('is-hidden'); }
    function onEnterDoc() { if (state.active) dot.classList.remove('is-hidden'); }
    function onVisibility() {
      if (document.hidden && state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    }
    function onStorage(e) { if (e.key === STORAGE_KEY) setActive(computeActive()); }
    function refresh() { setActive(computeActive()); }

    resize();
    setActive(computeActive());
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeaveDoc);
    document.addEventListener('mouseenter', onEnterDoc);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    reducedMotionMq.addEventListener('change', refresh);
    finePointerMq.addEventListener('change', refresh);
    forcedColorsMq.addEventListener('change', refresh);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeaveDoc);
      document.removeEventListener('mouseenter', onEnterDoc);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      reducedMotionMq.removeEventListener('change', refresh);
      finePointerMq.removeEventListener('change', refresh);
      forcedColorsMq.removeEventListener('change', refresh);
      if (state.raf) cancelAnimationFrame(state.raf);
      themeObserver.disconnect();
      document.documentElement.classList.remove('cursor-fx-active');
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="brand-cursor-canvas" aria-hidden="true" />
      <div ref={dotRef} className="brand-cursor-dot is-hidden" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="100%" height="100%">
          <polygon points="2,3 10,12 2,21 6,21 14,12 6,3" fill="var(--text)" opacity=".85" />
          <polygon points="9,3 17,12 9,21 13,21 21,12 13,3" fill="var(--accent)" />
        </svg>
      </div>
    </>
  );
}
