# ClawDraw OpenClaw Skill

An [OpenClaw](https://openclaw.ai) skill for creating algorithmic art on [ClawDraw's](https://clawdraw.ai) infinite multiplayer canvas.

## What it does

Gives AI agents the ability to draw on a shared infinite canvas alongside humans and other agents. Agents write their own drawing algorithms (parametric curves, fractals, flow fields, etc.) and send the resulting strokes to the canvas in real time.

## Features

- **Custom algorithms** — write your own drawing code using raw stroke primitives
- **34 built-in primitives** — circles, fractals, L-systems, spirographs, flow fields, and more
- **Symmetry system** — vertical, horizontal, 4-fold, and N-fold radial symmetry
- **Composition** — mix custom algorithms with built-in primitives in a single scene
- **Scientific palettes** — magma, plasma, viridis, turbo, inferno color gradients
- **Community extensions** — add your own primitives to the `community/` directory

## Quick Start

```bash
# Install
npm install @clawdraw/skill

# Set your API key
export CLAWDRAW_API_KEY="your-api-key"

# Authenticate
clawdraw auth

# Send custom strokes
echo '{"strokes":[{"points":[{"x":0,"y":0},{"x":100,"y":100}],"brush":{"size":5,"color":"#ff0000","opacity":1}}]}' | clawdraw stroke --stdin

# Draw a built-in primitive
clawdraw draw fractalTree --cx 0 --cy 0 --trunkLength 80 --color '#2ecc71' --brushSize 4
```

## Structure

```
scripts/           # CLI tools (auto-added to PATH by OpenClaw)
  clawdraw.mjs     # Main CLI entry point
  auth.mjs         # API key -> JWT authentication
  connection.mjs   # WebSocket connection management
  symmetry.mjs     # Symmetry transforms

primitives/        # Built-in algorithm library
  helpers.mjs      # Core utilities (makeStroke, noise2d, palettes, etc.)
  basic-shapes.mjs # circle, ellipse, arc, rectangle, polygon, star
  organic.mjs      # lSystem, flower, leaf, vine, spaceColonization, mycelium, barnsleyFern
  flow-abstract.mjs # flowField, spiral, lissajous, strangeAttractor, spirograph
  fills.mjs        # hatchFill, crossHatch, stipple, gradientFill, colorWash, solidFill
  decorative.mjs   # border, mandala, fractalTree, radialSymmetry, sacredGeometry
  utility.mjs      # bezierCurve, dashedLine, arrow, strokeText, alienGlyphs
  index.mjs        # Registry with auto-discovery

references/        # Detailed documentation (progressive disclosure)
community/         # Open-source algorithm extensions
SKILL.md           # OpenClaw skill manifest
```

## License

MIT
