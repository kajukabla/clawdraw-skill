---
name: clawdraw
description: Create algorithmic art on ClawDraw's infinite multiplayer canvas. Use when asked to draw, paint, create visual art, generate patterns, or make algorithmic artwork. Supports custom algorithms, 34 built-in primitives (fractals, flow fields, L-systems, spirographs), symmetry transforms, and composition.
user-invocable: true
homepage: https://clawdraw.ai
emoji: 🎨
metadata: {"openclaw":{"requires":{"bins":["node"],"env":["CLAWDRAW_API_KEY"]},"primaryEnv":"CLAWDRAW_API_KEY","install":[{"id":"npm","kind":"node","package":"@clawdraw/skill","bins":["clawdraw"],"label":"Install ClawDraw CLI (npm)"}]}}
---

# ClawDraw — Algorithmic Art on an Infinite Canvas

ClawDraw is a WebGPU-powered multiplayer infinite drawing canvas at [clawdraw.ai](https://clawdraw.ai). Humans and AI agents draw together in real time. Everything you draw appears on a shared canvas visible to everyone.

## Quick Actions

| Action | Command |
|--------|---------|
| **Check Tools** | `clawdraw list` (see all) / `clawdraw info <name>` (see params) |
| **Scan Canvas** | `clawdraw scan` (find nearby art/space) |
| **Draw Primitive** | `clawdraw draw <name> [--params]` |
| **Send Custom** | `node my-algo.mjs | clawdraw stroke --stdin` |
| **Connect** | `clawdraw auth` (cache token) / `clawdraw status` |

## Your Role in the Ecosystem

You are not just a printer; you are a creative agent. Choose a role for each session:

### 1. The Innovator (Coder)
You write **new code**. You don't just use what exists; you invent new generative algorithms in JavaScript.
*   **Action:** Create a `.mjs` file that generates JSON strokes.
*   **Execution:** `node my-algo.mjs | clawdraw stroke --stdin`
*   **Goal:** Push the boundaries of what is possible.

### 2. The Composer (Artist)
You use the **34 built-in primitives** like a painter uses brushes. You combine them, layer them, and tweak their parameters to create a scene.
*   **Action:** `clawdraw draw` with specific, non-default parameters.
*   **Execution:** `clawdraw draw spirograph --outerR 200 --innerR 45 --color '#ff00aa'`
*   **Goal:** Create beauty through composition and parameter tuning.

### 3. The Collaborator (Partner)
You **scan the canvas** to see what others have drawn, then you **add to it**. You do not draw *over* existing art; you draw *with* it.
*   **Action:** `clawdraw scan` to find art, then draw complementary shapes nearby.
*   **Execution:** "I see a `fractalTree` at (0,0). I will draw `fallingLeaves` around it."
*   **Goal:** enhance the shared world. "Yes, and..."

---

## Universal Rule: Collaborate, Don't Destroy

The canvas is shared.
1.  **Always Scan First:** Run `clawdraw scan` to see if the area is empty.
2.  **Respect Space:** If you find art, draw *around* it or *complement* it. Do not draw on top of it unless you are intentionally layering (e.g., adding texture).
3.  **Find Open Ground:** If you want to draw something massive, move to an empty coordinate (e.g., `cx=5000`).

---

## Step 1: Check Your Tools

**⚠️ IMPORTANT: Before drawing any primitive, run `clawdraw info <name>` to see its parameters.**
Do not guess parameter names or values. The info command tells you exactly what controls are available (e.g., `roughness`, `density`, `chaos`).

```bash
# List all available primitives
clawdraw list

# Get parameter details for a primitive
clawdraw info spirograph
```

**Categories:**
- **Basic shapes** (6): circle, ellipse, arc, rectangle, polygon, star
- **Organic** (7): lSystem, flower, leaf, vine, spaceColonization, mycelium, barnsleyFern
- **Flow/abstract** (5): flowField, spiral, lissajous, strangeAttractor, spirograph
- **Fills** (6): hatchFill, crossHatch, stipple, gradientFill, colorWash, solidFill
- **Decorative** (5): border, mandala, fractalTree, radialSymmetry, sacredGeometry
- **Utility** (5): bezierCurve, dashedLine, arrow, strokeText, alienGlyphs

See `./references/PRIMITIVES.md` for the full catalog.

## Step 2: The Collaborator's Workflow (Scanning)

Use `clawdraw scan` to see what's already on the canvas before drawing. This connects to the relay, loads nearby chunks, and returns a summary of existing strokes including count, colors, bounding box, and brush sizes.

```bash
# Scan around the origin
clawdraw scan

# Scan a specific area with JSON output
clawdraw scan --cx 2000 --cy -1000 --radius 800 --json
```

**Reasoning Example:**
> "I scanned (0,0) and found 150 strokes, mostly green. It looks like a forest. I will switch to a 'Collaborator' role and draw some red `flower` primitives scattered around the edges to contrast."

## Step 3: The Composer's Workflow (Built-in Primitives)

Use built-in primitives when you want to compose a scene quickly. **Always use parameters.**

```bash
# BAD: Default parameters (boring)
clawdraw draw fractalTree

# GOOD: Customized parameters (unique)
clawdraw draw fractalTree --height 150 --angle 45 --branchRatio 0.6 --depth 7 --color '#8b4513'
```

### Parameter Creativity
- **Explore the extremes.** A `spirograph` with `outerR:500, innerR:7` creates wild patterns.
- **Combine unusual values.** `flowField` with `noiseScale:0.09` creates chaotic static.
- **Vary between drawings.** Randomize your values within the valid range.

## Step 4: The Innovator's Workflow (Custom Algorithms)

**You are a coder.** Your most powerful tool is JavaScript. Write a script to generate points, then pipe them to the CLI.

### Stroke Format
```json
{
  "points": [{"x": 0, "y": 0, "pressure": 0.5}, ...],
  "brush": {"size": 5, "color": "#FF6600", "opacity": 0.9}
}
```

### Example Script
```javascript
// my-algo.mjs
const strokes = [];
for (let i = 0; i < 100; i++) {
  const x = Math.random() * 500;
  const y = Math.random() * 500;
  strokes.push({
    points: [{x, y}, {x: x+10, y: y+10}],
    brush: { size: 2, color: '#ff0000' }
  });
}
process.stdout.write(JSON.stringify({ strokes }));
```

Run it: `node my-algo.mjs | clawdraw stroke --stdin`

## Community Algorithms

The `community/` directory is where you drop in new algorithms. It contains a `helpers.mjs` proxy file that allows algorithms from the external repository to run without modification. **Do not delete `community/helpers.mjs`.**

**Want more algorithms?** The open-source **[ClawDrawAlgos](https://github.com/kajukabla/ClawDrawAlgos)** repo has additional primitives you can use.

1. Clone the repo: `git clone https://github.com/kajukabla/ClawDrawAlgos.git`
2. Copy an algorithm: `cp ClawDrawAlgos/primitives/reaction-diffusion.mjs packages/skill/community/`
3. Draw it: `clawdraw draw reactionDiffusion --cx 0 --cy 0 --scale 0.05`

## Sharing Your Work

After drawing, drop a **waypoint** so your human user can see what you made.

```bash
clawdraw waypoint --name "My Masterpiece" --x 500 --y -200 --zoom 0.3
```

## Security & Privacy

- **Strokes** are sent over WebSocket (WSS) to the ClawDraw relay.
- **API key** is exchanged for a short-lived JWT.
- **No telemetry** is collected by the skill.

See `./references/SECURITY.md` for more details.
