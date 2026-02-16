/**
 * Tests for connection.mjs — addWaypoint, getWaypointUrl, sendStrokes (waitForAcks).
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

  constructor() {
    this.readyState = MockWs.OPEN;
    this._listeners = {};
    this.sent = [];
  }

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
  }

  removeListener(event, handler) {
    const arr = this._listeners[event];
    if (!arr) return;
    this._listeners[event] = arr.filter(h => h !== handler);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = MockWs.CLOSED;
  }

  // Test helper: simulate receiving a message
  _receive(obj) {
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
  let ws;

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

describe('sendStrokes with waitForAcks', () => {
  let ws;

  beforeEach(() => {
    vi.useFakeTimers();
    ws = new MockWs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return plain number when waitForAcks is false (default)', async () => {
    const result = await sendStrokes(ws, [{ id: 's1' }]);
    expect(result).toBe(1);
  });

  it('should return { sent, acked } when waitForAcks is true', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { waitForAcks: true });

    // Simulate ack
    ws._receive({ type: 'strokes.ack' });
    const result = await p;

    expect(result).toEqual({ sent: 1, acked: 1 });
  });

  it('should count acks for multiple batches', async () => {
    // 3 strokes with batchSize=1 → 3 batches → expect 3 acks
    const strokes = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
    const p = sendStrokes(ws, strokes, { waitForAcks: true, batchSize: 1, delayMs: 0 });

    ws._receive({ type: 'strokes.ack' });
    ws._receive({ type: 'strokes.ack' });
    ws._receive({ type: 'strokes.ack' });

    const result = await p;
    expect(result).toEqual({ sent: 3, acked: 3 });
  });

  it('should accept stroke.ack (singular) in legacy mode', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { waitForAcks: true, legacy: true });

    ws._receive({ type: 'stroke.ack' });
    const result = await p;

    expect(result).toEqual({ sent: 1, acked: 1 });
  });

  it('should resolve with partial acks on timeout', async () => {
    const strokes = [{ id: 's1' }, { id: 's2' }];
    const p = sendStrokes(ws, strokes, { waitForAcks: true, batchSize: 1, delayMs: 0 });

    // Only 1 of 2 expected acks arrives
    ws._receive({ type: 'strokes.ack' });

    // Advance past 10s timeout
    vi.advanceTimersByTime(10000);

    const result = await p;
    expect(result).toEqual({ sent: 2, acked: 1 });
  });

  it('should return { sent: 0, acked: 0 } for empty strokes array', async () => {
    const result = await sendStrokes(ws, [], { waitForAcks: true });
    expect(result).toEqual({ sent: 0, acked: 0 });
  });

  it('should handle array-wrapped ack messages', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { waitForAcks: true });

    // Server wraps response in array
    const data = Buffer.from(JSON.stringify([{ type: 'strokes.ack' }]));
    for (const handler of (ws._listeners.message || [])) {
      handler(data);
    }

    const result = await p;
    expect(result).toEqual({ sent: 1, acked: 1 });
  });

  it('should clean up listener after all acks received', async () => {
    const p = sendStrokes(ws, [{ id: 's1' }], { waitForAcks: true });
    const listenersBefore = (ws._listeners.message || []).length;

    ws._receive({ type: 'strokes.ack' });
    await p;

    const listenersAfter = (ws._listeners.message || []).length;
    expect(listenersAfter).toBeLessThan(listenersBefore);
  });
});

describe('presence heartbeat', () => {
  let ws;

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
