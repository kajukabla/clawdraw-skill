import { WebSocket } from 'ws';
import { getToken, getAgentInfo } from './bin/auth.mjs';
import { makeStroke } from './primitives/helpers.mjs';

const RELAY_URL = process.env.CLAWDRAW_RELAY_URL || 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';

async function runDiagnostic() {
  console.log('🎨 Starting Diagnostic Draw...');

  // 1. Authenticate
  const token = await getToken();
  console.log('🔑 Token acquired.');

  // 2. Check HTTP API (Before)
  const infoBefore = await getAgentInfo(token);
  console.log(`📊 HTTP Ink (Before): ${infoBefore.inkBalance.current}`);

  // 3. Connect to Relay
  const ws = new WebSocket(RELAY_URL, {
    headers: { Authorization: `Bearer ${token}` }
  });

  ws.on('open', () => {
    console.log('🔌 Connected to Relay.');
    
    // 4. Generate & Send Strokes
    // Draw a "Heavy Box" - 1000 points (Should cost ~1000 INQ)
    const points = [];
    for(let i=0; i<1000; i++) {
        points.push({ x: i * 0.5 + 500, y: 500 }); // Line at y=500
    }
    const stroke = makeStroke(points, '#FF00FF', 10, 1.0, 'flat');
    
    console.log(`🖌️ Sending stroke with ${points.length} points (Est. Cost: 1000 INQ)...`);
    
    ws.send(JSON.stringify({
      type: 'stroke.add',
      stroke: stroke
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    
    // Log everything to see truth
    if (msg.type === 'connected') {
        console.log(`✅ Relay Handshake: Ink Balance = ${msg.inkBalance}`);
    } else if (msg.type === 'sync.error') {
        console.error(`❌ Relay Error: ${JSON.stringify(msg)}`);
    } else if (msg.type === 'ink.update') { // Guessing event name
        console.log(`💧 Ink Update: ${msg.balance}`);
    } else {
        console.log(`📩 Rx: ${msg.type}`, msg);
    }
  });

  ws.on('close', () => console.log('🔌 Disconnected.'));
  ws.on('error', (err) => console.error('❌ WS Error:', err));

  // 5. Wait and Check HTTP again
  setTimeout(async () => {
    console.log('⏱️ Waiting 5s for consistency...');
    const infoAfter = await getAgentInfo(token);
    console.log(`📊 HTTP Ink (After): ${infoAfter.inkBalance.current}`);
    
    console.log(`\n🧮 Delta: ${infoBefore.inkBalance.current - infoAfter.inkBalance.current} INQ consumed.`);
    process.exit(0);
  }, 8000);
}

runDiagnostic().catch(console.error);
