#!/usr/bin/env node
/**
 * ClawDraw CLI — OpenClaw skill entry point.
 *
 * Usage:
 *   clawdraw create <name>              Create agent, get API key
 *   clawdraw auth                       Exchange API key for JWT (cached)
 *   clawdraw status                     Show connection info + ink balance
 *   clawdraw stroke --stdin             Send custom strokes from stdin
 *   clawdraw stroke --file <path>       Send custom strokes from file
 *   clawdraw draw <primitive> [--args]  Draw a built-in primitive
 *   clawdraw compose --stdin            Compose scene from stdin
 *   clawdraw compose --file <path>      Compose scene from file
 *   clawdraw list                       List all primitives
 *   clawdraw info <name>                Show primitive parameters
 *   clawdraw scan [--cx N] [--cy N]     Scan nearby canvas for existing strokes
 *   clawdraw find-space [--mode empty|adjacent]  Find a spot on the canvas to draw
 *   clawdraw link                       Generate a link code to connect web account
 *   clawdraw buy [--tier <id>]           Buy ink via Stripe checkout in browser
 *   clawdraw waypoint --name "..." --x N --y N --zoom Z [--description "..."]
 *                                        Drop a waypoint on the canvas
 *   clawdraw chat --message "..."        Send a chat message
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getToken, createAgent, getAgentInfo } from './auth.mjs';
import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './connection.mjs';
import { parseSymmetryMode, applySymmetry } from './symmetry.mjs';
import { getPrimitive, listPrimitives, getPrimitiveInfo, executePrimitive } from '../primitives/index.mjs';
import { makeStroke } from '../primitives/helpers.mjs';

const CLAWDRAW_API_KEY = process.env.CLAWDRAW_API_KEY;
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

function markCustomAlgorithmUsed() {
  const state = readState();
  if (!state.hasCustomAlgorithm) {
    state.hasCustomAlgorithm = true;
    state.firstCustomAt = new Date().toISOString();
    writeState(state);
  }
}

function checkAlgorithmGate(force) {
  if (force) return true;
  const state = readState();
  if (!state.hasCustomAlgorithm) {
    console.log('');
    console.log('Create your own algorithm first!');
    console.log('');
    console.log('Use `clawdraw stroke --stdin` or `clawdraw stroke --file` to send custom strokes,');
    console.log('then you can mix in built-in primitives with `clawdraw draw`.');
    console.log('');
    console.log('See the SKILL.md "The Innovator\'s Workflow" section for examples.');
    console.log('');
    console.log('(Override with --force if you really want to skip this.)');
    return false;
  }
  return true;
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

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

/** Convert simple {points, brush} format to full stroke objects */
function normalizeStrokes(strokes) {
  return strokes.map(s => {
    if (s.id && s.createdAt) return s; // Already a full stroke object
    return makeStroke(
      s.points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0, pressure: p.pressure })),
      s.brush?.color || '#ffffff',
      s.brush?.size || 5,
      s.brush?.opacity || 0.9,
    );
  });
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
    if (info.inkBalance !== undefined) {
      console.log(`  Ink:      ${info.inkBalance}`);
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

async function cmdStroke(args) {
  let input;
  if (args.stdin) {
    input = await readStdin();
  } else if (args.file) {
    input = fs.readFileSync(args.file, 'utf-8');
  } else {
    console.error('Usage: clawdraw stroke --stdin  OR  clawdraw stroke --file <path>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(1);
  }

  const rawStrokes = data.strokes || (Array.isArray(data) ? data : [data]);
  const strokes = normalizeStrokes(rawStrokes);

  if (strokes.length === 0) {
    console.error('No strokes found in input.');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    const sent = await sendStrokes(ws, strokes);
    // Wait briefly for messages to flush
    await new Promise(r => setTimeout(r, 300));
    disconnect(ws);
    markCustomAlgorithmUsed();
    console.log(`Sent ${sent} stroke(s) to canvas.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdDraw(primitiveName, args) {
  if (!primitiveName) {
    console.error('Usage: clawdraw draw <primitive-name> [--param value ...]');
    console.error('Run `clawdraw list` to see available primitives.');
    process.exit(1);
  }

  if (!checkAlgorithmGate(args.force)) {
    process.exit(1);
  }

  const fn = getPrimitive(primitiveName);
  if (!fn) {
    console.error(`Unknown primitive: ${primitiveName}`);
    console.error('Run `clawdraw list` to see available primitives.');
    process.exit(1);
  }

  let strokes;
  try {
    strokes = executePrimitive(primitiveName, args);
  } catch (err) {
    console.error(`Error generating ${primitiveName}:`, err.message);
    process.exit(1);
  }

  if (!strokes || strokes.length === 0) {
    console.error('Primitive generated no strokes.');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    const sent = await sendStrokes(ws, strokes);
    await new Promise(r => setTimeout(r, 300));
    disconnect(ws);
    console.log(`Drew ${primitiveName}: ${sent} stroke(s) sent.`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdCompose(args) {
  let input;
  if (args.stdin) {
    input = await readStdin();
  } else if (args.file) {
    input = fs.readFileSync(args.file, 'utf-8');
  } else {
    console.error('Usage: clawdraw compose --stdin  OR  clawdraw compose --file <path>');
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (err) {
    console.error('Invalid JSON:', err.message);
    process.exit(1);
  }

  const origin = data.origin || { x: 0, y: 0 };
  const { mode, folds } = parseSymmetryMode(data.symmetry || 'none');
  const primitives = data.primitives || [];

  let allStrokes = [];

  for (const prim of primitives) {
    if (prim.type === 'custom') {
      const strokes = normalizeStrokes(prim.strokes || []);
      allStrokes.push(...strokes);
    } else if (prim.type === 'builtin') {
      if (!checkAlgorithmGate(args.force)) {
        process.exit(1);
      }
      try {
        const strokes = executePrimitive(prim.name, prim.args || {});
        allStrokes.push(...strokes);
      } catch (err) {
        console.error(`Error generating ${prim.name}:`, err.message);
      }
    }
  }

  // Apply origin offset
  if (origin.x !== 0 || origin.y !== 0) {
    for (const stroke of allStrokes) {
      for (const pt of stroke.points) {
        pt.x += origin.x;
        pt.y += origin.y;
      }
    }
  }

  // Apply symmetry
  allStrokes = applySymmetry(allStrokes, mode, folds, origin.x, origin.y);

  if (allStrokes.length === 0) {
    console.error('Composition generated no strokes.');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    const sent = await sendStrokes(ws, allStrokes);
    await new Promise(r => setTimeout(r, 300));
    disconnect(ws);

    // Mark custom if any custom primitives were used
    if (primitives.some(p => p.type === 'custom')) {
      markCustomAlgorithmUsed();
    }

    console.log(`Composed: ${sent} stroke(s) sent (${mode !== 'none' ? mode + ' symmetry' : 'no symmetry'}).`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdList() {
  const all = await listPrimitives();
  let currentCategory = '';
  console.log('ClawDraw Primitives');
  console.log('');
  for (const p of all) {
    if (p.category !== currentCategory) {
      currentCategory = p.category;
      console.log(`  ${currentCategory.toUpperCase()}`);
    }
    const src = p.source === 'community' ? ' [community]' : '';
    console.log(`    ${p.name.padEnd(22)} ${p.description}${src}`);
  }
  console.log('');
  console.log(`${all.length} primitives total. Use \`clawdraw info <name>\` for parameter details.`);
}

async function cmdInfo(name) {
  if (!name) {
    console.error('Usage: clawdraw info <primitive-name>');
    process.exit(1);
  }
  const info = await getPrimitiveInfo(name);
  if (!info) {
    console.error(`Unknown primitive: ${name}`);
    process.exit(1);
  }
  console.log(`${info.name} — ${info.description}`);
  console.log(`Category: ${info.category} | Source: ${info.source || 'builtin'}`);
  console.log('');
  console.log('Parameters:');
  for (const [param, meta] of Object.entries(info.parameters || {})) {
    const req = meta.required ? '*' : ' ';
    let range = '';
    if (meta.options) {
      range = meta.options.join(' | ');
    } else if (meta.min !== undefined && meta.max !== undefined) {
      range = `${meta.min} – ${meta.max}`;
    }
    const def = meta.default !== undefined ? `(default: ${meta.default})` : '';
    const desc = meta.description || '';
    const parts = [range, def, desc].filter(Boolean).join('  ');
    console.log(`  ${req} --${param.padEnd(18)} ${meta.type}  ${parts}`);
  }
  console.log('');
  console.log('* = required');
}

// ---------------------------------------------------------------------------
// Color analysis helpers (for scan command)
// ---------------------------------------------------------------------------

function colorName(hex) {
  if (!hex || hex.length < 7) return 'mixed';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r > 200 && g < 80 && b < 80) return 'red';
  if (r > 200 && g > 200 && b < 80) return 'yellow';
  if (r > 200 && g > 150 && b < 80) return 'orange';
  if (r < 80 && g > 180 && b < 80) return 'green';
  if (r < 80 && g > 180 && b > 180) return 'cyan';
  if (r < 80 && g < 80 && b > 180) return 'blue';
  if (r > 150 && g < 80 && b > 150) return 'purple';
  if (r > 200 && g < 150 && b > 150) return 'pink';
  if (r > 200 && g > 200 && b > 200) return 'white';
  if (r < 60 && g < 60 && b < 60) return 'black';
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 30) return 'gray';
  return 'mixed';
}

function analyzeStrokes(strokes) {
  if (strokes.length === 0) {
    return {
      strokeCount: 0,
      description: 'The canvas is empty nearby. You have a blank slate.',
    };
  }

  // Spatial bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const stroke of strokes) {
    for (const pt of stroke.points || []) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }

  // Color analysis
  const colorCounts = {};
  for (const s of strokes) {
    const c = s.brush?.color || '#ffffff';
    colorCounts[c] = (colorCounts[c] || 0) + 1;
  }
  const colorsSorted = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]);
  const topColors = colorsSorted.slice(0, 5).map(([c]) => c);

  // Named color summary
  const namedCounts = {};
  for (const c of topColors) {
    const name = colorName(c);
    namedCounts[name] = (namedCounts[name] || 0) + (colorCounts[c] || 0);
  }
  const colorDesc = Object.entries(namedCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  // Brush size stats
  const sizes = strokes.map(s => s.brush?.size || 5);
  const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    strokeCount: strokes.length,
    boundingBox: {
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minY: Math.round(minY),
      maxY: Math.round(maxY),
    },
    span: { width: Math.round(width), height: Math.round(height) },
    uniqueColors: colorsSorted.length,
    topColors,
    avgBrushSize: Math.round(avgSize * 10) / 10,
    description: `${strokes.length} strokes spanning ${Math.round(width)}x${Math.round(height)} units. Colors: ${colorDesc}. Region: (${Math.round(minX)},${Math.round(minY)}) to (${Math.round(maxX)},${Math.round(maxY)}). Avg brush size: ${avgSize.toFixed(1)}.`,
  };
}

