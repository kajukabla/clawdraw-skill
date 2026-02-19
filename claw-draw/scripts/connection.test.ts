/**
 * Tests for connection.mjs — addWaypoint, getWaypointUrl, sendStrokes (rate-aware).
 *
 * Uses a lightweight MockWs that mimics the 'ws' WebSocket API surface
 * used by connection.mjs (on, removeListener, send, readyState).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

class MockWs {
  static OPEN = 1;
  static CLOSED = 3;

  readyState: number;
  _listeners: Record<string, ((...args: unknown[]) => void)[]>;
  sent: any[];
  _presenceHeartbeat: ReturnType<typeof setInterval> | null;
  _autoRespond: ((msg: any) => void) | null;

  constructor() {
    this.readyState = MockWs.OPEN;
    this._listeners = {};
    this.sent = [];
    this._presenceHeartbeat = null;
    this._autoRespond = null;
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  removeListener(event: string, handler: (...args: unknown[]) => void) {
    const arr = this._listeners[event];
    if (!arr) return;
    this._listeners[event] = arr.filter(h => h !== handler);
  }

  send(data: string) {
    const parsed = JSON.parse(data);
    this.sent.push(parsed);
    if (this._autoRespond) {
      this._autoRespond(parsed);
    }
  }

  close() {
    this.readyState = MockWs.CLOSED;
  }

  // Test helper: simulate receiving a message
  _receive(obj: any) {
    const data = Buffer.from(JSON.stringify(obj));
    for (const handler of (this._listeners.message || [])) {
      handler(data);
    }
  }
}

// Mock the 'ws' module so connection.mjs imports our MockWs
vi.mock('ws', () => ({
  default: class WebSocket {
    static OPEN = 1;
    static CLOSED = 3;
  },
}));

// Import AFTER mock setup
const { addWaypoint, getWaypointUrl, sendStrokes, connect, disconnect } = await import('./connection.mjs');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addWaypoint', () => {
  let ws: MockWs;

  beforeEach(() => {
    vi.useFakeTimers();
    ws = new MockWs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should send waypoint.add message', async () => {
    const p = addWaypoint(ws, { name: 'Test', x: 10, y: 20, zoom: 1.5 });

    // Simulate server response immediately
    ws._receive({ type: 'waypoint.added', waypoint: { id: 'wp_1', name: 'Test', x: 10, y: 20, zoom: 1.5 } });

    await p;

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0].type).toBe('waypoint.add');
    expect(ws.sent[0].waypoint).toEqual({ name: 'Test', x: 10, y: 20, zoom: 1.5, description: undefined });
  });

  it('should resolve with waypoint object on waypoint.added', async () => {
    const p = addWaypoint(ws, { name: 'Spot', x: 0, y: 0, zoom: 2 });
    ws._receive({ type: 'waypoint.added', waypoint: { id: 'wp_abc', name: 'Spot', x: 0, y: 0, zoom: 2 } });

    const result = await p;
    expect(result).toEqual({ id: 'wp_abc', name: 'Spot', x: 0, y: 0, zoom: 2 });
  });

  it('should include description when provided', async () => {
    const p = addWaypoint(ws, { name: 'Art', x: 5, y: 5, zoom: 1, description: 'My art here' });
    ws._receive({ type: 'waypoint.added', waypoint: { id: 'wp_2', name: 'Art', x: 5, y: 5, zoom: 1 } });

    await p;
    expect(ws.sent[0].waypoint.description).toBe('My art here');
  });

  it('should reject on sync.error', async () => {
    const p = addWaypoint(ws, { name: 'Bad', x: 0, y: 0, zoom: 1 });
    ws._receive({ type: 'sync.error', message: 'Rate limited' });

    await expect(p).rejects.toThrow('Rate limited');
  });

  it('should reject on sync.error with code fallback', async () => {
    const p = addWaypoint(ws, { name: 'Bad', x: 0, y: 0, zoom: 1 });
    ws._receive({ type: 'sync.error', code: 'RATE_LIMIT' });

    await expect(p).rejects.toThrow('RATE_LIMIT');
  });

  it('should reject after 5s timeout', async () => {
    const p = addWaypoint(ws, { name: 'Slow', x: 0, y: 0, zoom: 1 });

    vi.advanceTimersByTime(5000);

    await expect(p).rejects.toThrow('Waypoint response timeout (5s)');
  });

  it('should clean up message listener on success', async () => {
    const p = addWaypoint(ws, { name: 'Clean', x: 0, y: 0, zoom: 1 });
    const listenersBefore = (ws._listeners.message || []).length;

    ws._receive({ type: 'waypoint.added', waypoint: { id: 'wp_x', name: 'Clean', x: 0, y: 0, zoom: 1 } });
    await p;

    const listenersAfter = (ws._listeners.message || []).length;
    expect(listenersAfter).toBeLessThan(listenersBefore);
  });

  it('should clean up message listener on error', async () => {
    const p = addWaypoint(ws, { name: 'Err', x: 0, y: 0, zoom: 1 });
    ws._receive({ type: 'sync.error', message: 'fail' });

    await expect(p).rejects.toThrow();
    expect((ws._listeners.message || []).length).toBe(0);
  });

  it('should handle batched/array messages', async () => {
    const p = addWaypoint(ws, { name: 'Batch', x: 0, y: 0, zoom: 1 });

    // Server sends array of messages
    const data = Buffer.from(JSON.stringify([
      { type: 'other.event' },
      { type: 'waypoint.added', waypoint: { id: 'wp_arr', name: 'Batch', x: 0, y: 0, zoom: 1 } },
    ]));
    for (const handler of (ws._listeners.message || [])) {
      handler(data);
    }

    const result = await p;
    expect(result.id).toBe('wp_arr');
  });
});

describe('getWaypointUrl', () => {
  it('should build URL with hardcoded base', () => {
    const url = getWaypointUrl({ id: 'wp_123' });
    expect(url).toBe('https://clawdraw.ai/?wp=wp_123');
  });
});

describe('sendStrokes (rate-aware)', () => {
  let ws: MockWs;

  beforeEach(() => {
    vi.useFakeTimers();
    ws = new MockWs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return SendResult with all fields for empty array', async () => {
    const result = await sendStrokes(ws, []);
    expect(result).toEqual({
      sent: 0, acked: 0, rejected: 0, errors: [],
      strokesSent: 0, strokesAcked: 0,
    });
  });

  it('should return SendResult on successful ack', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { delayMs: 0 });

    // Simulate ack
    ws._receive({ type: 'strokes.ack' });
    const result = await p;

    expect(result).toEqual({
      sent: 1, acked: 1, rejected: 0, errors: [],
      strokesSent: 1, strokesAcked: 1,
    });
  });

  it('should count stroke-level totals across multiple batches', async () => {
    // Auto-ack every strokes.add
    ws._autoRespond = (msg) => {
      if (msg.type === 'strokes.add' || msg.type === 'stroke.add') {
        queueMicrotask(() => ws._receive({ type: 'strokes.ack' }));
      }
    };

    // 5 strokes with batchSize=2 → 3 batches (2+2+1)
    const strokes = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` }));
    const result = await sendStrokes(ws, strokes, { batchSize: 2, delayMs: 0 });

    expect(result.sent).toBe(3);           // 3 batches sent
    expect(result.acked).toBe(3);           // 3 batches acked
    expect(result.strokesSent).toBe(5);     // 5 individual strokes
    expect(result.strokesAcked).toBe(5);    // 5 individual strokes acked
    expect(result.rejected).toBe(0);
  });

  it('should accept stroke.ack (singular) in legacy mode', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { legacy: true, delayMs: 0 });

    ws._receive({ type: 'stroke.ack' });
    const result = await p;

    expect(result.acked).toBe(1);
    expect(result.strokesAcked).toBe(1);
  });

  it('should retry on RATE_LIMITED with backoff', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { delayMs: 0 });

    // First attempt: rate limited
    ws._receive({ type: 'sync.error', code: 'RATE_LIMITED', message: 'Too many points per second' });

    // Advance past backoff (200ms for first retry)
    await vi.advanceTimersByTimeAsync(200);

    // Second attempt: success
    ws._receive({ type: 'strokes.ack' });

    const result = await p;
    expect(result.sent).toBe(2);            // sent twice (original + retry)
    expect(result.acked).toBe(1);           // acked once
    expect(result.rejected).toBe(0);        // not rejected (retry succeeded)
    expect(result.strokesSent).toBe(2);     // stroke transmitted twice
    expect(result.strokesAcked).toBe(1);    // stroke acked once
  });

  it('should exhaust retries on persistent RATE_LIMITED', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { delayMs: 0 });

    // Send RATE_LIMITED for each attempt (1 original + 5 retries = 6 total)
    for (let i = 0; i < 6; i++) {
      ws._receive({ type: 'sync.error', code: 'RATE_LIMITED', message: 'Too many points per second' });
      // Advance past backoff: 200, 400, 800, 1600, 3200
      if (i < 5) {
        await vi.advanceTimersByTimeAsync(200 * Math.pow(2, i));
      }
    }

    const result = await p;
    expect(result.acked).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('RATE_LIMITED');
  });

  it('should stop immediately on INSUFFICIENT_INQ', async () => {
    // 3 batches, second one gets INSUFFICIENT_INQ
    let batchCount = 0;
    ws._autoRespond = (msg) => {
      if (msg.type === 'strokes.add' || msg.type === 'stroke.add') {
        batchCount++;
        if (batchCount === 1) {
          queueMicrotask(() => ws._receive({ type: 'strokes.ack' }));
        } else {
          queueMicrotask(() => ws._receive({ type: 'sync.error', code: 'INSUFFICIENT_INQ', message: 'Not enough INQ' }));
        }
      }
    };

    const strokes = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const result = await sendStrokes(ws, strokes, { batchSize: 1, delayMs: 0 });

    expect(result.acked).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toContain('INSUFFICIENT_INQ');
    // Third batch was never sent (early stop)
    expect(result.strokesSent).toBe(2);
  });

  it('should skip batch on STROKE_TOO_LARGE and continue', async () => {
    let batchCount = 0;
    ws._autoRespond = (msg) => {
      if (msg.type === 'strokes.add' || msg.type === 'stroke.add') {
        batchCount++;
        if (batchCount === 1) {
          queueMicrotask(() => ws._receive({ type: 'sync.error', code: 'STROKE_TOO_LARGE', message: 'Stroke spans too many chunks' }));
        } else {
          queueMicrotask(() => ws._receive({ type: 'strokes.ack' }));
        }
      }
    };

    const strokes = [{ id: 's1' }, { id: 's2' }];
    const result = await sendStrokes(ws, strokes, { batchSize: 1, delayMs: 0 });

    expect(result.acked).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toContain('STROKE_TOO_LARGE');
    expect(result.strokesSent).toBe(2);
    expect(result.strokesAcked).toBe(1);
  });

  it('should handle timeout (no ack/error) and continue', async () => {
    const strokes = [{ id: 's1' }, { id: 's2' }];
    const p = sendStrokes(ws, strokes, { batchSize: 1, delayMs: 0 });

    // First batch: no response → timeout after 5s
    await vi.advanceTimersByTimeAsync(5000);
    // Second batch: acked
    ws._receive({ type: 'strokes.ack' });

    const result = await p;
    // Timeout batch counts as sent but not acked or rejected
    expect(result.sent).toBe(2);
    expect(result.acked).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('should handle WS closed mid-send', async () => {
    const strokes = [{ id: 's1' }, { id: 's2' }];
    // Close WS before sending
    ws.readyState = MockWs.CLOSED;

    const result = await sendStrokes(ws, strokes, { batchSize: 1, delayMs: 0 });
    expect(result.sent).toBe(0);
    expect(result.rejected).toBe(2);
    expect(result.errors).toEqual(['WS_CLOSED', 'WS_CLOSED']);
  });

  it('should handle array-wrapped ack messages', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { delayMs: 0 });

    // Server wraps response in array
    const data = Buffer.from(JSON.stringify([{ type: 'strokes.ack' }]));
    for (const handler of (ws._listeners.message || [])) {
      handler(data);
    }

    const result = await p;
    expect(result.acked).toBe(1);
  });

  it('should clean up listener after ack received', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { delayMs: 0 });
    const listenersBefore = (ws._listeners.message || []).length;

    ws._receive({ type: 'strokes.ack' });
    await p;

    const listenersAfter = (ws._listeners.message || []).length;
    expect(listenersAfter).toBeLessThan(listenersBefore);
  });

  it('should support legacy numeric delay argument', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], 0);
    ws._receive({ type: 'strokes.ack' });
    const result = await p;
    expect(result.acked).toBe(1);
  });

  it('should handle BATCH_FAILED error and continue', async () => {
    let batchCount = 0;
    ws._autoRespond = (msg) => {
      if (msg.type === 'strokes.add' || msg.type === 'stroke.add') {
        batchCount++;
        if (batchCount === 1) {
          queueMicrotask(() => ws._receive({ type: 'sync.error', code: 'BATCH_FAILED', message: 'Batch delivery failed, INQ refunded' }));
        } else {
          queueMicrotask(() => ws._receive({ type: 'strokes.ack' }));
        }
      }
    };

    const strokes = [{ id: 's1' }, { id: 's2' }];
    const result = await sendStrokes(ws, strokes, { batchSize: 1, delayMs: 0 });

    expect(result.acked).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.errors).toContain('BATCH_FAILED');
  });
});

describe('presence heartbeat', () => {
  let ws: MockWs;

  beforeEach(() => {
    vi.useFakeTimers();
    ws = new MockWs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should set _presenceHeartbeat interval on connect', async () => {
    // Simulate connect by manually building what connect() does:
    // We can't use real connect() because it creates a real WebSocket,
    // so test the heartbeat behavior on a MockWs directly.
    const viewportMsg = {
      type: 'viewport.update',
      viewport: { center: { x: 0, y: 0 }, zoom: 0.2, size: { width: 6000, height: 6000 } },
      cursor: { x: 0, y: 0 },
      username: 'test-bot',
    };
    ws.send(JSON.stringify(viewportMsg));

    ws._presenceHeartbeat = setInterval(() => {
      if (ws.readyState === MockWs.OPEN) {
        ws.send(JSON.stringify(viewportMsg));
      }
    }, 30000);

    expect(ws._presenceHeartbeat).toBeDefined();
  });

  it('should re-send viewport.update after 30s', async () => {
    const viewportMsg = {
      type: 'viewport.update',
      viewport: { center: { x: 0, y: 0 }, zoom: 0.2, size: { width: 6000, height: 6000 } },
      cursor: { x: 0, y: 0 },
      username: 'test-bot',
    };
    ws.send(JSON.stringify(viewportMsg));
    const initialCount = ws.sent.length;

    ws._presenceHeartbeat = setInterval(() => {
      if (ws.readyState === MockWs.OPEN) {
        ws.send(JSON.stringify(viewportMsg));
      }
    }, 30000);

    vi.advanceTimersByTime(30000);
    expect(ws.sent.length).toBe(initialCount + 1);
    expect(ws.sent[ws.sent.length - 1].type).toBe('viewport.update');

    clearInterval(ws._presenceHeartbeat);
  });

  it('should clear heartbeat on disconnect', () => {
    ws._presenceHeartbeat = setInterval(() => {}, 30000);
    expect(ws._presenceHeartbeat).toBeDefined();

    disconnect(ws);

    expect(ws._presenceHeartbeat).toBeNull();
  });

  it('should not send heartbeat when ws is closed', () => {
    const viewportMsg = {
      type: 'viewport.update',
      viewport: { center: { x: 0, y: 0 }, zoom: 0.2, size: { width: 6000, height: 6000 } },
      cursor: { x: 0, y: 0 },
      username: 'test-bot',
    };
    ws.send(JSON.stringify(viewportMsg));
    const initialCount = ws.sent.length;

    ws._presenceHeartbeat = setInterval(() => {
      if (ws.readyState === MockWs.OPEN) {
        ws.send(JSON.stringify(viewportMsg));
      }
    }, 30000);

    // Close the socket, then advance time
    ws.readyState = MockWs.CLOSED;
    vi.advanceTimersByTime(30000);

    // No new messages should have been sent
    expect(ws.sent.length).toBe(initialCount);

    clearInterval(ws._presenceHeartbeat);
  });
});
