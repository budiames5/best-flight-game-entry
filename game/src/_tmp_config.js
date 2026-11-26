// Meridian Run — tuning and mission data.
//
// Every number the rest of the game reads lives here, so balancing the
// flight model or the mission is a config edit, never a code hunt.

export const CONFIG = {
  canvasWidth: 1280,
  canvasHeight: 720,
  // World units are metres. The valley runs east from the home strip.
  worldLength: 6400,
  seedDefault: 1,
  viewScale: 0.62,

  plane: {
    maxSpeed: 260,
    stallSpeed: 75,
    accel: 55,
    decel: 0.9,
    pitchRate: 0.85,
    maxPitchUp: 0.6,
    maxPitchDown: -0.45,
    turnRate: 1.05,
    fuelDrain: 0.55,
    boostMult: 1.5,
    boostDrain: 1.7,
    fuelMax: 100,
  },

  runwayStart: { x0: 0, x1: 380 },
  runwayEnd: { x0: 5900, x1: 6400 },

  // Three target rings on the way to the far strip.
  rings: [
    { x: 1500, y: 430, r: 75 },
    { x: 2900, y: 540, r: 75 },
    { x: 4400, y: 390, r: 75 },
  ],

  score: { ring: 250, landing: 500, allRingsBonus: 250, fuelPerUnit: 5 },

  landing: { maxSink: 14, maxSpeed: 160, maxPitch: 0.25 },

  // Screen-space buttons (canvas pixels), shared by render and input.
  buttons: {
    fly: { x: 490, y: 520, w: 300, h: 64, label: 'FLY' },
    again: { x: 490, y: 520, w: 300, h: 64, label: 'FLY AGAIN' },
    retry: { x: 490, y: 520, w: 300, h: 64, label: 'RETRY' },
  },
};
