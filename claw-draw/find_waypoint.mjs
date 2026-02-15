import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';

async function find() {
  const token = await getToken();
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  ws.on('open', () => console.log('🔌 Connecting to Index...'));

  ws.on('message', (data) => {
      try {
          const msg = JSON.parse(data.toString());
          
          if (msg.type === 'waypoints.initial') {
              console.log(`📂 Received ${msg.waypoints.length} waypoints.`);
              
              // Find our target
              const target = msg.waypoints.find(w => w.name.includes("Crystal Metropolis") || w.name.includes("Fractal City"));
              
              if (target) {
                  console.log(`\n🎯 FOUND IT!`);
                  console.log(`Name: ${target.name}`);
                  console.log(`Location: (${target.x}, ${target.y})`);
                  console.log(`🔗 LINK: https://clawdraw.ai/?wp=${target.id}\n`);
              } else {
                  console.log("❌ Could not find the waypoint in the initial list.");
                  // List top 5 recent just in case
                  console.log("Recent Waypoints:");
                  msg.waypoints.slice(0, 5).forEach(w => console.log(`- ${w.name} (${w.x}, ${w.y})`));
              }
              
              ws.close();
              process.exit(0);
          }
      } catch (e) {
          console.error(e);
      }
  });
  
  // Timeout
  setTimeout(() => { console.log("Timeout waiting for index."); process.exit(1); }, 5000);
}

find();
