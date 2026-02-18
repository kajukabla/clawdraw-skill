# Primitives Reference

75 primitives organized into 10 categories (34 built-in + 41 community). All primitives return an array of stroke objects.

Common optional parameters (available on most primitives unless noted):
- `color` (string): Hex color, default `#ffffff`
- `brushSize` (number): Brush width 3-100
- `opacity` (number): Stroke opacity 0.01-1.0
- `pressureStyle` (string): One of `default`, `flat`, `taper`, `taperBoth`, `pulse`, `heavy`, `flick`

---

## Shapes (6 built-in + 3 community)

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

### hexGrid
Hexagonal honeycomb grid.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Overall radius (default 1000)
- `hexSize` (number): Single hex radius (default 100)

### gear
Mechanical cog wheel with trapezoidal teeth, inner hub, and radial spokes.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `outerRadius` (number): Outer tooth radius, 30-500 (default 170)
- `teeth` (number): Number of teeth, 6-40 (default 16)
- `hubRadius` (number): Inner hub radius, 10-outerRadius*0.6 (default 60)
- `toothDepth` (number): Tooth depth ratio, 0.1-0.5 (default 0.25)
- `palette` (string): Color palette name

### schotter
Georg Nees Schotter — grid of squares with increasing random disorder.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Grid width, 50-800 (default 280)
- `height` (number): Grid height, 50-800 (default 280)
- `cols` (number): Number of columns, 2-30 (default 12)
- `rows` (number): Number of rows, 2-30 (default 12)
- `decay` (number): Disorder increase rate, 0.1-3 (default 1.0)
- `palette` (string): Color palette name

---

## Organic (7 built-in + 5 community)

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

### vineGrowth
Recursive branching vine tendrils with curl noise and leaf loops at tips.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Growth radius, 20-500 (default 150)
- `branches` (number): Root branch count, 2-16 (default 8)
- `maxDepth` (number): Max recursion depth, 1-8 (default 5)
- `palette` (string): Color palette name

### phyllotaxisSpiral
Sunflower-inspired golden angle spiral pattern.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Outer radius, 10-500 (default 150)
- `numPoints` (number): Number of seed points, 10-500 (default 200)
- `dotSize` (number): Dot scale relative to spacing, 0.1-1.0 (default 0.4)
- `palette` (string): Color palette name

### lichenGrowth
Cyclic cellular automaton rendered as colored cell blocks.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 300)
- `height` (number): Pattern height, 50-800 (default 300)
- `states` (number): Number of cell states, 3-16 (default 6)
- `iterations` (number): Simulation iterations, 1-100 (default 30)
- `palette` (string): Color palette name

### slimeMold
Physarum slime mold agent simulation with trail visualization.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Field width, 50-600 (default 300)
- `height` (number): Field height, 50-600 (default 300)
- `agents` (number): Number of agents, 10-500 (default 100)
- `steps` (number): Simulation steps, 10-200 (default 60)
- `sensorDist` (number): Sensor distance, 1-30 (default 9)
- `sensorAngle` (number): Sensor angle in radians, 0.1-1.5 (default 0.5)
- `turnSpeed` (number): Turn speed in radians, 0.05-1.0 (default 0.3)
- `decayRate` (number): Trail decay rate, 0.5-0.99 (default 0.9)
- `palette` (string): Color palette name

### dla
Diffusion-Limited Aggregation fractal growth pattern.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Growth radius, 20-400 (default 140)
- `particles` (number): Max branches, 10-500 (default 100)
- `stickiness` (number): Branch wiggle, 0-1 (default 0.8)
- `palette` (string): Color palette name

---

## Fractals (10 community)

### mandelbrot
Mandelbrot set escape-time fractal with contour lines.
- `cx` (number, required): Center X on canvas
- `cy` (number, required): Center Y on canvas
- `width` (number): Pattern width, 50-800 (default 300)
- `height` (number): Pattern height, 50-800 (default 300)
- `maxIter` (number): Max iterations, 10-200 (default 40)
- `zoom` (number): Zoom level, 0.1-100 (default 1)
- `centerReal` (number): Real center in complex plane (default -0.5)
- `centerImag` (number): Imaginary center (default 0)
- `contours` (number): Number of contour levels, 2-20 (default 8)
- `palette` (string): Color palette name

