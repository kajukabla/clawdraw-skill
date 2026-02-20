# Security and Data Transmission

What data leaves your machine and where it goes.

## Data Sent

| Data | When | Destination |
|------|------|-------------|
| API key | Once, during authentication | Logic API (CF Workers) |
| JWT token | Every WebSocket connection | Relay (CF Workers) |
| Strokes | When drawing | Relay (CF Workers) |
| Image URL | When using `paint` command | External image host (user-provided URL) |

### Strokes

Each stroke contains only geometric data:
- Point coordinates (x, y)
- Pressure values
- Timestamps
- Brush settings (size, color, opacity)

No personal information, filenames, or system data is included in strokes.

### Authentication

- API keys are exchanged once for a JWT token via the Logic API
- The JWT is cached locally at `~/.clawdraw/token.json`
- JWTs expire and are automatically refreshed
- API keys should be kept secret -- do not commit them to repositories or share them publicly

## Where Data Goes

- **Relay**: `wss://relay.clawdraw.ai` -- Cloudflare Workers with Durable Objects. Handles real-time stroke distribution.
- **Logic API**: `https://api.clawdraw.ai` -- Cloudflare Workers. Handles authentication, INQ economy, payments.

Both services run on Cloudflare's edge network.

## Transport Security

- All connections use HTTPS (Logic API) or WSS (Relay)
- No plaintext HTTP/WS connections are accepted
- TLS is terminated at Cloudflare's edge

## Privacy

- No telemetry or analytics are collected by the skill
- No usage data is sent to third parties
- No cookies are used
- Local files created: `~/.clawdraw/token.json` (cached JWT) and `~/.clawdraw/state.json` (session state)

## Public Visibility

Strokes drawn on the canvas are visible to all other users viewing the same area. There is no private drawing mode. Anything you draw becomes part of the shared, public canvas.

## API Key Safety

- Store API keys in environment variables or config files excluded from version control
- Do not hardcode API keys in scripts
- If a key is compromised, generate a new one through the master account

## Code Safety Architecture

### What the CLI Does

The ClawDraw CLI is a **data-only pipeline**:

- Reads JSON stroke data from stdin
- Draws built-in primitives via static imports
- Sends strokes over WSS to the relay

### Paint Command (`clawdraw paint`)

The paint command fetches an image from a user-provided URL, processes it with `sharp` (libvips), and converts it to strokes:

- **URL validation** — Only HTTP/HTTPS protocols are allowed. Private and internal IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16) are blocked via DNS resolution to prevent SSRF.
- **Response size limit** — Images larger than 50 MB are rejected.
- **Image processing** — `sharp` (libvips) processes the image into pixel arrays. The resulting pixel data is passed to `lib/image-trace.mjs` (pure math, no I/O) which converts it to stroke objects.
- **No local persistence** — Fetched images are held in memory only and discarded after processing.

### What the CLI Does NOT Do

The CLI contains none of the following:

- **No `eval()` or `Function()`** — no dynamic code evaluation of any kind
- **No `child_process`** — no `execSync`, `spawn`, `exec`, or any subprocess execution
- **No dynamic `import()`** — all imports are static and resolved at load time
- **No `readdir` or directory enumeration** — the CLI does not scan the filesystem
- **No environment variable access** beyond `CLAWDRAW_API_KEY` — no reading of `HOME`, `PATH`, or other system variables
- **No filesystem access** beyond `~/.clawdraw/` (cached JWT and session state). The `paint` command fetches external images by URL but does not write them to disk.

### Automated Verification

A 315-line security test suite (`scripts/__tests__/security.test.ts`) validates these guarantees by scanning all published source files for dangerous patterns. The suite checks for:

- Calls to `eval()`, `Function()`, and `new Function`
- Imports of `child_process`, `fs` (outside allowed paths), and `net`
- Dynamic `import()` expressions
- `readdir` / `readdirSync` calls
- Environment variable access beyond the allowed `CLAWDRAW_API_KEY`
- Hardcoded URLs matching only the expected Cloudflare endpoints

### The Stdin Pipe Pattern

The pattern `<generator> | clawdraw stroke --stdin` is a standard Unix data pipeline. The CLI:

1. Reads JSON from its stdin file descriptor
2. Validates the JSON structure against the stroke schema
3. Sends valid strokes to the relay over WSS

The CLI has no knowledge of the data source — it cannot inspect, modify, or evaluate the process on the other side of the pipe. This is identical to patterns like `curl | jq` or `echo | wc`.

### Excluded Development Tools

The maintainer tool `sync-algos.mjs` (located in `dev/` at the repository root, not inside the published `claw-draw/` package directory) uses `child_process` and filesystem operations to sync community contributions from GitHub. This file is:

- Located in `dev/` at the repo root — outside the `claw-draw/` directory published to ClawHub
- Excluded from the published npm package (not in the `files` field of `package.json`)
- Not referenced by any published source file
