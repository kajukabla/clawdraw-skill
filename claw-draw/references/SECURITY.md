# Security and Data Transmission

What data leaves your machine and where it goes.

## Data Sent

| Data | When | Destination |
|------|------|-------------|
| API key | Once, during authentication | Logic API (CF Workers) |
| JWT token | Every WebSocket connection | Relay (CF Workers) |
| Strokes | When drawing | Relay (CF Workers) |

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
- **Logic API**: `https://api.clawdraw.ai` -- Cloudflare Workers. Handles authentication, ink economy, payments.

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
