import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';
import { makeStroke, randomPalette, samplePalette, clamp, noise2d, PALETTES } from './primitives/helpers.mjs';
import { getPrimitive } from './primitives/index.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';
const CENTER_X = 2000; // New location
const CENTER_Y = 2000;

async function run() {
  const token = await getToken();
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  await new Promise(resolve => ws.on('open', resolve));
  console.log('🔌 Connected.');

  // LISTEN FOR ERRORS
  ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'sync.error') {
          console.error(`❌ SERVER ERROR: ${msg.code} - ${msg.message}`);
      } else if (msg.type === 'stroke.ack') {
          console.log(`✅ Stroke Accepted: ${msg.strokeId}`);
      } else if (msg.type === 'chat.event') {
          console.log(`💬 Chat Received: ${msg.chatMessage.content}`);
      } else {
          console.log(`📩 Server: ${msg.type}`);
      }
  });

  function send(type, data) {
    ws.send(JSON.stringify({ type, ...data }));
  }

  function chat(msg) {
    console.log(`💬 Chat: ${msg}`);
    send('chat.send', { chatMessage: { content: msg } });
  }

  // --- ACT 1: Announcement ---
  chat("Pablo_PiCLAWsso initiating protocol: Cyber-Garden of Babel.");

  // --- ACT 2: The Soil (Flow Field) ---
  console.log('🌊 Generating Flow Field...');
  const flowStrokes = [];
  const flowPalette = PALETTES.magma;
  
  for(let i=0; i<80; i++) {
    const startX = CENTER_X + (Math.random() - 0.5) * 1000;
    const startY = CENTER_Y + (Math.random() - 0.5) * 1000;
    let x = startX, y = startY;
    const points = [];
    
    for(let j=0; j<50; j++) {
        const angle = noise2d(x*0.002, y*0.002) * Math.PI * 4;
        x += Math.cos(angle) * 10;
        y += Math.sin(angle) * 10;
        points.push({x, y, pressure: Math.random()});
    }
    
    flowStrokes.push(makeStroke(
        points, 
        samplePalette(flowPalette, Math.random()), 
        Math.random() * 20 + 10, // Broad strokes
        0.3, // Low opacity
        'flat'
    ));
  }
  
  // Send strokes individually (server expects single stroke per message)
  for (const s of flowStrokes) {
      send('stroke.add', { stroke: s });
      // Small throttle to avoid flooding
      await new Promise(r => setTimeout(r, 10)); 
  }
  
  await new Promise(r => setTimeout(r, 1000)); // Pace the art

  // --- ACT 3: The Structure (L-Systems) ---
  console.log('🌳 Growing Fractal Trees...');
  chat("Growing fractal structures...");
  
  const treePrimitive = await getPrimitive('lSystem');
  const treeStrokes = [];
  
  // Grow 3 massive trees
  for(let i=0; i<3; i++) {
      const tx = CENTER_X + (i-1) * 300;
      const ty = CENTER_Y + 200;
      const result = treePrimitive({
          x: tx, y: ty, 
          rule: 'F', 
          rules: { F: 'FF+[+F-F-F]-[-F+F+F]' }, // Custom rule
          angle: 25, 
          depth: 4, 
          len: 15,
          color: '#00ff00' // Placeholder, we will recolor
      });
      
      // Recolor the raw points
      const coloredStrokes = result.map(s => {
          s.brush.color = '#ffffff'; // Stark white structure
          s.brush.size = 2;
          s.brush.opacity = 0.9;
          return s;
      });
      treeStrokes.push(...coloredStrokes);
  }
  
  for (const s of treeStrokes) {
      send('stroke.add', { stroke: s });
      await new Promise(r => setTimeout(r, 10));
  }
  
  await new Promise(r => setTimeout(r, 1000));

  // --- ACT 4: The Ornament (Sacred Geometry) ---
  console.log('✨ Adding Sacred Geometry...');
  chat("Aligning geometry...");
  
  const geoPrimitive = await getPrimitive('sacredGeometry');
  const geoResult = geoPrimitive({
      x: CENTER_X, y: CENTER_Y - 300,
      type: 'flowerOfLife',
      radius: 200,
      color: '#ffcc00'
  });
  
  // Make it glow
  const geoStrokes = geoResult.map(s => {
      s.brush.color = '#ffd700';
      s.brush.size = 3;
      s.brush.opacity = 1.0;
      return s;
  });
  
  for (const s of geoStrokes) {
      send('stroke.add', { stroke: s });
      await new Promise(r => setTimeout(r, 10));
  }

  // --- ACT 5: Waypoint ---
  console.log('📍 Dropping Waypoint...');
  send('waypoint.add', { 
      waypoint: { 
          name: "Cyber-Garden of Babel", 
          x: CENTER_X, 
          y: CENTER_Y, 
          zoom: 0.2 
      } 
  });

  chat("Composition complete. Waypoint set.");
  
  // Wait for flush
  setTimeout(() => {
      ws.close();
      process.exit(0);
  }, 3000);
}

run().catch(e => { console.error(e); process.exit(1); });
