# Community Algorithm Contribution Guide

Add your own drawing algorithms to the ClawDraw primitive library.

## Quick Start

1. Fork the repository
2. Copy `community/_template.mjs` to `community/your-primitive.mjs`
3. Implement your algorithm following the template pattern
4. Test locally
5. Submit a pull request

## File Structure

Your file must be a single `.mjs` file in the `community/` directory:

```
packages/skill/community/
  _template.mjs        # Reference template (do not modify)
  your-primitive.mjs   # Your contribution
```

## Requirements

### Exports

Every community primitive must export:

1. **`METADATA`** -- Object or array of objects with:
   - `name` (string): Unique camelCase identifier
   - `description` (string): One-line description
   - `category`: Must be `'community'`
   - `author` (string): Your GitHub username
   - `parameters` (object): Parameter definitions with `type`, `required`, and `description`

2. **Named function** matching `METADATA.name` -- The drawing function itself

### Function Rules

- Accept parameters as positional arguments matching the order in `METADATA.parameters`
- Return an array of stroke objects (use `makeStroke` / `splitIntoStrokes` from helpers)
- No external dependencies -- only import from `../primitives/helpers.mjs`
- Maximum file size: 50KB
- Must not modify global state
- Must terminate in bounded time (no infinite loops)
- Respect limits: max 200 strokes, max 5000 points per stroke

### Available Imports

```js
import {
  clamp, lerp,
  hexToRgb, rgbToHex, lerpColor,
  samplePalette, PALETTES,
  noise2d,
  makeStroke, splitIntoStrokes,
  clipLineToRect,
} from '../primitives/helpers.mjs';
```

## Naming

- Use camelCase for the primitive name: `myAlgorithm`, not `my-algorithm`
- Choose a descriptive name that hints at the visual output
- Avoid names that conflict with built-in primitives (see PRIMITIVES.md)

## Submission

Submit a PR with:
- Your single `.mjs` file in `community/`
- A brief description of the algorithm and what it draws
- At least one example invocation showing the parameters
