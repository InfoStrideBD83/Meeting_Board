// Pure, framework-free drift/race physics + track geometry shared by the
// solo CarDrift.jsx and the online race lobby RaceLobby.jsx, the same
// way Chess.jsx's engine functions are shared by OnlineChess.jsx. Nothing
// here touches the DOM except canvas 2D drawing in drawScene (no React, no
// localStorage) so both callers can reuse it without duplicating physics.

const ENGINE_FORCE = 260;
const BRAKE_FORCE = 340;
const MAX_SPEED = 430;
const ROLL_DRAG = 0.6;
const GRIP_NORMAL = 9;
const GRIP_DRIFT = 1.1;
const BASE_TURN_RATE = 2.9;
const DRIFT_THRESHOLD = 70;
const SMOKE_THRESHOLD = 150;
const SKID_LIFETIME = 6.5;
const AI_BASE_SPEED = 225;
const PENALTY_BASELINE = 1000;
const WALL_PENALTY = 15;
const AI_HIT_PENALTY = 40;
const PENALTY_COOLDOWN = 0.5;
const WALL_TOLERANCE = 6;

export const CAR_LEN = 17;
export const CAR_W = 9.5;
export const RACE_LAPS = 3;
// An online Drift-mode time trial has no natural end (solo Drift Mode is
// open-ended freestyle) — capped at 45s so two racers' drift scores are a
// fair, comparable contest instead of "whoever played longest wins".
export const DRIFT_TIME_LIMIT = 45;

export const CARS = [
  { id: 'falcon', name: 'Falcon', sub: 'Balanced all-rounder', colors: { car: '#818cf8', carDark: '#6366f1' }, stats: { topSpeed: 1.0, accel: 1.0, grip: 1.0 } },
  { id: 'viper', name: 'Viper', sub: 'Fast but slippery — big drift scores', colors: { car: '#fb7185', carDark: '#e11d48' }, stats: { topSpeed: 1.15, accel: 0.9, grip: 0.85 } },
  { id: 'bulldog', name: 'Bulldog', sub: 'High grip — easiest to control', colors: { car: '#34d399', carDark: '#059669' }, stats: { topSpeed: 0.85, accel: 1.05, grip: 1.2 } },
  { id: 'comet', name: 'Comet', sub: 'Explosive acceleration, loose rear', colors: { car: '#fbbf24', carDark: '#d97706' }, stats: { topSpeed: 1.0, accel: 1.25, grip: 0.8 } },
];

export const PACES = [
  { id: 'easy', label: 'Easy', aiSpeed: 0.8 },
  { id: 'normal', label: 'Normal', aiSpeed: 1.0 },
  { id: 'fast', label: 'Fast', aiSpeed: 1.22 },
];

function svgPath(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
}

// Builds the generalized "closed waypoint loop" every track is represented
// as: N sampled centerline points plus their tangent/normal, an offset
// outer/inner boundary (for fill + collision), cumulative arc length (so AI
// pace can be expressed as px/s rather than rad/s, which stays correct
// whatever shape the loop is), and a ring of scenery just outside the track.
function buildTrack(def) {
  const N = 180;
  const points = [];
  for (let i = 0; i < N; i++) points.push(def.point((i / N) * Math.PI * 2));

  const tangents = [];
  const normals = [];
  for (let i = 0; i < N; i++) {
    const p0 = points[(i - 1 + N) % N];
    const p1 = points[(i + 1) % N];
    const dx = p1.x - p0.x; const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    tangents.push({ heading: Math.atan2(dy, dx) });
    normals.push({ x: dy / len, y: -dx / len });
  }

  let length = 0;
  for (let i = 0; i < N; i++) {
    const p0 = points[i]; const p1 = points[(i + 1) % N];
    length += Math.hypot(p1.x - p0.x, p1.y - p0.y);
  }

  const halfWidth = def.halfWidth;
  const outerPoints = points.map((p, i) => ({ x: p.x + normals[i].x * halfWidth, y: p.y + normals[i].y * halfWidth }));
  const innerPoints = points.map((p, i) => ({ x: p.x - normals[i].x * halfWidth, y: p.y - normals[i].y * halfWidth }));

  const scenery = [];
  for (let i = 0; i < N; i += 9) {
    const out = halfWidth + 14 + (i % 27 === 0 ? 6 : 0);
    scenery.push({ x: points[i].x + normals[i].x * out, y: points[i].y + normals[i].y * out, size: 5 + (i % 3) * 2 });
  }

  return {
    id: def.id, name: def.name, sub: def.sub,
    points, tangents, normals, length, halfWidth, outerPoints, innerPoints, scenery,
    previewPath: svgPath(outerPoints), previewInnerPath: svgPath(innerPoints),
  };
}