### juliaSet
Julia set escape-time fractal with marching-squares contour lines.
- `cx` (number, required): Center X on canvas
- `cy` (number, required): Center Y on canvas
- `width` (number): Pattern width, 50-800 (default 300)
- `height` (number): Pattern height, 50-800 (default 300)
- `cReal` (number): Real part of c constant (default -0.7)
- `cImag` (number): Imaginary part of c constant (default 0.27015)
- `maxIter` (number): Max iterations, 10-200 (default 50)
- `contours` (number): Number of contour levels, 2-20 (default 10)
- `palette` (string): Color palette name

### apollonianGasket
Recursive circle packing using Descartes circle theorem.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Outer circle radius, 10-500 (default 150)
- `maxDepth` (number): Recursion depth, 1-6 (default 4)
- `minRadius` (number): Minimum circle radius to draw, 1-50 (default 3)
- `palette` (string): Color palette name

### dragonCurve
Heighway dragon fractal curve via L-system iterative fold sequence.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Fit size, 50-800 (default 300)
- `iterations` (number): Fold iterations, 1-16 (default 12)
- `palette` (string): Color palette name

### kochSnowflake
Koch snowflake fractal via recursive edge subdivision.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Circumscribed radius, 20-500 (default 150)
- `depth` (number): Recursion depth, 1-6 (default 4)
- `palette` (string): Color palette name

### sierpinskiTriangle
Recursive Sierpinski triangle fractal.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Distance from center to vertex, 10-500 (default 120)
- `depth` (number): Recursion depth, 1-5 (default 4)
- `palette` (string): Color palette name

### kaleidoscopicIfs
Chaos game iterated function system with kaleidoscopic symmetry.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Fit radius, 20-500 (default 150)
- `symmetry` (number): Fold symmetry order, 2-24 (default 6)
- `transforms` (number): Number of IFS transforms, 2-8 (default 3)
- `iterations` (number): Chaos game iterations, 100-50000 (default 8000)
- `numStrokes` (number): Stroke segments, 1-200 (default 80)
- `palette` (string): Color palette name

### penroseTiling
Penrose P3 tiling via Robinson triangle subdivision with golden ratio.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Outer radius of initial decagon, 10-500 (default 170)
- `depth` (number): Subdivision depth, 1-6 (default 4)
- `palette` (string): Color palette name

### hyperbolicTiling
Poincare disk model hyperbolic tiling using Mobius transformations.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Poincare disk radius, 10-500 (default 170)
- `p` (number): Polygon sides, 3-8 (default 5)
- `q` (number): Polygons meeting at each vertex, 3-8 (default 4)
- `maxDepth` (number): Recursion depth, 1-4 (default 3)
- `palette` (string): Color palette name

### viridisVortex
A recursive fractal spiral with noise warp and pure viridis gradient.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Size of the vortex, 500-10000 (default 2000)
- `arms` (number): Number of spiral arms, 3-20 (default 7)
- `turns` (number): Number of turns per arm, 1-10 (default 4)
- `warp` (number): Amount of noise warp (default 100)
- `palette` (string): Color palette (default viridis)

---

## Flow (5 built-in + 5 community)

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

### cliffordAttractor
Clifford strange attractor with sinusoidal dynamics.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Fit radius, 20-500 (default 150)
- `a` (number): Parameter a (default -1.4)
- `b` (number): Parameter b (default 1.6)
- `c` (number): Parameter c (default 1.0)
- `d` (number): Parameter d (default 0.7)
- `numPoints` (number): Iteration count, 100-50000 (default 8000)
- `numStrokes` (number): Stroke segments, 1-200 (default 80)
- `palette` (string): Color palette name

### hopalongAttractor
Martin hopalong map producing intricate orbital scatter patterns.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Fit radius, 20-500 (default 150)
- `a` (number): Parameter a (default 1.1)
- `b` (number): Parameter b (default 2.0)
- `c` (number): Parameter c (default 0.5)
- `numPoints` (number): Iteration count, 100-50000 (default 5000)
- `numStrokes` (number): Stroke segments, 1-200 (default 80)
- `palette` (string): Color palette name

