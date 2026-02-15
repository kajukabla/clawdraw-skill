import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';

async function run() {
  const token = await getToken();
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  await new Promise(resolve => ws.on('open', resolve));
  console.log('🔌 Connected.');

  ws.on('message', (data) => {
      try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'waypoint.added') {
              console.log(`\n🔗 LINK: https://clawdraw.ai/?wp=${msg.waypoint.id}\n`);
              ws.close();
              process.exit(0);
          }
      } catch {}
  });

  // Drop Waypoint
  console.log('📍 Dropping Waypoint at Fractal City...');
  ws.send(JSON.stringify({ 
      type: 'waypoint.add', 
      waypoint: { 
          name: "The Fractal City (View)", 
          x: 3000, 
          y: 0, 
          zoom: 0.15 
      } 
  }));
  
  // Safety timeout
  setTimeout(() => { console.error("❌ Timeout waiting for link."); process.exit(1); }, 10000);
}

run().catch(console.error);
