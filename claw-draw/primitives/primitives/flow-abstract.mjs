/**
 * Flow/abstract primitives: flowField, spiral, lissajous, strangeAttractor, spirograph.
 */

import { clamp, lerp, noise2d, makeStroke, splitIntoStrokes, samplePalette } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const METADATA = [
  {
    name: 'flowField', description: 'Perlin noise flow field particle traces', category: 'flow-abstract',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      width: { type: 'number' }, height: { type: 'number' }, noiseScale: { type: 'number' },
      density: { type: 'number' }, segmentLength: { type: 'number' },
      color: { type: 'string' }, brushSize: { type: 'number' },
      palette: { type: 'string' }, traceLength: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'spiral', description: 'Archimedean spiral', category: 'flow-abstract',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      turns: { type: 'number' }, startRadius: { type: 'number' }, endRadius: { type: 'number' },
      color: { type: 'string' }, brushSize: { type: 'number' }, opacity: { type: 'number' },
      pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'lissajous', description: 'Lissajous harmonic curves', category: 'flow-abstract',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      freqX: { type: 'number' }, freqY: { type: 'number' }, phase: { type: 'number' },
      amplitude: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      palette: { type: 'string' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'strangeAttractor', description: 'Strange attractor chaotic orbits (lorenz, aizawa, thomas)', category: 'flow-abstract',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      type: { type: 'string', description: 'lorenz|aizawa|thomas' },
      iterations: { type: 'number' }, scale: { type: 'number' },
      color: { type: 'string' }, brushSize: { type: 'number' },
      palette: { type: 'string' }, timeStep: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'spirograph', description: 'Spirograph (epitrochoid/hypotrochoid) geometric curves', category: 'flow-abstract',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      outerR: { type: 'number' }, innerR: { type: 'number' }, traceR: { type: 'number' },
      revolutions: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      palette: { type: 'string' }, startAngle: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function flowField(cx, cy, width, height, noiseScale, density, segmentLength, color, brushSize, palette, traceLength, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  width = clamp(Number(width) || 200, 20, 600);
  height = clamp(Number(height) || 200, 20, 600);
  noiseScale = clamp(Number(noiseScale) || 0.01, 0.001, 0.1);
  density = clamp(Number(density) || 0.5, 0.1, 1);
  segmentLength = clamp(Number(segmentLength) || 5, 1, 30);
  brushSize = clamp(Number(brushSize) || 2, 3, 100);

  traceLength = clamp(Math.round(Number(traceLength) || 40), 5, 200);
  const numParticles = Math.round(20 * density);
  const stepsPerParticle = traceLength;
  const result = [];

  for (let p = 0; p < numParticles; p++) {
    let x = cx + (Math.random() - 0.5) * width;
    let y = cy + (Math.random() - 0.5) * height;
    const pts = [{ x, y }];

    for (let s = 0; s < stepsPerParticle; s++) {
      const angle = noise2d(x * noiseScale, y * noiseScale) * Math.PI * 2;
      x += Math.cos(angle) * segmentLength;
      y += Math.sin(angle) * segmentLength;
      pts.push({ x, y });
      if (Math.abs(x - cx) > width * 0.6 || Math.abs(y - cy) > height * 0.6) break;
    }
    const c = palette ? samplePalette(palette, Math.random()) : color;
    if (pts.length > 2) result.push(makeStroke(pts, c, brushSize, 0.7, pressureStyle));
    if (result.length >= 200) break;
  }

  return result;
}

export function spiral(cx, cy, turns, startRadius, endRadius, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  turns = clamp(Number(turns) || 3, 0.5, 20);
  startRadius = clamp(Number(startRadius) || 5, 0, 500);
  endRadius = clamp(Number(endRadius) || 100, 1, 500);
  const steps = clamp(Math.round(turns * 30), 20, 2000);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = lerp(startRadius, endRadius, t);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return splitIntoStrokes(pts, color, brushSize, opacity, pressureStyle);
}

export function lissajous(cx, cy, freqX, freqY, phase, amplitude, color, brushSize, palette, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  freqX = clamp(Number(freqX) || 3, 1, 20);
  freqY = clamp(Number(freqY) || 2, 1, 20);
  phase = (Number(phase) || 0) * Math.PI / 180;
  amplitude = clamp(Number(amplitude) || 80, 10, 500);

  const steps = 200;
  const noiseSeed = Math.random() * 100;

  if (!palette) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const wobble = noise2d(i * 0.05 + noiseSeed, 0) * 0.1;
      pts.push({
        x: cx + Math.sin(freqX * t + phase + wobble) * amplitude,
        y: cy + Math.sin(freqY * t + wobble * 0.7) * amplitude,
      });
    }
    return splitIntoStrokes(pts, color, brushSize, 0.8, pressureStyle);
  }

  const segments = 12;
  const perSegment = Math.ceil(steps / segments) + 1;
  const strokes = [];
  for (let seg = 0; seg < segments; seg++) {
    const pts = [];
    const t0 = seg / segments;
    const c = samplePalette(palette, t0);
    for (let j = 0; j <= perSegment; j++) {
      const i = Math.min(seg * (steps / segments) + j, steps);
      const t = (i / steps) * Math.PI * 2;
      const wobble = noise2d(i * 0.05 + noiseSeed, 0) * 0.1;
      pts.push({
        x: cx + Math.sin(freqX * t + phase + wobble) * amplitude,
        y: cy + Math.sin(freqY * t + wobble * 0.7) * amplitude,
      });
    }
    if (pts.length > 1) strokes.push(makeStroke(pts, c, brushSize, 0.8, pressureStyle));
  }
  return strokes;
}

export function strangeAttractor(cx, cy, type, iterations, scale, color, brushSize, palette, timeStep, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  type = String(type || 'lorenz').toLowerCase();
  iterations = clamp(Math.round(Number(iterations) || 2000), 100, 5000);
  scale = clamp(Number(scale) || 5, 0.1, 50);
  brushSize = clamp(Number(brushSize) || 2, 3, 100);
  timeStep = clamp(Number(timeStep) || 0.005, 0.001, 0.02);

  let x = 0.1 + Math.random() * 0.05;
  let y = Math.random() * 0.05;
  let z = Math.random() * 0.05;
  const dt = timeStep;

  function step() {
    let dx, dy, dz;
    if (type === 'aizawa') {
      const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
      dx = (z - b) * x - d * y;
      dy = d * x + (z - b) * y;
      dz = c + a * z - z * z * z / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x;
    } else if (type === 'thomas') {
      const b = 0.208186;
      dx = Math.sin(y) - b * x;
      dy = Math.sin(z) - b * y;
      dz = Math.sin(x) - b * z;
    } else {
      const sigma = 10, rho = 28, beta = 8/3;
      dx = sigma * (y - x);
      dy = x * (rho - z) - y;
      dz = x * y - beta * z;
    }
    x += dx * dt; y += dy * dt; z += dz * dt;
  }

  if (!palette) {
    const pts = [];
    for (let i = 0; i < iterations; i++) {
      step();
      pts.push({ x: cx + x * scale, y: cy + y * scale });
    }
    return splitIntoStrokes(pts, color, brushSize, 0.7, pressureStyle);
  }

  const segments = 10;
  const perSegment = Math.floor(iterations / segments);
  const strokes = [];
  for (let seg = 0; seg < segments; seg++) {
    const pts = [];
    const t = seg / (segments - 1);
    for (let i = 0; i < perSegment; i++) {
      step();
      pts.push({ x: cx + x * scale, y: cy + y * scale });
    }
    if (pts.length > 1) strokes.push(makeStroke(pts, samplePalette(palette, t), brushSize, 0.7, pressureStyle));
  }
  return strokes;
}

export function spirograph(cx, cy, outerR, innerR, traceR, revolutions, color, brushSize, palette, startAngle, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  outerR = clamp(Number(outerR) || 100, 10, 500);
  innerR = clamp(Number(innerR) || 40, 5, 400);
  traceR = clamp(Number(traceR) || 30, 1, 400);
  revolutions = clamp(Number(revolutions) || 10, 1, 50);
  brushSize = clamp(Number(brushSize) || 2, 3, 100);
  startAngle = (Number(startAngle) || 0) * Math.PI / 180;

  const steps = revolutions * 100;
  const diff = outerR - innerR;

  if (!palette) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * revolutions * Math.PI * 2 + startAngle;
      const x = cx + diff * Math.cos(t) + traceR * Math.cos(t * diff / innerR);
      const y = cy + diff * Math.sin(t) - traceR * Math.sin(t * diff / innerR);
      pts.push({ x, y });
    }
    return splitIntoStrokes(pts, color, brushSize, 0.8, pressureStyle);
  }

  const segments = 16;
  const perSegment = Math.ceil(steps / segments) + 1;
  const strokes = [];
  for (let seg = 0; seg < segments; seg++) {
    const pts = [];
    const palT = seg / (segments - 1);
    for (let j = 0; j <= perSegment; j++) {
      const i = Math.min(seg * Math.floor(steps / segments) + j, steps);
      const t = (i / steps) * revolutions * Math.PI * 2 + startAngle;
      const x = cx + diff * Math.cos(t) + traceR * Math.cos(t * diff / innerR);
      const y = cy + diff * Math.sin(t) - traceR * Math.sin(t * diff / innerR);
      pts.push({ x, y });
    }
    if (pts.length > 1) strokes.push(makeStroke(pts, samplePalette(palette, palT), brushSize, 0.8, pressureStyle));
  }
  return strokes;
}
