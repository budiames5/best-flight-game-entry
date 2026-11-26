// Meridian Run — game loop and flight model.
//
// The Swift takes off from Meridian Field, threads three rings over the
// valley, and puts down on the far strip before the tanks run dry. The
// model is arcade-simple on purpose: throttle sets speed, pitch sets
// climb, turning swings the heading, and the ground is always waiting.

import { CONFIG } from './config.js';
import { buildWorld } from './world.js';
import { createInput, hitButton } from './input.js';
import { render } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);

const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed')) || CONFIG.seedDefault;
const shot = params.get('shot');

const world = buildWorld(seed);

const state = {
  mode: 'title',
  seed,
  world,
  input,
  plane: {
    x: 140,
    alt: 0,
    speed: 0,
    pitch: 0,
    heading: 0,
    throttle: 0,
    fuel: 100,
    bank: 0,
  },
  score: 0,
  rings: [false, false, false],
  time: 0,
  message: '',
  messageT: 0,
  cam: { x: -80, y: -468 },
  camLocked: false,
  shotTime: null,
  crashReason: '',
  boost: false,
  airborne: false,
  everAirborne: false,
  best: 0,
};

try {
  state.best = Number(window.localStorage.getItem('meridian-run-best')) || 0;
} catch {
  state.best = 0;
}

function saveBest() {
  if (state.score <= state.best) return;
  state.best = state.score;
  try {
    window.localStorage.setItem('meridian-run-best', String(state.best));
  } catch {
    // Storage may be unavailable; the score still stands this session.
  }
}

// --- Sound, synthesized in code: no audio files, no network. ---
const audio = (() => {
  let ac = null;
  let engine = null;
  let engineGain = null;
  function ensure() {
    if (ac) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ac = new AC();
      engine = ac.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 55;
      engineGain = ac.createGain();
      engineGain.gain.value = 0;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ac.destination);
      engine.start();
    } catch {
      ac = null;
    }
  }
  function tone(freq, when, dur, vol) {
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, ac.currentTime + when);
    gain.gain.linearRampToValueAtTime(vol, ac.currentTime + when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + when + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(ac.currentTime + when);
    osc.stop(ac.currentTime + when + dur + 0.05);
  }
  return {
    ensure,
    setEngine(throttle, boost) {
      if (!ac || !engine) return;
      engine.frequency.value = 50 + throttle * 75 + (boost ? 35 : 0);
      engineGain.gain.value = state.mode === 'flying' ? throttle * 0.045 : 0;
    },
    chime() {
      tone(880, 0, 0.18, 0.16);
      tone(1318, 0.09, 0.28, 0.16);
    },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.3, 0.15));
    },
    thud() {
      if (!ac) return;
      const len = ac.sampleRate * 0.35;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const gain = ac.createGain();
      gain.gain.value = 0.4;
      src.connect(gain);
      gain.connect(ac.destination);
      src.start();
    },
  };
})();

window.addEventListener('keydown', () => audio.ensure());
canvas.addEventListener('mousedown', () => audio.ensure());

// Edge-triggered keys: pause, start, restart.
let pausePressed = false;
let enterPressed = false;
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyP') pausePressed = true;
  if (event.code === 'Enter') enterPressed = true;
});

function resetFlight() {
  const p = state.plane;
  p.x = 120;
  p.alt = 0;
  p.speed = 0;
  p.pitch = 0;
  p.heading = 0;
  p.throttle = 0.35;
  p.fuel = CONFIG.plane.fuelMax;
  p.bank = 0;
  state.score = 0;
  state.rings = [false, false, false];
  state.time = 0;
  state.message = 'TAKE OFF — THROTTLE UP';
  state.messageT = 4;
  state.crashReason = '';
  state.airborne = false;
  state.everAirborne = false;
  state.boost = false;
  state.camLocked = false;
  state.mode = 'flying';
}

