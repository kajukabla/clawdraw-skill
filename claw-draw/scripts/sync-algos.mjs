#!/usr/bin/env node
/**
 * sync-algos.mjs — Maintainer tool to sync community algorithms from ClawDrawAlgos.
 *
 * Clones (or pulls) kajukabla/ClawDrawAlgos into a temp directory, reads each
 * algorithm's METADATA to determine its category, copies files into the correct
 * primitives/<category>/ folder, and regenerates primitives/index.mjs imports.
 *
 * Usage:  node scripts/sync-algos.mjs
 *
 * NOT included in the npm package (excluded from package.json "files").
 */

import { execSync } from 'node:child_process';
import { readdir, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRIMITIVES_DIR = join(__dirname, '..', 'primitives');
const REPO_URL = 'https://github.com/kajukabla/ClawDrawAlgos.git';

// Files to skip from the community repo
const SKIP_FILES = new Set(['helpers.mjs', 'sacred-geometry.mjs']);

// Category mapping — maps METADATA category values to folder names.
// Algorithms whose METADATA category doesn't match are placed in a "misc" folder.
const CATEGORY_FOLDERS = {
  shapes: 'shapes',
  organic: 'organic',
  fractals: 'fractals',
  flow: 'flow',
  noise: 'noise',
  simulation: 'simulation',
  fills: 'fills',
  decorative: 'decorative',
  '3d': '3d',
  utility: 'utility',
};

// Manual overrides for algorithms whose METADATA category is 'community' or missing.
// Maps filename → target folder name.
const CATEGORY_OVERRIDES = {
  'hex-grid.mjs': 'shapes',
  'gear.mjs': 'shapes',
  'schotter.mjs': 'shapes',
  'vine-growth.mjs': 'organic',
  'phyllotaxis-spiral.mjs': 'organic',
  'lichen-growth.mjs': 'organic',
  'slime-mold.mjs': 'organic',
  'dla.mjs': 'organic',
  'mandelbrot.mjs': 'fractals',
  'julia-set.mjs': 'fractals',
  'apollonian-gasket.mjs': 'fractals',
  'dragon-curve.mjs': 'fractals',
  'koch-snowflake.mjs': 'fractals',
  'sierpinski-triangle.mjs': 'fractals',
  'kaleidoscopic-ifs.mjs': 'fractals',
  'penrose-tiling.mjs': 'fractals',
  'hyperbolic-tiling.mjs': 'fractals',
  'viridis-vortex.mjs': 'fractals',
  'clifford-attractor.mjs': 'flow',
  'hopalong-attractor.mjs': 'flow',
  'double-pendulum.mjs': 'flow',
  'orbital-dynamics.mjs': 'flow',
  'gielis-superformula.mjs': 'flow',
  'voronoi-noise.mjs': 'noise',
  'voronoi-crackle.mjs': 'noise',
  'voronoi-grid.mjs': 'noise',
  'worley-noise.mjs': 'noise',
  'domain-warping.mjs': 'noise',
  'turing-patterns.mjs': 'noise',
  'reaction-diffusion.mjs': 'noise',
  'gray-scott.mjs': 'noise',
  'metaballs.mjs': 'noise',
  'game-of-life.mjs': 'simulation',
  'langtons-ant.mjs': 'simulation',
  'wave-function-collapse.mjs': 'simulation',
  'starburst.mjs': 'decorative',
  'clockwork-nebula.mjs': 'decorative',
  'matrix-rain.mjs': 'decorative',
  'cube-3d.mjs': '3d',
  'sphere-3d.mjs': '3d',
  'hypercube.mjs': '3d',
};

async function main() {
  // 1. Clone or pull the repo
  const cloneDir = join(tmpdir(), 'ClawDrawAlgos-sync');
  console.log(`Syncing from ${REPO_URL}...`);
  try {
    execSync(`git clone --depth 1 ${REPO_URL} "${cloneDir}"`, { stdio: 'pipe' });
  } catch {
    console.log('Repo exists, pulling latest...');
    execSync(`git -C "${cloneDir}" pull`, { stdio: 'pipe' });
  }

  const srcDir = join(cloneDir, 'primitives');
  const files = (await readdir(srcDir)).filter(f => f.endsWith('.mjs') && !SKIP_FILES.has(f));

  console.log(`Found ${files.length} algorithm files`);

  // 2. Distribute files into category folders
  const distributed = [];
  const skipped = [];

  for (const file of files) {
    const category = CATEGORY_OVERRIDES[file];
    if (!category) {
      skipped.push(file);
      continue;
    }

    const destDir = join(PRIMITIVES_DIR, category);
    await mkdir(destDir, { recursive: true });

    // Ensure helpers.mjs proxy exists
    const helperPath = join(destDir, 'helpers.mjs');
    try {
      await readFile(helperPath);
    } catch {
      await writeFile(helperPath, "export * from '../helpers.mjs';\n");
    }

    await copyFile(join(srcDir, file), join(destDir, file));
    distributed.push({ file, category });
  }

  // 3. Print summary
  console.log('\n--- Sync Summary ---');
  console.log(`Distributed: ${distributed.length} files`);
  const byCat = {};
  for (const { file, category } of distributed) {
    (byCat[category] ??= []).push(file);
  }
  for (const [cat, catFiles] of Object.entries(byCat).sort()) {
    console.log(`  ${cat}/ (${catFiles.length}): ${catFiles.join(', ')}`);
  }
  if (skipped.length) {
    console.log(`\nSkipped (no category override): ${skipped.join(', ')}`);
    console.log('Add these to CATEGORY_OVERRIDES in sync-algos.mjs');
  }

  console.log('\nDone. Review changes, then regenerate primitives/index.mjs if new files were added.');

  // Cleanup temp dir
  try { execSync(`rm -rf "${cloneDir}"`, { stdio: 'pipe' }); } catch { /* ok */ }
}

main().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
