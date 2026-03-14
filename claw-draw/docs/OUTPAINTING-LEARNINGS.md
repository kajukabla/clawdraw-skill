# Outpainting Pipeline — Learnings & Process

## What We're Building

Seamless canvas extension on ClawDraw's infinite canvas. An AI agent inspects existing art, proposes a generation area (PGS) that partially overlaps existing content, and uses Flux Fill Pro to generate new content that seamlessly continues the scene.

## Model Selection

### Tested Models

| Model | Preserves Pixels? | Quality | Verdict |
|-------|-------------------|---------|---------|
| **Flux Fill Pro** | Yes (mask-based) | High | **Winner** — designed for inpainting/outpainting |
| Flux Kontext Max | No (VAE re-encodes) | High | Beautiful but re-generates everything. Seams on canvas. |
| Flux Expand Pro | Yes (directional) | Medium | Duplicated subject in testing. Directional API is limiting. |
| Flux 2 Pro/Max | Partial | High | Generation models, not designed for outpainting |

### Why Fill Pro

Fill Pro takes an image + a binary mask. Black mask = preserve those pixels exactly. White mask = generate new content there. This is exactly what outpainting needs — the existing art is preserved pixel-perfect, and only the empty space gets filled.

## Fill Pro Behavior — Critical Findings

### Mask Ratio

Earlier testing suggested a hard rule: 50% mask = duplication, 33% = works. But further testing showed it's more nuanced:

| Content % | Mask (fill) % | Behavior |
|-----------|---------------|----------|
| 67% | 33% | Works reliably |
| 50% | 50% | **Sometimes duplicates, sometimes works** |
| <50% | >50% | Unreliable — too little context |

The 50% duplication was observed multiple times with landscape (1536x1024) images where content filled the left half. However, a portrait (1024x1536) image with content in the bottom half at 50% mask worked perfectly — no duplication. The behavior may depend on aspect ratio, content position (edge vs center), or image content itself.

**The aspect ratio is the key variable:**
- **Landscape (e.g. 1536x1024) at 50% mask → duplicates reliably**
- **Square (1024x1024) at 50% mask → works reliably**
- **Portrait (1024x1536) at 50% mask → works reliably**

**Bottom line:** Use square PGS dimensions for extends. Square at 50% mask works every time. Landscape at 50% mask duplicates. Trying to generate at a reduced resolution and then resize introduces distortion (stretching). Just keep it square.

### Resolution Limits

- Fill Pro outputs up to ~1.6 megapixels
- Beyond that, it silently downscales the output
- 1536x1024 = 1.57MP — safely within limits
- 2048x1024 = 2.1MP — will be downscaled, quality degrades

### Guidance Parameter

- `guidance: 30` is BFL's default — works well for outpainting
- `guidance: 2` was too low — produced incoherent results
- `guidance: 60` was the original code value — too high, over-follows text prompt and ignores image context

### Text Artifacts

- Fill Pro sometimes hallucinates text/watermarks ("DrRaota", "STARY", "Dina Clest")
- Adding "No text, no words, no letters, no watermarks, no logos" to the prompt reduces but doesn't eliminate this
- Seems more common with higher step counts or when the prompt mentions specific objects

## Architecture — Current Working Approach

```
1. PGS area defines the output rectangle and pixel resolution
2. Find images overlapping the PGS area (sorted by overlap area, not recency)
3. Capture ONLY the overlap between source image and PGS area
4. Place captured content at its correct position on a black canvas at PGS resolution
5. Build mask: white where no content, black where content exists
6. Single Fill Pro call with image + mask + prompt
7. Result IS the final output — place directly on canvas
```

**Key insight: capture the overlap, not the whole source.** If a source image is 2048px wide but only 1024px overlaps the PGS area, only capture that 1024px. This ensures:
- Content is at the correct scale (no squishing)
- Content aligns with the PGS coordinate system
- The placed result lines up perfectly on canvas

### What didn't work

**Sliding-window strip stitching**: Pad 512px, call Fill Pro, extract the 512px strip, slide the 1024px context window, repeat. Problems:
- Strip extraction and recomposition introduced seams
- Multi-step chains compound errors and are slow (lock expiry)
- Source image selection was wrong (picked by recency, not by overlap)
- Stitching with sharp's `create().composite()` produced garbled results

**Capturing entire source image**: When the source is larger than the PGS overlap, capturing it all and squishing to working resolution distorts content and breaks alignment. A 2048-wide source squished to 1024px means every pixel represents 2 canvas units instead of 1, so the placed result doesn't line up.

**Direction detection**: Calculating "extend right/left/up/down" added complexity with no benefit. The PGS area + overlap geometry already defines where content is and where empty space is. The mask handles it automatically.

**1024+512 fixed working resolution**: Forced all content into 1024x1024 regardless of actual overlap shape. Works for square overlaps but distorts non-square ones.

## Key Constraints

1. **PGS requires 50% overlap** — the generation area must overlap existing content by at least 50%
2. **PGS resolution stays under 1.6MP** — the server caps at 1536 on the long edge, keeping total pixels under Fill Pro's limit
3. **Always use square PGS** — 1024x1024 at 50% overlap/mask works reliably. Landscape at 50% duplicates.
4. Each extend adds 512 canvas units of new content (half the 1024 PGS width)

## Prompt Strategy

**What works:**
```
[describe new content]. Same art style, same lighting, same color palette. No text, no words, no letters, no watermarks, no logos.
```

**What doesn't work:**
- "Preserve the original pixels" — Fill Pro does this via mask, not prompt
- "Outpaint" or "extend the image" — less effective than describing the new content
- Long detailed instructions — short prompts work better
- Mentioning specific UI elements or text — triggers text hallucination

## Infrastructure Notes

- `captureFromImages()` fetches source images from R2 via relay's `/api/pgs/area-images` endpoint
- Images are served at `relay.clawdraw.ai/images/{id}.png`
- `area-images` returns ALL images including deleted/undone ones (chunk DO storage persistence issue)
- Canvas clear doesn't purge image records from chunk DOs — stale data affects overlap calculations
- PGS locks expire after ~2 minutes — single-call approach avoids expiry
- `place-image` uploads via logic-cf's `/api/agents/images` endpoint, requires valid PGS lock
- Service token auth allows direct coordinate placement (for seeds on empty canvas)

## Cost

Each Fill Pro call costs BFL credits. At 1536x1024:
- ~$0.05 per call (BFL pricing)
- Single-call approach = 1 call per extend = cheapest and fastest

## Timeline of Attempts

1. **Kontext Max** — beautiful results but re-generates everything, visible seams on canvas
2. **Fill Pro with guidance=2** — incoherent output
3. **Fill Pro with guidance=30, 50/50 mask (landscape)** — duplicated subject
4. **Fill Pro 1024+512 sliding window** — works for single step, stitching bugs for multi-step
5. **Fill Pro at PGS resolution (50% mask, landscape)** — duplicated subject again
6. **Fill Pro 1024+512 single step** — works but captured wrong area (full source instead of overlap)
7. **Overlap-only capture + PGS-resolution single call** — **current approach, works correctly**
8. **50% mask portrait test** — worked without duplication, updating mask ratio understanding
9. **Reduced working resolution hack** — generated at 1146x1024 (67% content), resized to 1536x1024 — introduced 34% horizontal stretch/squash. Bad approach.
10. **Square PGS (1024x1024) at 50% mask** — **works reliably, no duplication, no distortion**. This is the current approach.
