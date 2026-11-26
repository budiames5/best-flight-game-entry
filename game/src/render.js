// Meridian Run — all drawing.
//
// One module owns every pixel: the dawn sky, the valley, the Swift, the
// instruments and the menus. It never touches state except to read it, so
// the flight model and the picture stay separate.

import { CONFIG } from './config.js';

const { canvasWidth: W, canvasHeight: H, viewScale: S } = CONFIG;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function toScreen(state, wx, wy) {
  return {
    x: (wx - state.cam.x) * S,
    y: H - (wy - state.cam.y) * S,
  };
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8, 14, 28, 0.72)';
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90, 200, 255, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function headingDegrees(heading) {
  return Math.round((90 - (heading * 180) / Math.PI + 360) % 360);
}

export function drawButton(ctx, button, label, hover) {
  const grad = ctx.createLinearGradient(0, button.y, 0, button.y + button.h);
  grad.addColorStop(0, hover ? '#ffb347' : '#e8825a');
  grad.addColorStop(1, hover ? '#e86a2a' : '#c65a2e');
  ctx.fillStyle = grad;
  rr(ctx, button.x, button.y, button.w, button.h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '700 30px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, button.x + button.w / 2, button.y + button.h / 2 + 1);
}

function drawSky(ctx, state, now) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#16244d');
  grad.addColorStop(0.55, '#4a5a8a');
  grad.addColorStop(0.82, '#e8825a');
  grad.addColorStop(1, '#f2a35e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Low sun, upper right.
  const sunX = W - 180;
  const sunY = 150;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
  glow.addColorStop(0, 'rgba(255, 214, 130, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 170, 90, 0.45)');
  glow.addColorStop(1, 'rgba(255, 170, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
  ctx.fillStyle = '#ffe6a8';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
  ctx.fill();

  // Clouds drift with time; a fixed time renders a fixed sky.
  for (const c of state.world.clouds) {
    const cx = ((c.x + now * c.v - state.cam.x * 0.85) * S) % (W + 320);
    const px = cx < -160 ? cx + W + 320 : cx;
    const py = H - (c.y - state.cam.y) * S * 0.9 - 40;
    if (py < -60 || py > H + 60) continue;
    ctx.fillStyle = 'rgba(255, 244, 230, 0.85)';
    for (const [ox, oy, r] of [
      [0, 0, 26],
      [30, -8, 32],
      [66, 2, 24],
      [34, 10, 28],
    ]) {
      ctx.beginPath();
      ctx.arc(px + ox * c.s, py + oy * c.s, r * c.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRidges(ctx, state) {
  const colors = ['rgba(74, 84, 130, 0.75)', 'rgba(96, 104, 148, 0.85)'];
  state.world.ridges.forEach((ridge, layer) => {
    const px0 = -state.cam.x * ridge.parallax * S;
    ctx.fillStyle = colors[layer];
    ctx.beginPath();
    ctx.moveTo(-10, H);
    for (const p of ridge.pts) {
      const sx = p.x * S + px0;
      if (sx < -200 || sx > W + 200) continue;
      const sy = H - (p.h - state.cam.y) * S * 0.9 - 60;
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(W + 10, H);
    ctx.closePath();
    ctx.fill();
  });
}

function drawTerrain(ctx, state) {
  const x0 = state.cam.x - 80;
  const x1 = state.cam.x + W / S + 80;
  const ground = ctx.createLinearGradient(0, 120, 0, H);
  ground.addColorStop(0, '#7a8a58');
  ground.addColorStop(0.45, '#4a7a3f');
  ground.addColorStop(1, '#2c4d2a');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo((x0 - state.cam.x) * S, H + 10);
  for (let x = x0; x <= x1; x += 12) {
    const p = toScreen(state, x, state.world.heightAt(x));
    ctx.lineTo(p.x, p.y);
  }
  ctx.lineTo((x1 - state.cam.x) * S, H + 10);
  ctx.closePath();
  ctx.fill();

  // Snow on the high peaks.
  ctx.fillStyle = 'rgba(232, 238, 242, 0.95)';
  for (let x = x0; x <= x1; x += 12) {
    const h = state.world.heightAt(x);
    if (h < 380) continue;
    const p = toScreen(state, x, h);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 16, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The river follows the valley floor between the ridges.
  ctx.strokeStyle = '#3f7fb8';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let started = false;
  for (let x = 2350; x <= 3250; x += 12) {
    const h = state.world.heightAt(x);
    if (h > 60) continue;
    const p = toScreen(state, x, h + 3);
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(180, 220, 245, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Pines on the slopes.
  for (const t of state.world.trees) {
    if (t.x < x0 || t.x > x1) continue;
    const p = toScreen(state, t.x, t.y);
    const s = t.s * S * 1.6;
    ctx.fillStyle = '#1f4d2a';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 26 * s);
    ctx.lineTo(p.x - 9 * s, p.y - 4 * s);
    ctx.lineTo(p.x + 9 * s, p.y - 4 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 34 * s);
    ctx.lineTo(p.x - 6 * s, p.y - 16 * s);
    ctx.lineTo(p.x + 6 * s, p.y - 16 * s);
    ctx.closePath();
    ctx.fill();
  }

  drawRunway(ctx, state, CONFIG.runwayStart, '09');
  drawRunway(ctx, state, CONFIG.runwayEnd, '27');
}

function drawRunway(ctx, state, runway, label) {
  const a = toScreen(state, runway.x0, 0);
  const b = toScreen(state, runway.x1, 0);
  const w = b.x - a.x;
  ctx.fillStyle = '#2c2f36';
  ctx.fillRect(a.x, a.y - 9, w, 10);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillRect(a.x, a.y - 10, w, 2);
  ctx.fillRect(a.x, a.y + 1, w, 2);
  // Centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (let x = runway.x0 + 30; x < runway.x1 - 20; x += 60) {
    const p = toScreen(state, x, 0);
    ctx.fillRect(p.x, a.y - 5, 26 * S, 2);
  }
  // Threshold bars.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  for (const tx of [runway.x0 + 8, runway.x1 - 26]) {
    const p = toScreen(state, tx, 0);
    ctx.fillRect(p.x, a.y - 8, 18 * S, 8);
  }
  const mid = toScreen(state, (runway.x0 + runway.x1) / 2, 0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = '700 13px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, mid.x, a.y - 13);
}

function drawRings(ctx, state, now) {
  CONFIG.rings.forEach((ring, i) => {
    const p = toScreen(state, ring.x, ring.y);
    const r = ring.r * S;
    if (p.x < -120 || p.x > W + 120) return;
    const passed = state.rings[i];
    const pulse = 1 + 0.06 * Math.sin(now * 3 + i);
    ctx.save();
    ctx.globalAlpha = passed ? 0.35 : 1;
    ctx.strokeStyle = passed ? '#7ddc7d' : '#ffc857';
    ctx.lineWidth = 7;
    ctx.shadowColor = passed ? '#7ddc7d' : '#ffb347';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * pulse - 6, 0, Math.PI * 2);
    ctx.stroke();
    // Chevrons pointing through the ring.
    ctx.fillStyle = passed ? '#7ddc7d' : '#ffc857';
    for (const [dx, dy] of [
      [-r * 0.55, 0],
      [0, -r * 0.55],
      [r * 0.55, 0],
      [0, r * 0.55],
    ]) {
      ctx.beginPath();
      ctx.moveTo(p.x + dx, p.y + dy - 8);
      ctx.lineTo(p.x + dx + 8, p.y + dy + 6);
      ctx.lineTo(p.x + dx - 8, p.y + dy + 6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (!passed && state.rings.slice(0, i).every(Boolean)) {
      ctx.fillStyle = '#ffe6a8';
      ctx.font = '700 15px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const dist = Math.max(0, Math.round(ring.x - state.plane.x));
      ctx.fillText(`RING ${i + 1} — ${dist}m`, p.x, p.y - r - 12);
    }
  });
}

function drawPlane(ctx, state, now) {
  const p = state.plane;
  const pos = toScreen(state, p.x, p.alt);
  const dir = Math.cos(p.heading) >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(-p.pitch + p.bank * 0.45);
  ctx.scale(dir, 1);
  const visual = 1.55;

  // Engine flame, flickering with throttle.
  if (p.throttle > 0.05 && state.mode === 'flying') {
    const flick = 1 + 0.25 * Math.sin(now * 31) * Math.random();
    const len = (16 + p.throttle * 30 * (state.boost ? 1.4 : 1)) * flick;
    const grad = ctx.createLinearGradient(-46 * visual, 0, (-46 - len) * visual, 0);
    grad.addColorStop(0, 'rgba(255, 220, 120, 0.95)');
    grad.addColorStop(0.5, 'rgba(255, 140, 40, 0.8)');
    grad.addColorStop(1, 'rgba(255, 80, 20, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-46 * visual, -5);
    ctx.lineTo((-46 - len) * visual, 0);
    ctx.lineTo(-46 * visual, 5);
    ctx.closePath();
    ctx.fill();
  }

  ctx.scale(visual, visual);
  // Delta wing.
  ctx.fillStyle = '#2e4a73';
  ctx.beginPath();
  ctx.moveTo(8, 3);
  ctx.lineTo(-26, 30);
  ctx.lineTo(-40, 30);
  ctx.lineTo(-12, 3);
  ctx.closePath();
  ctx.fill();
  // Tail fin.
  ctx.fillStyle = '#33507a';
  ctx.beginPath();
  ctx.moveTo(-32, -3);
  ctx.lineTo(-46, -26);
  ctx.lineTo(-38, -26);
  ctx.lineTo(-26, -3);
  ctx.closePath();
  ctx.fill();
  // Fuselage.
  const body = ctx.createLinearGradient(0, -10, 0, 10);
  body.addColorStop(0, '#eef3f9');
  body.addColorStop(0.5, '#b9c9dc');
  body.addColorStop(1, '#7d92ad');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(52, 0);
  ctx.quadraticCurveTo(30, -9, -8, -8);
  ctx.quadraticCurveTo(-38, -7, -50, -3);
  ctx.lineTo(-50, 3);
  ctx.quadraticCurveTo(-38, 7, -8, 8);
  ctx.quadraticCurveTo(30, 9, 52, 0);
  ctx.closePath();
  ctx.fill();
  // Cheatline.
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, 1);
  ctx.quadraticCurveTo(10, 4, -46, 2);
  ctx.stroke();
  // Canopy, lit.
  const glass = ctx.createLinearGradient(6, -14, 26, -2);
  glass.addColorStop(0, '#9fe8ff');
  glass.addColorStop(1, '#1b3a5c');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(14, -7, 15, 6.5, -0.12, 0, Math.PI * 2);
  ctx.fill();
  // Wingtip light.
  ctx.fillStyle = '#39ff88';
  ctx.beginPath();
  ctx.arc(-40, 28, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHud(ctx, state) {
  const p = state.plane;
  const mono = 'ui-monospace, Menlo, Consolas, monospace';

  // Top-left: flight data.
  panel(ctx, 16, 14, 300, 92);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7fb8d8';
  ctx.font = `600 12px ${mono}`;
  ctx.fillText('ALT', 30, 38);
  ctx.fillText('SPD', 30, 64);
  ctx.fillText('HDG', 30, 90);
  ctx.fillStyle = '#bfe9ff';
  ctx.font = `700 20px ${mono}`;
  ctx.fillText(`${Math.round(p.alt * 3.28)} ft`, 92, 40);
  ctx.fillText(`${Math.round(p.speed * 1.2)} kts`, 92, 66);
  ctx.fillText(`${String(headingDegrees(p.heading)).padStart(3, '0')}°`, 92, 92);

  // Compass tape, top centre.
  panel(ctx, 420, 14, 440, 40);
  const deg = headingDegrees(p.heading);
  ctx.save();
  ctx.beginPath();
  rr(ctx, 420, 14, 440, 40, 10);
  ctx.clip();
  ctx.fillStyle = '#bfe9ff';
  ctx.font = `700 15px ${mono}`;
  ctx.textAlign = 'center';
  for (let d = -60; d <= 60; d += 15) {
    const h = (deg + d + 360) % 360;
    const x = 640 + d * 3.1;
    const label =
      h === 0 ? 'N' : h === 90 ? 'E' : h === 180 ? 'S' : h === 270 ? 'W' : `${h}`;
    ctx.fillText(label, x, 34);
    ctx.fillRect(x - 0.5, 44, 1, 6);
  }
  ctx.fillStyle = '#ffc857';
  ctx.beginPath();
  ctx.moveTo(640, 16);
  ctx.lineTo(634, 26);
  ctx.lineTo(646, 26);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Top-right: score, rings, fuel.
  panel(ctx, 964, 14, 300, 92);
  ctx.fillStyle = '#7fb8d8';
  ctx.font = `600 12px ${mono}`;
  ctx.textAlign = 'left';
  ctx.fillText('SCORE', 978, 38);
  ctx.fillText('RINGS', 978, 64);
  ctx.fillText('FUEL', 978, 90);
  ctx.fillStyle = '#bfe9ff';
  ctx.font = `700 20px ${mono}`;
  ctx.fillText(`${state.score}`, 1040, 40);
  CONFIG.rings.forEach((_, i) => {
    ctx.beginPath();
    ctx.arc(1046 + i * 26, 60, 8, 0, Math.PI * 2);
    ctx.fillStyle = state.rings[i] ? '#7ddc7d' : 'rgba(255, 255, 255, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#ffc857';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  const fuelW = 150;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  rr(ctx, 1040, 80, fuelW, 12, 6);
  ctx.fill();
  ctx.fillStyle = p.fuel < 25 ? '#ff5a4e' : '#39d98a';
  if (fuelW * (p.fuel / 100) > 4) {
    rr(ctx, 1040, 80, fuelW * (p.fuel / 100), 12, 6);
    ctx.fill();
  }

  // Throttle bar, bottom left.
  ctx.fillStyle = 'rgba(8, 14, 28, 0.72)';
  rr(ctx, 16, 640, 190, 56, 10);
  ctx.fill();
  ctx.fillStyle = '#7fb8d8';
  ctx.font = `600 12px ${mono}`;
  ctx.fillText('THR', 30, 662);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  rr(ctx, 30, 670, 150, 10, 5);
  ctx.fill();
  ctx.fillStyle = '#ffc857';
  rr(ctx, 30, 670, Math.max(4, 150 * p.throttle), 10, 5);
  ctx.fill();

  drawAttitude(ctx, state);

  // Warnings.
  ctx.textAlign = 'center';
  ctx.font = `700 22px ${mono}`;
  if (state.mode === 'flying' && p.fuel < 25 && p.fuel > 0) {
    ctx.fillStyle = Math.sin(Date.now() / 180) > 0 ? '#ff5a4e' : '#ffb3ad';
    ctx.fillText('FUEL LOW', W / 2, 130);
  }
  if (state.mode === 'flying' && p.speed < CONFIG.plane.stallSpeed && p.alt > 30) {
    ctx.fillStyle = '#ffb347';
    ctx.fillText('STALL — NOSE DOWN, THROTTLE UP', W / 2, 158);
  }

  // Centre message.
  if (state.message && state.messageT > 0) {
    ctx.fillStyle = '#ffe6a8';
    ctx.font = `700 26px ${mono}`;
    ctx.fillText(state.message, W / 2, 200);
  }

  // Controls hint early in the flight.
  if (state.mode === 'flying' && state.time < 12) {
    ctx.fillStyle = 'rgba(191, 233, 255, 0.85)';
    ctx.font = `600 14px ${mono}`;
    ctx.fillText('↑↓ pitch · ←→ turn · W/S throttle · SPACE boost · P pause', W / 2, H - 16);
  }
}

function drawAttitude(ctx, state) {
  const cx = 1180;
  const cy = 618;
  const r = 52;
  const p = state.plane;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#2f6db3';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.translate(cx, cy);
  ctx.rotate(p.bank * 0.5);
  ctx.translate(0, p.pitch * r * 1.6);
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(-r, 0, r * 2, r * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(90, 200, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffe6a8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy);
  ctx.lineTo(cx + 16, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
}

function drawTitle(ctx, state) {
  ctx.fillStyle = 'rgba(6, 10, 24, 0.5)';
  ctx.fillRect(0, 0, W, H);
  const mono = 'ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '800 68px ui-monospace, Menlo, Consolas, monospace';
  ctx.shadowColor = '#4db8ff';
  ctx.shadowBlur = 26;
  ctx.fillText('MERIDIAN RUN', W / 2, 190);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffc857';
  ctx.font = `600 21px ${mono}`;
  ctx.fillText('A valley flight — three rings, one far runway', W / 2, 232);
  ctx.fillStyle = '#bfe9ff';
  ctx.font = `600 17px ${mono}`;
  ctx.fillText('Take off from Meridian Field, thread the rings, and put her down', W / 2, 300);
  ctx.fillText('on the far strip before the tanks run dry.', W / 2, 326);
  ctx.fillStyle = '#8fb8d8';
  ctx.font = `600 15px ${mono}`;
  ctx.fillText('↑↓ pitch    ←→ turn    W/S throttle    SPACE boost    P pause', W / 2, 392);
  ctx.fillText('Mouse: hold to steer toward the pointer, click the buttons.', W / 2, 418);
  const hover =
    state.input.mouse.x >= CONFIG.buttons.fly.x &&
    state.input.mouse.x <= CONFIG.buttons.fly.x + CONFIG.buttons.fly.w &&
    state.input.mouse.y >= CONFIG.buttons.fly.y &&
    state.input.mouse.y <= CONFIG.buttons.fly.y + CONFIG.buttons.fly.h;
  drawButton(ctx, CONFIG.buttons.fly, 'FLY', hover);
  if (state.best > 0) {
    ctx.fillStyle = '#7ddc7d';
    ctx.font = `700 17px ${mono}`;
    ctx.fillText(`BEST SCORE ${state.best}`, W / 2, 620);
  }
}

function drawEndPanel(ctx, state, title, titleColor, lines, button) {
  ctx.fillStyle = 'rgba(6, 10, 24, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const mono = 'ui-monospace, Menlo, Consolas, monospace';
  panel(ctx, 340, 150, 600, 330);
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = '800 44px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(title, W / 2, 230);
  ctx.fillStyle = '#bfe9ff';
  ctx.font = `600 19px ${mono}`;
  lines.forEach((line, i) => ctx.fillText(line, W / 2, 286 + i * 34));
  const hover =
    state.input.mouse.x >= button.x &&
    state.input.mouse.x <= button.x + button.w &&
    state.input.mouse.y >= button.y &&
    state.input.mouse.y <= button.y + button.h;
  drawButton(ctx, button, button.label, hover);
}

export function render(ctx, state, now) {
  ctx.clearRect(0, 0, W, H);
  drawSky(ctx, state, now);
  drawRidges(ctx, state);
  drawTerrain(ctx, state);
  drawRings(ctx, state, now);
  drawPlane(ctx, state, now);
  if (state.mode === 'title') {
    drawTitle(ctx, state);
    return;
  }
  drawHud(ctx, state);
  if (state.mode === 'paused') {
    ctx.fillStyle = 'rgba(6, 10, 24, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#eaf6ff';
    ctx.font = '800 52px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, 350);
    ctx.fillStyle = '#bfe9ff';
    ctx.font = '600 19px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillText('Press P to resume', W / 2, 396);
    return;
  }
  if (state.mode === 'landed') {
    const fuelBonus = Math.round(state.plane.fuel * CONFIG.score.fuelPerUnit);
    const lines = [
      `Rings cleared ${state.rings.filter(Boolean).length} / 3`,
      `Landing +${CONFIG.score.landing}`,
      `Fuel bonus +${fuelBonus}`,
      '',
      `TOTAL SCORE  ${state.score}`,
    ];
    drawEndPanel(ctx, state, 'MISSION COMPLETE', '#7ddc7d', lines, CONFIG.buttons.again);
    return;
  }
  if (state.mode === 'crashed') {
    const lines = [
      state.crashReason,
      `Rings cleared ${state.rings.filter(Boolean).length} / 3`,
      '',
      `SCORE  ${state.score}`,
    ];
    drawEndPanel(ctx, state, 'CRASHED', '#ff5a4e', lines, CONFIG.buttons.retry);
  }
}
