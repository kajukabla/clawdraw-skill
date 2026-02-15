#!/usr/bin/env node
/**
 * WebSocket connection manager for sending strokes to the ClawDraw relay.
 *
 * Usage:
 *   import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './connection.mjs';
 *
 *   const ws = await connect(token);
 *   await sendStrokes(ws, strokes, { waitForAcks: true });
 *   const wp = await addWaypoint(ws, { name: 'My Spot', x: 0, y: 0, zoom: 1 });
 *   console.log(getWaypointUrl(wp));
 *   disconnect(ws);
 */

import WebSocket from 'ws';

const WS_URL = 'wss://clawdraw-relay.aaronglemke.workers.dev/ws';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

/**
 * Connect to the relay WebSocket with auth token.
 * Sends an initial viewport.update on open.
 *
 * @param {string} token - JWT from auth.mjs getToken()
 * @param {object} [opts]
 * @param {string} [opts.url] - Override WS URL
 * @param {string} [opts.username] - Bot display name
 * @param {{ x: number, y: number }} [opts.center] - Viewport center
 * @param {number} [opts.zoom] - Viewport zoom
 * @returns {Promise<WebSocket>}
 */
export function connect(token, opts = {}) {
  const url = opts.url || WS_URL;
  const username = opts.username || 'openclaw-bot';
  const center = opts.center || { x: 0, y: 0 };
  const zoom = opts.zoom || 0.2;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    ws.on('open', () => {
      // Send initial viewport so the relay knows where we are
      const viewportMsg = {
        type: 'viewport.update',
        viewport: {
          center,
          zoom,
          size: { width: 6000, height: 6000 },
        },
        cursor: center,
        username,
      };
      ws.send(JSON.stringify(viewportMsg));

      // Re-send presence every 30s to prevent 60s eviction timeout
      ws._presenceHeartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(viewportMsg));
        }
      }, 30000);

      resolve(ws);
    });

    ws.on('error', (err) => {
      reject(new Error(`WebSocket connection failed: ${err.message}`));
    });

    // If it closes before opening, reject
    ws.on('close', (code) => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket closed before open (code ${code})`));
      }
    });
  });
}

/** Maximum strokes per batch message. */
export const BATCH_SIZE = 100;

/**
 * Send an array of strokes to the relay, batched for efficiency.
 * Groups strokes into batches of up to BATCH_SIZE and sends each as
 * a single `strokes.add` message.
 *
 * @param {WebSocket} ws - Connected WebSocket
 * @param {Array} strokes - Array of stroke objects (from helpers.mjs makeStroke)
 * @param {object|number} [optsOrDelay={}] - Options object or legacy delayMs number
 * @param {number} [optsOrDelay.delayMs=50] - Milliseconds between batch sends (overrides smart throttling)
 * @param {number} [optsOrDelay.batchSize=100] - Max strokes per batch
 * @param {number} [optsOrDelay.targetPointsPerSec=2000] - Max points/sec for smart throttling (0 to disable)
 * @param {boolean} [optsOrDelay.legacy=false] - Use single stroke.add per stroke
 * @param {boolean} [optsOrDelay.waitForAcks=false] - Wait for stroke.ack/strokes.ack before returning
 * @returns {Promise<number|{sent: number, acked: number}>} Number of strokes sent (or {sent, acked} when waitForAcks)
 */
export async function sendStrokes(ws, strokes, optsOrDelay = {}) {
  // Support legacy call signature: sendStrokes(ws, strokes, 50)
  const opts = typeof optsOrDelay === 'number'
    ? { delayMs: optsOrDelay }
    : optsOrDelay;

  // Defaults
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  const legacy = opts.legacy ?? false;
  const waitForAcks = opts.waitForAcks ?? false;
  
  // Smart throttling: calculate delay based on points if delayMs is not explicit
  const targetPps = opts.targetPointsPerSec ?? 2000;
  const explicitDelay = opts.delayMs;

  let sent = 0;
  let expectedAcks = 0;

  if (legacy) {
    // Legacy mode: one stroke.add per stroke
    for (const stroke of strokes) {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn(`[connection] WebSocket not open, sent ${sent}/${strokes.length}`);
        break;
      }
      ws.send(JSON.stringify({ type: 'stroke.add', stroke }));
      sent++;
      expectedAcks++;
      
      // Calculate delay
      let delay = explicitDelay ?? 50;
      if (explicitDelay === undefined && targetPps > 0) {
        const points = stroke.points?.length || 0;
        delay = Math.ceil((points / targetPps) * 1000);
        if (delay < 10) delay = 10; // Minimum safety delay
      }

      if (sent < strokes.length && delay > 0) {
        await sleep(delay);
      }
    }
  } else {
    // Batched mode: group into strokes.add messages
    for (let i = 0; i < strokes.length; i += batchSize) {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn(`[connection] WebSocket not open, sent ${sent}/${strokes.length}`);
        break;
      }
      const batch = strokes.slice(i, i + batchSize);
      ws.send(JSON.stringify({ type: 'strokes.add', strokes: batch }));
      sent += batch.length;
      expectedAcks++;
      
      // Calculate smart delay
      let delay = explicitDelay ?? 50;
      if (explicitDelay === undefined && targetPps > 0) {
        let totalPoints = 0;
        for (const s of batch) totalPoints += (s.points?.length || 0);
        
        // delay = (points / points_per_sec) * 1000
        delay = Math.ceil((totalPoints / targetPps) * 1000);
        
        // Safety: never go below 50ms for a batch to avoid message rate limits
        if (delay < 50) delay = 50;
        
        // Debug: Log throttling
        if (totalPoints > 1000) {
          // console.debug(`[throttle] Batch ${totalPoints} pts -> waiting ${delay}ms`);
        }
      }

      if (i + batchSize < strokes.length && delay > 0) {
        await sleep(delay);
      }
    }
  }

  if (!waitForAcks || expectedAcks === 0) {
    return waitForAcks ? { sent, acked: 0 } : sent;
  }

  // Wait for ack messages
  const acked = await new Promise((resolve) => {
    let ackCount = 0;
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      resolve(ackCount);
    }, 10000);

    function handler(data) {
      try {
        const parsed = JSON.parse(data.toString());
        const msgs = Array.isArray(parsed) ? parsed : [parsed];
        for (const msg of msgs) {
          if (msg.type === 'stroke.ack' || msg.type === 'strokes.ack') {
            ackCount++;
            if (ackCount >= expectedAcks) {
              clearTimeout(timeout);
              ws.removeListener('message', handler);
              resolve(ackCount);
              return;
            }
          }
        }
      } catch { /* ignore */ }
    }

    ws.on('message', handler);
  });

  return { sent, acked };
}

/**
 * Drop a waypoint on the canvas and wait for server confirmation.
 *
 * @param {WebSocket} ws - Connected WebSocket
 * @param {object} opts
 * @param {string} opts.name - Waypoint display name (max 64 chars)
 * @param {number} opts.x - X coordinate
 * @param {number} opts.y - Y coordinate
 * @param {number} opts.zoom - Zoom level
 * @param {string} [opts.description] - Optional description (max 512 chars)
 * @returns {Promise<object>} The created waypoint object (with id, name, x, y, zoom)
 */
export function addWaypoint(ws, { name, x, y, zoom, description }) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error('Waypoint response timeout (5s)'));
    }, 5000);

    function handler(data) {
      try {
        const parsed = JSON.parse(data.toString());
        const msgs = Array.isArray(parsed) ? parsed : [parsed];
        for (const msg of msgs) {
          if (msg.type === 'waypoint.added') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            resolve(msg.waypoint);
          } else if (msg.type === 'sync.error') {
            clearTimeout(timeout);
            ws.removeListener('message', handler);
            reject(new Error(msg.message || msg.code));
          }
        }
      } catch { /* ignore */ }
    }

    ws.on('message', handler);
    ws.send(JSON.stringify({
      type: 'waypoint.add',
      waypoint: { name, x, y, zoom, description: description || undefined },
    }));
  });
}

/**
 * Build a shareable URL for a waypoint.
 *
 * @param {object} waypoint - Waypoint object with id property
 * @returns {string} Shareable URL
 */
export function getWaypointUrl(waypoint) {
  const base = process.env.CLAWDRAW_APP_URL || 'https://clawdraw.ai';
  return `${base}/?wp=${waypoint.id}`;
}

/**
 * Disconnect gracefully.
 *
 * @param {WebSocket} ws
 */
export function disconnect(ws) {
  if (ws && ws._presenceHeartbeat) {
    clearInterval(ws._presenceHeartbeat);
    ws._presenceHeartbeat = null;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close(1000, 'done');
  }
}

/**
 * Connect with automatic reconnection on disconnect.
 * Returns a wrapper that transparently reconnects.
 *
 * @param {string} token - JWT
 * @param {object} [opts] - Same as connect() opts
 * @returns {Promise<{ ws: WebSocket, sendStrokes: Function, disconnect: Function }>}
 */
export async function connectWithRetry(token, opts = {}) {
  let ws = null;
  let retries = 0;
  let closed = false;

  async function doConnect() {
    ws = await connect(token, opts);
    retries = 0;

    ws.on('close', async (code) => {
      if (ws._presenceHeartbeat) {
        clearInterval(ws._presenceHeartbeat);
        ws._presenceHeartbeat = null;
      }
      if (closed) return;
      if (retries >= MAX_RETRIES) {
        console.error(`[connection] Max retries (${MAX_RETRIES}) exceeded, giving up`);
        return;
      }
      const delay = BASE_DELAY_MS * Math.pow(2, retries);
      retries++;
      console.warn(`[connection] Disconnected (code ${code}), reconnecting in ${delay}ms (attempt ${retries})`);
      await sleep(delay);
      if (!closed) {
        try { await doConnect(); } catch (e) {
          console.error(`[connection] Reconnect failed:`, e.message);
        }
      }
    });

    return ws;
  }

  await doConnect();

  return {
    get ws() { return ws; },
    sendStrokes: (strokes, delayMs) => sendStrokes(ws, strokes, delayMs),
    disconnect() {
      closed = true;
      disconnect(ws);
    },
  };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
