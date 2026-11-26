// Meridian Run — deterministic screenshot scenes.
//
// ?shot=start|play|end&seed=N freezes the game in a scene the maker
// photographs: the title on the home strip, a ring ahead in flight, and
// the landing on the far strip. Every value is set outright, so the same
// seed always renders the same picture.

import { CONFIG } from './config.js';

function frameCamera(state) {
  const p = state.plane;
  state.cam.x = Math.max(-80, p.x - 400 / CONFIG.viewScale);
  state.cam.y = p.alt - (CONFIG.canvasHeight - 430) / CONFIG.viewScale;
}

export function applyShot(state, shot) {
  const p = state.plane;
  state.shotTime = 8.5;
  state.camLocked = true;
  state.message = '';
  state.messageT = 0;

  if (shot === 'start') {
    state.mode = 'title';
    p.x = 300;
    p.alt = 0;
    p.speed = 0;
    p.pitch = 0;
    p.heading = 0;
    p.throttle = 0;
    p.fuel = 100;
    p.bank = 0;
    state.score = 0;
    state.rings = [false, false, false];
    state.time = 0;
  } else if (shot === 'play') {
    state.mode = 'flying';
    p.x = 1180;
    p.alt = 440;
    p.speed = 190;
    p.pitch = 0.06;
    p.heading = 0;
    p.throttle = 0.72;
    p.fuel = 86;
    p.bank = 0;
    state.score = 0;
    state.rings = [false, false, false];
    state.time = 18;
    state.message = '';
    state.messageT = 0;
  } else if (shot === 'end') {
    state.mode = 'landed';
    p.x = 6120;
    p.alt = 0;
    p.speed = 0;
    p.pitch = 0;
    p.heading = 0;
    p.throttle = 0;
    p.fuel = 41;
    p.bank = 0;
    state.score = 1455;
    state.rings = [true, true, true];
    state.time = 96;
  } else {
    state.shotTime = null;
    state.camLocked = false;
    return false;
  }
  frameCamera(state);
  if (shot === 'end') {
    // Frame the parked Swift left of the results panel, not behind it.
    state.cam.x = p.x - 180 / CONFIG.viewScale;
  }
  return true;
}