const RAW_TRACKS = [
  {
    id: 'oval', name: 'Oval Speedway', sub: 'The classic loop', halfWidth: 30,
    point: (t) => ({ x: 120 * Math.cos(t), y: 74 * Math.sin(t) }),
  },
  {
    id: 'figure8', name: 'Figure-8 Circuit', sub: 'A crossing circuit — watch your line', halfWidth: 26,
    point: (t) => ({ x: 118 * Math.sin(2 * t), y: 72 * Math.sin(t) }),
  },
  {
    id: 'serpentine', name: 'Serpentine', sub: 'S-curves reward a controlled drift', halfWidth: 26,
    point: (t) => {
      const a = 118; const b = 72;
      const x = a * Math.cos(t); const y = b * Math.sin(t);
      const dx = -a * Math.sin(t); const dy = b * Math.cos(t);
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len; const ny = -dx / len;
      const wobble = 12 * Math.sin(3 * t);
      return { x: x + nx * wobble, y: y + ny * wobble };
    },
  },
];

export const TRACKS = RAW_TRACKS.map(buildTrack);
// Matches CarDrift.jsx's VIRTUAL_W/VIRTUAL_H — every track fits inside it,
// so a single fixed viewBox works for every thumbnail preview.
export const TRACK_PREVIEW_VIEWBOX = '-190 -130 380 260';

/** A point (and heading) at fractional progress t ([0,1), wraps), optionally
 *  offset sideways along the track's normal — used both for the finish line
 *  (t=0) and to place an AI racer on its own line through the track. */
function pointAtT(track, t, lateral = 0) {
  const N = track.points.length;
  const tt = ((t % 1) + 1) % 1;
  const idx = tt * N;
  const i0 = Math.floor(idx) % N;
  const i1 = (i0 + 1) % N;
  const frac = idx - Math.floor(idx);
  const p0 = track.points[i0]; const p1 = track.points[i1];
  const n0 = track.normals[i0];
  return {
    x: p0.x + (p1.x - p0.x) * frac + n0.x * lateral,
    y: p0.y + (p1.y - p0.y) * frac + n0.y * lateral,
    heading: track.tangents[i0].heading,
  };
}

