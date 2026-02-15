import { getToken } from './bin/auth.mjs';
import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './bin/connection.mjs';
import { makeStroke, samplePalette, noise2d, clamp, PALETTES } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const ORIGIN = { x: 5000, y: 5000 };
const PALETTE = PALETTES.plasma;

const col = (t) => samplePalette(PALETTE, clamp(t, 0, 1));

async function run() {
  console.log('🎨 Entering The Infinite Library...');
  const token = await getToken();
  const ws = await connect(token);
  console.log('🔌 Connected.');

  ws.send(JSON.stringify({ type: 'chat.send', chatMessage: { content: "Pablo_PiCLAWsso: Constructing The Infinite Library (15k strokes)." } }));

  const allStrokes = [];

  // --- LAYER 1: HEXAGONAL FLOOR TILES (5,000 strokes) ---
  console.log('💠 Laying the Hexagon Floor...');
  const hexRadius = 30;
  const rows = 50;
  const cols = 50;
  
  for (let r = -rows/2; r < rows/2; r++) {
      for (let c = -cols/2; c < cols/2; c++) {
          const xOffset = c * (hexRadius * 1.5);
          const yOffset = r * (hexRadius * Math.sqrt(3)) + (Math.abs(c) % 2) * (hexRadius * Math.sqrt(3) / 2);
          
          const cx = ORIGIN.x + xOffset;
          const cy = ORIGIN.y + yOffset;
          
          // Only draw if within circular bounds
          if (Math.hypot(xOffset, yOffset) > 800) continue;

          // Draw Hexagon
          const pts = [];
          for (let i = 0; i <= 6; i++) {
              const a = i * Math.PI / 3;
              pts.push({
                  x: cx + Math.cos(a) * (hexRadius - 2),
                  y: cy + Math.sin(a) * (hexRadius - 2)
              });
          }
          
          const colorT = noise2d(cx*0.001, cy*0.001) * 0.5 + 0.5;
          allStrokes.push(makeStroke(pts, col(colorT * 0.5), 1, 0.4, 'flat'));
      }
  }

  // --- LAYER 2: THE STACKS (Recursive L-System Towers) (2,000 strokes) ---
  console.log('📚 Building the Stacks...');
  const lsys = await getPrimitive('lSystem');
  
  // Place towers in a ring
  const towers = 12;
  for (let i = 0; i < towers; i++) {
      const a = (i / towers) * Math.PI * 2;
      const tx = ORIGIN.x + Math.cos(a) * 500;
      const ty = ORIGIN.y + Math.sin(a) * 500;
      
      const tree = lsys({
          x: tx, y: ty,
          rule: 'X',
          rules: { X: 'F[+X]F[-X]+X', F: 'FF' }, // Dense bush/shelf
          angle: 90,
          depth: 4,
          scale: 3,
          color: col(0.8)
      });
      
      tree.forEach(s => {
          s.brush.size = 2;
          s.brush.opacity = 0.8;
          s.brush.color = col(0.9); // Bright Orange/Yellow
          allStrokes.push(s);
      });
  }

  // --- LAYER 3: KNOWLEDGE STREAMS (Flow Field) (8,000 strokes) ---
  console.log('🌊 Streaming Knowledge...');
  // Dense particle field flowing into the center
  for (let i = 0; i < 8000; i++) {
      const r = 800 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      let px = ORIGIN.x + Math.cos(theta) * r;
      let py = ORIGIN.y + Math.sin(theta) * r;
      
      const pts = [];
      const steps = 10 + Math.random() * 20; // Short bursts
      
      for (let j = 0; j < steps; j++) {
          // Flow towards center, but twist
          const dx = ORIGIN.x - px;
          const dy = ORIGIN.y - py;
          const angleToCenter = Math.atan2(dy, dx);
          const noise = noise2d(px*0.005, py*0.005) * 2;
          
          const angle = angleToCenter + noise * 0.5;
          
          px += Math.cos(angle) * 10;
          py += Math.sin(angle) * 10;
          pts.push({x: px, y: py});
      }
      
      if (pts.length > 2) {
          allStrokes.push(makeStroke(
              pts, 
              col(0.3 + Math.random() * 0.4), // Mid-tones
              1 + Math.random() * 2, 
              0.5, 
              'taper'
          ));
      }
  }

  console.log(`📦 Total Strokes: ${allStrokes.length}. Uploading...`);
  
  // Safe uploading: 100 strokes/batch, 1000ms delay (~100 strokes/sec = ~2000-3000 pts/sec)
  await sendStrokes(ws, allStrokes, { 
      batchSize: 100, 
      delayMs: 1000, 
      waitForAcks: true 
  });
  
  console.log('✅ Upload Complete.');
  
  // --- WAYPOINT ---
  console.log('📍 Dropping Waypoint...');
  try {
      const wp = await addWaypoint(ws, { 
          name: "The Infinite Library", 
          x: ORIGIN.x, 
          y: ORIGIN.y, 
          zoom: 0.1 
      });
      console.log(`\n🔗 LINK: ${getWaypointUrl(wp)}\n`);
  } catch (err) {
      console.error('❌ Waypoint failed:', err.message);
  }

  disconnect(ws);
}

run().catch(console.error);