function landPlane() {
  const p = state.plane;
  state.score += CONFIG.score.landing;
  if (state.rings.every(Boolean)) state.score += CONFIG.score.allRingsBonus;
  state.score += Math.round(p.fuel * CONFIG.score.fuelPerUnit);
  state.mode = 'landed';
  state.message = '';
  audio.jingle();
  saveBest();
}

function crashPlane(reason) {
  state.crashReason = reason;
  state.mode = 'crashed';
  state.message = '';
  audio.thud();
  saveBest();
}

function updateFlight(dt) {
  const p = state.plane;
  const cfg = CONFIG.plane;
  const ground = world.heightAt(p.x);

  // Throttle.
  if (input.anyDown(['KeyW'])) p.throttle = Math.min(1, p.throttle + 0.8 * dt);
  if (input.anyDown(['KeyS'])) p.throttle = Math.max(0, p.throttle - 0.8 * dt);

  // Mouse steering: hold to fly toward the pointer.
  if (input.mouse.down && state.mode === 'flying') {
    const planeScreenY = CONFIG.canvasHeight - (p.alt - state.cam.y) * CONFIG.viewScale;
    const planeScreenX = (p.x - state.cam.x) * CONFIG.viewScale;
    const targetPitch = Math.max(
      cfg.maxPitchDown,
      Math.min(cfg.maxPitchUp, (planeScreenY - input.mouse.y) / 320),
    );
    p.pitch += Math.max(-cfg.pitchRate * dt, Math.min(cfg.pitchRate * dt, targetPitch - p.pitch));
    if (input.mouse.x < planeScreenX - 90) p.heading += cfg.turnRate * dt;
    if (input.mouse.x > planeScreenX + 90) p.heading -= cfg.turnRate * dt;
  } else {
    if (input.anyDown(['ArrowUp', 'KeyI'])) p.pitch += cfg.pitchRate * dt;
    if (input.anyDown(['ArrowDown', 'KeyK'])) p.pitch -= cfg.pitchRate * dt;
    if (input.anyDown(['ArrowLeft', 'KeyJ'])) p.heading += cfg.turnRate * dt;
    if (input.anyDown(['ArrowRight', 'KeyL'])) p.heading -= cfg.turnRate * dt;
  }
  p.pitch = Math.max(cfg.maxPitchDown, Math.min(cfg.maxPitchUp, p.pitch));
  p.heading = Math.max(0, Math.min(Math.PI, p.heading));

  // Bank follows the turn for the picture.
  const turning =
    (input.anyDown(['ArrowLeft', 'KeyJ']) ? 1 : 0) -
    (input.anyDown(['ArrowRight', 'KeyL']) ? 1 : 0);
  p.bank += (turning * 0.5 - p.bank) * Math.min(1, 6 * dt);

  state.boost = input.isDown('Space') && p.fuel > 0;
  const targetSpeed = p.throttle * cfg.maxSpeed * (state.boost ? cfg.boostMult : 1);
  if (targetSpeed > p.speed) p.speed += cfg.accel * dt;
  else p.speed += (targetSpeed - p.speed) * cfg.decel * dt;
  if (p.speed < 0) p.speed = 0;

  // Fuel.
  if (p.fuel > 0) {
    p.fuel -= (p.throttle * cfg.fuelDrain + (state.boost ? cfg.boostDrain : 0)) * dt;
    if (p.fuel <= 0) {
      p.fuel = 0;
      p.throttle = 0;
    }
  }

  // Vertical speed: pitch lifts, a slow wing sinks.
  const sink = p.speed < cfg.stallSpeed ? (cfg.stallSpeed - p.speed) * 0.55 : 0;
  let vy = p.speed * Math.sin(p.pitch) - sink;
  const vx = p.speed * Math.cos(p.pitch) * Math.cos(p.heading);

  const wasAirborne = state.airborne;
  p.x += vx * dt;
  p.alt += vy * dt;
  if (p.x < 0) {
    p.x = 0;
    p.heading = 0;
  }
  if (p.x > CONFIG.worldLength) {
    p.x = CONFIG.worldLength;
    p.heading = Math.PI;
  }
  if (p.alt > ground + 5) {
    state.airborne = true;
    state.everAirborne = true;
  }

  // Rings.
  CONFIG.rings.forEach((ring, i) => {
    if (state.rings[i]) return;
    const dx = p.x - ring.x;
    const dy = p.alt - ring.y;
    if (dx * dx + dy * dy < ring.r * ring.r) {
      state.rings[i] = true;
      state.score += CONFIG.score.ring;
      state.message = `RING ${i + 1} CLEAR  +${CONFIG.score.ring}`;
      state.messageT = 2.5;
      audio.chime();
    }
  });

  // Ground contact.
  const nowGround = world.heightAt(p.x);
  if (p.alt <= nowGround) {
    p.alt = nowGround;
    const onRunway =
      (p.x >= CONFIG.runwayStart.x0 && p.x <= CONFIG.runwayStart.x1) ||
      (p.x >= CONFIG.runwayEnd.x0 && p.x <= CONFIG.runwayEnd.x1);
    // A gentle touchdown counts once the sortie has flown, even from a
    // shallow approach that never left the ground's edge this frame.
    const gentle =
      onRunway &&
      Math.abs(vy) <= CONFIG.landing.maxSink &&
      p.speed <= CONFIG.landing.maxSpeed &&
      Math.abs(p.pitch) <= CONFIG.landing.maxPitch;
    if (gentle && state.everAirborne) {
      landPlane();
    } else if (wasAirborne) {
      // A slam out of the air.
      if (onRunway && Math.abs(vy) > CONFIG.landing.maxSink) {
        crashPlane('Landing gear collapsed — you came down too hard.');
      } else if (onRunway) {
        crashPlane('Came in too hot for the strip.');
      } else {
        crashPlane('You clipped the ridge.');
      }
    } else if (state.everAirborne && p.speed > 170) {
      // Scraping along the ground at speed after having flown.
      crashPlane('You clipped the ridge.');
    } else if (!state.everAirborne && p.speed > 170) {
      // Never got airborne: ran off the strip.
      crashPlane('You ran off the strip into the rocks.');
    }
    // Otherwise the Swift is rolling on the ground and can lift off again.
  }

  state.time += dt;
  if (state.messageT > 0) state.messageT -= dt;
  audio.setEngine(p.throttle, state.boost);
}

