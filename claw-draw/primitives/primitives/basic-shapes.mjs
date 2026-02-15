/**
 * Basic shape primitives: circle, ellipse, arc, rectangle, polygon, star.
 */

import { clamp, lerp, makeStroke, splitIntoStrokes } from './helpers.mjs';

// ---------------------------------------------------------------------------
// Metadata for registry auto-discovery
// ---------------------------------------------------------------------------

export const METADATA = [
  {
    name: 'circle', description: 'Smooth circle', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      radius: { type: 'number', required: true, description: '1-500' },
      color: { type: 'string' }, brushSize: { type: 'number' }, opacity: { type: 'number' },
      pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'ellipse', description: 'Rotated oval', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      radiusX: { type: 'number', required: true }, radiusY: { type: 'number', required: true },
      rotation: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      opacity: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'arc', description: 'Partial circle arc', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      radius: { type: 'number', required: true },
      startAngle: { type: 'number', required: true, description: 'Degrees' },
      endAngle: { type: 'number', required: true, description: 'Degrees' },
      color: { type: 'string' }, brushSize: { type: 'number' }, opacity: { type: 'number' },
      pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'rectangle', description: 'Rectangle outline', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      width: { type: 'number', required: true }, height: { type: 'number', required: true },
      rotation: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      opacity: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'polygon', description: 'Regular N-sided polygon', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      radius: { type: 'number', required: true }, sides: { type: 'number', required: true, description: '3-24' },
      rotation: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      opacity: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
  {
    name: 'star', description: 'N-pointed star', category: 'basic-shapes',
    parameters: {
      cx: { type: 'number', required: true }, cy: { type: 'number', required: true },
      outerR: { type: 'number', required: true }, innerR: { type: 'number', required: true },
      points: { type: 'number', required: true, description: '3-20' },
      rotation: { type: 'number' }, color: { type: 'string' }, brushSize: { type: 'number' },
      opacity: { type: 'number' }, pressureStyle: { type: 'string' },
    },
  },
];

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function circle(cx, cy, radius, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  radius = clamp(Number(radius) || 50, 1, 500);
  const steps = clamp(Math.round(radius * 0.5), 24, 200);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const wobble = radius * (1 + (Math.random() - 0.5) * 0.04);
    pts.push({ x: cx + Math.cos(a) * wobble, y: cy + Math.sin(a) * wobble });
  }
  return splitIntoStrokes(pts, color, brushSize, opacity, pressureStyle);
}

export function ellipse(cx, cy, radiusX, radiusY, rotation, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  radiusX = clamp(Number(radiusX) || 50, 1, 500);
  radiusY = clamp(Number(radiusY) || 30, 1, 500);
  rotation = (Number(rotation) || 0) * Math.PI / 180;
  const steps = clamp(Math.round(Math.max(radiusX, radiusY) * 0.5), 24, 200);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const lx = Math.cos(a) * radiusX, ly = Math.sin(a) * radiusY;
    pts.push({
      x: cx + lx * Math.cos(rotation) - ly * Math.sin(rotation),
      y: cy + lx * Math.sin(rotation) + ly * Math.cos(rotation),
    });
  }
  return splitIntoStrokes(pts, color, brushSize, opacity, pressureStyle);
}

export function arc(cx, cy, radius, startAngle, endAngle, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  radius = clamp(Number(radius) || 50, 1, 500);
  startAngle = (Number(startAngle) || 0) * Math.PI / 180;
  endAngle = (Number(endAngle) || 180) * Math.PI / 180;
  const span = Math.abs(endAngle - startAngle);
  const steps = clamp(Math.round(radius * span * 0.3), 12, 200);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = lerp(startAngle, endAngle, i / steps);
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return splitIntoStrokes(pts, color, brushSize, opacity, pressureStyle);
}

export function rectangle(cx, cy, width, height, rotation, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  width = clamp(Number(width) || 100, 2, 1000);
  height = clamp(Number(height) || 100, 2, 1000);
  rotation = (Number(rotation) || 0) * Math.PI / 180;
  const hw = width / 2, hh = height / 2;
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]];
  const pts = corners.map(([lx, ly]) => ({
    x: cx + lx * Math.cos(rotation) - ly * Math.sin(rotation),
    y: cy + lx * Math.sin(rotation) + ly * Math.cos(rotation),
  }));
  return [makeStroke(pts, color, brushSize, opacity, pressureStyle)];
}

export function polygon(cx, cy, radius, sides, rotation, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  radius = clamp(Number(radius) || 50, 1, 500);
  sides = clamp(Math.round(Number(sides) || 6), 3, 24);
  rotation = (Number(rotation) || 0) * Math.PI / 180;
  const pts = [];
  for (let i = 0; i <= sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return [makeStroke(pts, color, brushSize, opacity, pressureStyle)];
}

export function star(cx, cy, outerR, innerR, points, rotation, color, brushSize, opacity, pressureStyle) {
  cx = Number(cx) || 0; cy = Number(cy) || 0;
  outerR = clamp(Number(outerR) || 60, 5, 500);
  innerR = clamp(Number(innerR) || 30, 2, outerR - 1);
  points = clamp(Math.round(Number(points) || 5), 3, 20);
  rotation = (Number(rotation) || -90) * Math.PI / 180;
  const pts = [];
  const totalVerts = points * 2;
  for (let i = 0; i <= totalVerts; i++) {
    const a = rotation + (i / totalVerts) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return [makeStroke(pts, color, brushSize, opacity, pressureStyle)];
}
