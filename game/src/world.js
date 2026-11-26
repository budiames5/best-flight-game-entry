// Meridian Run — the valley.
//
// Builds the terrain, the river, the trees and the clouds from one seed,
// and answers the one question the flight model asks all the time: how
// high is the ground at this x?

import { CONFIG } from './config.js';
import { makeRandom } from './random.js';

const STEP = 320;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function buildWorld(seed) {
  const rng = makeRandom(seed);
  const { worldLength, runwayStart, runwayEnd } = CONFIG;

  // Control heights every STEP units: layered sines plus seeded noise,
  // so the valley reads as ridges and bowls rather than a flat line.
  const points = [];
  const phase1 = rng.range(0, Math.PI * 2);
  const phase2 = rng.range(0, Math.PI * 2);
  const phase3 = rng.range(0, Math.PI * 2);
  for (let x = 0; x <= worldLength + STEP; x += STEP) {
    let h =
      150 +
      130 * Math.sin(x / 900 + phase1) +
      90 * Math.sin(x / 420 + phase2) +
      55 * Math.sin(x / 190 + phase3) +
      rng.range(-25, 25);
    h = Math.max(30, Math.min(520, h));
    points.push({ x, h });
  }

  // Flatten both strips and blend the ground into them.
  function flatten(x0, x1) {
    for (const p of points) {
      if (p.x >= x0 - 260 && p.x <= x1 + 260) {
        const d = Math.min(
          Math.max(p.x - (x0 - 260), 0),
          Math.max(x1 + 260 - p.x, 0),
          260,
        );
        const blend = smoothstep(d / 260);
        p.h = p.h * blend;
      }
      if (p.x >= x0 && p.x <= x1) p.h = 0;
    }
  }
  flatten(runwayStart.x0, runwayStart.x1);
  flatten(runwayEnd.x0, runwayEnd.x1);

  function heightAt(x) {
    const clamped = Math.max(0, Math.min(worldLength, x));
    const i = Math.min(points.length - 2, Math.floor(clamped / STEP));
    const a = points[i];
    const b = points[i + 1];
    const t = smoothstep((clamped - a.x) / STEP);
    return a.h + (b.h - a.h) * t;
  }

  // Pines on the slopes, never on a strip or in the river valley.
  const trees = [];
  for (let i = 0; i < 110; i++) {
    const x = rng.range(420, worldLength - 420);
    const h = heightAt(x);
    if (h < 70 || h > 380) continue;
    if (x > 2350 && x < 3250) continue;
    trees.push({ x, y: h, s: rng.range(0.7, 1.4) });
  }

  // Clouds drift above the valley; their screen drift is a function of
  // time, so a fixed time renders a fixed sky.
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({
      x: rng.range(0, worldLength),
      y: rng.range(540, 680),
      s: rng.range(0.8, 1.9),
      v: rng.range(4, 11),
    });
  }

  // Distant ridges, drawn behind the terrain with parallax.
  const ridges = [0, 1].map((layer) => {
    const amp = layer === 0 ? 150 : 110;
    const base = layer === 0 ? 300 : 230;
    const ph = rng.range(0, Math.PI * 2);
    const pts = [];
    for (let x = 0; x <= worldLength + 640; x += 160) {
      pts.push({
        x,
        h: base + amp * Math.sin(x / 700 + ph + layer) + rng.range(-18, 18),
      });
    }
    return { pts, parallax: layer === 0 ? 0.35 : 0.55 };
  });

  return { seed, points, heightAt, trees, clouds, ridges };
}
