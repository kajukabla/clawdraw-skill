/**
 * Cosine-blend compositing — pastes original pixels back over the overlap
 * zone of an AI-generated image, using the original screenshot's alpha channel
 * as the content mask. Guarantees pixel preservation regardless of model.
 *
 * Dependencies: sharp (native PNG decode/encode + image processing)
 */

import sharp from 'sharp';

/**
 * Composite original pixels back over the AI-generated result using
 * alpha-channel-guided cosine blending.
 *
 * Where the original has content (alpha > 0), original pixels are preserved.
 * Where it's transparent, generated pixels are used. At the boundary, a
 * smooth cosine blend over `blendWidth` pixels creates a seamless transition.
 *
 * @param {Buffer} originalPng - PNG buffer of the original screenshot (from generate)
 * @param {Buffer} generatedPng - PNG buffer of the AI-generated result
 * @param {object} [opts]
 * @param {number} [opts.blendWidth=60] - Width of the cosine blend zone in pixels
 * @returns {Promise<Buffer>} Composited PNG buffer
 */
export async function cosineBlendComposite(originalPng, generatedPng, opts = {}) {
  const blendWidth = opts.blendWidth ?? 60;

  // Decode generated image to get target dimensions
  const genMeta = await sharp(generatedPng).metadata();
  const genW = genMeta.width;
  const genH = genMeta.height;

  // Decode original, resize to match generated dimensions if needed
  const origMeta = await sharp(originalPng).metadata();
  let origPipeline = sharp(originalPng).ensureAlpha();
  if (origMeta.width !== genW || origMeta.height !== genH) {
    origPipeline = origPipeline.resize(genW, genH, { fit: 'fill' });
  }
  const origRaw = await origPipeline.raw().toBuffer();

  // Decode generated image
  const genRaw = await sharp(generatedPng).ensureAlpha().raw().toBuffer();

  // Build binary content mask from original alpha channel
  // 1 = has content (alpha > 10), 0 = empty
  const mask = new Float32Array(genW * genH);
  for (let i = 0; i < genW * genH; i++) {
    mask[i] = origRaw[i * 4 + 3] > 10 ? 1.0 : 0.0;
  }

  // Compute distance field: for each pixel, approximate distance to nearest
  // opposite-value pixel. Uses two-pass (horizontal + vertical) approximation.
  const dist = new Float32Array(genW * genH);
  const INF = genW + genH;

  // Initialize: content pixels get INF distance (far from empty edge),
  // empty pixels get 0 (they ARE the edge)
  for (let i = 0; i < genW * genH; i++) {
    dist[i] = mask[i] > 0 ? INF : 0;
  }

  // Forward pass (top-left to bottom-right)
  for (let y = 0; y < genH; y++) {
    for (let x = 0; x < genW; x++) {
      const i = y * genW + x;
      if (dist[i] === 0) continue; // empty pixel, distance stays 0
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[(y - 1) * genW + x] + 1);
    }
  }

  // Backward pass (bottom-right to top-left)
  for (let y = genH - 1; y >= 0; y--) {
    for (let x = genW - 1; x >= 0; x--) {
      const i = y * genW + x;
      if (dist[i] === 0) continue;
      if (x < genW - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < genH - 1) dist[i] = Math.min(dist[i], dist[(y + 1) * genW + x] + 1);
    }
  }

  // Blend pixels using distance field
  const result = Buffer.alloc(genW * genH * 4);

  for (let i = 0; i < genW * genH; i++) {
    const off = i * 4;

    if (mask[i] === 0) {
      // Empty in original — use 100% generated
      result[off] = genRaw[off];
      result[off + 1] = genRaw[off + 1];
      result[off + 2] = genRaw[off + 2];
      result[off + 3] = genRaw[off + 3];
    } else if (dist[i] >= blendWidth) {
      // Deep inside original content — use 100% original
      result[off] = origRaw[off];
      result[off + 1] = origRaw[off + 1];
      result[off + 2] = origRaw[off + 2];
      result[off + 3] = origRaw[off + 3];
    } else {
      // Blend zone — cosine interpolation
      const t = dist[i] / blendWidth;
      const alpha = 0.5 * (1 - Math.cos(Math.PI * t));
      // alpha=0 near empty edge (use generated), alpha=1 deep inside (use original)
      const r = Math.round(genRaw[off] * (1 - alpha) + origRaw[off] * alpha);
      const g = Math.round(genRaw[off + 1] * (1 - alpha) + origRaw[off + 1] * alpha);
      const b = Math.round(genRaw[off + 2] * (1 - alpha) + origRaw[off + 2] * alpha);
      const a = Math.round(genRaw[off + 3] * (1 - alpha) + origRaw[off + 3] * alpha);
      result[off] = r;
      result[off + 1] = g;
      result[off + 2] = b;
      result[off + 3] = a;
    }
  }

  return sharp(result, { raw: { width: genW, height: genH, channels: 4 } })
    .png()
    .toBuffer();
}
