/**
 * Security tests for OpenClaw skill scripts.
 *
 * Verifies:
 * 1. No env-var overrides for server URLs (prevents API key redirection)
 * 2. No execSync usage (prevents shell injection)
 * 3. Checkout URL validation (HTTPS-only, valid URL structure)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS_DIR = path.resolve(__dirname, '..');

function readScript(name: string): string {
  return fs.readFileSync(path.join(SCRIPTS_DIR, name), 'utf-8');
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
    const scripts = ['auth.mjs', 'clawdraw.mjs', 'connection.mjs', 'symmetry.mjs'];
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
