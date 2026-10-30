import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './CarParking.module.css';

const VIRTUAL_W = 380;
const VIRTUAL_H = 260;
const LOT = { x: 26, y: 20, w: 328, h: 220 };
const CAR_LEN = 24;
const CAR_WID = 12;
const TOTAL_LEVELS = 50;

const TIERS = [
  { id: 'easy', name: 'Easy', from: 1, to: 10, color: '#34d399', time: 40, obstacles: [0, 2], moving: 0, spotMult: 1.7, angled: false, mult: 1 },
  { id: 'medium', name: 'Medium', from: 11, to: 25, color: '#60a5fa', time: 33, obstacles: [2, 4], moving: 0, spotMult: 1.38, angled: false, mult: 1.3 },
  { id: 'hard', name: 'Hard', from: 26, to: 40, color: '#fbbf24', time: 27, obstacles: [3, 6], moving: 1, spotMult: 1.16, angled: true, mult: 1.7 },
  { id: 'expert', name: 'Expert', from: 41, to: 50, color: '#fb7185', time: 21, obstacles: [5, 8], moving: 2, spotMult: 1, angled: true, mult: 2.2 },
];
function tierFor(level) {
  return TIERS.find((t) => level >= t.from && level <= t.to) || TIERS[0];
}

/* ── seeded RNG so a given level always generates the same layout ── */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── oriented-rectangle geometry: corners / axes / SAT collision ──
   Rects are { x, y, w, h, angle } with (x, y) at the CENTER. Used for the
   car, every obstacle, every wall segment and the target spot alike, so
   one collision routine covers all of them. */
