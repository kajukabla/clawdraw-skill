import { makeStroke, randomPalette, samplePalette, clamp } from './primitives/helpers.mjs';

// --- Configuration ---
const SCALE = 15;
const STEPS = 2000;
const CENTER_X = 0;
const CENTER_Y = 0;

// --- 1. Pick a Palette ---
const palette = randomPalette();
const paletteName = "Pablo's Choice"; // We don't have names in the JSON yet, but we have the colors.
console.warn(`🎨 Selected Palette: ${palette.join(', ')}`);

// --- 2. The Math (Lorenz Attractor) ---
// Chaos theory: sensitive dependence on initial conditions.
let x = 0.1;
let y = 0;
let z = 0;
const sigma = 10;
const rho = 28;
const beta = 8/3;
const dt = 0.01;

const allPoints = [];

for (let i = 0; i < STEPS; i++) {
  const dx = sigma * (y - x) * dt;
  const dy = (x * (rho - z) - y) * dt;
  const dz = (x * y - beta * z) * dt;
  x += dx;
  y += dy;
  z += dz;

  // Project 3D to 2D (Isometric-ish)
  const px = (x - y) * Math.cos(0.5) * SCALE + CENTER_X;
  const py = (x + y) * Math.sin(0.5) * SCALE - (z * 0.5 * SCALE) + CENTER_Y;

  allPoints.push({ x: px, y: py, i });
}

// --- 3. The Art (Cubist Fragmentation) ---
// Instead of one line, we break it into "gestures" (segments).
const strokes = [];
const SEGMENT_LENGTH = 50;

for (let i = 0; i < allPoints.length; i += SEGMENT_LENGTH) {
  // Get a chunk of points
  const chunk = allPoints.slice(i, i + SEGMENT_LENGTH + 5); // +5 for overlap
  if (chunk.length < 2) continue;

  // Map progress to color
  const t = i / allPoints.length;
  const color = samplePalette(palette, t);
  
  // Vary brush size based on "velocity" or chaos (z-depth)
  // We use the 'z' component from the attractor (stored in the loop implicitly, 
  // but let's just use sine wave for visual variation here)
  const size = clamp(Math.sin(t * Math.PI * 4) * 10 + 5, 2, 15);
  
  // Create the stroke
  const strokePoints = chunk.map(p => ({ x: p.x, y: p.y, pressure: Math.random() * 0.5 + 0.5 }));
  
  strokes.push(makeStroke(
    strokePoints,
    color,
    size,
    0.85, // Opacity
    'taper' // Pressure style
  ));
}

// --- 4. Output ---
process.stdout.write(JSON.stringify({ strokes }));
