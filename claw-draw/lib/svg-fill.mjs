/**
 * SVG fill engine — converts closed SVG paths into brush strokes covering the interior.
 *
 * Two fill strategies:
 *   - contourFill: concentric inset rings (for compact shapes)
 *   - hatchFill:   parallel clipped lines (for elongated/complex shapes)
 */

import { clamp } from '../primitives/helpers.mjs';

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/**
 * Ray-casting even-odd point-in-polygon test.
 * @param {number} px
 * @param {number} py
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {boolean}
 */
export function pointInPolygon(px, py, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Axis-aligned bounding box of a polygon.
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}}
 */
export function polygonBBox(polygon) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Compute polygon area (shoelace formula), perimeter, and compactness.
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {{area: number, perimeter: number, compactness: number}}
 */
export function polygonMetrics(polygon) {
  const n = polygon.length;
  if (n < 3) return { area: 0, perimeter: 0, compactness: 0 };

  let area = 0;
  let perimeter = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  area = Math.abs(area) / 2;
  const compactness = perimeter > 0 ? (4 * Math.PI * area) / (perimeter * perimeter) : 0;
  return { area, perimeter, compactness };
}

/**
 * Choose fill strategy based on shape compactness.
 * Compact shapes (circles, squares) → contour fill (concentric rings).
 * Elongated/complex shapes → hatch fill (parallel lines).
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {'contour' | 'hatch'}
 */
export function chooseFillStrategy(polygon) {
  const { compactness } = polygonMetrics(polygon);
  return compactness > 0.15 ? 'contour' : 'hatch';
}

// ---------------------------------------------------------------------------
// Offset polygon (for contour fill)
// ---------------------------------------------------------------------------

/**
 * Inset a polygon by moving each vertex along its averaged inward normal.
 * Returns null if the result is degenerate (< 3 vertices or self-intersecting).
 * @param {Array<{x: number, y: number}>} polygon
 * @param {number} distance - positive = inset
 * @returns {Array<{x: number, y: number}> | null}
 */
export function offsetPolygon(polygon, distance) {
  const n = polygon.length;
  if (n < 3) return null;

  // Ensure consistent winding (CCW = positive area in shoelace)
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    signedArea += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  const winding = signedArea > 0 ? 1 : -1; // 1 = CCW, -1 = CW

  const result = [];
  for (let i = 0; i < n; i++) {
    const prev = polygon[(i - 1 + n) % n];
    const curr = polygon[i];
    const next = polygon[(i + 1) % n];

    // Edge normals (pointing inward for CCW winding)
    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const nx1 = -dy1 / len1 * winding, ny1 = dx1 / len1 * winding;

    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    const nx2 = -dy2 / len2 * winding, ny2 = dx2 / len2 * winding;

    // Average normal
    let nx = nx1 + nx2, ny = ny1 + ny2;
    const nLen = Math.sqrt(nx * nx + ny * ny);
    if (nLen < 0.001) {
      // Collinear edges — use one normal
      nx = nx1; ny = ny1;
    } else {
      nx /= nLen; ny /= nLen;
      // Scale by 1/cos(halfAngle) to maintain distance from edge
      const dot = nx1 * nx + ny1 * ny;
      const scale = dot > 0.1 ? 1 / dot : 3; // cap to avoid miter explosion
      nx *= Math.min(scale, 3);
      ny *= Math.min(scale, 3);
    }

    result.push({
      x: curr.x + nx * distance,
      y: curr.y + ny * distance,
    });
  }

  // Validate: check for self-intersection by looking for collapsed area
  let newArea = 0;
  for (let i = 0; i < result.length; i++) {
    const j = (i + 1) % result.length;
    newArea += result[i].x * result[j].y - result[j].x * result[i].y;
  }
  if (Math.abs(newArea) < 1) return null; // collapsed

  return result;
}

// ---------------------------------------------------------------------------
// Contour fill
// ---------------------------------------------------------------------------

/**
 * Fill a polygon by generating concentric inset rings.
 * Each ring becomes a closed stroke. Step = brushSize * 0.6 for overlap.
 * @param {Array<{x: number, y: number}>} polygon
 * @param {{brushSize?: number}} [options]
 * @returns {Array<Array<{x: number, y: number}>>} - arrays of point rings
 */
export function contourFill(polygon, options = {}) {
  const { brushSize = 5 } = options;
  const step = brushSize * 0.6;
  const rings = [];
  let current = polygon;
  const MAX_RINGS = 50;

  for (let i = 0; i < MAX_RINGS; i++) {
    // Add current ring (close it by repeating the first point)
    if (current.length >= 3) {
      const ring = [...current, current[0]];
      rings.push(ring);
    }

    // Inset for next ring
    const next = offsetPolygon(current, step);
    if (!next || next.length < 3) break;
    current = next;
  }

  return rings;
}