function obbCorners(r) {
  const hw = r.w / 2; const hh = r.h / 2;
  const cos = Math.cos(r.angle); const sin = Math.sin(r.angle);
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({
    x: r.x + x * cos - y * sin,
    y: r.y + x * sin + y * cos,
  }));
}
function rectAxes(corners) {
  const axes = [];
  for (let i = 0; i < 2; i++) {
    const p1 = corners[i]; const p2 = corners[i + 1];
    const ex = p2.x - p1.x; const ey = p2.y - p1.y;
    const len = Math.hypot(ex, ey) || 1;
    axes.push({ x: -ey / len, y: ex / len });
  }
  return axes;
}
function project(corners, axis) {
  let min = Infinity; let max = -Infinity;
  for (const p of corners) {
    const d = p.x * axis.x + p.y * axis.y;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}
/** Separating Axis Theorem — returns the minimum-translation vector to push
 *  `a` out of `b`, or null if they don't overlap. */
function obbCollide(a, b) {
  const ca = obbCorners(a); const cb = obbCorners(b);
  const axes = [...rectAxes(ca), ...rectAxes(cb)];
  let minOverlap = Infinity; let minAxis = null;
  for (const axis of axes) {
    const [minA, maxA] = project(ca, axis);
    const [minB, maxB] = project(cb, axis);
    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
    if (overlap <= 0) return null;
    if (overlap < minOverlap) { minOverlap = overlap; minAxis = axis; }
  }
  const dir = { x: a.x - b.x, y: a.y - b.y };
  if (dir.x * minAxis.x + dir.y * minAxis.y < 0) minAxis = { x: -minAxis.x, y: -minAxis.y };
  return { overlap: minOverlap, axis: minAxis };
}
function obbToAABB(r) {
  const c = obbCorners(r);
  const xs = c.map((p) => p.x); const ys = c.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function aabbOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y;
}
function pointInOBB(px, py, r, tolerance = 0) {
  const dx = px - r.x; const dy = py - r.y;
  const cos = Math.cos(-r.angle); const sin = Math.sin(-r.angle);
  const lx = dx * cos - dy * sin; const ly = dx * sin + dy * cos;
  return Math.abs(lx) <= r.w / 2 + tolerance && Math.abs(ly) <= r.h / 2 + tolerance;
}

function wallsFor(lot) {
  const t = 14;
  return [
    { x: lot.x - t / 2, y: lot.y + lot.h / 2, w: t, h: lot.h + t * 2, angle: 0 },
    { x: lot.x + lot.w + t / 2, y: lot.y + lot.h / 2, w: t, h: lot.h + t * 2, angle: 0 },
    { x: lot.x + lot.w / 2, y: lot.y - t / 2, w: lot.w + t * 2, h: t, angle: 0 },
    { x: lot.x + lot.w / 2, y: lot.y + lot.h + t / 2, w: lot.w + t * 2, h: t, angle: 0 },
  ];
}

/** Parametric level generator, seeded by level number — same level number
 *  always produces the same layout, and difficulty scales smoothly through
 *  each tier (more/tighter obstacles, smaller spot, less time, moving
 *  hazards from Hard onward) without hand-authoring 50 bespoke scenes. */
function generateLevel(levelNum) {
  const tier = tierFor(levelNum);
  const rand = mulberry32(levelNum * 7919 + 13);
  const idxInTier = levelNum - tier.from;

  const start = { x: LOT.x + LOT.w / 2, y: LOT.y + LOT.h - CAR_LEN * 0.9, heading: -Math.PI / 2 };

  const spotW = CAR_WID * tier.spotMult;
  const spotL = CAR_LEN * 1.3;
  const angled = tier.angled && rand() > 0.45;
  const spotAngle = angled ? (rand() > 0.5 ? Math.PI / 5 : -Math.PI / 5) : (rand() > 0.5 ? 0 : Math.PI / 2);
  let spot = null;
  for (let tries = 0; tries < 30; tries++) {
    const sx = LOT.x + spotL + rand() * (LOT.w - spotL * 2);
    const sy = LOT.y + spotW + rand() * (LOT.h * 0.62 - spotW);
    if (Math.hypot(sx - start.x, sy - start.y) > 55) { spot = { x: sx, y: sy, w: spotL, h: spotW, angle: spotAngle }; break; }
  }
  if (!spot) spot = { x: LOT.x + LOT.w * 0.3, y: LOT.y + LOT.h * 0.3, w: spotL, h: spotW, angle: 0 };

  const startAABB = { x: start.x - CAR_LEN, y: start.y - CAR_LEN, w: CAR_LEN * 2, h: CAR_LEN * 2 };
  const spotAABB = obbToAABB(spot);

  const count = Math.round(tier.obstacles[0] + rand() * (tier.obstacles[1] - tier.obstacles[0]));
  const obstacles = [];
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const ox = LOT.x + CAR_LEN + rand() * (LOT.w - CAR_LEN * 2);
      const oy = LOT.y + CAR_LEN + rand() * (LOT.h - CAR_LEN * 2);
      const oAngle = rand() > 0.5 ? 0 : Math.PI / 2;
      const cand = { x: ox, y: oy, w: CAR_LEN, h: CAR_WID, angle: oAngle };
      const candAABB = obbToAABB(cand);
      if (
        !aabbOverlap(candAABB, spotAABB, 12)
        && !aabbOverlap(candAABB, startAABB, 10)
        && !obstacles.some((o) => aabbOverlap(candAABB, obbToAABB(o), 6))
      ) { obstacles.push(cand); break; }
    }
  }

  const movers = [];
  for (let i = 0; i < tier.moving; i++) {
    const horizontal = rand() > 0.5;
    const cross = horizontal
      ? LOT.y + 25 + rand() * (LOT.h - 50)
      : LOT.x + 30 + rand() * (LOT.w - 60);
    const min = horizontal ? LOT.x + 16 : LOT.y + 16;
    const max = horizontal ? LOT.x + LOT.w - 16 : LOT.y + LOT.h - 16;
    const mover = {
      axis: horizontal ? 'x' : 'y', min, max, cross,
      pos: 0.5, dir: rand() > 0.5 ? 1 : -1,
      speed: 20 + rand() * 12 + idxInTier * 0.5,
      w: CAR_LEN, h: CAR_WID, angle: horizontal ? 0 : Math.PI / 2,
      x: 0, y: 0,
    };
    placeMover(mover);
    movers.push(mover);
  }

  const timeLimit = Math.max(14, Math.round(tier.time - idxInTier * 0.45));

  return { level: levelNum, tier, start, spot, obstacles, movers, timeLimit };
}

function placeMover(m) {
  const coord = m.min + m.pos * (m.max - m.min);
  if (m.axis === 'x') { m.x = coord; m.y = m.cross; } else { m.y = coord; m.x = m.cross; }
}
function stepMover(m, dt) {
  const range = m.max - m.min || 1;
  let p = m.pos + (m.dir * m.speed * dt) / range;
  if (p >= 1) { p = 1; m.dir = -1; } else if (p <= 0) { p = 0; m.dir = 1; }
  m.pos = p;
  placeMover(m);
}