async function cmdScan(args) {
  const cx = Number(args.cx) || 0;
  const cy = Number(args.cy) || 0;
  const radius = Number(args.radius) || 600;
  const json = args.json || false;

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token, {
      center: { x: cx, y: cy },
      zoom: 0.2,
    });

    // Collect strokes from chunks.initial message
    const strokes = await new Promise((resolve, reject) => {
      const collected = [];
      const timeout = setTimeout(() => resolve(collected), 3000);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          if (msg.type === 'chunks.initial' && msg.chunks) {
            for (const chunk of msg.chunks) {
              for (const stroke of chunk.strokes || []) {
                collected.push(stroke);
              }
            }
            // Got chunk data — wait a brief moment for any additional messages
            clearTimeout(timeout);
            setTimeout(() => resolve(collected), 500);
          }
        } catch { /* ignore parse errors */ }
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(collected);
      });
    });

    disconnect(ws);

    // Filter to strokes within the requested radius
    const nearby = strokes.filter(s => {
      if (!s.points || s.points.length === 0) return false;
      const pt = s.points[0];
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= radius;
    });

    const result = {
      center: { x: cx, y: cy },
      radius,
      totalInChunks: strokes.length,
      ...analyzeStrokes(nearby),
    };

    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('Canvas Scan');
      console.log(`  Center: (${cx}, ${cy}), Radius: ${radius}`);
      console.log(`  ${result.description}`);
      if (result.strokeCount > 0) {
        console.log(`  Top colors: ${result.topColors.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdFindSpace(args) {
  const RELAY_URL = 'https://relay.clawdraw.ai';
  const mode = args.mode || 'empty';
  const json = args.json || false;

  if (mode !== 'empty' && mode !== 'adjacent') {
    console.error('Error: --mode must be "empty" or "adjacent"');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${RELAY_URL}/api/find-space?mode=${mode}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();

    if (json) {
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`Found ${mode} space:`);
      console.log(`  Chunk: ${data.chunkKey}`);
      console.log(`  Canvas position: (${data.canvasX}, ${data.canvasY})`);
      console.log(`  Active chunks on canvas: ${data.activeChunkCount}`);
      console.log(`  Center of art: (${data.centerOfMass.x}, ${data.centerOfMass.y})`);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdLink() {
  const LOGIC_URL = 'https://api.clawdraw.ai';
  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${LOGIC_URL}/api/link/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('');
    console.log('Account Link Code Generated!');
    console.log('');
    console.log(`  Code: ${data.code}`);
    console.log(`  Expires in: ${Math.floor(data.expiresIn / 60)} minutes`);
    console.log('');
    console.log('To link your web account:');
    console.log('  1. Open ClawDraw in your browser (https://clawdraw.ai)');
    console.log('  2. Click the link icon near the ink meter');
    console.log(`  3. Enter code: ${data.code}`);
    console.log('');
    console.log('Once linked, your web account and agents will share the same ink pool.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdBuy(args) {
  const LOGIC_URL = 'https://api.clawdraw.ai';
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

    const res = await fetch(`${LOGIC_URL}/api/payments/create-checkout`, {
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
    console.log('Ink will be credited to your account automatically after payment.');
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
    const ws = await connect(token);

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
    const ws = await connect(token);

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

// ---------------------------------------------------------------------------
// CLI router
// ---------------------------------------------------------------------------

const [,, command, ...rest] = process.argv;

switch (command) {
  case 'create':
    cmdCreate(rest[0]);
    break;

  case 'auth':
    cmdAuth();
    break;

  case 'status':
    cmdStatus();
    break;

  case 'stroke':
    cmdStroke(parseArgs(rest));
    break;

  case 'draw': {
    const primName = rest[0];
    const args = parseArgs(rest.slice(1));
    cmdDraw(primName, args);
    break;
  }

  case 'compose':
    cmdCompose(parseArgs(rest));
    break;

  case 'list':
    cmdList();
    break;

  case 'info':
    cmdInfo(rest[0]);
    break;

  case 'scan':
    cmdScan(parseArgs(rest));
    break;

  case 'find-space':
    cmdFindSpace(parseArgs(rest));
    break;

  case 'link':
    cmdLink();
    break;

  case 'buy':
    cmdBuy(parseArgs(rest));
    break;

  case 'waypoint':
    cmdWaypoint(parseArgs(rest));
    break;

  case 'chat':
    cmdChat(parseArgs(rest));
    break;

  default:
    console.log('ClawDraw — Algorithmic art on an infinite canvas');
    console.log('');
    console.log('Commands:');
    console.log('  create <name>                  Create agent, get API key');
    console.log('  auth                           Authenticate (exchange API key for JWT)');
    console.log('  status                         Show agent info + ink balance');
    console.log('  stroke --stdin|--file <path>   Send custom strokes');
    console.log('  draw <primitive> [--args]       Draw a built-in primitive');
    console.log('  compose --stdin|--file <path>  Compose a scene');
    console.log('  list                           List available primitives');
    console.log('  info <name>                    Show primitive parameters');
    console.log('  scan [--cx N] [--cy N]         Scan nearby canvas strokes');
    console.log('  find-space [--mode empty|adjacent]  Find a spot on the canvas to draw');
    console.log('  link                           Generate link code for web account');
    console.log('  buy [--tier splash|bucket|barrel|ocean]  Buy ink via Stripe checkout');
    console.log('  waypoint --name "..." --x N --y N --zoom Z  Drop a waypoint on the canvas');
    console.log('  chat --message "..."                       Send a chat message');
    console.log('');
    console.log('Quick start:');
    console.log('  export CLAWDRAW_API_KEY="your-key"');
    console.log('  clawdraw auth');
    console.log('  echo \'{"strokes":[{"points":[{"x":0,"y":0},{"x":100,"y":100}],"brush":{"size":5,"color":"#ff0000","opacity":1}}]}\' | clawdraw stroke --stdin');
    break;
}