function updateCamera(dt) {
  if (state.camLocked) return;
  const p = state.plane;
  const targetX = Math.max(-80, p.x - 400 / CONFIG.viewScale);
  const targetY = p.alt - (CONFIG.canvasHeight - 430) / CONFIG.viewScale;
  const k = Math.min(1, 3.5 * dt);
  state.cam.x += (targetX - state.cam.x) * k;
  state.cam.y += (targetY - state.cam.y) * k;
}

function update(dt) {
  if (pausePressed) {
    pausePressed = false;
    if (state.mode === 'flying') state.mode = 'paused';
    else if (state.mode === 'paused') state.mode = 'flying';
  }
  if (state.mode === 'title') {
    const click = input.consumeClick();
    if ((click && hitButton(click, CONFIG.buttons.fly)) || enterPressed) {
      enterPressed = false;
      resetFlight();
    }
    return;
  }
  if (state.mode === 'landed') {
    const click = input.consumeClick();
    if ((click && hitButton(click, CONFIG.buttons.again)) || enterPressed) {
      enterPressed = false;
      resetFlight();
    }
    return;
  }
  if (state.mode === 'crashed') {
    const click = input.consumeClick();
    if ((click && hitButton(click, CONFIG.buttons.retry)) || enterPressed) {
      enterPressed = false;
      resetFlight();
    }
    return;
  }
  if (state.mode === 'paused') return;
  enterPressed = false;
  updateFlight(dt);
  updateCamera(dt);
}

let last = performance.now();
function frame(nowMs) {
  const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
  last = nowMs;
  const now = state.shotTime ?? nowMs / 1000;
  if (state.shotTime === null) update(dt);
  render(ctx, state, now);
  requestAnimationFrame(frame);
}

if (shot) {
  applyShot(state, shot);
}
requestAnimationFrame(frame);
