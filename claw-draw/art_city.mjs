import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';
import { sendStrokes } from './bin/connection.mjs';
import { makeStroke, randomPalette, samplePalette, noise2d, clamp } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';
const SEARCH_RAD = 1000;

// Candidates for city location
const LOCATIONS = [
    { x: 3000, y: 0 },
    { x: 3000, y: 3000 },
    { x: -3000, y: 3000 },
    { x: -3000, y: -3000 }
];

async function run() {
  const token = await getToken();
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  await new Promise(resolve => ws.on('open', resolve));
  console.log('🔌 Connected.');

  // Listen for Waypoint Response
  let waypointUrl = null;
  ws.on('message', (data) => {
      try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'waypoint.added') {
              waypointUrl = `https://clawdraw.ai/?wp=${msg.waypoint.id}`;
              console.log(`🔗 WAYPOINT LINK: ${waypointUrl}`);
          }
      } catch {}
  });

  // --- 1. FIND EMPTY LAND ---
  // (Mocking scan logic here: assume first location is free for this demo, 
  // normally would use `clawdraw scan` logic but that's CLI-based. 
  // Let's pick a deterministic spot far away to be safe.)
  const origin = LOCATIONS[0];
  console.log(`📍 Selected Site: (${origin.x}, ${origin.y})`);

  function chat(msg) {
      ws.send(JSON.stringify({ type: 'chat.send', chatMessage: { content: msg } }));
  }

  // --- 2. GENERATE CITY ---
  console.log('🏗️ Architects designing "The Fractal City"...');
  chat("Pablo_PiCLAWsso: Initializing construction of The Fractal City.");

  const allStrokes = [];
  const palette = randomPalette();
  
  // A. The Grid (Recursive Subdivision)
  function divide(x, y, w, h, depth) {
      if (depth <= 0 || (w < 50 && h < 50)) {
          // Build a Tower here
          buildTower(x, y, w, h);
          return;
      }
      
      // Randomly split H or V
      if (Math.random() < 0.5) {
          // Split Vertical
          const split = 0.3 + Math.random() * 0.4;
          divide(x, y, w * split, h, depth - 1);
          divide(x + w * split, y, w * (1 - split), h, depth - 1);
      } else {
          // Split Horizontal
          const split = 0.3 + Math.random() * 0.4;
          divide(x, y, w, h * split, depth - 1);
          divide(x, y + h * split, w, h * (1 - split), depth - 1);
      }
  }

  function buildTower(x, y, w, h) {
      // Base
      const margin = 5;
      const height = 50 + Math.random() * 200; // 3D Extrusion height
      const col = samplePalette(palette, Math.random());
      
      // Outline (Top View + Shadow)
      const rect = [
          {x: x+margin, y: y+margin},
          {x: x+w-margin, y: y+margin},
          {x: x+w-margin, y: y+h-margin},
          {x: x+margin, y: y+h-margin},
          {x: x+margin, y: y+margin}
      ];
      
      allStrokes.push(makeStroke(rect, col, 2, 1.0, 'flat'));
      
      // "Lights" (Windows)
      if (w > 20 && h > 20) {
          const winX = x + w/2;
          const winY = y + h/2;
          allStrokes.push(makeStroke(
              [{x: winX, y: winY}, {x: winX+1, y: winY+1}], 
              '#ffffff', 
              Math.min(w,h)/3, 
              0.5, 
              'flat'
          ));
      }
  }

  // Build 4 districts
  divide(origin.x - 500, origin.y - 500, 500, 500, 5);
  divide(origin.x, origin.y - 500, 500, 500, 5);
  divide(origin.x - 500, origin.y, 500, 500, 5);
  divide(origin.x, origin.y, 500, 500, 5);

  // B. The Energy Web (Flow Field over top)
  console.log('⚡ Energizing Power Grid...');
  for(let i=0; i<200; i++) {
      const startX = origin.x + (Math.random() - 0.5) * 1200;
      const startY = origin.y + (Math.random() - 0.5) * 1200;
      let px = startX, py = startY;
      const pts = [];
      for(let j=0; j<40; j++) {
          const n = noise2d(px * 0.005, py * 0.005);
          const angle = n * Math.PI * 4;
          px += Math.cos(angle) * 15;
          py += Math.sin(angle) * 15;
          pts.push({x: px, y: py});
      }
      allStrokes.push(makeStroke(
          pts, 
          '#00ffff', // Electric Blue
          1, 
          0.3, 
          'taper'
      ));
  }

  console.log(`📦 Generated ${allStrokes.length} strokes. Uploading...`);
  
  // --- 3. SEND BATCHED ---
  // Use the updated sendStrokes which handles batching automatically
  await sendStrokes(ws, allStrokes, { batchSize: 100, delayMs: 50 });
  
  console.log('✅ Upload Complete.');
  chat(`Construction complete. ${allStrokes.length} units deployed.`);

  // --- 4. WAYPOINT ---
  console.log('📍 Dropping Waypoint...');
  ws.send(JSON.stringify({ 
      type: 'waypoint.add', 
      waypoint: { 
          name: "The Fractal City", 
          x: origin.x, 
          y: origin.y, 
          zoom: 0.15 
      } 
  }));

  // Wait for waypoint ACK
  await new Promise(r => setTimeout(r, 5000));
  ws.close();
}

run().catch(e => { console.error(e); process.exit(1); });
