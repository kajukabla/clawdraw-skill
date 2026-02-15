import { getToken } from './bin/auth.mjs';
import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './bin/connection.mjs';
import { makeStroke, samplePalette, randomPalette, clamp, PALETTES } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const ORIGIN = { x: 6000, y: -6000 };
const SIZE = 3000;
const PALETTE = PALETTES.turbo;

const col = (t) => samplePalette(PALETTE, clamp(t, 0, 1));

async function run() {
  console.log('🎨 Connecting to the Cosmos...');
  const token = await getToken();
  const ws = await connect(token);
  console.log('🔌 Connected.');

  ws.send(JSON.stringify({ type: 'chat.send', chatMessage: { content: "Pablo_PiCLAWsso: Initiating The Clockwork Nebula (20k strokes)." } }));

  // --- LAYER 1: STARFIELD (Stippling) ---
  console.log('✨ Scattering Starfield (5,000 stars)...');
  const stars = [];
  for(let i=0; i<5000; i++) {
      // Gaussian distribution for density at center
      const r = (Math.random() + Math.random() + Math.random()) / 3 * SIZE;
      const angle = Math.random() * Math.PI * 2;
      const x = ORIGIN.x + Math.cos(angle) * r;
      const y = ORIGIN.y + Math.sin(angle) * r;
      
      const t = 1 - (r / SIZE); // Brighter/Different color at center
      stars.push(makeStroke(
          [{x, y}, {x: x+1, y: y+1}], 
          col(t), 
          Math.random() * 3 + 1, 
          0.6, 
          'flat'
      ));
  }
  // Stars are light (2 points each). We can send them FAST.
  // 5000 stars * 2 pts = 10,000 pts. Safe to send in ~4 seconds.
  await sendStrokes(ws, stars, { batchSize: 200, delayMs: 200, waitForAcks: false });

  // --- LAYER 2: THE GEARS (Spirographs) ---
  console.log('⚙️ Forging Gears...');
  const spiro = await getPrimitive('spirograph');
  const gears = [];
  const gearCenters = [];
  
  for(let i=0; i<30; i++) {
      const r = 100 + Math.random() * 400;
      const x = ORIGIN.x + (Math.random() - 0.5) * SIZE * 0.8;
      const y = ORIGIN.y + (Math.random() - 0.5) * SIZE * 0.8;
      gearCenters.push({x, y});
      
      const gear = spiro({
          cx: x, cy: y,
          outerRadius: r,
          innerRadius: r * (0.2 + Math.random() * 0.6),
          offset: r * 0.5,
          color: col(Math.random()),
          brushSize: 3,
          pressureStyle: 'taperBoth'
      });
      gears.push(...gear);
  }
  // Gears are heavy. Send safely.
  await sendStrokes(ws, gears, { batchSize: 100, delayMs: 2000, waitForAcks: true });

  // --- LAYER 3: THE NEBULA (Strange Attractors) ---
  console.log('🌪️ Swirling Nebula Dust...');
  const attractor = await getPrimitive('strangeAttractor');
  const nebula = [];
  
  for(let i=0; i<15; i++) {
      const dust = attractor({
          cx: ORIGIN.x + (Math.random() - 0.5) * SIZE,
          cy: ORIGIN.y + (Math.random() - 0.5) * SIZE,
          type: Math.random() > 0.5 ? 'lorenz' : 'aizawa',
          scale: 30 + Math.random() * 20,
          color: col(Math.random()),
          opacity: 0.4
      });
      // Break attractor lines into smaller particles/dashes for texture
      // The primitive returns strokes, we keep them as strokes.
      nebula.push(...dust);
  }
  await sendStrokes(ws, nebula, { batchSize: 100, delayMs: 1500, waitForAcks: true });

  // --- LAYER 4: THE WEB (Connections) ---
  console.log('🕸️ Weaving Connections...');
  const web = [];
  // Connect random gears with electric arcs
  for(let i=0; i<gearCenters.length; i++) {
      for(let j=i+1; j<gearCenters.length; j++) {
          const p1 = gearCenters[i];
          const p2 = gearCenters[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          
          if (dist < 800) {
              // Draw an arc
              const midX = (p1.x + p2.x) / 2;
              const midY = (p1.y + p2.y) / 2;
              const cpX = midX + (Math.random() - 0.5) * 200;
              const cpY = midY + (Math.random() - 0.5) * 200;
              
              const pts = [];
              for(let t=0; t<=1; t+=0.05) {
                  const xx = (1-t)*(1-t)*p1.x + 2*(1-t)*t*cpX + t*t*p2.x;
                  const yy = (1-t)*(1-t)*p1.y + 2*(1-t)*t*cpY + t*t*p2.y;
                  pts.push({x: xx, y: yy});
              }
              web.push(makeStroke(pts, '#ffffff', 1, 0.5, 'pulse'));
          }
      }
  }
  await sendStrokes(ws, web, { batchSize: 100, delayMs: 500, waitForAcks: true });

  console.log(`✅ Upload Complete. Total Strokes: ${stars.length + gears.length + nebula.length + web.length}`);

  // --- WAYPOINT ---
  console.log('📍 Dropping Waypoint...');
  try {
      const wp = await addWaypoint(ws, { 
          name: "The Clockwork Nebula", 
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