### doublePendulum
Chaotic double pendulum trajectories via RK4 Lagrangian integration.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Fit radius, 20-500 (default 150)
- `angle1` (number): Initial angle 1 in degrees (default 120)
- `angle2` (number): Initial angle 2 in degrees (default 150)
- `steps` (number): Simulation steps, 100-5000 (default 1500)
- `traces` (number): Number of pendulum traces, 1-40 (default 5)
- `palette` (string): Color palette name

### orbitalDynamics
Gravitational orbit trails around attractor points.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): System radius, 20-500 (default 150)
- `numBodies` (number): Number of orbiting bodies, 2-30 (default 8)
- `attractors` (number): Number of gravity attractors, 1-5 (default 2)
- `steps` (number): Simulation steps per body, 50-2000 (default 300)
- `gravity` (number): Gravitational strength, 50-5000 (default 500)
- `palette` (string): Color palette name

### gielisSuperformula
Layered Gielis superformula curves (supershapes) with parametric variation.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Outer radius, 10-500 (default 120)
- `m` (number): Rotational symmetry order (default 5)
- `n1` (number): Exponent n1 (default 0.3)
- `n2` (number): Exponent n2 (default 0.3)
- `n3` (number): Exponent n3 (default 0.3)
- `a` (number): Parameter a (default 1)
- `b` (number): Parameter b (default 1)
- `layers` (number): Number of concentric layers, 1-30 (default 8)
- `pointsPerLayer` (number): Points per layer, 50-500 (default 200)
- `palette` (string): Color palette name

---

## Noise (9 community)

### voronoiNoise
Organic Voronoi cell noise pattern with hand-drawn edges.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 300)
- `height` (number): Pattern height, 50-800 (default 300)
- `numCells` (number): Number of seed points, 5-80 (default 25)
- `wobble` (number): Hand-drawn wobble amount, 0-1 (default 0.3)
- `palette` (string): Color palette name

### voronoiCrackle
Voronoi cell edge pattern using F2-F1 distance field with marching squares contours.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `numCells` (number): Number of seed points, 3-80 (default 25)
- `contours` (number): Number of contour levels, 1-10 (default 4)
- `palette` (string): Color palette name

### voronoiGrid
Voronoi-style cellular grid generated by edge scanning.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Width, 100-5000 (default 1000)
- `height` (number): Height, 100-5000 (default 1000)
- `cells` (number): Number of cells, 5-100 (default 20)
- `palette` (string): Color palette (default magma)

### worleyNoise
Worley (cellular) noise with F1/F2 distance field contour extraction.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `numCells` (number): Number of Worley seed points, 3-50 (default 15)
- `mode` (string): Distance mode: `F1`, `F2`, or `F2minusF1` (default `F2minusF1`)
- `contours` (number): Number of contour levels, 2-12 (default 5)
- `palette` (string): Color palette name

### domainWarping
Inigo Quilez nested noise domain warping with organic contour extraction.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `scale` (number): Noise scale, 0.001-0.05 (default 0.008)
- `warpStrength` (number): Warp displacement strength, 10-200 (default 80)
- `warpOctaves` (number): Number of warp octaves, 1-4 (default 2)
- `contours` (number): Number of contour levels, 2-12 (default 5)
- `palette` (string): Color palette name

### turingPatterns
Multi-octave noise turbulence with sin() modulation for organic stripe and spot contours.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `scale` (number): Noise scale, 0.005-0.2 (default 0.03)
- `complexity` (number): Sin modulation complexity, 1-8 (default 3)
- `contours` (number): Number of contour levels, 2-12 (default 5)
- `palette` (string): Color palette name

### reactionDiffusion
Turing-inspired reaction-diffusion contour patterns (spots, stripes, labyrinths).
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 300)
- `height` (number): Pattern height, 50-800 (default 300)
- `scale` (number): Noise scale — smaller = larger blobs, 0.005-0.2 (default 0.04)
- `contours` (number): Number of contour levels, 2-12 (default 5)
- `palette` (string): Color palette name

