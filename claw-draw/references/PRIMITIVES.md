# Built-in Primitives Reference

34 built-in primitives organized into 6 categories. All primitives return an array of stroke objects.

Common optional parameters (available on most primitives unless noted):
- `color` (string): Hex color, default `#ffffff`
- `brushSize` (number): Brush width 3-100
- `opacity` (number): Stroke opacity 0.01-1.0
- `pressureStyle` (string): One of `default`, `flat`, `taper`, `taperBoth`, `pulse`, `heavy`, `flick`

---

## Basic Shapes (6)

### circle
Smooth circle with slight organic wobble.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number, required): Radius, 1-500

### ellipse
Rotated oval.
- `cx`, `cy` (number, required): Center
- `radiusX` (number, required): Horizontal radius, 1-500
- `radiusY` (number, required): Vertical radius, 1-500
- `rotation` (number): Rotation in degrees

### arc
Partial circle arc.
- `cx`, `cy` (number, required): Center
- `radius` (number, required): Radius, 1-500
- `startAngle` (number, required): Start angle in degrees
- `endAngle` (number, required): End angle in degrees

### rectangle
Rectangle outline.
- `cx`, `cy` (number, required): Center
- `width` (number, required): Width, 2-1000
- `height` (number, required): Height, 2-1000
- `rotation` (number): Rotation in degrees

### polygon
Regular N-sided polygon.
- `cx`, `cy` (number, required): Center
- `radius` (number, required): Radius, 1-500
- `sides` (number, required): Number of sides, 3-24
- `rotation` (number): Rotation in degrees

### star
N-pointed star.
- `cx`, `cy` (number, required): Center
- `outerR` (number, required): Outer radius, 5-500
- `innerR` (number, required): Inner radius, 2 to outerR-1
- `points` (number, required): Number of points, 3-20
- `rotation` (number): Rotation in degrees (default -90)

---

## Organic (7)

### lSystem
L-System branching structures.
- `cx`, `cy` (number, required): Base position
- `preset` (string, required): One of `fern`, `tree`, `bush`, `coral`, `seaweed`
- `iterations` (number): Iteration count (max varies by preset, 1-5)
- `scale` (number): Size multiplier, 0.1-5
- `rotation` (number): Starting rotation in degrees
- `palette` (string): Color palette name (`magma`, `plasma`, `viridis`, `turbo`, `inferno`)

### flower
Multi-petal flower with filled center spiral.
- `cx`, `cy` (number, required): Center
- `petals` (number): Number of petals, 3-20 (default 8)
- `petalLength` (number): Length, 10-300 (default 60)
- `petalWidth` (number): Width, 5-150 (default 25)
- `centerRadius` (number): Center size, 5-100 (default 20)
- `petalColor` (string): Petal hex color
- `centerColor` (string): Center hex color

### leaf
Single leaf with midrib and veins.
- `cx`, `cy` (number, required): Base position
- `length` (number): Leaf length, 10-300 (default 80)
- `width` (number): Leaf width, 5-150 (default 30)
- `rotation` (number): Rotation in degrees
- `veinCount` (number): Number of veins, 0-12 (default 4)

### vine
Curving vine with small leaves along a bezier path.
- `startX`, `startY` (number, required): Start position
- `endX`, `endY` (number, required): End position
- `curveAmount` (number): Curve intensity, 0-300 (default 50)
- `leafCount` (number): Number of leaves, 0-20 (default 5)

### spaceColonization
Space colonization algorithm producing root/vein/lightning patterns.
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 20-600 (default 200)
- `height` (number): Area height, 20-600 (default 200)
- `density` (number): Attractor density, 0.1-1 (default 0.5)
- `stepLength` (number): Growth step length, 2-30 (default 8)
- `palette` (string): Color palette name

### mycelium
Organic branching mycelium network.
- `cx`, `cy` (number, required): Center
- `radius` (number): Spread radius, 20-500 (default 150)
- `density` (number): Branch density, 0.1-1 (default 0.5)
- `branchiness` (number): Branch probability, 0.1-1.0 (default 0.5)
- `palette` (string): Color palette name

### barnsleyFern
Barnsley Fern IFS fractal.
- `cx`, `cy` (number, required): Center
- `scale` (number): Size scale, 3-100 (default 20)
- `iterations` (number): Point count, 500-8000 (default 2000)
- `lean` (number): Lean angle in degrees, -30 to 30
- `curl` (number): Curl factor, 0.5-1.5 (default 1.0)
- `palette` (string): Color palette name

---

## Flow / Abstract (5)

### flowField
Perlin noise flow field with particle traces.
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 20-600 (default 200)
- `height` (number): Area height, 20-600 (default 200)
- `noiseScale` (number): Noise frequency, 0.001-0.1 (default 0.01)
- `density` (number): Particle density, 0.1-1 (default 0.5)
- `segmentLength` (number): Step size, 1-30 (default 5)
- `traceLength` (number): Steps per trace, 5-200 (default 40)
- `palette` (string): Color palette name

### spiral
Archimedean spiral.
- `cx`, `cy` (number, required): Center
- `turns` (number): Number of turns, 0.5-20 (default 3)
- `startRadius` (number): Inner radius, 0-500 (default 5)
- `endRadius` (number): Outer radius, 1-500 (default 100)

### lissajous
Lissajous harmonic curves.
- `cx`, `cy` (number, required): Center
- `freqX` (number): X frequency, 1-20 (default 3)
- `freqY` (number): Y frequency, 1-20 (default 2)
- `phase` (number): Phase offset in degrees (default 0)
- `amplitude` (number): Size, 10-500 (default 80)
- `palette` (string): Color palette name