/* ── car physics ── */
const MAX_SPEED = 118;
const MAX_REVERSE = 68;
const ACCEL = 95;
const BRAKE_DECEL = 170;
const FRICTION = 62;
const TURN_RATE = 2.55;

function carRect(car) { return { x: car.x, y: car.y, w: CAR_LEN, h: CAR_WID, angle: car.heading }; }

function stepCarPhysics(car, input, dt) {
  if (input.throttle) car.speed += ACCEL * dt;
  else if (input.brake) car.speed -= BRAKE_DECEL * dt;
  else if (car.speed > 0) car.speed = Math.max(0, car.speed - FRICTION * dt);
  else if (car.speed < 0) car.speed = Math.min(0, car.speed + FRICTION * dt);
  car.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, car.speed));

  if (Math.abs(car.speed) > 0.5) {
    const speedRatio = Math.max(0.4, Math.min(1, Math.abs(car.speed) / MAX_SPEED));
    const dir = car.speed > 0 ? 1 : -1;
    car.heading += input.steer * TURN_RATE * speedRatio * dir * dt;
  }
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.y -= Math.cos(car.heading) * car.speed * dt;
}

/** Pushes the car out of anything it's touching (walls/obstacles/movers),
 *  dampens its speed on impact, and reports whether a NEW hit started this
 *  frame (a sustained scrape against the same thing only counts once). */
function resolveCollisions(car, solids) {
  let touching = false;
  for (const solid of solids) {
    const res = obbCollide(carRect(car), solid);
    if (res) {
      car.x -= res.axis.x * res.overlap;
      car.y -= res.axis.y * res.overlap;
      car.speed *= 0.25;
      touching = true;
    }
  }
  const newHit = touching && !car.wasTouching;
  car.wasTouching = touching;
  return newHit;
}

function isParked(car, spot) {
  if (Math.abs(car.speed) > 9) return false;
  return obbCorners(carRect(car)).every((c) => pointInOBB(c.x, c.y, spot, 1.5));
}

function scoreRun(tier, timeLimit, timeRemaining, hits) {
  const timeFrac = Math.max(0, timeRemaining / timeLimit);
  const base = Math.round(600 * tier.mult);
  const bonus = Math.round(420 * tier.mult * timeFrac);
  const points = Math.max(80, base + bonus - hits * 55);
  let stars = 1;
  if (hits === 0 && timeFrac > 0.5) stars = 3;
  else if (hits <= 2 && timeFrac > 0.18) stars = 2;
  return { points, stars };
}