// ---------------------------------------------------------------------------
// Hatch fill (parallel line clipping)
// ---------------------------------------------------------------------------

/**
 * Clip a line to a polygon boundary, returning entry/exit segments.
 * @param {{x: number, y: number}} linePoint - a point on the line
 * @param {{x: number, y: number}} lineDir - direction vector of the line
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {Array<{enter: {x: number, y: number}, exit: {x: number, y: number}}>}
 */
export function clipLineToPolygon(linePoint, lineDir, polygon) {
  const n = polygon.length;
  const intersections = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = polygon[j].x - polygon[i].x;
    const ey = polygon[j].y - polygon[i].y;

    const denom = lineDir.x * ey - lineDir.y * ex;
    if (Math.abs(denom) < 1e-10) continue;

    const dx = polygon[i].x - linePoint.x;
    const dy = polygon[i].y - linePoint.y;
    const t = (dx * ey - dy * ex) / denom;
    const u = (dx * lineDir.y - dy * lineDir.x) / denom;

    if (u >= 0 && u <= 1) {
      intersections.push({
        t,
        x: linePoint.x + lineDir.x * t,
        y: linePoint.y + lineDir.y * t,
      });
    }
  }

  // Sort by parameter t along the line
  intersections.sort((a, b) => a.t - b.t);

  // Pair up intersections as enter/exit segments
  const segments = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    segments.push({
      enter: { x: intersections[i].x, y: intersections[i].y },
      exit: { x: intersections[i + 1].x, y: intersections[i + 1].y },
    });
  }

  return segments;
}

/**
 * Fill a polygon with parallel hatching lines.
 * Lines are perpendicular to the polygon's longest axis for better coverage.
 * @param {Array<{x: number, y: number}>} polygon
 * @param {{brushSize?: number}} [options]
 * @returns {Array<Array<{x: number, y: number}>>} - arrays of line segments (each is [start, end])
 */
export function hatchFill(polygon, options = {}) {
  const { brushSize = 5 } = options;
  const step = brushSize * 0.6;
  const bbox = polygonBBox(polygon);

  // Find longest axis angle via PCA-lite (longest edge direction)
  let bestLen = 0, bestAngle = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const dx = polygon[j].x - polygon[i].x;
    const dy = polygon[j].y - polygon[i].y;
    const len = dx * dx + dy * dy;
    if (len > bestLen) {
      bestLen = len;
      bestAngle = Math.atan2(dy, dx);
    }
  }

  // Sweep perpendicular to the longest edge
  const sweepAngle = bestAngle + Math.PI / 2;
  const lineDir = { x: Math.cos(bestAngle), y: Math.sin(bestAngle) };
  const sweepDir = { x: Math.cos(sweepAngle), y: Math.sin(sweepAngle) };

  // Project all vertices onto sweep direction to find sweep range
  let minProj = Infinity, maxProj = -Infinity;
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  for (const p of polygon) {
    const proj = (p.x - cx) * sweepDir.x + (p.y - cy) * sweepDir.y;
    if (proj < minProj) minProj = proj;
    if (proj > maxProj) maxProj = proj;
  }

  const lines = [];
  const MAX_LINES = 200;
  for (let d = minProj; d <= maxProj && lines.length < MAX_LINES; d += step) {
    const linePoint = {
      x: cx + sweepDir.x * d,
      y: cy + sweepDir.y * d,
    };
    const segments = clipLineToPolygon(linePoint, lineDir, polygon);
    for (const seg of segments) {
      lines.push([seg.enter, seg.exit]);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Shape-to-path converters
// ---------------------------------------------------------------------------

/**
 * Convert a circle to an SVG `d` string (two arcs).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @returns {string}
 */
export function circleToPath(cx, cy, r) {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

/**
 * Convert an ellipse to an SVG `d` string.
 * @param {number} cx
 * @param {number} cy
 * @param {number} rx
 * @param {number} ry
 * @returns {string}
 */
export function ellipseToPath(cx, cy, rx, ry) {
  return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
}

/**
 * Convert a rect to an SVG `d` string (with optional rounded corners).
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} [rx=0]
 * @returns {string}
 */
export function rectToPath(x, y, w, h, rx = 0) {
  if (rx <= 0) {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  const r = Math.min(rx, w / 2, h / 2);
  return [
    `M ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `L ${x + w} ${y + h - r}`,
    `A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `L ${x + r} ${y + h}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    'Z',
  ].join(' ');
}
