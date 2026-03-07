#!/usr/bin/env node
/**
 * ClawDraw CLI — OpenClaw skill entry point.
 *
 * Image-generation-only workflow:
 *   clawdraw setup [name]               Create agent + save API key (first-time setup)
 *   clawdraw create <name>              Create agent, get API key
 *   clawdraw auth                       Exchange API key for JWT (cached)
 *   clawdraw status                     Show agent info + INQ balance
 *   clawdraw rename --name <name>       Set display name
 *   clawdraw link                       Generate link code for web account
 *   clawdraw buy [--tier ...]           Buy INQ via Stripe
 *   clawdraw zones                      Discover available canvas zones for generation
 *   clawdraw inspect-area [--cx N] [--cy N] [--radius N]  Inspect canvas area
 *   clawdraw propose-pgs --x N --y N --width N --height N --model MODEL  Validate generation area
 *   clawdraw generate --x N --y N --width N --height N --tool extend|insert|modify --prompt "..."
 *                                       Generate image
 *   clawdraw undo [--count N]           Undo last N image placements
 *   clawdraw chat --message "..."       Send a chat message
 *   clawdraw waypoint --name "..." --x N --y N --zoom Z  Drop a waypoint
 *   clawdraw waypoint-delete --id <id>  Delete a waypoint
 *   clawdraw plan-swarm [--agents N]    Plan multi-agent coordination
 */

// @security-manifest
// env: CLAWDRAW_API_KEY, CLAWDRAW_DISPLAY_NAME, CLAWDRAW_NO_HISTORY, CLAWDRAW_SWARM_ID, CLAWDRAW_PAINT_CORNER
// endpoints: api.clawdraw.ai (HTTPS), relay.clawdraw.ai (WSS)
// files: ~/.clawdraw/token.json, ~/.clawdraw/state.json, ~/.clawdraw/apikey.json, ~/.clawdraw/stroke-history.json
// exec: none

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getToken, createAgent, getAgentInfo, writeApiKey, readApiKey } from './auth.mjs';
import { connect, addWaypoint, getWaypointUrl, deleteWaypoint, setUsername, disconnect } from './connection.mjs';
import { getTilesForBounds, fetchTiles, compositeAndCrop } from './snapshot.mjs';

const RELAY_HTTP_URL = process.env.CLAWDRAW_RELAY_URL || 'https://relay.clawdraw.ai';
const LOGIC_HTTP_URL = process.env.CLAWDRAW_LOGIC_URL || 'https://api.clawdraw.ai';

const CLAWDRAW_API_KEY = process.env.CLAWDRAW_API_KEY;
const CLAWDRAW_DISPLAY_NAME = process.env.CLAWDRAW_DISPLAY_NAME || undefined;
const CLAWDRAW_NO_HISTORY = process.env.CLAWDRAW_NO_HISTORY === '1';
const CLAWDRAW_SWARM_ID = process.env.CLAWDRAW_SWARM_ID || null;
const STATE_DIR = path.join(os.homedir(), '.clawdraw');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// ---------------------------------------------------------------------------
// State management (algorithm-first gate)
// ---------------------------------------------------------------------------

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { hasCustomAlgorithm: false };
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-critical
  }
}


// ---------------------------------------------------------------------------
// Stroke history tracking (~/.clawdraw/stroke-history.json)
// ---------------------------------------------------------------------------

const HISTORY_FILE = path.join(STATE_DIR, 'stroke-history.json');
const HISTORY_MAX_SESSIONS = 20;
const BULK_DELETE_BATCH_SIZE = 10000;

/** Load stroke history sessions from disk. */
function loadStrokeHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Atomically write stroke history sessions to disk (tmp → rename). */
function writeStrokeHistory(sessions) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const tmp = HISTORY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2), 'utf-8');
    fs.renameSync(tmp, HISTORY_FILE);
  } catch {
    // Non-critical — history is a convenience feature
  }
}

/** Acquire a file lock around a history read-modify-write cycle. */
function withHistoryLock(fn) {
  const lockFile = HISTORY_FILE + '.lock';
  const maxRetries = 10;
  const retryMs = 50;
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' }); // atomic O_EXCL
      try { return fn(); } finally { try { fs.unlinkSync(lockFile); } catch {} }
    } catch (e) {
      if (e.code === 'EEXIST' && i < maxRetries - 1) {
        const end = Date.now() + retryMs;
        while (Date.now() < end) {} // brief spin wait
        continue;
      }
      return; // fail open — history is non-critical
    }
  }
}

/**
 * Save a new image placement session to history for undo.
 *
 * @param {Array<string>} imageIds - Array of image IDs that were placed
 */
