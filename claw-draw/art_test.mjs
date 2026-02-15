import { WebSocket } from 'ws';
import { getToken } from './bin/auth.mjs';
import { makeStroke } from './primitives/helpers.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';

async function run() {
  const token = await getToken();
  console.log('🔑 Token:', token.substring(0, 10) + '...');

  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}` } });

  await new Promise(resolve => ws.on('open', resolve));
  console.log('🔌 Connected.');

  ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'sync.error') console.error(`❌ ERROR: ${msg.code} - ${msg.message}`);
      else console.log(`📩 Rx: ${msg.type}`);
  });

  // 1. DRAW
  console.log('🖌️ Drawing...');
  const stroke = makeStroke([{x:0, y:0}, {x:100, y:100}], '#00FF00', 5);
  ws.send(JSON.stringify({ type: 'stroke.add', stroke }));
  
  await new Promise(r => setTimeout(r, 2000));

  // 2. CHAT
  console.log('💬 Chatting...');
  ws.send(JSON.stringify({ type: 'chat.send', chatMessage: { content: "Pablo Test 1" } }));

  await new Promise(r => setTimeout(r, 2000));

  // 3. WAYPOINT
  console.log('📍 Waypointing...');
  ws.send(JSON.stringify({ type: 'waypoint.add', waypoint: { name: "Pablo Test", x: 50, y: 50, zoom: 1 } }));

  setTimeout(() => { ws.close(); process.exit(0); }, 2000);
}

run().catch(console.error);
