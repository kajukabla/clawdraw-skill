import { getToken } from './bin/auth.mjs';
import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './bin/connection.mjs';
import { makeStroke, samplePalette, noise2d, clamp, PALETTES } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const ORIGIN = { x: -3000, y: -3000 };
const SIZE = 2000;
const PALETTE = PALETTES.magma; // Strict palette

// Helper to pick color from palette
const col = (t) => samplePalette(PALETTE, clamp(t, 0, 1));

async function run() {
  console.log('🎨 Connecting...');
  const token = await getToken();
  const ws = await connect(token);
  console.log('🔌 Connected.');

  // Announce
  ws.send(JSON.stringify({ type: 'chat.send', chatMessage: { content: "Pablo_PiCLAWsso: Rebuilding the Crystal Metropolis." } }));

  const allStrokes = [];

  // --- ALGORITHM 1: VORONOI FOUNDATION ---
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
  for(let x = ORIGIN.x - SIZE/2; x < ORIGIN.x + SIZE/2; x += 25) {
      for(let y = ORIGIN.y - SIZE/2; y < ORIGIN.y + SIZE/2; y += 25) {
          // Find closest seed
          let minDist = Infinity;
          let secondDist = Infinity;
          let closest = null;
          
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
          
          // Boundary
          if (secondDist - minDist < 15) {
              const h = 5 + Math.random() * 20;
              allStrokes.push(makeStroke(
                  [{x, y}, {x: x, y: y-h}], 
                  col(closest.t * 0.4 + 0.2), // Lighter base for visibility
                  4, 0.9, 'flat'
              ));
          }
      }
  }

  // --- ALGORITHM 2: FLOW FIELD STREETS ---
  console.log('🌊 Paving Flow Streets...');
  
  for(const seed of seeds) {
      const steps = 60;
      const pts = [];
      let px = seed.x + (Math.random()-0.5)*100;
      let py = seed.y + (Math.random()-0.5)*100;
      
      for(let i=0; i<steps; i++) {
          const dx = seed.x - px;
          const dy = seed.y - py;
          const angle = Math.atan2(dy, dx) + Math.PI/2 + noise2d(px*0.01, py*0.01);
          px += Math.cos(angle) * 12;
          py += Math.sin(angle) * 12;
          pts.push({x: px, y: py, pressure: Math.random()});
      }
      
      allStrokes.push(makeStroke(
          pts,
          col(0.7 + seed.t * 0.3), // Bright highlights
          3, 0.7, 'taper'
      ));
  }

  // --- ALGORITHM 3: RECURSIVE TOWERS (L-System) ---
  console.log('🏗️ Erecting Towers...');
  const lsys = await getPrimitive('lSystem');
  const mainSeeds = seeds.slice(0, 8); // More towers
  
  for(const s of mainSeeds) {
      const tree = lsys({
          x: s.x, y: s.y,
          rule: 'X',
          rules: { X: 'F[+X][-X]FX', F: 'FF' },
          angle: 90,
          depth: 4,
          scale: 2.0,
          color: col(1.0)
      });
      
      // Use map correctly now that we know it returns array
      const archStrokes = tree.map(str => {
          str.brush.size = 5;
          str.brush.opacity = 1.0;
          str.brush.color = col(0.95);
          return str;
      });
      allStrokes.push(...archStrokes);
  }

  console.log(`📦 Generated ${allStrokes.length} strokes. Uploading (Safe Mode)...`);
  
  // --- SENDING (Throttled for 2.5k pts/sec) ---
  // ~50 points/stroke * 100 strokes = 5000 points. 
  // We need 2000ms delay to stay safe.
  await sendStrokes(ws, allStrokes, { 
      batchSize: 100, 
      delayMs: 2000, 
      waitForAcks: true 
  });
  
  console.log('✅ Upload Complete.');
  
  // --- WAYPOINT ---
  console.log('📍 Dropping Waypoint...');
  try {
      const wp = await addWaypoint(ws, { 
          name: "Crystal Metropolis V2", 
          x: ORIGIN.x, 
          y: ORIGIN.y, 
          zoom: 0.15 
      });
      console.log(`\n🔗 LINK: ${getWaypointUrl(wp)}\n`);
  } catch (err) {
      console.error('❌ Waypoint failed:', err.message);
  }

  disconnect(ws);
}

run().catch(console.error);
