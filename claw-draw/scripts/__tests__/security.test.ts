/**
 * Security tests for OpenClaw skill scripts.
 *
 * Verifies:
 * 1. No env-var overrides for server URLs (prevents API key redirection)
 * 2. No execSync usage (prevents shell injection)
 * 3. Checkout URL validation (HTTPS-only, valid URL structure)
 * 4. lib/ and community/ safety (no exec, no network, no env, no dynamic import)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS_DIR = path.resolve(__dirname, '..');

function readScript(name: string): string {
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8');
}

/** Recursively collect all .mjs files under a directory. */
function collectMjsFiles(dir: string, excludeNames: string[] = []): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMjsFiles(full, excludeNames));
    } else if (entry.name.endsWith('.mjs') && !excludeNames.includes(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('env-harvesting protection', () => {
  it('auth.mjs should not allow CLAWDRAW_LOGIC_URL override', () => {
    const src = readScript('auth.mjs');
    expect(src).not.toContain('process.env.CLAWDRAW_LOGIC_URL');
    // Should still have the hardcoded URL
    expect(src).toContain('https://api.clawdraw.ai');
  });

  it('connection.mjs should not allow CLAWDRAW_WS_URL override', () => {
    const src = readScript('connection.mjs');
    expect(src).not.toContain('process.env.CLAWDRAW_WS_URL');
    // Should still have the hardcoded URL
    expect(src).toContain('wss://relay.clawdraw.ai/ws');
  });

  it('clawdraw.mjs should not allow CLAWDRAW_LOGIC_URL override', () => {
    const src = readScript('clawdraw.mjs');
    expect(src).not.toContain('process.env.CLAWDRAW_LOGIC_URL');
  });

  it('clawdraw.mjs should not allow CLAWDRAW_WS_URL override', () => {
    const src = readScript('clawdraw.mjs');
    expect(src).not.toContain('process.env.CLAWDRAW_WS_URL');
  });

  it('connection.mjs should not allow CLAWDRAW_APP_URL override', () => {
    const src = readScript('connection.mjs');
    expect(src).not.toContain('process.env.CLAWDRAW_APP_URL');
    // Should still have the hardcoded URL
    expect(src).toContain('https://clawdraw.ai');
  });

  it('connection.mjs should not allow opts.url override', () => {
    const src = readScript('connection.mjs');
    expect(src).not.toContain('opts.url');
  });

  it('should still allow CLAWDRAW_API_KEY (user auth, not destination)', () => {
    // API key is read from env in clawdraw.mjs and passed to auth.mjs as a parameter
    const src = readScript('clawdraw.mjs');
    expect(src).toContain('process.env.CLAWDRAW_API_KEY');
  });

  it('no published script should use process.env for anything except CLAWDRAW_API_KEY', () => {
    const scripts = ['auth.mjs', 'clawdraw.mjs', 'connection.mjs', 'symmetry.mjs', 'snapshot.mjs'];
    for (const name of scripts) {
      const src = readScript(name);
      // Find all process.env usages
      const envMatches = src.match(/process\.env\.\w+/g) || [];
      for (const match of envMatches) {
        expect(match, `${name} uses disallowed env var: ${match}`).toBe('process.env.CLAWDRAW_API_KEY');
      }
    }
  });
});

describe('dangerous-exec protection', () => {
  it('clawdraw.mjs should not use execSync', () => {
    const src = readScript('clawdraw.mjs');
    expect(src).not.toContain('execSync');
  });

  it('clawdraw.mjs should print checkout URL instead of executing it', () => {
    const src = readScript('clawdraw.mjs');
    // Script prints the URL for user to open manually — no spawn/exec needed
    expect(src).toContain('console.log(');
    expect(src).toContain('data.url');
    expect(src).not.toContain('execSync');
  });

  it('no script should use execSync', () => {
    const scripts = ['auth.mjs', 'clawdraw.mjs', 'connection.mjs', 'symmetry.mjs', 'snapshot.mjs'];
    for (const name of scripts) {
      const src = readScript(name);
      expect(src).not.toContain('execSync');
    }
  });
});

describe('checkout URL validation', () => {
  it('clawdraw.mjs should check that checkout URL is returned', () => {
    const src = readScript('clawdraw.mjs');
    // Script validates that a URL was returned before printing it
    expect(src).toContain('!data.url');
  });

  it('clawdraw.mjs should use hardcoded HTTPS URLs for checkout', () => {
    const src = readScript('clawdraw.mjs');
    // Success/cancel URLs are hardcoded HTTPS — not user-controlled
    expect(src).toContain("successUrl: 'https://clawdraw.ai'");
    expect(src).toContain("cancelUrl: 'https://clawdraw.ai'");
  });

  it('URL constructor rejects injection payloads', () => {
    // Verify the validation approach actually catches bad inputs
    expect(() => new URL('$(whoami)')).toThrow();
    expect(() => new URL('; rm -rf /')).toThrow();
    expect(() => new URL('`id`')).toThrow();
  });

  it('URL constructor rejects non-HTTPS protocols', () => {
    const fileUrl = new URL('file:///etc/passwd');
    expect(fileUrl.protocol).not.toBe('https:');

    const jsUrl = new URL('javascript:alert(1)');
    expect(jsUrl.protocol).not.toBe('https:');
  });

  it('URL constructor accepts valid Stripe checkout URLs', () => {
    const url = new URL('https://checkout.stripe.com/c/pay/cs_live_abc123');
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('checkout.stripe.com');
  });
});

// ---------------------------------------------------------------------------
// Primitives safety — regression guards against re-introducing flagged patterns
// ---------------------------------------------------------------------------

describe('primitives safety', () => {
  const primDir = path.resolve(__dirname, '..', '..', 'primitives');
  const mjsFiles = collectMjsFiles(primDir, ['helpers.mjs']);

  // Sanity: make sure we actually found primitive files
  it('should find primitive .mjs files', () => {
    expect(mjsFiles.length).toBeGreaterThan(0);
  });

  it('no dynamic imports (readdir or import()) in any primitive', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(primDir, file);
      expect(src, `${rel} contains readdir`).not.toMatch(/readdir/);
      expect(src, `${rel} contains import(`).not.toMatch(/import\s*\(/);
      expect(src, `${rel} contains require(`).not.toMatch(/require\s*\(/);
    }
  });

  it('no shell execution in any primitive', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(primDir, file);
      expect(src, `${rel} contains execSync`).not.toContain('execSync');
      expect(src, `${rel} contains child_process`).not.toContain('child_process');
      expect(src, `${rel} contains eval(`).not.toMatch(/\beval\s*\(/);
      expect(src, `${rel} contains Function(`).not.toMatch(/\bFunction\s*\(/);
      expect(src, `${rel} contains spawn(`).not.toMatch(/\bspawn\s*\(/);
    }
  });

  it('no network access in any primitive', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(primDir, file);
      expect(src, `${rel} contains fetch(`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${rel} contains http.`).not.toMatch(/\bhttp\./);
      expect(src, `${rel} contains https.`).not.toMatch(/\bhttps\./);
      expect(src, `${rel} contains net.`).not.toMatch(/\bnet\./);
      expect(src, `${rel} contains XMLHttpRequest`).not.toContain('XMLHttpRequest');
    }
  });

  it('no environment variable access in any primitive', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(primDir, file);
      expect(src, `${rel} contains process.env`).not.toContain('process.env');
    }
  });
});

// ---------------------------------------------------------------------------
// lib/ safety — same guards as primitives
// ---------------------------------------------------------------------------

describe('lib/ safety', () => {
  const libDir = path.resolve(__dirname, '..', '..', 'lib');
  const mjsFiles = collectMjsFiles(libDir);

  it('should find lib .mjs files', () => {
    expect(mjsFiles.length).toBeGreaterThan(0);
  });

  it('no shell execution in any lib module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(libDir, file);
      expect(src, `${rel} contains execSync`).not.toContain('execSync');
      expect(src, `${rel} contains child_process`).not.toContain('child_process');
      expect(src, `${rel} contains eval(`).not.toMatch(/\beval\s*\(/);
      expect(src, `${rel} contains Function(`).not.toMatch(/\bFunction\s*\(/);
      expect(src, `${rel} contains spawn(`).not.toMatch(/\bspawn\s*\(/);
    }
  });

  it('no network access in any lib module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(libDir, file);
      expect(src, `${rel} contains fetch(`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${rel} contains http.`).not.toMatch(/\bhttp\./);
      expect(src, `${rel} contains https.`).not.toMatch(/\bhttps\./);
      expect(src, `${rel} contains net.`).not.toMatch(/\bnet\./);
      expect(src, `${rel} contains XMLHttpRequest`).not.toContain('XMLHttpRequest');
    }
  });

  it('no environment variable access in any lib module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(libDir, file);
      expect(src, `${rel} contains process.env`).not.toContain('process.env');
    }
  });

  it('no dynamic imports in any lib module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(libDir, file);
      expect(src, `${rel} contains import(`).not.toMatch(/import\s*\(/);
      expect(src, `${rel} contains require(`).not.toMatch(/require\s*\(/);
      expect(src, `${rel} contains readdir`).not.toMatch(/readdir/);
    }
  });
});

// ---------------------------------------------------------------------------
// community/ safety — same guards as primitives
// ---------------------------------------------------------------------------

describe('community/ safety', () => {
  const communityDir = path.resolve(__dirname, '..', '..', 'community');
  const mjsFiles = collectMjsFiles(communityDir);

  it('should find community .mjs files', () => {
    expect(mjsFiles.length).toBeGreaterThan(0);
  });

  it('no shell execution in any community module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(communityDir, file);
      expect(src, `${rel} contains execSync`).not.toContain('execSync');
      expect(src, `${rel} contains child_process`).not.toContain('child_process');
      expect(src, `${rel} contains eval(`).not.toMatch(/\beval\s*\(/);
      expect(src, `${rel} contains Function(`).not.toMatch(/\bFunction\s*\(/);
      expect(src, `${rel} contains spawn(`).not.toMatch(/\bspawn\s*\(/);
    }
  });

  it('no network access in any community module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(communityDir, file);
      expect(src, `${rel} contains fetch(`).not.toMatch(/\bfetch\s*\(/);
      expect(src, `${rel} contains http.`).not.toMatch(/\bhttp\./);
      expect(src, `${rel} contains https.`).not.toMatch(/\bhttps\./);
      expect(src, `${rel} contains net.`).not.toMatch(/\bnet\./);
      expect(src, `${rel} contains XMLHttpRequest`).not.toContain('XMLHttpRequest');
    }
  });

  it('no environment variable access in any community module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(communityDir, file);
      expect(src, `${rel} contains process.env`).not.toContain('process.env');
    }
  });

  it('no dynamic imports in any community module', () => {
    for (const file of mjsFiles) {
      const src = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(communityDir, file);
      expect(src, `${rel} contains import(`).not.toMatch(/import\s*\(/);
      expect(src, `${rel} contains require(`).not.toMatch(/require\s*\(/);
      expect(src, `${rel} contains readdir`).not.toMatch(/readdir/);
    }
  });
});