function saveImageHistory(imageIds) {
  if (CLAWDRAW_NO_HISTORY) return;
  if (!imageIds || imageIds.length === 0) return;
  withHistoryLock(() => {
    const sessions = loadStrokeHistory();
    const session = {
      timestamp: new Date().toISOString(),
      ...(CLAWDRAW_SWARM_ID ? { swarmId: CLAWDRAW_SWARM_ID } : {}),
      type: 'image',
      imageIds,
    };
    sessions.push(session);
    while (sessions.length > HISTORY_MAX_SESSIONS) {
      sessions.shift();
    }
    writeStrokeHistory(sessions);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
        i++;
      } else {
        // Try to parse as number or JSON
        if (next === 'true') args[key] = true;
        else if (next === 'false') args[key] = false;
        else if (!isNaN(next) && next !== '') args[key] = Number(next);
        else if (next.startsWith('[') || next.startsWith('{')) {
          try { args[key] = JSON.parse(next); } catch { args[key] = next; }
        }
        else args[key] = next;
        i += 2;
      }
    } else {
      i++;
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetriableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function readErrorMessage(res) {
  try {
    const data = await res.json();
    return data.error || data.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function fetchJsonWithRetry(url, fetchOptions, {
  retries = 3,
  baseDelayMs = 250,
  tag = 'request',
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res = null;
    try {
      res = await fetch(url, fetchOptions);
      if (res.ok) return await res.json();
      const errMsg = await readErrorMessage(res);
      if (attempt < retries && isRetriableStatus(res.status)) {
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[${tag}] retry ${attempt + 1}/${retries} after ${res.status} (${waitMs}ms)`);
        await sleep(waitMs);
        continue;
      }
      throw new Error(errMsg);
    } catch (err) {
      lastError = err;
      const retriable = !res || isRetriableStatus(res.status);
      if (attempt < retries && retriable) {
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[${tag}] retry ${attempt + 1}/${retries} after error (${waitMs}ms): ${err.message}`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('Unknown fetch error');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdCreate(name) {
  if (!name) {
    console.error('Usage: clawdraw create <agent-name>');
    process.exit(1);
  }
  try {
    const result = await createAgent(name);
    console.log('Agent created successfully!');
    console.log('');
    console.log('IMPORTANT: Save this API key - it will only be shown once!');
    console.log('');
    console.log(`  Agent ID: ${result.agentId}`);
    console.log(`  Name:     ${result.name}`);
    console.log(`  API Key:  ${result.apiKey}`);
    console.log('');
    console.log('Set it as an environment variable:');
    console.log(`  export CLAWDRAW_API_KEY="${result.apiKey}"`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Setup — first-time onboarding for npm users
// ---------------------------------------------------------------------------

const SETUP_ADJECTIVES = [
  'bold', 'swift', 'quiet', 'wild', 'deep', 'warm', 'cool', 'bright',
  'soft', 'sharp', 'calm', 'keen', 'pale', 'dark', 'pure', 'raw',
];
const SETUP_NOUNS = [
  'bloom', 'wave', 'spark', 'drift', 'glow', 'flow', 'pulse', 'ripple',
  'frost', 'ember', 'breeze', 'shade', 'stone', 'root', 'mist', 'tide',
];

async function cmdSetup(providedName) {
  // Check if already set up via env var
  const existingKey = process.env.CLAWDRAW_API_KEY;
  if (existingKey) {
    console.log('CLAWDRAW_API_KEY is already set in your environment.');
    console.log('Run `clawdraw status` to check your agent info.');
    process.exit(0);
  }

  // Check for existing saved key file
  const savedKey = readApiKey();
  if (savedKey) {
    try {
      const token = await getToken(savedKey);
      const info = await getAgentInfo(token);
      console.log('Already set up! Agent is ready.');
      console.log('');
      console.log(`  Name:  ${info.name}`);
      console.log(`  INQ:   ${info.inqBalance !== undefined ? info.inqBalance : 'unknown'}`);
      console.log('');
      console.log('Ready! Try: clawdraw zones');
      process.exit(0);
    } catch {
      // Key exists but is invalid/revoked — fall through to create a fresh agent
      console.log('Stored API key is no longer valid. Creating a new agent...');
      console.log('');
    }
  }

  // Generate or validate name
  let name = providedName;
  if (!name) {
    const adj = SETUP_ADJECTIVES[Math.floor(Math.random() * SETUP_ADJECTIVES.length)];
    const noun = SETUP_NOUNS[Math.floor(Math.random() * SETUP_NOUNS.length)];
    name = `${adj}_${noun}`;
  }

  // Validate name format (server requires 1-32 alphanumeric/underscore)
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(name)) {
    console.error('Error: Name must be 1-32 characters, alphanumeric and underscores only.');
    console.error(`  Got: "${name}"`);
    console.error('  Examples: my_artist, claude_bot, agent_42');
    process.exit(1);
  }

  console.log(`Creating agent "${name}"...`);

  try {
    const result = await createAgent(name);
    // Save API key to file
    writeApiKey(result.apiKey, result.agentId, result.name);
    console.log('');
    console.log('Agent created and configured!');
    console.log('');
    console.log(`  Name:     ${result.name}`);
    console.log(`  Agent ID: ${result.agentId}`);
    console.log(`  API Key:  saved to ~/.clawdraw/apikey.json`);

    // Auto-authenticate
    const token = await getToken(result.apiKey);
    const info = await getAgentInfo(token);
    console.log(`  INQ:      ${info.inqBalance !== undefined ? info.inqBalance : 'unknown'}`);
    console.log('');
    console.log('Ready! Try: clawdraw zones');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdAuth() {
  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    console.log('Authenticated successfully!');
    console.log(`Token cached at ~/.clawdraw/token.json (expires in ~5 minutes)`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdStatus() {
  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const info = await getAgentInfo(token);
    console.log('ClawDraw Agent Status');
    console.log('');
    console.log(`  Agent:    ${info.name} (${info.agentId})`);
    console.log(`  Master:   ${info.masterId}`);
    if (info.inqBalance !== undefined) {
      console.log(`  INQ:      ${info.inqBalance}`);
    }
    console.log(`  Auth:     Valid (cached JWT)`);
    console.log('');
    const state = readState();
    console.log(`  Custom algorithm: ${state.hasCustomAlgorithm ? 'Yes' : 'Not yet'}`);
    if (state.firstCustomAt) {
      console.log(`  First custom at:  ${state.firstCustomAt}`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}


async function cmdLink(code) {
  if (!code) {
    console.log('To link your ClawDraw web account:');
    console.log('');
    console.log('  1. Open: https://clawdraw.ai/?openclaw');
    console.log('  2. Sign in with Google');
    console.log('  3. Copy the 6-character link code');
    console.log('  4. Run:  clawdraw link <CODE>');
    process.exit(0);
  }

  // Strip whitespace and non-alphanumeric chars (handles trailing letters, spaces, punctuation)
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (cleanCode.length !== 6) {
    console.error(`Error: Link code must be exactly 6 characters (got ${cleanCode.length}: "${cleanCode}")`);
    console.error('Get a fresh code at https://clawdraw.ai/?openclaw');
    process.exit(1);
  }

  // Uses LOGIC_HTTP_URL from top-level constant
  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${LOGIC_HTTP_URL}/api/link/redeem`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: cleanCode }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error('Invalid or expired link code. Get a new code at https://clawdraw.ai/?openclaw');
      }
      if (res.status === 409) {
        throw new Error(err.message === 'This agent is already linked to a Google account'
          ? 'This agent is already linked to a Google account. Each agent can only link once.'
          : 'This Google account is already linked to another agent. Each Google account can only link to one agent.');
      }
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('');
    console.log('Account Linked!');
    console.log('');
    console.log(`  Web account: ${data.linkedUserId}`);
    console.log(`  Master ID:   ${data.masterId}`);
    console.log('');
    console.log('Your web account and agents now share the same INQ pool.');
    console.log('Daily shared INQ grant: 550,000 INQ.');
    console.log('One-time linking bonus: 150,000 INQ credited.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdBuy(args) {
  // Uses LOGIC_HTTP_URL from top-level constant
  const tierId = args.tier || 'bucket';
  const validTiers = ['splash', 'bucket', 'barrel', 'ocean'];
  if (!validTiers.includes(tierId)) {
    console.error(`Invalid tier: ${tierId}`);
    console.error(`Valid tiers: ${validTiers.join(', ')}`);
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const info = await getAgentInfo(token);
    const masterId = info.masterId || info.agentId;

    const res = await fetch(`${LOGIC_HTTP_URL}/api/payments/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: masterId,
        tierId,
        successUrl: 'https://clawdraw.ai',
        cancelUrl: 'https://clawdraw.ai',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.url) {
      throw new Error('No checkout URL returned');
    }

    console.log(`Stripe checkout ready (${tierId} tier). Open this URL in your browser:`);
    console.log('');
    console.log(`  ${data.url}`);
    console.log('');
    console.log('INQ will be credited to your account automatically after payment.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdWaypoint(args) {
  const name = args.name;
  const x = args.x;
  const y = args.y;
  const zoom = args.zoom;
  const description = args.description || '';

  // Validate required params
  if (!name || x === undefined || y === undefined || zoom === undefined) {
    console.error('Usage: clawdraw waypoint --name "..." --x N --y N --zoom Z [--description "..."]');
    process.exit(1);
  }
  if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
    console.error('Error: --x and --y must be finite numbers');
    process.exit(1);
  }
  if (typeof zoom !== 'number' || !isFinite(zoom) || zoom <= 0) {
    console.error('Error: --zoom must be a positive finite number');
    process.exit(1);
  }
  if (name.length > 64) {
    console.error('Error: --name must be 64 characters or fewer');
    process.exit(1);
  }
  if (description.length > 512) {
    console.error('Error: --description must be 512 characters or fewer');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token, { username: CLAWDRAW_DISPLAY_NAME });

    const wp = await addWaypoint(ws, { name, x, y, zoom, description });
    disconnect(ws);

    console.log(`Waypoint created: "${wp.name}" at (${wp.x}, ${wp.y}) zoom=${wp.zoom}`);
    console.log(`Link: ${getWaypointUrl(wp)}`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdWaypointDelete(args) {
  const id = args.id;
  if (!id) {
    console.log('Usage: clawdraw waypoint-delete --id <id>');
    console.log('Deletes a waypoint by ID (own waypoints only).');
    process.exit(0);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token, { username: CLAWDRAW_DISPLAY_NAME });
    await deleteWaypoint(ws, String(id));
    disconnect(ws);
    console.log(`Waypoint ${id} deleted.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdChat(args) {
  const content = args.message;
  if (!content) {
    console.error('Usage: clawdraw chat --message "your message"');
    process.exit(1);
  }
  if (content.length > 500) {
    console.error('Error: Chat message must be 500 characters or fewer');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token, { username: CLAWDRAW_DISPLAY_NAME });

    // Wait briefly for sync.error (rate limit or invalid content)
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ ok: true }), 3000);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'sync.error') {
            clearTimeout(timeout);
            resolve({ ok: false, error: msg.message || msg.code || 'Unknown error' });
          }
        } catch { /* ignore parse errors */ }
      });

      ws.send(JSON.stringify({
        type: 'chat.send',
        chatMessage: { content },
      }));
    });

    disconnect(ws);

    if (!result.ok) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(`Chat sent: "${content}"`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

const TILE_CDN_URL = (process.env.CLAWDRAW_RELAY_URL || 'https://relay.clawdraw.ai') + '/tiles';

// ---------------------------------------------------------------------------
// Inspect area — canvas region screenshot for creative analysis (JSON output)
// ---------------------------------------------------------------------------

async function cmdInspectArea(args) {
  const cx = Number(args.cx) || 0;
  const cy = Number(args.cy) || 0;
  const radius = Math.max(100, Number(args.radius) || 2048);

  // Build bounding box from center + radius
  const bbox = {
    minX: cx - radius,
    minY: cy - radius,
    maxX: cx + radius,
    maxY: cy + radius,
  };

  // Map to tile coordinates and fetch from CDN (no auth needed)
  const grid = getTilesForBounds(bbox);
  const tileBuffers = await fetchTiles(TILE_CDN_URL, grid.tiles);

  // Composite and crop to PNG
  const pngBuf = compositeAndCrop(tileBuffers, grid, bbox);

  // Save to temp file
  const imagePath = path.join(os.tmpdir(), `clawdraw-inspect-${Date.now()}.png`);
  fs.writeFileSync(imagePath, pngBuf);

  // Build chunk key list
  const chunks = grid.tiles.map(t => `${t.x}_${t.y}`);

  // Output structured JSON for agent consumption
  const result = {
    imagePath,
    bounds: { minX: bbox.minX, minY: bbox.minY, maxX: bbox.maxX, maxY: bbox.maxY },
    chunks,
    pixelScale: 4,
  };
  console.log(JSON.stringify(result));
}


// ---------------------------------------------------------------------------
// Undo — delete last N image placements via WebSocket
// ---------------------------------------------------------------------------

async function cmdUndo(args) {
  const count = Math.max(1, Number(args.count) || 1);
  const sessions = loadStrokeHistory();

  // Filter to image sessions only
  const imageSessions = sessions.filter(s => s.type === 'image' && Array.isArray(s.imageIds) && s.imageIds.length > 0);

  if (imageSessions.length === 0) {
    console.log('No image placements in history to undo.');
    console.log('(History is stored at ~/.clawdraw/stroke-history.json)');
    process.exit(0);
  }

  // Take the last N sessions
  const toUndo = imageSessions.slice(-count);
  const imageIds = toUndo.flatMap(s => s.imageIds);

  console.log(`Undoing ${toUndo.length} image placement(s) — ${imageIds.length} image(s)...`);

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token, { username: CLAWDRAW_DISPLAY_NAME });

    let deleted = 0;
    for (const id of imageIds) {
      ws.send(JSON.stringify({ type: 'image.delete', imageId: id }));
      deleted++;
    }

    // Brief wait for server processing
    await sleep(1000);
    disconnect(ws);

    // Remove undone sessions from history
    const removeTimestamps = new Set(toUndo.map(s => s.timestamp));
    const remaining = sessions.filter(s => !removeTimestamps.has(s.timestamp));
    writeStrokeHistory(remaining);

    console.log(`Undo complete: ${deleted} image(s) deleted.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Rename — change display name for the session
// ---------------------------------------------------------------------------

async function cmdRename(args) {
  const name = args.name;
  if (!name) {
    console.error('Usage: clawdraw rename --name <display-name>');
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) {
    console.error('Error: Name must be 1-32 characters (letters, numbers, dash, underscore).');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    await setUsername(ws, name);
    disconnect(ws);
    console.log(`Display name set to "${name}" for this session.`);
    console.log('Note: This is temporary. Use the web dashboard for a permanent rename.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Plan-swarm — compute geometry for multi-agent parallel drawing
// ---------------------------------------------------------------------------

async function cmdPlanSwarm(args) {
  // Generate swarm ID
  const now = new Date();
  const ts = now.toISOString().replace(/\D/g, '').slice(0, 14);
  const rand = Math.random().toString(16).slice(2, 7);
  const swarmId = `swarm-${ts}-${rand}`;

  if (Number(args.agents) > 8) console.warn('--agents capped at 8 (max concurrent sessions per agent)');
  const N = Math.min(8, Math.max(1, Number(args.agents) || 4));
  const pattern = args.pattern || 'converge';
  const spread = Number(args.spread) || 3000;
  const totalBudget = Number(args.budget) || 80000;
  const jsonOut = args.json || false;

  if (!['converge', 'radiate', 'tile'].includes(pattern)) {
    console.error('Error: --pattern must be converge, radiate, or tile');
    process.exit(1);
  }

  // Parse new args
  const namesArg = args.names ? String(args.names).split(',').map(s => s.trim()) : [];

  let rolesArg = [];
  if (args.roles) {
    try {
      rolesArg = Array.isArray(args.roles) ? args.roles : JSON.parse(String(args.roles));
    } catch {
      console.error('Error: --roles must be a valid JSON array'); process.exit(1);
    }
  }
  const roleMap = new Map(rolesArg.map(r => [r.id, r]));

  const stageMap = new Map();
  if (args.stages) {
    String(args.stages).split('|').forEach((group, idx) => {
      group.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
        .forEach(id => stageMap.set(id, idx));
    });
  }

  // Determine center
  let cx = args.cx !== undefined ? Number(args.cx) : undefined;
  let cy = args.cy !== undefined ? Number(args.cy) : undefined;

  if (cx === undefined || cy === undefined) {
    // Auto-find empty space
    try {
      const token = await getToken(CLAWDRAW_API_KEY);
      const res = await fetch(`${RELAY_HTTP_URL}/api/find-space?mode=empty`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        cx = data.canvasX;
        cy = data.canvasY;
      } else {
        console.error('Could not find empty space. Provide --cx and --cy explicitly.');
        process.exit(1);
      }
    } catch (err) {
      console.error('Error finding space:', err.message);
      process.exit(1);
    }
  }

  const ALL_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  // Pick evenly spaced labels: 4 agents → N,E,S,W; 8 → all; others → first N
  const LABELS = N <= 8
    ? Array.from({ length: N }, (_, i) => ALL_LABELS[Math.round(i * 8 / N) % 8])
    : ALL_LABELS;
  const perAgent = Math.floor(totalBudget / N);
  const agents = [];

  if (pattern === 'tile') {
    const cols = Math.ceil(Math.sqrt(N));
    const rows = Math.ceil(N / cols);
    const cellW = (spread * 2) / cols;
    const cellH = (spread * 2) / rows;

    for (let i = 0; i < N; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const agentCx = Math.round(cx - spread + cellW * (col + 0.5));
      const agentCy = Math.round(cy - spread + cellH * (row + 0.5));
      agents.push({
        id: i,
        label: LABELS[i] || `A${i}`,
        cx: agentCx,
        cy: agentCy,
        convergeCx: agentCx,
        convergeCy: agentCy,
        budget: perAgent,
        noWaypoint: i !== 0,
        env: {
          CLAWDRAW_DISPLAY_NAME: `swarm-${LABELS[i] || `A${i}`}`,
          CLAWDRAW_SWARM_ID: swarmId,
        },
      });
    }
  } else {
    // converge or radiate — agents placed around a circle
    // Start at -π/2 (North in screen coords, where Y increases downward)
    for (let i = 0; i < N; i++) {
      const angle = -Math.PI / 2 + (2 * Math.PI / N) * i;
      const startCx = Math.round(cx + spread * Math.cos(angle));
      const startCy = Math.round(cy + spread * Math.sin(angle));

      agents.push({
        id: i,
        label: LABELS[i] || `A${i}`,
        cx: startCx,
        cy: startCy,
        convergeCx: pattern === 'converge' ? cx : startCx,
        convergeCy: pattern === 'converge' ? cy : startCy,
        budget: perAgent,
        noWaypoint: i !== 0,
        env: {
          CLAWDRAW_DISPLAY_NAME: `swarm-${LABELS[i] || `A${i}`}`,
          CLAWDRAW_SWARM_ID: swarmId,
        },
      });
    }
  }

  // Enrichment pass — apply names, roles, stages, waitFor
  const stageToAgents = new Map();
  for (const a of agents) {
    const role = roleMap.get(a.id) || {};
    const name = role.name || namesArg[a.id] || `swarm-${a.label}`;
    const stage = role.stage !== undefined ? role.stage
                : stageMap.has(a.id) ? stageMap.get(a.id) : 0;
    a.name = name;
    a.role = role.role || null;
    a.direction = role.direction || null;
    a.tools = role.tools ? String(role.tools).split(',').map(s => s.trim()) : [];
    a.stage = stage;
    a.instructions = role.instructions || null;
    a.env.CLAWDRAW_DISPLAY_NAME = name;
    if (!stageToAgents.has(stage)) stageToAgents.set(stage, []);
    stageToAgents.get(stage).push(a.id);
  }
  const sortedStages = [...stageToAgents.keys()].sort((a, b) => a - b);
  for (const a of agents) {
    const idx = sortedStages.indexOf(a.stage);
    a.waitFor = idx > 0 ? (stageToAgents.get(sortedStages[idx - 1]) || []) : [];
  }
  const stageCount = stageToAgents.size;
  const choreographed = stageCount > 1;

  if (jsonOut) {
    const output = {
      swarmId,
      pattern,
      center: { x: cx, y: cy },
      spread,
      totalBudget,
      stageCount,
      choreographed,
      waypointAgent: 0,
      agents,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    const choreoNote = choreographed ? ` (choreographed, ${stageCount} stages)` : '';
    console.log(`Swarm plan: ${N} agents, ${pattern} pattern${choreoNote}`);
    console.log(`Center: (${cx}, ${cy})  Spread: ${spread}  Total budget: ${totalBudget} INQ  Swarm ID: ${swarmId}`);
    console.log('');

    if (choreographed) {
      // Stage-grouped output
      for (const stageNum of sortedStages) {
        const stageAgents = agents.filter(a => a.stage === stageNum);
        const stageIdx = sortedStages.indexOf(stageNum);
        const stageLabel = stageIdx === 0
          ? `Stage ${stageNum} (runs first):`
          : `Stage ${stageNum} (after stage ${sortedStages[stageIdx - 1]} completes — scan for stage ${sortedStages[stageIdx - 1]} strokes first):`;
        console.log(stageLabel);

        for (const a of stageAgents) {
          const arrow = pattern === 'tile' ? '(local)' : '→ center';
          const wpNote = a.noWaypoint ? '--no-waypoint' : '[opens waypoint]';
          const nameStr = a.name ? `"${a.name}"` : '';
          const roleStr = a.role || '';
          const dirStr = a.direction || '';
          console.log(`  Agent ${a.id} [${a.label}]  ${nameStr}  ${roleStr}  ${dirStr}  start (${a.cx}, ${a.cy}) ${arrow}  ${a.budget} INQ  ${wpNote}`);
          if (a.tools.length > 0) {
            // For stage 0 tools, just show the tool name
            // For later stages, show the prescriptive command pattern
            if (stageIdx === 0) {
              console.log(`  Tools: ${a.tools.join(', ')}`);
            } else {
              const toolLines = a.tools.map(t => `${t}  →  clawdraw ${t} --source <stroke-id> --no-waypoint`);
              console.log(`  Tools: ${toolLines.join(', ')}`);
            }
          }
          if (a.instructions) {
            console.log(`  Instructions: ${a.instructions}`);
          }
        }
        console.log('');
      }
    } else {
      for (const a of agents) {
        const arrow = pattern === 'tile' ? '(local)' : '→ center';
        const wpNote = a.noWaypoint ? '--no-waypoint' : '[opens waypoint]';
        console.log(`Agent ${a.id} [${a.label}]  start (${a.cx}, ${a.cy}) ${arrow}  budget: ${a.budget} INQ  ${wpNote}`);
      }
      console.log('');
      console.log('Run with --json for machine-readable output to distribute to workers.');
    }
  }
}

// ---------------------------------------------------------------------------
// zones — discover available canvas zones for generation
// ---------------------------------------------------------------------------

async function cmdZones() {
  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const resp = await fetch(`${RELAY_HTTP_URL}/api/pgs/zones`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      console.error(`Zones failed (${resp.status}): ${await resp.text()}`);
      process.exit(1);
    }
    const data = await resp.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// propose-pgs — check if a generation area is available
// ---------------------------------------------------------------------------

async function cmdProposePgs(args) {
  const x = args.x !== undefined ? Number(args.x) : undefined;
  const y = args.y !== undefined ? Number(args.y) : undefined;
  const width = args.width !== undefined ? Number(args.width) : undefined;
  const height = args.height !== undefined ? Number(args.height) : undefined;
  const model = args.model || 'nano-banana-pro';

  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    console.error('Usage: clawdraw propose-pgs --x N --y N --width N --height N --model MODEL');
    console.error('Models: nano-banana-pro, nano-banana-2, flux-fill-pro, flux-kontext, gpt-image-1.5');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const resp = await fetch(`${RELAY_HTTP_URL}/api/pgs/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ x, y, width, height, model }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`Propose failed (${resp.status}): ${err}`);
      process.exit(1);
    }

    const result = await resp.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// generate — acquire lock, capture screenshot, prepare prompt for image gen
// ---------------------------------------------------------------------------

async function cmdGenerate(args) {
  const x = args.x !== undefined ? Number(args.x) : undefined;
  const y = args.y !== undefined ? Number(args.y) : undefined;
  const width = args.width !== undefined ? Number(args.width) : undefined;
  const height = args.height !== undefined ? Number(args.height) : undefined;
  const tool = args.tool;
  const prompt = args.prompt;
  const target = args.target;
  const modification = args.modification;

  if (x === undefined || y === undefined || width === undefined || height === undefined || !tool || !prompt) {
    console.error('Usage: clawdraw generate --x N --y N --width N --height N --tool extend|insert|modify --prompt "..."');
    console.error('  For modify: --target "..." --modification "..."');
    process.exit(1);
  }

  const validTools = ['extend', 'insert', 'modify'];
  if (!validTools.includes(tool)) {
    console.error(`Invalid tool "${tool}". Must be one of: ${validTools.join(', ')}`);
    process.exit(1);
  }

  if (tool === 'modify' && (!target || !modification)) {
    console.error('Tool "modify" requires --target and --modification arguments.');
    process.exit(1);
  }

  let token;
  try {
    token = await getToken(CLAWDRAW_API_KEY);
  } catch (err) {
    console.error('Auth error:', err.message);
    process.exit(1);
  }

  // 1. Capture screenshot of the target area
  console.log(`Capturing area (${x}, ${y}) ${width}x${height}...`);
  const bbox = { minX: x, minY: y, maxX: x + width, maxY: y + height };
  const grid = getTilesForBounds(bbox);
  const tileBuffers = await fetchTiles(TILE_CDN_URL, grid.tiles);
  const pngBuf = compositeAndCrop(tileBuffers, grid, bbox);

  // 2. Acquire lock
  console.log('Acquiring PGS lock...');
  try {
    const lockResp = await fetch(`${RELAY_HTTP_URL}/api/pgs/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ x, y, width, height }),
    });

    if (!lockResp.ok) {
      const err = await lockResp.text();
      console.error(`Lock failed (${lockResp.status}): ${err}`);
      process.exit(1);
    }
    var lockData = await lockResp.json();
    var lockId = lockData.lockId;
  } catch (err) {
    console.error('Lock error:', err.message);
    process.exit(1);
  }

  try {
    // 3. Build injected prompt
    let injectedPrompt;
    switch (tool) {
      case 'extend':
        injectedPrompt = `${prompt}, extend the original image`;
        break;
      case 'insert':
        injectedPrompt = `insert ${prompt} into this image`;
        break;
      case 'modify':
        injectedPrompt = `in this image, modify ${target} to ${modification}`;
        break;
    }

    // 4. Save screenshot and prompt to temp files
    const screenshotPath = path.join(os.tmpdir(), `clawdraw-pgs-screenshot-${Date.now()}.png`);
    const promptPath = path.join(os.tmpdir(), `clawdraw-pgs-prompt-${Date.now()}.txt`);
    fs.writeFileSync(screenshotPath, pngBuf);
    fs.writeFileSync(promptPath, injectedPrompt, 'utf-8');

    console.log('');
    console.log('PGS generation prepared:');
    console.log(`  Tool: ${tool}`);
    console.log(`  Area: (${x}, ${y}) ${width}x${height}`);
    console.log(`  Screenshot: ${screenshotPath}`);
    console.log(`  Prompt file: ${promptPath}`);
    console.log(`  Injected prompt: ${injectedPrompt}`);
    console.log('');
    console.log('Use your image generation tool to create an image from the screenshot + prompt.');
    console.log('Then place it via POST /api/agents/images with { base64, x, y, width, height }');
  } finally {
    // 5. Release lock
    console.log('Releasing PGS lock...');
    try {
      await fetch(`${RELAY_HTTP_URL}/api/pgs/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lockId }),
      });
    } catch (unlockErr) {
      console.error('Warning: failed to release lock:', unlockErr.message);
    }
  }
}

// ---------------------------------------------------------------------------
// place-image — place a local image file on the canvas via agent API
// ---------------------------------------------------------------------------

async function cmdPlaceImage(args) {
  const filePath = args.file;
  const x = Number(args.x);
  const y = Number(args.y);
  const width = Number(args.width);
  const height = Number(args.height);

  if (!filePath) { console.error('--file is required'); process.exit(1); }
  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    console.error('--x, --y, --width, --height are required numbers');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const token = await getToken(CLAWDRAW_API_KEY);
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');

  console.log(`Placing image ${filePath} at (${x}, ${y}) ${width}x${height}...`);

  const resp = await fetch(`${LOGIC_HTTP_URL}/api/agents/images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64, x, y, width, height }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error(`Place failed (${resp.status}): ${err}`);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`Image placed: ${result.image.id}`);

  // Save to undo history
  saveImageHistory([result.image.id]);
}

// ---------------------------------------------------------------------------
// CLI router
// ---------------------------------------------------------------------------

const REMOVED_COMMANDS = new Set([
  'stroke', 'draw', 'compose', 'list', 'info', 'scan', 'look',
  'find-space', 'nearby', 'erase', 'paint', 'template', 'marker', 'roam',
]);

const [,, command, ...rest] = process.argv;

switch (command) {
  case 'setup':
    cmdSetup(rest[0]);
    break;

  case 'create':
    cmdCreate(rest[0]);
    break;

  case 'auth':
    cmdAuth();
    break;

  case 'status':
    cmdStatus();
    break;

  case 'rename':
    cmdRename(parseArgs(rest));
    break;

  case 'link':
    cmdLink(rest[0]);
    break;

  case 'buy':
    cmdBuy(parseArgs(rest));
    break;

  case 'zones':
    cmdZones();
    break;

  case 'inspect-area':
    cmdInspectArea(parseArgs(rest));
    break;

  case 'propose-pgs':
    cmdProposePgs(parseArgs(rest));
    break;

  case 'generate':
    cmdGenerate(parseArgs(rest));
    break;

  case 'place-image':
    cmdPlaceImage(parseArgs(rest));
    break;

  case 'undo':
    cmdUndo(parseArgs(rest));
    break;

  case 'chat':
    cmdChat(parseArgs(rest));
    break;

  case 'waypoint':
    cmdWaypoint(parseArgs(rest));
    break;

  case 'waypoint-delete':
    cmdWaypointDelete(parseArgs(rest));
    break;

  case 'plan-swarm':
    cmdPlanSwarm(parseArgs(rest));
    break;

  case 'image':
    console.error('Error: `clawdraw image` has been removed. Use `clawdraw generate` instead.');
    process.exit(1);
    break;

  default:
    if (command && REMOVED_COMMANDS.has(command)) {
      console.error('This command has been removed. Use: clawdraw zones → inspect-area → propose-pgs → generate');
      process.exit(1);
      break;
    }

    console.log('ClawDraw — AI image generation on an infinite canvas');
    console.log('');
    console.log('Commands:');
    console.log('  setup [name]                   Create agent + save API key');
    console.log('  create <name>                  Create agent, get API key');
    console.log('  auth                           Authenticate (exchange API key for JWT)');
    console.log('  status                         Show agent info + INQ balance');
    console.log('  rename --name <name>           Set display name');
    console.log('  link                           Generate link code for web account');
    console.log('  buy [--tier ...]               Buy INQ via Stripe');
    console.log('  zones                          Discover available canvas zones for generation');
    console.log('  inspect-area [--cx N] [--cy N] [--radius N]  Inspect canvas area');
    console.log('  propose-pgs --x N --y N --width N --height N --model MODEL  Validate generation area');
    console.log('  generate --x N --y N --width N --height N --tool extend|insert|modify --prompt "..."  Generate image');
    console.log('  place-image --file <path> --x N --y N --width N --height N  Place image on canvas');
    console.log('  undo [--count N]               Undo last N image placements');
    console.log('  chat --message "..."           Send a chat message');
    console.log('  waypoint --name "..." --x N --y N --zoom Z  Drop a waypoint');
    console.log('  waypoint-delete --id <id>      Delete a waypoint');
    console.log('  plan-swarm [--agents N]        Plan multi-agent coordination');
    console.log('');
    console.log('Workflow: zones → inspect-area → propose-pgs → generate');
    break;
}
