/**
 * Primitive registry — auto-discovers built-in and community primitives.
 *
 * Usage:
 *   import { getPrimitive, listPrimitives, getPrimitiveInfo } from './index.mjs';
 *
 *   const fn = getPrimitive('circle');
 *   const strokes = fn(0, 0, 100, '#ff0000', 5, 0.9);
 *
 *   const all = listPrimitives();
 *   const info = getPrimitiveInfo('fractalTree');
 */

import { readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Built-in primitive imports
// ---------------------------------------------------------------------------

import * as basicShapes from './basic-shapes.mjs';
import * as organic from './organic.mjs';
import * as flowAbstract from './flow-abstract.mjs';
import * as fills from './fills.mjs';
import * as decorative from './decorative.mjs';
import * as utility from './utility.mjs';

const builtinModules = [basicShapes, organic, flowAbstract, fills, decorative, utility];

/** @type {Map<string, { fn: Function, meta: object }>} */
const registry = new Map();

// Register all built-in primitives
for (const mod of builtinModules) {
  if (!mod.METADATA) continue;
  const metaList = Array.isArray(mod.METADATA) ? mod.METADATA : [mod.METADATA];
  for (const meta of metaList) {
    const fn = mod[meta.name];
    if (typeof fn === 'function') {
      registry.set(meta.name, { fn, meta });
    }
  }
}

// ---------------------------------------------------------------------------
// Community primitive auto-discovery
// ---------------------------------------------------------------------------

let communityLoaded = false;

async function loadCommunityPrimitives() {
  if (communityLoaded) return;
  communityLoaded = true;

  const communityDir = join(__dirname, '..', 'community');
  try {
    const files = await readdir(communityDir);
    for (const file of files) {
      if (!file.endsWith('.mjs') || file.startsWith('_')) continue;
      try {
        const mod = await import(join(communityDir, file));
        if (mod.METADATA) {
          const metaList = Array.isArray(mod.METADATA) ? mod.METADATA : [mod.METADATA];
          for (const meta of metaList) {
            const fn = mod[meta.name];
            if (typeof fn === 'function') {
              registry.set(meta.name, { fn, meta: { ...meta, source: 'community', file } });
            }
          }
        }
      } catch (err) {
        console.error(`Warning: Failed to load community primitive ${file}: ${err.message}`);
      }
    }
  } catch {
    // community/ dir doesn't exist or isn't readable — that's fine
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a primitive function by name.
 * @param {string} name - Primitive name (e.g. 'circle', 'fractalTree')
 * @returns {Function|null} The primitive function, or null if not found
 */
export function getPrimitive(name) {
  const entry = registry.get(name);
  return entry ? entry.fn : null;
}

/**
 * List all registered primitives.
 * @param {object} [opts]
 * @param {string} [opts.category] - Filter by category
 * @param {boolean} [opts.includeCommunity=true] - Include community primitives
 * @returns {Promise<Array<{name: string, description: string, category: string}>>}
 */
export async function listPrimitives(opts = {}) {
  await loadCommunityPrimitives();
  const results = [];
  for (const [name, { meta }] of registry) {
    if (opts.category && meta.category !== opts.category) continue;
    if (opts.includeCommunity === false && meta.source === 'community') continue;
    results.push({
      name,
      description: meta.description,
      category: meta.category,
      source: meta.source || 'builtin',
    });
  }
  return results.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

/**
 * Get detailed info about a specific primitive.
 * @param {string} name - Primitive name
 * @returns {Promise<object|null>} Full metadata including parameters, or null
 */
export async function getPrimitiveInfo(name) {
  await loadCommunityPrimitives();
  const entry = registry.get(name);
  if (!entry) return null;
  return { ...entry.meta, source: entry.meta.source || 'builtin' };
}

/**
 * Execute a primitive by name with args object.
 * @param {string} name - Primitive name
 * @param {object} args - Arguments as key-value pairs
 * @returns {Array} Array of stroke objects
 */
export function executePrimitive(name, args) {
  const entry = registry.get(name);
  if (!entry) throw new Error(`Unknown primitive: ${name}`);

  const meta = entry.meta;
  const paramNames = Object.keys(meta.parameters || {});
  const positionalArgs = paramNames.map(p => args[p]);
  return entry.fn(...positionalArgs);
}

// Re-export all primitive functions for direct import
export { circle, ellipse, arc, rectangle, polygon, star } from './basic-shapes.mjs';
export { lSystem, flower, leaf, vine, spaceColonization, mycelium, barnsleyFern } from './organic.mjs';
export { flowField, spiral, lissajous, strangeAttractor, spirograph } from './flow-abstract.mjs';
export { hatchFill, crossHatch, stipple, gradientFill, colorWash, solidFill } from './fills.mjs';
export { border, mandala, fractalTree, radialSymmetry, sacredGeometry } from './decorative.mjs';
export { bezierCurve, dashedLine, arrow, strokeText, alienGlyphs } from './utility.mjs';
