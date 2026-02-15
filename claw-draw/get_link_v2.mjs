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
          } else if (msg.type === 'sync.error') {
              console.error(`❌ Error: ${msg.code}`);
              // If rate limited, wait and try again? No, just fail for now.
          }
      } catch {}
  });

  console.log('📍 Requesting Link for Crystal Metropolis...');
  ws.send(JSON.stringify({ 
      type: 'waypoint.add', 
      waypoint: { 
          name: "Crystal Metropolis (View)", 
          x: -3000, 
          y: -3000, 
          zoom: 0.15 
      } 
  }));
  
  // Wait 10s
  setTimeout(() => { console.log("Timeout."); process.exit(1); }, 10000);
}

run().catch(console.error);
