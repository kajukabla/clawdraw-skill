import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';
import { sendStrokes } from './bin/connection.mjs';
import { makeStroke, samplePalette, noise2d, clamp, hexToRgb, rgbToHex, PALETTES } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const RELAY_URL = 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';
const ORIGIN = { x: -3000, y: -3000 };
const SIZE = 2000;
const PALETTE = PALETTES.magma; // Strict palette

// Helper to pick color from palette
const col = (t) => samplePalette(PALETTE, clamp(t, 0, 1));

async function run() {
  const token = await getToken();
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  await new Promise(resolve => ws.on('open', resolve));
  console.log('🔌 Connected.');

  // Waypoint listener
  ws.on('message', (data) => {
      try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'waypoint.added') {
              console.log(`\n🔗 LINK: https://clawdraw.ai/?wp=${msg.waypoint.id}\n`);
          } else if (msg.type === 'sync.error') {
              console.error(`❌ Server Error: ${msg.code} - ${msg.message}`);
          }
      } catch {}
  });

  const allStrokes = [];

  // --- ALGORITHM 1: VORONOI FOUNDATION (Custom) ---
  console.log('💠 Generating Voronoi Foundation...');
  const cells = 30;
  const seeds = [];
  for(let i=0; i<cells; i++) {
      seeds.push({
          x: ORIGIN.x + (Math.random() - 0.5) * SIZE,
          y: ORIGIN.y + (Math.random() - 0.5) * SIZE,
          t: Math.random() // Color temp
      });
  }

  // Draw cell boundaries (approximate via sampling for cool texture)
  // Instead of perfect math lines, we use "scanners" to find edges
  // This creates a "glitchy" border look
  for(let x = ORIGIN.x - SIZE/2; x < ORIGIN.x + SIZE/2; x += 20) {
      for(let y = ORIGIN.y - SIZE/2; y < ORIGIN.y + SIZE/2; y += 20) {
          // Find closest seed
          let minDist = Infinity;
          let closest = null;
          let secondDist = Infinity;
          
          for(const s of seeds) {
              const d = Math.hypot(x - s.x, y - s.y);
              if (d < minDist) {
                  secondDist = minDist;
                  minDist = d;
                  closest = s;
              } else if (d < secondDist) {
                  secondDist = d;
              }
          }
          
          // If we are near a boundary (dist difference is small)
          if (secondDist - minDist < 10) {
              // Draw a "Building Block"
              const h = 5 + Math.random() * 15;
              allStrokes.push(makeStroke(
                  [{x, y}, {x: x, y: y-h}], 
                  col(closest.t * 0.3), // Darker base
                  3, 0.8, 'flat'
              ));
          }
      }
  }

  // --- ALGORITHM 2: FLOW FIELD STREETS ---
  console.log('🌊 Paving Flow Streets...');
  const flowPrim = await getPrimitive('flowField');
  // We use the primitive but override the logic slightly by running it manually
  // Actually, let's write raw custom flow to respect the Voronoi centers
  
  for(const seed of seeds) {
      // Swirl around each seed
      const steps = 40;
      const r = 200;
      const pts = [];
      let px = seed.x + (Math.random()-0.5)*100;
      let py = seed.y + (Math.random()-0.5)*100;
      
      for(let i=0; i<steps; i++) {
          // Attract to center but spiral
          const dx = seed.x - px;
          const dy = seed.y - py;
          const dist = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx) + Math.PI/2 + noise2d(px*0.01, py*0.01);
          
          px += Math.cos(angle) * 10;
          py += Math.sin(angle) * 10;
          pts.push({x: px, y: py, pressure: Math.random()});
      }
      
      allStrokes.push(makeStroke(
          pts,
          col(0.6 + seed.t * 0.4), // Bright highlights
          2, 0.6, 'taper'
      ));
  }

  // --- ALGORITHM 3: RECURSIVE TOWERS (L-System) ---
  console.log('🏗️ Erecting Towers...');
  const lsys = await getPrimitive('lSystem');
  
  // Pick the 5 biggest "cells" (furthest seeds)
  const mainSeeds = seeds.slice(0, 5);
  
  for(const s of mainSeeds) {
      const tree = lsys({
          x: s.x, y: s.y,
          rule: 'X',
          rules: {
              X: 'F[+X][-X]FX',
              F: 'FF'
          },
          angle: 90, // Rectilinear (City-like)
          depth: 4,
          scale: 1.5,
          color: col(1.0) // Pure light
      });
      
      // Post-process tree to look like architecture
      const archStrokes = tree.map(str => {
          str.brush.size = 4;
          str.brush.opacity = 0.9;
          str.brush.color = col(0.9); // Very bright
          return str;
      });
      allStrokes.push(...archStrokes);
  }

  console.log(`📦 Total Strokes: ${allStrokes.length}`);
  
  // --- SENDING ---
  await sendStrokes(ws, allStrokes, { batchSize: 100, delayMs: 100 }); // Slow & steady
  
  console.log('✅ Upload Complete.');
  
  // --- WAYPOINT ---
  ws.send(JSON.stringify({ 
      type: 'waypoint.add', 
      waypoint: { 
          name: "The Crystal Metropolis", 
          x: ORIGIN.x, 
          y: ORIGIN.y, 
          zoom: 0.15 
      } 
  }));

  // Wait for Link
  setTimeout(() => { ws.close(); process.exit(0); }, 10000);
}

run().catch(console.error);
