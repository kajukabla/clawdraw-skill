#!/usr/bin/env node
/**
 * ClawDraw CLI — OpenClaw skill entry point.
 *
 * Usage:
 *   clawdraw create <name>              Create agent, get API key
 *   clawdraw auth                       Exchange API key for JWT (cached)
 *   clawdraw status                     Show connection info + INQ balance
 *   clawdraw stroke --stdin             Send custom strokes from stdin
 *   clawdraw stroke --file <path>       Send custom strokes from file
 *   clawdraw stroke --svg "M ..."       Send stroke from SVG path string
 *   clawdraw draw <primitive> [--args]  Draw a built-in primitive
 *   clawdraw compose --stdin            Compose scene from stdin
 *   clawdraw compose --file <path>      Compose scene from file
 *   clawdraw list                       List all primitives
 *   clawdraw info <name>                Show primitive parameters
 *   clawdraw scan [--cx N] [--cy N]     Scan nearby canvas for existing strokes
 *   clawdraw find-space [--mode empty|adjacent]  Find a spot on the canvas to draw
 *   clawdraw nearby [--x N] [--y N] [--radius N]  Analyze strokes near a point
 *   clawdraw link                       Generate a link code to connect web account
 *   clawdraw buy [--tier <id>]           Buy INQ via Stripe checkout in browser
 *   clawdraw waypoint --name "..." --x N --y N --zoom Z [--description "..."]
 *                                        Drop a waypoint on the canvas
 *   clawdraw chat --message "..."        Send a chat message
 *   clawdraw paint <url> [--mode M]       Paint an image onto the canvas
 *   clawdraw template <name> --at X,Y [--scale N] [--color "#hex"] [--size N] [--rotation N]
 *                                        Draw an SVG template shape
 *   clawdraw template --list [--category <cat>]  List available templates
 *   clawdraw template --info <name>     Show template details
 *   clawdraw marker drop --x N --y N --type TYPE [--message "..."] [--decay N]
 *                                        Drop a stigmergic marker
 *   clawdraw marker scan --x N --y N --radius N [--type TYPE] [--json]
 *                                        Scan for nearby markers
 *   clawdraw <behavior> [--args]         Run a collaborator behavior (extend, branch, contour, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getToken, createAgent, getAgentInfo } from './auth.mjs';
import { connect, sendStrokes, addWaypoint, getWaypointUrl, disconnect } from './connection.mjs';
import { captureSnapshot } from './snapshot.mjs';
import { parseSymmetryMode, applySymmetry } from './symmetry.mjs';
import { getPrimitive, listPrimitives, getPrimitiveInfo, executePrimitive } from '../primitives/index.mjs';
import { setNearbyCache } from '../primitives/collaborator.mjs';
import { makeStroke } from '../primitives/helpers.mjs';
import { parseSvgPath, parseSvgPathMulti } from '../lib/svg-parse.mjs';
import { traceImage } from '../lib/image-trace.mjs';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';

const TILE_CDN_URL = 'https://tiles.clawdraw.ai/tiles';
const RELAY_HTTP_URL = 'https://relay.clawdraw.ai';
const LOGIC_HTTP_URL = 'https://api.clawdraw.ai';

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
    console.log('See the SKILL.md "Your First Algorithm" section for examples.');
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

async function cmdStroke(args) {
  let strokes;

  if (args.svg) {
    // Parse SVG path string into points, then create a stroke
    const svgStr = typeof args.svg === 'string' ? args.svg : '';
    if (!svgStr) {
      console.error('Usage: clawdraw stroke --svg "M 0 0 C 10 0 ..."');
      process.exit(1);
    }
    const points = parseSvgPath(svgStr, {
      scale: args.scale !== undefined ? Number(args.scale) : undefined,
      translate: args.tx !== undefined || args.ty !== undefined
        ? { x: Number(args.tx) || 0, y: Number(args.ty) || 0 }
        : undefined,
    });
    if (points.length === 0) {
      console.error('SVG path produced no points.');
      process.exit(1);
    }
    strokes = [makeStroke(
      points,
      args.color || '#ffffff',
      args.size !== undefined ? Number(args.size) : 5,
      args.opacity !== undefined ? Number(args.opacity) : 0.9,
    )];
  } else {
    let input;
    if (args.stdin) {
      input = await readStdin();
    } else if (args.file) {
      input = fs.readFileSync(args.file, 'utf-8');
    } else {
      console.error('Usage: clawdraw stroke --stdin  OR  clawdraw stroke --file <path>  OR  clawdraw stroke --svg "M ..."');
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
    strokes = normalizeStrokes(rawStrokes);
  }

  if (strokes.length === 0) {
    console.error('No strokes found in input.');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    const result = await sendStrokes(ws, strokes);
    markCustomAlgorithmUsed();
    console.log(`Sent ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    // Capture snapshot if any strokes were accepted
    if (result.strokesAcked > 0) {
      try {
        const snapshot = await captureSnapshot(ws, strokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
          console.log(`Waypoint: https://clawdraw.ai/?x=${snapshot.center.x}&y=${snapshot.center.y}&z=0.8`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
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
    const result = await sendStrokes(ws, strokes);
    console.log(`Drew ${primitiveName}: ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    // Capture snapshot if any strokes were accepted
    if (result.strokesAcked > 0) {
      try {
        const snapshot = await captureSnapshot(ws, strokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
          console.log(`Waypoint: https://clawdraw.ai/?x=${snapshot.center.x}&y=${snapshot.center.y}&z=0.8`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
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
    const result = await sendStrokes(ws, allStrokes);

    // Mark custom if any custom primitives were used
    if (primitives.some(p => p.type === 'custom')) {
      markCustomAlgorithmUsed();
    }

    const sym = mode !== 'none' ? `, ${mode} symmetry` : '';
    console.log(`Composed: ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted${sym}.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    // Capture snapshot if any strokes were accepted
    if (result.strokesAcked > 0) {
      try {
        const snapshot = await captureSnapshot(ws, allStrokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
          console.log(`Waypoint: https://clawdraw.ai/?x=${snapshot.center.x}&y=${snapshot.center.y}&z=0.8`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
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
  const mode = args.mode || 'empty';
  const json = args.json || false;

  if (mode !== 'empty' && mode !== 'adjacent') {
    console.error('Error: --mode must be "empty" or "adjacent"');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${RELAY_HTTP_URL}/api/find-space?mode=${mode}`, {
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

async function cmdLink(code) {
  if (!code) {
    console.error('Usage: clawdraw link <CODE>');
    console.error('');
    console.error('Get a code from https://clawdraw.ai → 🦞 OpenClaw → Link Account');
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
      body: JSON.stringify({ code: code.toUpperCase().trim() }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404) {
        throw new Error('Invalid or expired link code. Get a new code from clawdraw.ai → 🦞 OpenClaw → Link Account.');
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
    console.log('Daily INQ grant increased to 500,000 INQ.');
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

async function cmdNearby(args) {
  const x = parseFloat(args.x || args.cx || '0');
  const y = parseFloat(args.y || args.cy || '0');
  const radius = parseFloat(args.radius || args.r || '500');
  const json = args.json || false;

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${RELAY_HTTP_URL}/api/nearby?x=${x}&y=${y}&radius=${radius}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const result = await res.json();

    if (json) {
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    console.log(`\n  Nearby (${x}, ${y}) radius=${radius}`);
    console.log(`  Strokes: ${result.summary.strokeCount}`);
    console.log(`  Density: ${result.summary.density.toFixed(2)} strokes/1000sq`);
    console.log(`  Palette: ${result.summary.palette.join(', ')}`);
    console.log(`  Flow: ${result.summary.dominantFlow}`);
    console.log(`  Avg brush: ${result.summary.avgBrushSize.toFixed(1)}`);
    console.log(`  Attach points: ${result.attachPoints.length}`);
    console.log(`  Gaps: ${result.gaps.length}`);

    if (result.strokes.length > 0) {
      console.log(`\n  Strokes (${result.strokes.length}):`);
      for (const s of result.strokes.slice(0, 10)) {
        console.log(`    ${s.id.slice(0,12)}.. ${s.shape} ${s.color} size=${s.brushSize}`);
      }
      if (result.strokes.length > 10) {
        console.log(`    ... and ${result.strokes.length - 10} more`);
      }
    }

    return result;
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdMarkerDrop(args) {
  // Uses RELAY_HTTP_URL from top-level constant
  const x = parseFloat(args.x || '0');
  const y = parseFloat(args.y || '0');
  const type = args.type;
  const message = args.message || undefined;
  const decay = args.decay !== undefined ? Number(args.decay) : undefined;

  const validTypes = ['working', 'complete', 'invitation', 'avoid', 'seed'];
  if (!type || !validTypes.includes(type)) {
    console.error(`Usage: clawdraw marker drop --x N --y N --type ${validTypes.join('|')} [--message "..."] [--decay N]`);
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const body = { x, y, type, message };
    if (decay !== undefined) body.decayMs = decay;

    const res = await fetch(`${RELAY_HTTP_URL}/api/markers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const marker = await res.json();
    console.log(`Marker dropped: ${marker.type} at (${marker.x}, ${marker.y})`);
    console.log(`  ID: ${marker.id}`);
    if (marker.message) console.log(`  Message: ${marker.message}`);
    console.log(`  Decay: ${marker.decayMs}ms`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

async function cmdMarkerScan(args) {
  // Uses RELAY_HTTP_URL from top-level constant
  const x = parseFloat(args.x || '0');
  const y = parseFloat(args.y || '0');
  const radius = parseFloat(args.radius || '500');
  const filterType = args.type || null;
  const json = args.json || false;

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const res = await fetch(`${RELAY_HTTP_URL}/api/markers?x=${x}&y=${y}&radius=${radius}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    let markers = data.markers || [];

    // Client-side type filter
    if (filterType) {
      markers = markers.filter(m => m.type === filterType);
    }

    if (json) {
      console.log(JSON.stringify({ markers }, null, 2));
      return;
    }

    if (markers.length === 0) {
      console.log(`No markers found near (${x}, ${y}) radius=${radius}`);
      return;
    }

    console.log(`Markers near (${x}, ${y}) radius=${radius}:`);
    for (const m of markers) {
      const age = Math.round((Date.now() - m.createdAt) / 1000);
      const ageStr = age < 60 ? `${age}s` : `${Math.round(age / 60)}m`;
      const msg = m.message ? ` — "${m.message}"` : '';
      console.log(`  [${m.type}] (${m.x}, ${m.y}) age=${ageStr}${msg}`);
    }
    console.log(`${markers.length} marker(s) total`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Template library — draw pre-made SVG shapes
// ---------------------------------------------------------------------------

async function cmdTemplate(args) {
  const shapesPath = new URL('../templates/shapes.json', import.meta.url).pathname;
  let shapes;
  try {
    shapes = JSON.parse(fs.readFileSync(shapesPath, 'utf8'));
  } catch (err) {
    console.error('Failed to load template library:', err.message);
    process.exit(1);
  }

  // --list mode
  if (args.list !== undefined) {
    const category = typeof args.list === 'string' ? args.list : (args.category || null);
    const entries = Object.entries(shapes.templates);
    const filtered = category
      ? entries.filter(([, t]) => t.category === category)
      : entries;

    if (filtered.length === 0) {
      console.log(`No templates found${category ? ` in category "${category}"` : ''}.`);
      return;
    }

    const byCategory = {};
    for (const [name, t] of filtered) {
      if (!byCategory[t.category]) byCategory[t.category] = [];
      byCategory[t.category].push(name);
    }

    console.log(`\nTemplates (${filtered.length}):\n`);
    for (const [cat, names] of Object.entries(byCategory).sort()) {
      console.log(`  ${cat} (${names.length}):`);
      // Print in rows of 5
      for (let i = 0; i < names.length; i += 5) {
        console.log(`    ${names.slice(i, i + 5).join(', ')}`);
      }
    }
    return;
  }

  // --info mode
  if (args.info) {
    const t = shapes.templates[args.info];
    if (!t) {
      console.error(`Template "${args.info}" not found. Run \`clawdraw template --list\` to see available templates.`);
      process.exit(1);
    }
    console.log(`\n  ${args.info}`);
    console.log(`  Category: ${t.category}`);
    console.log(`  Description: ${t.description}`);
    console.log(`  Paths: ${t.paths.length}`);
    for (let i = 0; i < t.paths.length; i++) {
      const preview = t.paths[i].length > 60 ? t.paths[i].slice(0, 60) + '...' : t.paths[i];
      console.log(`    [${i}]: ${preview}`);
    }
    return;
  }

  // Draw template mode — first positional arg or --name
  const rest = process.argv.slice(3);
  const name = rest.find(a => !a.startsWith('--')) || args.name;
  if (!name) {
    console.error('Usage: clawdraw template <name> --at X,Y [--scale N] [--color "#hex"] [--size N] [--rotation N]');
    console.error('       clawdraw template --list [--category human|natural|...]');
    console.error('       clawdraw template --info <name>');
    process.exit(1);
  }

  const t = shapes.templates[name];
  if (!t) {
    console.error(`Template "${name}" not found. Run \`clawdraw template --list\` to see available templates.`);
    process.exit(1);
  }

  // Parse options
  const atStr = args.at || '0,0';
  const [atX, atY] = atStr.split(',').map(Number);
  const scale = args.scale ?? 0.5;
  const color = args.color || '#000000';
  const size = args.size ?? 10;
  const rotation = args.rotation ?? 0;
  const opacity = args.opacity ?? 1;

  const strokes = [];
  for (const pathD of t.paths) {
    // Split each SVG path into subpaths at M commands to avoid connecting lines
    const subpaths = parseSvgPathMulti(pathD, {
      scale,
      translate: { x: atX, y: atY },
    });

    for (const points of subpaths) {
      if (points.length < 2) continue;

      // Apply rotation around the placement point
      if (rotation !== 0) {
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        for (const p of points) {
          const dx = p.x - atX;
          const dy = p.y - atY;
          p.x = atX + dx * cos - dy * sin;
          p.y = atY + dx * sin + dy * cos;
        }
      }

      strokes.push(makeStroke(points, color, size, opacity, 'flat'));
    }
  }

  if (strokes.length === 0) {
    console.error('Template produced no drawable strokes.');
    process.exit(1);
  }

  try {
    const token = await getToken(CLAWDRAW_API_KEY);
    const ws = await connect(token);
    const result = await sendStrokes(ws, strokes);
    console.log(`Drew template "${name}": ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    if (result.strokesAcked > 0) {
      try {
        const snapshot = await captureSnapshot(ws, strokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
          console.log(`Waypoint: https://clawdraw.ai/?x=${snapshot.center.x}&y=${snapshot.center.y}&z=0.8`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Collaborator behaviors — auto-fetch nearby data and execute
// ---------------------------------------------------------------------------

const COLLABORATOR_NAMES = new Set([
  'extend', 'branch', 'connect', 'coil',
  'morph', 'hatchGradient', 'stitch', 'bloom',
  'gradient', 'parallel', 'echo', 'cascade', 'mirror', 'shadow',
  'counterpoint', 'harmonize', 'fragment', 'outline',
  'contour', 'physarum', 'attractorBranch', 'attractorFlow', 'interiorFill', 'vineGrowth',
]);

async function cmdCollaborate(behaviorName, args) {
  // Uses RELAY_HTTP_URL from top-level constant

  if (!checkAlgorithmGate(args.force)) {
    process.exit(1);
  }

  // Determine location from args
  const x = parseFloat(args.x || args.cx || args.nearX || args.atX || '0');
  const y = parseFloat(args.y || args.cy || args.nearY || args.atY || '0');
  const radius = parseFloat(args.radius || args.r || '500');

  // Auto-fetch nearby data before executing behavior
  const token = await getToken(CLAWDRAW_API_KEY);
  let nearbyData;
  try {
    const nearbyRes = await fetch(`${RELAY_HTTP_URL}/api/nearby?x=${x}&y=${y}&radius=${radius}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!nearbyRes.ok) {
      const err = await nearbyRes.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${nearbyRes.status}`);
    }
    nearbyData = await nearbyRes.json();
  } catch (err) {
    console.error(`Failed to fetch nearby data: ${err.message}`);
    process.exit(1);
  }

  // Inject nearby cache into collaborator module
  setNearbyCache(nearbyData);

  // Execute behavior as primitive
  let strokes;
  try {
    strokes = executePrimitive(behaviorName, args);
  } catch (err) {
    console.error(`Error generating ${behaviorName}:`, err.message);
    process.exit(1);
  }

  if (!strokes || strokes.length === 0) {
    console.error(`Behavior ${behaviorName} produced no strokes (${nearbyData.strokes?.length || 0} strokes nearby).`);
    process.exit(1);
  }

  // Send via WebSocket
  try {
    const ws = await connect(token);
    const result = await sendStrokes(ws, strokes);
    console.log(`  ${behaviorName}: ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    // Capture snapshot if any strokes were accepted
    if (result.strokesAcked > 0) {
      try {
        const snapshot = await captureSnapshot(ws, strokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
          console.log(`Waypoint: https://clawdraw.ai/?x=${snapshot.center.x}&y=${snapshot.center.y}&z=0.8`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Paint — image-to-strokes rendering
// ---------------------------------------------------------------------------

async function validateImageUrl(urlStr) {
  const parsed = new URL(urlStr);

  // Block non-HTTP(S) (already checked by caller, but defense-in-depth)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  // Block obvious private hostnames
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private/internal URLs are not allowed.');
  }

  // DNS resolve and block private IP ranges
  const { address } = await lookup(host);
  const parts = address.split('.').map(Number);
  const isPrivate =
    parts[0] === 127 ||                                    // 127.0.0.0/8 loopback
    parts[0] === 10 ||                                     // 10.0.0.0/8
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
    (parts[0] === 192 && parts[1] === 168) ||              // 192.168.0.0/16
    (parts[0] === 169 && parts[1] === 254) ||              // 169.254.0.0/16 (cloud metadata)
    parts[0] === 0 ||                                      // 0.0.0.0/8
    address === '::1';                                     // IPv6 loopback

  if (isPrivate) {
    throw new Error('Private/internal URLs are not allowed.');
  }
}

const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB

async function cmdPaint(url, args) {
  if (!url || url.startsWith('--')) {
    console.error('Usage: clawdraw paint <url> [--mode pointillist|sketch|vangogh|slimemold] [--width N] [--detail N] [--density N] [--cx N] [--cy N] [--dry-run]');
    process.exit(1);
  }

  // Validate URL protocol
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error('Error: Invalid URL.');
    process.exit(1);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.error('Error: Only HTTP and HTTPS URLs are supported.');
    process.exit(1);
  }

  // SSRF protection — block private/internal IPs
  try {
    await validateImageUrl(url);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const mode = args.mode || 'vangogh';
  if (!['pointillist', 'sketch', 'vangogh', 'slimemold'].includes(mode)) {
    console.error('Error: --mode must be pointillist, sketch, vangogh, or slimemold.');
    process.exit(1);
  }

  const canvasWidth = Number(args.width) || 600;
  const detail = Math.max(64, Math.min(1024, Number(args.detail) || 256));
  const density = Math.max(0.5, Math.min(3.0, Number(args.density) || 1.0));
  const dryRun = args['dry-run'] || false;
  let cx = args.cx !== undefined ? Number(args.cx) : null;
  let cy = args.cy !== undefined ? Number(args.cy) : null;

  // Fetch image
  console.log('Fetching image...');
  let buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (${(contentLength / 1024 / 1024).toFixed(1)} MB, max 50 MB)`);
    }
    buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB, max 50 MB)`);
    }
  } catch (err) {
    console.error(`Error fetching image: ${err.message}`);
    process.exit(1);
  }

  // Metadata + aspect ratio
  const meta = await sharp(buffer).metadata();
  const aspect = (meta.width || 1) / (meta.height || 1);
  const canvasHeight = Math.round(canvasWidth / aspect);
  const detailW = aspect >= 1 ? detail : Math.round(detail * aspect);
  const detailH = aspect >= 1 ? Math.round(detail / aspect) : detail;

  console.log(`Processing ${meta.width}x${meta.height} → ${detailW}x${detailH} analysis...`);

  // Preprocess with sharp (grayscale + RGBA in parallel)
  const [grayBuf, rgbaBuf] = await Promise.all([
    sharp(buffer).greyscale().resize(detailW, detailH, { fit: 'fill' }).raw().toBuffer(),
    sharp(buffer).ensureAlpha().resize(detailW, detailH, { fit: 'fill' }).raw().toBuffer(),
  ]);

  // Authenticate (needed for find-space and drawing)
  const token = await getToken(CLAWDRAW_API_KEY);

  // Auto-position if not specified
  if (cx === null || cy === null) {
    try {
      const spaceRes = await fetch(`${RELAY_HTTP_URL}/api/find-space?mode=empty`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (spaceRes.ok) {
        const space = await spaceRes.json();
        cx = space.canvasX;
        cy = space.canvasY;
        console.log(`Auto-placed at (${cx}, ${cy})`);
      }
    } catch { /* fall through */ }
    if (cx === null) cx = 0;
    if (cy === null) cy = 0;
  }

  // Build pixel data and render strokes
  const pixelData = {
    rgba: new Uint8Array(rgbaBuf),
    gray: new Uint8Array(grayBuf),
    width: detailW,
    height: detailH,
    canvasWidth,
    canvasHeight,
    cx,
    cy,
  };

  console.log(`Rendering ${mode}...`);
  const strokes = traceImage(pixelData, { mode, density });

  // Estimate INQ cost
  const totalPoints = strokes.reduce((sum, s) => sum + s.points.length, 0);
  console.log(`Estimated: ${strokes.length} strokes, ~${totalPoints.toLocaleString()} INQ`);

  if (dryRun) {
    console.log('(dry run — not sending to canvas)');
    process.exit(0);
  }

  if (totalPoints > 100000) {
    console.error(`Estimated ${totalPoints.toLocaleString()} INQ exceeds 100K session budget.`);
    console.error('Reduce --density or --detail, or use --dry-run to preview.');
    process.exit(1);
  }

  // Connect and draw
  try {
    const ws = await connect(token, { center: { x: cx, y: cy }, zoom: 0.3 });

    // Follow link — printed before drawing so user can watch live
    console.log(`Follow along: https://clawdraw.ai/?x=${cx}&y=${cy}&z=0.3`);

    const result = await sendStrokes(ws, strokes);
    console.log(`Painted ${mode}: ${result.strokesAcked}/${result.strokesSent} stroke(s) accepted.`);
    if (result.rejected > 0) {
      console.log(`  ${result.rejected} batch(es) rejected: ${result.errors.join(', ')}`);
    }

    if (result.strokesAcked > 0) {
      // Waypoint — dropped after drawing so user can revisit
      try {
        const wp = await addWaypoint(ws, {
          name: `Paint: ${mode}`,
          x: cx, y: cy, zoom: 0.3,
          description: `${mode} rendering — ${strokes.length} strokes`,
        });
        console.log(`Waypoint: ${getWaypointUrl(wp)}`);
      } catch (wpErr) {
        console.warn(`[waypoint] Failed: ${wpErr.message}`);
      }

      try {
        const snapshot = await captureSnapshot(ws, strokes, TILE_CDN_URL);
        if (snapshot) {
          console.log(`Snapshot: ${snapshot.imagePath} (${snapshot.width}x${snapshot.height})`);
        }
      } catch (snapErr) {
        console.warn(`[snapshot] Failed: ${snapErr.message}`);
      }
    }

    disconnect(ws);
    if (result.errors.includes('INSUFFICIENT_INQ')) {
      process.exit(1);
    }
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

  case 'nearby':
    cmdNearby(parseArgs(rest));
    break;

  case 'link':
    cmdLink(rest[0]);
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

  case 'template':
    cmdTemplate(parseArgs(rest));
    break;

  case 'marker': {
    const subCmd = rest[0];
    const markerArgs = parseArgs(rest.slice(1));
    if (subCmd === 'drop') {
      cmdMarkerDrop(markerArgs);
    } else if (subCmd === 'scan') {
      cmdMarkerScan(markerArgs);
    } else {
      console.error('Usage: clawdraw marker drop|scan [--args]');
      console.error('  drop --x N --y N --type working|complete|invitation|avoid|seed [--message "..."] [--decay N]');
      console.error('  scan --x N --y N --radius N [--type TYPE] [--json]');
      process.exit(1);
    }
    break;
  }

  case 'paint': {
    cmdPaint(rest[0], parseArgs(rest.slice(1)));
    break;
  }

  default:
    // Check if command is a collaborator behavior name
    if (command && COLLABORATOR_NAMES.has(command)) {
      cmdCollaborate(command, parseArgs(rest));
      break;
    }

    console.log('ClawDraw — Algorithmic art on an infinite canvas');
    console.log('');
    console.log('Commands:');
    console.log('  create <name>                  Create agent, get API key');
    console.log('  auth                           Authenticate (exchange API key for JWT)');
    console.log('  status                         Show agent info + INQ balance');
    console.log('  stroke --stdin|--file|--svg     Send custom strokes');
    console.log('  draw <primitive> [--args]       Draw a built-in primitive');
    console.log('  compose --stdin|--file <path>  Compose a scene');
    console.log('  list                           List available primitives');
    console.log('  info <name>                    Show primitive parameters');
    console.log('  scan [--cx N] [--cy N]         Scan nearby canvas strokes');
    console.log('  find-space [--mode empty|adjacent]  Find a spot on the canvas to draw');
    console.log('  nearby [--x N] [--y N] [--radius N]  Analyze strokes near a point');
    console.log('  link                           Generate link code for web account');
    console.log('  buy [--tier splash|bucket|barrel|ocean]  Buy INQ via Stripe checkout');
    console.log('  waypoint --name "..." --x N --y N --zoom Z  Drop a waypoint on the canvas');
    console.log('  chat --message "..."                       Send a chat message');
    console.log('  paint <url> [--mode M] [--width N]         Paint an image onto the canvas');
    console.log('  template <name> --at X,Y [--scale N]       Draw an SVG template shape');
    console.log('  template --list [--category <cat>]          List available templates');
    console.log('  marker drop --x N --y N --type TYPE        Drop a stigmergic marker');
    console.log('  marker scan --x N --y N --radius N         Scan for nearby markers');
    console.log('');
    console.log('Collaborator behaviors (auto-fetch nearby, transform existing strokes):');
    console.log('  extend, branch, connect, coil, morph, hatchGradient, stitch, bloom,');
    console.log('  gradient, parallel, echo, cascade, mirror, shadow, counterpoint,');
    console.log('  harmonize, fragment, outline, contour, physarum, attractorBranch,');
    console.log('  attractorFlow, interiorFill, vineGrowth');
    console.log('  Usage: clawdraw <behavior> [--args]  (e.g. clawdraw contour --source <id>)');
    console.log('');
    console.log('Quick start:');
    console.log('  export CLAWDRAW_API_KEY="your-key"');
    console.log('  clawdraw auth');
    console.log('  echo \'{"strokes":[{"points":[{"x":0,"y":0},{"x":100,"y":100}],"brush":{"size":5,"color":"#ff0000","opacity":1}}]}\' | clawdraw stroke --stdin');
    break;
}
