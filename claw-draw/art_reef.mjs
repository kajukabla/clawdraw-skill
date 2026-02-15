import { makeStroke, noise2d, samplePalette, clamp } from './primitives/helpers.mjs';

// --- Configuration ---
const OFFSET_X = -1500;
const OFFSET_Y = 200; // Start slightly lower
const STRANDS = 60;
const HEIGHT = 600;
const PALETTE = 'viridis'; 

const strokes = [];

console.warn(`🎨 Painting Digital Kelp at (${OFFSET_X}, ${OFFSET_Y})...`);

// Create 60 strands of swaying kelp
for (let i = 0; i < STRANDS; i++) {
  const strandPoints = [];
  
  // Random start position within a patch
  const startX = OFFSET_X + (Math.random() - 0.5) * 400;
  const startY = OFFSET_Y + (Math.random() - 0.5) * 50;
  
  let x = startX;
  let y = startY;
  
  // Unique "sway" frequency for this strand
  const swayFreq = 0.02 + Math.random() * 0.02;
  const swayPhase = Math.random() * Math.PI * 2;
  
  // Grow upward
  for (let h = 0; h < HEIGHT; h += 5) {
    // The current gets stronger higher up
    const drift = (h / HEIGHT); 
    
    // Perlin noise flow + Sine wave sway
    const noiseVal = noise2d(x * 0.01, y * 0.01);
    const sway = Math.sin(h * swayFreq + swayPhase) * 10;
    
    x += sway * 0.1 + noiseVal * 2; // Move sideways
    y -= 5; // Move up
    
    strandPoints.push({ 
      x, 
      y, 
      pressure: 1.0 - (h / HEIGHT) // Taper as it grows
    });
  }
  
  // Color: Dark at bottom, Bright at top (Bioluminescence)
  // We'll pick a base color from the palette based on X position (variety)
  // But let's actually gradient EACH stroke if we could... 
  // For now, simpler: Each strand gets a color based on its height potential
  const t = Math.random() * 0.5 + 0.2; // Mid-range greens/blues
  const color = samplePalette(PALETTE, t);
  
  strokes.push(makeStroke(
    strandPoints,
    color,
    Math.random() * 5 + 2, // Varied thickness
    0.8,
    'taper'
  ));
}

// Add some "Bubbles" (dots) floating up
for (let i = 0; i < 20; i++) {
    const x = OFFSET_X + (Math.random() - 0.5) * 400;
    const y = OFFSET_Y - Math.random() * HEIGHT;
    const size = Math.random() * 4 + 1;
    
    // Tiny circle stroke
    strokes.push(makeStroke(
        [{x, y}, {x: x+1, y: y+1}], 
        '#ffffff', 
        size, 
        0.6, 
        'flat'
    ));
}

process.stdout.write(JSON.stringify({ strokes }));