/* ── progress persistence (client-only, no account sync) ── */
const PROGRESS_KEY = 'infostride-car-parking-progress';
function loadProgress() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || 'null');
    if (raw && typeof raw.unlocked === 'number' && raw.results) return raw;
  } catch { /* ignore */ }
  return { unlocked: 1, results: {} };
}
function saveProgress(p) {
  try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function themeToken(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const KEYS = {
  throttle: ['ArrowUp', 'w', 'W'],
  brake: ['ArrowDown', 's', 'S'],
  left: ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
};

/** A top-down, 50-level car-parking arcade — park within the highlighted
 *  spot before the timer runs out, with as few wall/car touches as
 *  possible. Levels are generated parametrically (generateLevel above) in
 *  4 difficulty tiers; completing a level unlocks the next, and progress
 *  (unlocked levels + best stars/points per level) persists in
 *  localStorage. Canvas drawn in a fixed virtual space and scaled to its
 *  container, same pattern as CarDrift, so GamesWidget's full-screen
 *  toggle actually gives it more room. */
export function CarParking() {
  const canvasRef = useRef(null);
  const boardWrapRef = useRef(null);
  const colorsRef = useRef(null);
  const carRef = useRef({ x: 0, y: 0, heading: 0, speed: 0, wasTouching: false });
  const levelDataRef = useRef(null);
  const keysRef = useRef(new Set());
  const touchRef = useRef({ throttle: false, brake: false, left: false, right: false });
  const timeLeftRef = useRef(0);
  const hitsRef = useRef(0);
  const parkedForRef = useRef(0);

  const [screen, setScreen] = useState('select'); // select | countdown | playing | result
  const [levelNum, setLevelNum] = useState(1);
  const [progress, setProgress] = useState(loadProgress);
  const [countdownStage, setCountdownStage] = useState(0);
  const [hud, setHud] = useState({ time: 0, hits: 0 });
  const [result, setResult] = useState(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  }, []);

  function readColors() {
    colorsRef.current = {
      ground: themeToken('--panel-2', '#1a2130'),
      lot: themeToken('--panel-3', '#222b3c'),
      wall: themeToken('--border-strong', '#33405a'),
      line: themeToken('--border-soft', '#1e2532'),
      spot: themeToken('--success', '#34d399'),
      car: themeToken('--accent', '#818cf8'),
      carDark: themeToken('--accent-2', '#6366f1'),
      obstacle: themeToken('--muted', '#8a93a6'),
      mover: themeToken('--danger', '#fb7185'),
      text: themeToken('--text', '#e9edf6'),
    };
  }

  useEffect(() => {
    readColors();
    const obs = new MutationObserver(readColors);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    function down(e) {
      if ([...KEYS.throttle, ...KEYS.brake, ...KEYS.left, ...KEYS.right].includes(e.key)) e.preventDefault();
      keysRef.current.add(e.key);
    }
    function up(e) { keysRef.current.delete(e.key); }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useLayoutEffect(() => {
    const wrap = boardWrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    function resize() {
      const rect = wrap.getBoundingClientRect();
      const aspect = VIRTUAL_W / VIRTUAL_H;
      let dispW = rect.width || VIRTUAL_W;
      let dispH = dispW / aspect;
      if (rect.height > 0 && dispH > rect.height) { dispH = rect.height; dispW = dispH * aspect; }
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${dispW}px`;
      canvas.style.height = `${dispH}px`;
      canvas.width = Math.max(1, Math.round(dispW * dpr));
      canvas.height = Math.max(1, Math.round(dispH * dpr));
      if (screen !== 'playing' && colorsRef.current && levelDataRef.current) draw();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    window.addEventListener('resize', resize);
    return () => { ro.disconnect(); window.removeEventListener('resize', resize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function startLevel(n) {
    const data = generateLevel(n);
    levelDataRef.current = data;
    carRef.current = { x: data.start.x, y: data.start.y, heading: data.start.heading, speed: 0, wasTouching: false };
    timeLeftRef.current = data.timeLimit;
    hitsRef.current = 0;
    parkedForRef.current = 0;
    setLevelNum(n);
    setResult(null);
    setHud({ time: data.timeLimit, hits: 0 });
    draw();

    setScreen('countdown');
    let stage = 1;
    setCountdownStage(1);
    const tick = () => {
      stage += 1;
      if (stage <= 3) { setCountdownStage(stage); setTimeout(tick, 480); } else {
        setCountdownStage(4);
        setTimeout(() => { setCountdownStage(0); setScreen('playing'); }, 420);
      }
    };
    setTimeout(tick, 480);
  }

  function finishLevel(success) {
    const data = levelDataRef.current;
    if (success) {
      const { points, stars } = scoreRun(data.tier, data.timeLimit, timeLeftRef.current, hitsRef.current);
      setResult({ success: true, points, stars, hits: hitsRef.current, timeUsed: data.timeLimit - timeLeftRef.current });
      setProgress((prev) => {
        const next = { unlocked: Math.max(prev.unlocked, Math.min(TOTAL_LEVELS, levelNum + 1)), results: { ...prev.results } };
        const existing = next.results[levelNum];
        if (!existing || stars > existing.stars || (stars === existing.stars && points > existing.points)) {
          next.results[levelNum] = { stars, points };
        }
        saveProgress(next);
        return next;
      });
    } else {
      setResult({ success: false, hits: hitsRef.current });
    }
    setScreen('result');
  }

  useEffect(() => {
    if (screen !== 'playing') return undefined;
    let raf; let last = performance.now(); let hudTimer = 0;
    const keys = keysRef.current;
    function held(list) { return list.some((k) => keys.has(k)) || null; }

    function step(now) {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const data = levelDataRef.current;
      const car = carRef.current;
      const touch = touchRef.current;

      const input = {
        throttle: Boolean(held(KEYS.throttle)) || touch.throttle,
        brake: Boolean(held(KEYS.brake)) || touch.brake,
        steer: ((held(KEYS.left) || touch.left) ? -1 : 0) + ((held(KEYS.right) || touch.right) ? 1 : 0),
      };
      stepCarPhysics(car, input, dt);
      data.movers.forEach((m) => stepMover(m, dt));

      const solids = [...wallsFor(LOT), ...data.obstacles, ...data.movers.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, angle: m.angle }))];
      if (resolveCollisions(car, solids)) hitsRef.current += 1;

      if (isParked(car, data.spot)) parkedForRef.current += dt; else parkedForRef.current = 0;

      timeLeftRef.current = Math.max(0, timeLeftRef.current - dt);

      draw();

      hudTimer += dt;
      if (hudTimer > 0.1) { hudTimer = 0; setHud({ time: timeLeftRef.current, hits: hitsRef.current }); }

      if (parkedForRef.current > 0.5) { finishLevel(true); return; }
      if (timeLeftRef.current <= 0) { finishLevel(false); return; }

      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  function draw() {
    const canvas = canvasRef.current;
    const c = colorsRef.current;
    const data = levelDataRef.current;
    if (!canvas || !c || !data) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(canvas.width / VIRTUAL_W, 0, 0, canvas.height / VIRTUAL_H, 0, 0);
    ctx.fillStyle = c.ground;
    ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

    ctx.fillStyle = c.lot;
    ctx.fillRect(LOT.x, LOT.y, LOT.w, LOT.h);
    ctx.strokeStyle = c.wall;
    ctx.lineWidth = 6;
    ctx.strokeRect(LOT.x, LOT.y, LOT.w, LOT.h);

    drawRect(ctx, data.spot, 'none', c.spot, 2.4, true);
    ctx.save();
    ctx.translate(data.spot.x, data.spot.y);
    ctx.rotate(data.spot.angle);
    ctx.fillStyle = c.spot;
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillText('P', 0, 0);
    ctx.restore();

    data.obstacles.forEach((o) => drawCar(ctx, o, c.obstacle, c.wall));
    data.movers.forEach((m) => drawCar(ctx, m, c.mover, c.wall));
    drawCar(ctx, carRect(carRef.current), c.car, c.carDark, carRef.current.heading);
  }

  function drawRect(ctx, r, fill, stroke, lineWidth, dashed) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    if (dashed) ctx.setLineDash([5, 4]);
    if (fill !== 'none') { ctx.fillStyle = fill; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h); }
    ctx.restore();
  }

  function drawCar(ctx, r, color, dark, heading) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    ctx.fillStyle = color;
    const rx = Math.min(3, r.h / 3);
    roundRect(ctx, -r.w / 2, -r.h / 2, r.w, r.h, rx);
    ctx.fill();
    if (heading != null) {
      ctx.fillStyle = dark;
      roundRect(ctx, r.w / 2 - r.w * 0.32, -r.h / 2 + 1.5, r.w * 0.22, r.h - 3, 1.5);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function touchDown(key) { touchRef.current[key] = true; }
  function touchUp(key) { touchRef.current[key] = false; }

  const timeFrac = levelDataRef.current ? hud.time / levelDataRef.current.timeLimit : 1;

  return (
    <div className={styles.wrap}>
      {screen === 'playing' && (
        <div className={styles.hud}>
          <span>Level <strong>{levelNum}</strong></span>
          <span className={styles.timerWrap}>
            <span className={styles.timerBarTrack}><span className={styles.timerBarFill} style={{ width: `${Math.max(0, timeFrac) * 100}%`, background: timeFrac < 0.25 ? 'var(--danger)' : 'var(--accent)' }} /></span>
            {hud.time.toFixed(1)}s
          </span>
          <span>Hits <strong>{hud.hits}</strong></span>
          <button type="button" className={styles.quitBtn} onClick={() => setScreen('select')} aria-label="Quit to level select" title="Quit to level select">×</button>
        </div>
      )}

      <div className={styles.boardWrap} ref={boardWrapRef}>
        {screen !== 'select' && <canvas ref={canvasRef} className={styles.canvas} />}

        {screen === 'countdown' && (
          <div className={styles.lightsWrap}>
            <div className={styles.lights}>
              <span className={`${styles.light} ${countdownStage >= 1 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 2 ? styles.lightRed : ''}`} />
              <span className={`${styles.light} ${countdownStage >= 3 ? styles.lightRed : ''}`} />
            </div>
            {countdownStage >= 4 && <div className={styles.goText}>GO!</div>}
          </div>
        )}

        {screen === 'playing' && isTouch && (
          <div className={styles.touchControls} aria-hidden="true">
            <div className={styles.touchCol}>
              <button type="button" className={styles.touchBtn} onPointerDown={() => touchDown('throttle')} onPointerUp={() => touchUp('throttle')} onPointerLeave={() => touchUp('throttle')}>▲</button>
              <button type="button" className={styles.touchBtn} onPointerDown={() => touchDown('brake')} onPointerUp={() => touchUp('brake')} onPointerLeave={() => touchUp('brake')}>▼</button>
            </div>
            <div className={styles.touchCol}>
              <button type="button" className={styles.touchBtn} onPointerDown={() => touchDown('left')} onPointerUp={() => touchUp('left')} onPointerLeave={() => touchUp('left')}>◀</button>
              <button type="button" className={styles.touchBtn} onPointerDown={() => touchDown('right')} onPointerUp={() => touchUp('right')} onPointerLeave={() => touchUp('right')}>▶</button>
            </div>
          </div>
        )}

        {screen === 'result' && result && (
          <div className={styles.overlay}>
            {result.success ? (
              <>
                <h3 className={styles.resultTitle}>Parked!</h3>
                <div className={styles.starsRow}>
                  {[1, 2, 3].map((i) => <span key={i} className={i <= result.stars ? styles.starOn : styles.starOff}>★</span>)}
                </div>
                <p>{result.points} points · {result.hits} hit{result.hits === 1 ? '' : 's'} · {result.timeUsed.toFixed(1)}s</p>
                <div className={styles.resultBtns}>
                  {levelNum < TOTAL_LEVELS && <button type="button" className="btn btn-primary" onClick={() => startLevel(levelNum + 1)}>Next level</button>}
                  <button type="button" className="btn" onClick={() => startLevel(levelNum)}>Retry</button>
                  <button type="button" className="btn" onClick={() => setScreen('select')}>Level select</button>
                </div>
              </>
            ) : (
              <>
                <h3 className={styles.resultTitle}>Time's up</h3>
                <p>{result.hits} hit{result.hits === 1 ? '' : 's'} — give it another go.</p>
                <div className={styles.resultBtns}>
                  <button type="button" className="btn btn-primary" onClick={() => startLevel(levelNum)}>Retry</button>
                  <button type="button" className="btn" onClick={() => setScreen('select')}>Level select</button>
                </div>
              </>
            )}
          </div>
        )}

        {screen === 'select' && (
          <div className={styles.overlay}>
            <div className={styles.menuScroll}>
              <p className={styles.menuHint}>Arrows/WASD to drive — park in the green spot before time runs out</p>
              {TIERS.map((tier) => (
                <div key={tier.id} className={styles.tierSection}>
                  <div className={styles.tierHeader} style={{ color: tier.color }}>
                    <span className={styles.tierDot} style={{ background: tier.color }} />
                    {tier.name} <span className={styles.tierRange}>· Levels {tier.from}–{tier.to}</span>
                  </div>
                  <div className={styles.levelGrid}>
                    {Array.from({ length: tier.to - tier.from + 1 }, (_, i) => tier.from + i).map((n) => {
                      const locked = n > progress.unlocked;
                      const res = progress.results[n];
                      return (
                        <button
                          key={n}
                          type="button"
                          className={`${styles.levelBtn} ${locked ? styles.levelLocked : ''}`}
                          disabled={locked}
                          onClick={() => startLevel(n)}
                          style={!locked ? { borderColor: tier.color } : undefined}
                        >
                          {locked ? <span className={styles.lockIcon}>🔒</span> : <span className={styles.levelNum}>{n}</span>}
                          {res && (
                            <span className={styles.miniStars}>
                              {[1, 2, 3].map((i) => <span key={i} className={i <= res.stars ? styles.starOnTiny : styles.starOffTiny}>★</span>)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