### strangeAttractor
Strange attractor chaotic orbits.
- `cx`, `cy` (number, required): Center
- `type` (string): One of `lorenz`, `aizawa`, `thomas` (default `lorenz`)
- `iterations` (number): Point count, 100-5000 (default 2000)
- `scale` (number): Display scale, 0.1-50 (default 5)
- `timeStep` (number): Integration step, 0.001-0.02 (default 0.005)
- `palette` (string): Color palette name

### spirograph
Spirograph (epitrochoid) geometric curves.
- `cx`, `cy` (number, required): Center
- `outerR` (number): Outer ring radius, 10-500 (default 100)
- `innerR` (number): Inner ring radius, 5-400 (default 40)
- `traceR` (number): Trace point distance, 1-400 (default 30)
- `revolutions` (number): Number of revolutions, 1-50 (default 10)
- `startAngle` (number): Starting angle in degrees
- `palette` (string): Color palette name

---

## Fills (6)

### hatchFill
Parallel line shading (hatching).
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-600 (default 100)
- `height` (number): Area height, 10-600 (default 100)
- `angle` (number): Line angle in degrees (default 45)
- `spacing` (number): Line spacing, 2-50 (default 8)
- `colorEnd` (string): End color for gradient hatching

### crossHatch
Two-angle crosshatch shading (45 and -45 degrees).
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-600
- `height` (number): Area height, 10-600
- `spacing` (number): Line spacing, 2-50

### stipple
Random dot pattern fill.
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-600 (default 100)
- `height` (number): Area height, 10-600 (default 100)
- `density` (number): Dot density, 0.1-1 (default 0.5)
- `dotCount` (number): Exact dot count, 10-500

### gradientFill
Color gradient via parallel strokes with interpolated colors.
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-600 (default 200)
- `height` (number): Area height, 10-600 (default 200)
- `colorStart` (string): Start color
- `colorEnd` (string): End color
- `angle` (number): Gradient angle in degrees
- `density` (number): Line density, 0.1-1 (default 0.5)

### colorWash
Seamless color wash fill using overlapping horizontal and vertical strokes.
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-800 (default 200)
- `height` (number): Area height, 10-800 (default 200)
- `opacity` (number): Max opacity, 0.01-0.6 (default 0.35)

### solidFill
Solid color fill (alias for colorWash).
- `cx`, `cy` (number, required): Center
- `width` (number): Area width, 10-800
- `height` (number): Area height, 10-800
- `direction` (string): Unused, reserved

---

## Decorative (5)

### border
Decorative border frame.
- `cx`, `cy` (number, required): Center
- `width` (number): Frame width, 20-800 (default 200)
- `height` (number): Frame height, 20-800 (default 200)
- `pattern` (string): One of `dots`, `dashes`, `waves`, `zigzag` (default `dashes`)
- `amplitude` (number): Wave/zigzag amplitude, 2-30 (default 8)

### mandala
Radially symmetric mandala pattern with wobble motifs.
- `cx`, `cy` (number, required): Center
- `radius` (number): Overall radius, 10-500 (default 100)
- `symmetry` (number): Rotational folds, 3-24 (default 8)
- `complexity` (number): Number of concentric rings, 1-8 (default 3)
- `colors` (array): Array of hex color strings
- `wobbleAmount` (number): Motif wobble intensity, 0-0.5 (default 0.15)

### fractalTree
Recursive branching tree.
- `cx`, `cy` (number, required): Base position (trunk base)
- `trunkLength` (number): Trunk length, 10-300 (default 80)
- `branchAngle` (number): Branch spread in degrees, 5-60 (default 25)
- `depth` (number): Recursion depth, 1-8 (default 5)
- `branchRatio` (number): Length ratio per level, 0.4-0.9 (default 0.7)
- `palette` (string): Color palette name

### radialSymmetry
Complex mandala-like patterns with bezier motifs.
- `cx`, `cy` (number, required): Center
- `radius` (number): Overall radius, 10-500 (default 120)
- `folds` (number): Rotational folds, 3-24 (default 8)
- `layers` (number): Concentric layers, 1-8 (default 4)
- `complexity` (number): Motif complexity, 1-5 (default 3)
- `colors` (array): Array of hex color strings

### sacredGeometry
Sacred geometry patterns.
- `cx`, `cy` (number, required): Center
- `radius` (number): Overall radius, 10-500 (default 120)
- `pattern` (string): One of `flowerOfLife`, `goldenSpiral`, `metatronsCube`, `sriYantra`

---

## Utility (5)

### bezierCurve
Smooth Catmull-Rom spline through control points.
- `points` (array, required): Array of `{x, y}` control points (max 20)

### dashedLine
Dashed line segment.
- `startX`, `startY` (number, required): Start position
- `endX`, `endY` (number, required): End position
- `dashLength` (number): Dash length, 2-50 (default 10)
- `gapLength` (number): Gap length, 1-50 (default 5)

### arrow
Line with arrowhead.
- `startX`, `startY` (number, required): Start position
- `endX`, `endY` (number, required): End position (arrowhead location)
- `headSize` (number): Arrowhead size, 3-60 (default 15)

### strokeText
Draw text as single-stroke letterforms. Supports A-Z, 0-9, and basic punctuation.
- `cx`, `cy` (number, required): Center of text
- `text` (string, required): Text to draw (max 40 chars, converted to uppercase)
- `charHeight` (number): Character height, 5-200 (default 30)
- `rotation` (number): Text rotation in degrees

### alienGlyphs
Procedural cryptic alien/AI glyphs.
- `cx`, `cy` (number, required): Center
- `count` (number): Number of glyphs, 1-20 (default 8)
- `glyphSize` (number): Glyph size, 5-100 (default 25)
- `arrangement` (string): One of `line`, `grid`, `scatter`, `circle` (default `line`)