### grayScott
Gray-Scott PDE reaction-diffusion simulation with contour extraction.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `feed` (number): Feed rate, 0.01-0.1 (default 0.037)
- `kill` (number): Kill rate, 0.01-0.1 (default 0.06)
- `iterations` (number): Simulation iterations, 50-500 (default 150)
- `contours` (number): Number of contour levels, 2-12 (default 5)
- `palette` (string): Color palette name

### metaballs
Metaball implicit surface field with smooth blobby contour extraction.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 350)
- `height` (number): Pattern height, 50-800 (default 350)
- `numBalls` (number): Number of metaballs, 2-12 (default 5)
- `threshold` (number): Iso-surface threshold, 0.1-5 (default 1.0)
- `contours` (number): Number of contour levels, 2-12 (default 4)
- `palette` (string): Color palette name

---

## Simulation (3 community)

### gameOfLife
Conway's Game of Life cellular automaton with R-pentomino seed.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Grid width in pixels, 50-800 (default 300)
- `height` (number): Grid height in pixels, 50-800 (default 300)
- `generations` (number): Simulation generations, 10-500 (default 200)
- `cellSize` (number): Cell size in pixels, 2-20 (default 5)
- `palette` (string): Color palette name

### langtonsAnt
Langton's Ant cellular automaton with emergent highway patterns.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 280)
- `height` (number): Pattern height, 50-800 (default 280)
- `steps` (number): Simulation steps, 100-50000 (default 11000)
- `cellSize` (number): Cell size in pixels, 2-20 (default 4)
- `palette` (string): Color palette name

### waveFunctionCollapse
Simplified wave function collapse with pipe/maze tileset.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Pattern width, 50-800 (default 280)
- `height` (number): Pattern height, 50-800 (default 280)
- `tileSize` (number): Tile size, 10-60 (default 25)
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

## Decorative (5 built-in + 3 community)

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

### starburst
Radial sunburst with alternating triangular rays colored by angle.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `outerRadius` (number): Outer ray radius, 30-500 (default 185)
- `rays` (number): Number of rays, 8-60 (default 24)
- `innerRadius` (number): Inner circle radius, 5-outerRadius*0.5 (default 30)
- `shortRatio` (number): Short ray length ratio, 0.3-0.9 (default 0.6)
- `palette` (string): Color palette name

### clockworkNebula
A cosmic scene with starfield, spirograph gears, and nebula dust.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Overall size, 500-10000 (default 3000)
- `stars` (number): Number of stars, 100-5000 (default 1000)
- `gears` (number): Number of spirograph gears, 1-50 (default 15)
- `dust` (number): Amount of nebula dust, 10-200 (default 50)
- `palette` (string): Color palette (default turbo)

### matrixRain
Digital rain effect with glitch offsets.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `width` (number): Field width, 100-5000 (default 1000)
- `height` (number): Field height, 100-5000 (default 1000)
- `density` (number): Number of drops, 10-500 (default 50)
- `color` (string): Color (default #00ff00)
- `glitch` (number): Glitch probability, 0-1 (default 0.1)

---

## 3D (3 community)

### cube3d
Wireframe 3D cube with rotation and depth shading.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Cube half-size, 10-500 (default 120)
- `rotateX` (number): X rotation in degrees (default 25)
- `rotateY` (number): Y rotation in degrees (default 35)
- `rotateZ` (number): Z rotation in degrees (default 0)
- `subdivisions` (number): Edge subdivisions for wireframe detail, 0-5 (default 0)
- `palette` (string): Color palette name

### sphere3d
Wireframe 3D sphere with latitude and longitude lines.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `radius` (number): Sphere radius, 10-500 (default 120)
- `latLines` (number): Latitude lines, 2-20 (default 8)
- `lonLines` (number): Longitude lines, 3-24 (default 12)
- `rotateX` (number): X rotation in degrees, -90 to 90 (default 20)
- `rotateY` (number): Y rotation in degrees, -180 to 180 (default 30)
- `palette` (string): Color palette name

### hypercube
4D tesseract wireframe projected to 2D with rotation.
- `cx` (number, required): Center X
- `cy` (number, required): Center Y
- `size` (number): Projection scale, 20-500 (default 150)
- `angleXW` (number): Rotation angle in XW plane in degrees (default 45)
- `angleYZ` (number): Rotation angle in YZ plane in degrees (default 30)
- `palette` (string): Color palette name

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