function nearestIndex(track, x, y) {
  let best = 0; let bestD = Infinity;
  for (let i = 0; i < track.points.length; i++) {
    const p = track.points[i];
    const dx = x - p.x; const dy = y - p.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { idx: best, dist: Math.sqrt(bestD) };
}

function wheelPoints(car) {
  const rearX = car.x - Math.cos(car.heading) * (CAR_LEN / 2);
  const rearY = car.y - Math.sin(car.heading) * (CAR_LEN / 2);
  const perp = CAR_W / 2.2;
  return {
    left: { x: rearX - Math.sin(car.heading) * perp, y: rearY + Math.cos(car.heading) * perp },
    right: { x: rearX + Math.sin(car.heading) * perp, y: rearY - Math.cos(car.heading) * perp },
  };
}

export function ordinal(n) { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`; }

export function freshCar(track) {
  const p = pointAtT(track, 0);
  return {
    x: p.x, y: p.y, heading: p.heading, vf: 0, vl: 0,
    totalProgress: 0, lastIdx: undefined, lap: 0,
    driftScore: 0, driftCombo: 0, skidL: [], skidR: [], smoke: [], smokeTimer: 0, shake: 0,
    penalty: 0, _wallCd: 0, _aiCd: 0,
    // Purely visual, additive to the physics/lap state above: a brief
    // checkered-flash pulse + confetti burst fired whenever a lap completes
    // (see stepCar's justLapped handling) and rendered in drawScene.
    finishFlash: 0, confetti: [],
  };
}

/** A clean-driving score: starts at PENALTY_BASELINE and loses points for
 *  wall contact and (Race Mode) clipping an AI car — the "points system" the
 *  racing lobby's scorecard ranks Drift Mode by (there's no lap time there
 *  to rank by) and shows as a secondary stat in Race Mode (ranked by time).
 *  Each penalty type has its own short cooldown so scraping a wall for a
 *  full second deducts once, not a tick every frame. */
export function netScore(car) { return PENALTY_BASELINE - car.penalty; }

/** Call once per frame, after stepCar/stepAI, from whichever screen is
 *  driving the race (solo CarDrift.jsx or the race-lobby online screen) —
 *  kept separate from stepCar itself since it needs the AI list too, and
 *  solo Drift Mode (no AI list) still wants the wall-penalty half of it. */
export function stepPenalties(car, aiList, track, dt) {
  car._wallCd = Math.max(0, car._wallCd - dt);
  car._aiCd = Math.max(0, car._aiCd - dt);
  const events = [];

  const near = nearestIndex(track, car.x, car.y);
  if (near.dist > track.halfWidth + WALL_TOLERANCE && car._wallCd <= 0) {
    car.penalty += WALL_PENALTY;
    car._wallCd = PENALTY_COOLDOWN;
    events.push({ type: 'wall', points: WALL_PENALTY });
  }

  if (aiList && aiList.length && car._aiCd <= 0) {
    const hitRadius = (CAR_LEN + CAR_W) / 2 * 0.65;
    for (const ai of aiList) {
      const p = pointAtT(track, ai.t, ai.laneOffset);
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < hitRadius) {
        car.penalty += AI_HIT_PENALTY;
        car._aiCd = PENALTY_COOLDOWN;
        // A little knockback so a collision actually reads as one, not just
        // an invisible point deduction.
        const away = Math.atan2(car.y - p.y, car.x - p.x);
        car.vf *= 0.6;
        car.vl += Math.sin(away - car.heading) * 80;
        events.push({ type: 'ai', points: AI_HIT_PENALTY });
        break;
      }
    }
  }
  return events;
}

export function freshAI(track, index) {
  const startOffset = -0.02 * (index + 1);
  return {
    t: ((startOffset % 1) + 1) % 1,
    totalProgress: startOffset,
    speedFactor: 0.86 + Math.random() * 0.26,
    laneOffset: index === 0 ? -10 : 10,
  };
}

/** Advances one car one physics tick. `carDef` supplies the stat
 *  multipliers (topSpeed/accel/grip) that give each of the 4 cars a
 *  genuinely different feel, not just a different color. Mutates `car` in
 *  place (matches the original CarDrift step() style) and returns whether
 *  a lap was just completed, since lap-timing/best-lap bookkeeping differs
 *  between solo play (localStorage) and the online time trial (none). */
export function stepCar(car, input, dt, now, carDef, track) {
  const stats = carDef.stats;
  car._steerVisual = input.steer * 0.5;
  car._braking = input.brake;

  const speedNow = Math.hypot(car.vf, car.vl);
  const turnScale = Math.max(0.35, Math.min(1, speedNow / 90));
  car.heading += input.steer * BASE_TURN_RATE * turnScale * dt;

  if (input.throttle) car.vf += ENGINE_FORCE * stats.accel * dt;
  if (input.brake) car.vf -= BRAKE_FORCE * dt;
  car.vf -= car.vf * ROLL_DRAG * dt;
  const maxSpeed = MAX_SPEED * stats.topSpeed;
  car.vf = Math.max(-maxSpeed * 0.45, Math.min(maxSpeed, car.vf));

  const grip = input.handbrake ? GRIP_DRIFT : GRIP_NORMAL * stats.grip;
  car.vl -= car.vl * grip * dt;
  // Lower-grip cars (Viper/Comet) slide more under the same steering input;
  // Bulldog's high grip keeps it planted — this is what actually makes the
  // 4 cars feel different, not just their top speed/accel numbers.
  if (Math.abs(input.steer) > 0 && speedNow > 140) {
    car.vl += input.steer * 26 * dt * (input.handbrake ? 2.2 : 1) * (2 - stats.grip);
  }

  const near = nearestIndex(track, car.x, car.y);
  const onTrack = near.dist <= track.halfWidth ? 1 : Math.max(0.15, 1 - (near.dist - track.halfWidth) / 26);
  car.vf *= 0.4 + 0.6 * onTrack;
  car.vl *= 0.5 + 0.5 * onTrack;
  const offTrackBump = onTrack < 1 ? (1 - onTrack) * 1.4 : 0;

  const vx = car.vf * Math.cos(car.heading) - car.vl * Math.sin(car.heading);
  const vy = car.vf * Math.sin(car.heading) + car.vl * Math.cos(car.heading);
  car.x += vx * dt;
  car.y += vy * dt;

  // Lap counting tracks cumulative progress around the waypoint loop (index
  // delta, not a spatial angle) rather than a one-shot "crossed the line"
  // flag — crucial for a self-crossing shape like Figure-8, where a car's
  // on-screen angle from the center repeats twice per lap and can't tell
  // laps apart on its own.
  let justLapped = false;
  if (car.lastIdx !== undefined) {
    const N = track.points.length;
    let delta = near.idx - car.lastIdx;
    if (delta > N / 2) delta -= N;
    if (delta < -N / 2) delta += N;
    car.totalProgress += delta / N;
  }
  car.lastIdx = near.idx;
  const lapsNow = Math.floor(Math.abs(car.totalProgress));
  if (lapsNow > car.lap) { car.lap = lapsNow; justLapped = true; }

  // Finish-line flourish — purely cosmetic: a checkered flash (drawn in
  // drawScene, decaying over ~1s) and a confetti puff, fired on every lap
  // completion (including the final, race-winning one). Doesn't touch lap
  // counting/scoring above, just reacts to it.
  if (justLapped) {
    car.finishFlash = 1;
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 30 + Math.random() * 90;
      car.confetti.push({
        x: car.x, y: car.y,
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 40,
        age: 0, life: 0.7 + Math.random() * 0.5,
        size: 2 + Math.random() * 2.2,
        spin: (Math.random() - 0.5) * 10,
        color: ['#fbbf24', '#f87171', '#60a5fa', '#34d399'][i % 4],
      });
    }
  } else {
    car.finishFlash = Math.max(0, car.finishFlash - dt);
  }
  car.confetti.forEach((p) => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 110 * dt; });
  car.confetti = car.confetti.filter((p) => p.age < p.life);
  if (car.confetti.length > 80) car.confetti.splice(0, car.confetti.length - 80);

  const slip = Math.abs(car.vl);
  const drifting = slip > DRIFT_THRESHOLD;
  car.driftCombo = drifting ? car.driftCombo + slip * dt * 0.08 : Math.max(0, car.driftCombo - dt * 60);
  if (drifting) {
    car.driftScore += slip * dt * 0.05;
    const { left, right } = wheelPoints(car);
    const a = Math.min(0.55, 0.25 + slip / 260);
    car.skidL.push({ x: left.x, y: left.y, t: now, a });
    car.skidR.push({ x: right.x, y: right.y, t: now, a });
  } else {
    car.skidL.push(null);
    car.skidR.push(null);
  }
  car.skidL = car.skidL.filter((p) => p === null || now - p.t < SKID_LIFETIME * 1000);
  car.skidR = car.skidR.filter((p) => p === null || now - p.t < SKID_LIFETIME * 1000);
  if (car.skidL.length > 900) car.skidL.splice(0, car.skidL.length - 900);
  if (car.skidR.length > 900) car.skidR.splice(0, car.skidR.length - 900);

  car.smokeTimer += dt;
  if (slip > SMOKE_THRESHOLD && car.smokeTimer > 0.045) {
    car.smokeTimer = 0;
    const { left, right } = wheelPoints(car);
    [left, right].forEach((p) => {
      car.smoke.push({
        x: p.x + (Math.random() - 0.5) * 4, y: p.y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14,
        size: 5 + Math.random() * 3, age: 0, life: 0.55 + Math.random() * 0.25,
      });
    });
  }
  car.smoke.forEach((p) => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 9; });
  car.smoke = car.smoke.filter((p) => p.age < p.life);
  if (car.smoke.length > 160) car.smoke.splice(0, car.smoke.length - 160);

  car.shake = Math.max(0, (slip - 230) / 90) + offTrackBump * (speedNow / 140);

  return { justLapped };
}

/** AI racers don't run the physics model at all — they progress along the
 *  track's arc length at a per-racer pace (the Pace setting's multiplier
 *  times a small per-racer random factor), on their own lane offset, which
 *  guarantees they stay on-track on any of the 3 shapes without needing a
 *  steering/grip model of their own. */
export function stepAI(ai, track, dt, paceMultiplier) {
  const speedPxPerSec = AI_BASE_SPEED * ai.speedFactor * paceMultiplier;
  const progressPerSec = speedPxPerSec / track.length;
  ai.t = ((ai.t + progressPerSec * dt) % 1 + 1) % 1;
  ai.totalProgress += progressPerSec * dt;
}

/** Renders one frame into a canvas already sized/transformed by the caller
 *  (context.setTransform to map the VIRTUAL_W x VIRTUAL_H space onto the
 *  actual canvas size) — shared by CarDrift.jsx and RaceLobby.jsx so
 *  the two can never visually drift apart. */
export function drawScene(context, { car, aiList, remoteList, track, carDef, colors, mode, now, virtualW, virtualH }) {
  const c = colors;
  const CX = virtualW / 2; const CY = virtualH / 2;
  context.clearRect(0, 0, virtualW, virtualH);
  context.fillStyle = c.grass;
  context.fillRect(0, 0, virtualW, virtualH);

  const speedNow = Math.hypot(car.vf, car.vl);
  if (speedNow > 220) {
    const t = Math.min(1, (speedNow - 220) / 200);
    context.strokeStyle = c.line;
    context.lineWidth = 1;
    context.globalAlpha = t * 0.5;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (now / 4000);
      const r1 = 150; const r2 = 150 + 18 + t * 10;
      context.beginPath();
      context.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1 * 0.72);
      context.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2 * 0.72);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  context.save();
  const shk = car.shake || 0;
  const sx = shk > 0.05 ? (Math.random() - 0.5) * shk * 2 : 0;
  const sy = shk > 0.05 ? (Math.random() - 0.5) * shk * 2 : 0;
  context.translate(CX + sx, CY + sy);

  track.scenery.forEach((t) => {
    context.fillStyle = c.treeDark;
    context.beginPath(); context.arc(t.x, t.y, t.size, 0, Math.PI * 2); context.fill();
    context.fillStyle = c.tree;
    context.beginPath(); context.arc(t.x - t.size * 0.3, t.y - t.size * 0.3, t.size * 0.65, 0, Math.PI * 2); context.fill();
  });

  context.fillStyle = c.track;
  context.beginPath();
  track.outerPoints.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
  context.closePath();
  track.innerPoints.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y)));
  context.closePath();
  context.fill('evenodd');

  context.strokeStyle = c.edge;
  context.lineWidth = 2;
  context.beginPath(); track.outerPoints.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y))); context.closePath(); context.stroke();
  context.beginPath(); track.innerPoints.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y))); context.closePath(); context.stroke();

  context.strokeStyle = c.line;
  context.setLineDash([6, 8]);
  context.beginPath(); track.points.forEach((p, i) => (i === 0 ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y))); context.closePath(); context.stroke();
  context.setLineDash([]);

  context.strokeStyle = c.finish;
  context.lineWidth = 3;
  const fin = pointAtT(track, 0);
  context.beginPath();
  context.moveTo(fin.x - Math.sin(fin.heading) * 14, fin.y + Math.cos(fin.heading) * 14);
  context.lineTo(fin.x + Math.sin(fin.heading) * 14, fin.y - Math.cos(fin.heading) * 14);
  context.stroke();

  context.strokeStyle = c.mark;
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  [car.skidL, car.skidR].forEach((skid) => {
    let open = false;
    for (let i = 0; i < skid.length; i++) {
      const p = skid[i];
      if (!p) { if (open) context.stroke(); open = false; continue; }
      const age = now - p.t;
      const alpha = p.a * Math.max(0, 1 - age / (SKID_LIFETIME * 1000));
      if (!open) { context.beginPath(); context.moveTo(p.x, p.y); open = true; context.globalAlpha = alpha; }
      else { context.globalAlpha = alpha; context.lineTo(p.x, p.y); }
    }
    if (open) context.stroke();
  });
  context.globalAlpha = 1;

  const sprite = getSmokeSprite();
  car.smoke.forEach((p) => {
    const t = p.age / p.life;
    context.globalAlpha = Math.max(0, 1 - t) * 0.8;
    const r = p.size * (0.6 + t * 0.8);
    context.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
  });
  context.globalAlpha = 1;

  // Finish-line confetti (world-space, see stepCar's justLapped handling) —
  // a brief celebratory puff, independent of the checkered screen flash
  // drawn at the very end of this function.
  car.confetti.forEach((p) => {
    const t = p.age / p.life;
    context.globalAlpha = Math.max(0, 1 - t);
    context.fillStyle = p.color;
    context.save();
    context.translate(p.x, p.y);
    context.rotate(p.age * p.spin);
    context.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    context.restore();
  });
  context.globalAlpha = 1;

  if (mode === 'race' && aiList && aiList.length) {
    aiList.forEach((ai, i) => {
      const p = pointAtT(track, ai.t, ai.laneOffset);
      context.save();
      context.translate(p.x, p.y);
      context.rotate(p.heading);
      drawHeadlightCone(context);
      context.fillStyle = i === 0 ? c.ai1 : c.ai2;
      roundRectPath(context, -CAR_LEN / 2, -CAR_W / 2, CAR_LEN, CAR_W, 3);
      context.fill();
      context.fillStyle = c.grassDark;
      roundRectPath(context, -CAR_LEN / 2 + CAR_LEN * 0.42, -CAR_W / 2 + 1.6, CAR_LEN * 0.3, CAR_W - 3.2, 1.5);
      context.fill();
      context.restore();
    });
  }

  // Real teammates in a Race Online lobby — each running their own physics
  // locally and broadcasting {x, y, heading} a few times a second (see
  // RaceLobby.jsx), not a shared simulation. Drawn in the color of whichever
  // car they actually picked, with a name tag, so they read as people, not
  // AI traffic.
  if (remoteList && remoteList.length) {
    remoteList.forEach((r) => {
      context.save();
      context.translate(r.x, r.y);
      context.rotate(r.heading);
      drawHeadlightCone(context);
      const grad = context.createLinearGradient(0, -CAR_W / 2, 0, CAR_W / 2);
      grad.addColorStop(0, r.colors.carDark);
      grad.addColorStop(0.5, r.colors.car);
      grad.addColorStop(1, r.colors.carDark);
      context.fillStyle = grad;
      roundRectPath(context, -CAR_LEN / 2, -CAR_W / 2, CAR_LEN, CAR_W, 3);
      context.fill();
      context.fillStyle = c.grassDark;
      roundRectPath(context, -CAR_LEN / 2 + CAR_LEN * 0.42, -CAR_W / 2 + 1.6, CAR_LEN * 0.3, CAR_W - 3.2, 1.5);
      context.fill();
      context.restore();

      context.save();
      context.translate(r.x, r.y - CAR_W - 3);
      context.font = '600 6px Inter, sans-serif';
      context.textAlign = 'center';
      context.fillStyle = 'rgba(0,0,0,.55)';
      context.fillText(r.name, 0.3, 0.3);
      context.fillStyle = '#fff';
      context.fillText(r.name, 0, 0);
      context.restore();
    });
  }

  context.save();
  context.translate(car.x, car.y);
  context.rotate(car.heading);
  drawHeadlightCone(context);
  const lean = Math.max(0, Math.min(0.16, Math.abs(car.vl) / 500));
  context.scale(1, 1 + lean);

  const steerVisual = car._steerVisual || 0;
  const wheelLen = 4.4; const wheelWid = 2;
  context.fillStyle = '#15181f';
  context.fillRect(-CAR_LEN / 2 + 1, -CAR_W / 2 - wheelWid / 2, wheelLen, wheelWid);
  context.fillRect(-CAR_LEN / 2 + 1, CAR_W / 2 - wheelWid / 2, wheelLen, wheelWid);
  [-1, 1].forEach((side) => {
    context.save();
    context.translate(CAR_LEN / 2 - wheelLen, side * CAR_W / 2);
    context.rotate(steerVisual);
    context.fillRect(-wheelLen / 2, -wheelWid / 2, wheelLen, wheelWid);
    context.restore();
  });

  const grad = context.createLinearGradient(0, -CAR_W / 2, 0, CAR_W / 2);
  grad.addColorStop(0, carDef.colors.carDark);
  grad.addColorStop(0.5, carDef.colors.car);
  grad.addColorStop(1, carDef.colors.carDark);
  context.fillStyle = grad;
  roundRectPath(context, -CAR_LEN / 2, -CAR_W / 2, CAR_LEN, CAR_W, 3);
  context.fill();

  context.fillStyle = c.grassDark;
  roundRectPath(context, -CAR_LEN / 2 + CAR_LEN * 0.42, -CAR_W / 2 + 1.6, CAR_LEN * 0.3, CAR_W - 3.2, 1.5);
  context.fill();

  context.fillStyle = '#ffe9a8';
  context.fillRect(CAR_LEN / 2 - 1.5, -CAR_W / 2 + 1, 1.5, 1.6);
  context.fillRect(CAR_LEN / 2 - 1.5, CAR_W / 2 - 2.6, 1.5, 1.6);

  context.fillStyle = car._braking ? c.brake : 'rgba(180,40,40,.55)';
  context.globalAlpha = car._braking ? 1 : 0.6;
  context.fillRect(-CAR_LEN / 2, -CAR_W / 2 + 1, 1.3, 1.6);
  context.fillRect(-CAR_LEN / 2, CAR_W / 2 - 2.6, 1.3, 1.6);
  context.globalAlpha = 1;

  context.restore();
  context.restore();

  // Ambient "near top speed" screen vignette — a subtle warm glow at the
  // viewport edges, screen-space (outside the shaken/translated world
  // transform above) so it reads as a HUD-level effect, not part of the
  // scene itself.
  const topSpeedForCar = MAX_SPEED * ((carDef && carDef.stats && carDef.stats.topSpeed) || 1);
  const boostRatio = Math.max(0, Math.min(1, (speedNow / topSpeedForCar - 0.82) / 0.18));
  drawSpeedVignette(context, boostRatio, virtualW, virtualH);

  // Finish-line checkered flash — brief, decays to 0 over ~1s via
  // car.finishFlash (set in stepCar).
  if (car.finishFlash > 0) drawFinishFlash(context, car.finishFlash, virtualW, virtualH);
}

// Headlight glow for any car — called with the canvas already translated to
// the car's position and rotated to its heading, so the cone always points
// in the direction of travel without any extra trig here. Purely additive
// lighting drawn before the car body, so the body still reads crisply on
// top of it.
function drawHeadlightCone(context) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  const beamR = 15;
  [-1, 1].forEach((side) => {
    context.save();
    context.translate(CAR_LEN / 2 - 1, side * (CAR_W / 2 - 1.3));
    context.scale(2.4, 1);
    const grad = context.createRadialGradient(0, 0, 0, 0, 0, beamR);
    grad.addColorStop(0, 'rgba(255,241,200,.32)');
    grad.addColorStop(1, 'rgba(255,241,200,0)');
    context.fillStyle = grad;
    context.beginPath();
    context.arc(0, 0, beamR, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  context.restore();
}

// Subtle radial warm-tint vignette at the viewport edges, strongest at near
// top speed (boostRatio -> 1), invisible otherwise.
function drawSpeedVignette(context, boostRatio, w, h) {
  if (boostRatio <= 0.003) return;
  context.save();
  const cx = w / 2; const cy = h / 2;
  const outerR = Math.hypot(cx, cy);
  const grad = context.createRadialGradient(cx, cy, outerR * 0.55, cx, cy, outerR);
  grad.addColorStop(0, 'rgba(255,110,60,0)');
  grad.addColorStop(1, `rgba(255,90,40,${(0.22 * boostRatio).toFixed(3)})`);
  context.fillStyle = grad;
  context.globalCompositeOperation = 'lighter';
  context.fillRect(0, 0, w, h);
  context.restore();
}

// Full-viewport checkered-flag flash, screen-space, fading out as
// car.finishFlash decays from 1 to 0 over ~1s.
function drawFinishFlash(context, amt, w, h) {
  const alpha = Math.max(0, Math.min(1, amt)) * 0.4;
  if (alpha <= 0.004) return;
  context.save();
  context.globalAlpha = alpha;
  const cell = 16;
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      context.fillStyle = (x + y) % 2 === 0 ? '#f5f5f5' : '#111318';
      context.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  context.restore();
}

// A soft radial blob rendered once and reused via drawImage for every smoke
// puff — a fresh gradient per particle per frame was the exact per-frame
// cost that made the branded cursor laggy earlier in this project.
let smokeSprite = null;
function getSmokeSprite() {
  if (smokeSprite) return smokeSprite;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(210,212,218,.85)');
  grad.addColorStop(0.55, 'rgba(190,192,198,.45)');
  grad.addColorStop(1, 'rgba(190,192,198,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  smokeSprite = c;
  return smokeSprite;
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}
