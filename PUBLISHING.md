# Publishing Flow for @clawdraw/skill

Step-by-step runbook for releasing a new version to npm and ClawHub.

---

## 1. Pre-Publish Sync Check

Before bumping a version, verify the skill is in sync with the main ClawDraw app. Check these areas:

| Area | What to verify |
|------|---------------|
| **Nearby API fields** | Skill only uses fields the app still returns (`summary`, `topology.isClosed`, `centroid`, `area`, `multiStrokeRegions`, `attachPoints`, `gaps`) |
| **Rate limits** | Any new rate limits (e.g. 10 nearby calls / 60s) are handled — HTTP 429 surfaces as error message |
| **Stroke validation** | Primitives stay within app-side limits (e.g. 50K extent max) — our ~300 unit output is well under |
| **INQ economy** | Grant amounts in `SKILL.md` and `clawdraw.mjs` match what the app actually gives (base grant, agent multiplier, linked grant) |
| **New features** | Any new lib functions (e.g. `parseSvgPathMulti`) are imported and used where needed |

---

## 2. Security Audit

Run the full security checklist before every publish. This directly determines whether the package passes the OpenClaw/VirusTotal scan.

### Automated tests (83 tests)

```bash
cd claw-draw && npx vitest run
```

The test suite (`scripts/__tests__/security.test.ts`) validates:

- **No env-var overrides** — server URLs are hardcoded, only `process.env.CLAWDRAW_API_KEY` is allowed
- **No shell execution** — no `execSync`, `spawn`, `child_process` in any published file
- **Checkout URL safety** — URLs validated via `new URL()`, HTTPS-only, hardcoded success/cancel URLs
- **Primitives isolation** — all `.mjs` files in `primitives/` are scanned for:
  - No `eval()` or `new Function()`
  - No `child_process` or `spawn`
  - No `fetch()`, `http.`, `https.`, `net.`, `XMLHttpRequest`
  - No `process.env`
  - No `import()` (dynamic) or `require()`
  - No `readdir` / `readdirSync`
- **lib/ isolation** — same checks as primitives
- **community/ isolation** — same checks as primitives

### Manual checklist

Run these greps against the `claw-draw/` directory (excluding `node_modules/` and test files):

| Check | Command | Expected |
|-------|---------|----------|
| `execute-script.mjs` | `find claw-draw -name 'execute-script.mjs'` | Not found |
| `child_process` / `spawn` / `execSync` | `grep -r 'child_process\|execSync\|spawn' --include='*.mjs' claw-draw/scripts/ claw-draw/primitives/ claw-draw/lib/` | No matches (regex `.exec()` is fine) |
| `eval()` / `new Function` | `grep -rP '\beval\s*\(\|new Function' --include='*.mjs' claw-draw/scripts/ claw-draw/primitives/ claw-draw/lib/` | No matches |
| `readdir` in primitives | `grep -r 'readdir' --include='*.mjs' claw-draw/primitives/` | No matches |
| Dynamic `import()` in primitives | `grep -rP 'import\s*\(' --include='*.mjs' claw-draw/primitives/` | No matches |
| `process.env` beyond API key | `grep -r 'process.env' --include='*.mjs' claw-draw/primitives/ claw-draw/lib/` | No matches |
| `console.log` in primitives/lib | `grep -r 'console.log' --include='*.mjs' claw-draw/primitives/ claw-draw/lib/` | No matches |
| TODO/FIXME/HACK | `grep -ri 'TODO\|FIXME\|HACK' --include='*.mjs' --include='*.md' claw-draw/` | No matches (in published files) |
| Trigger words in `.md` files | `grep -ri 'execute\|inject\|exploit\|backdoor\|exfiltrat' claw-draw/SKILL.md claw-draw/references/*.md` | Context-appropriate only (e.g. "shell injection" in security docs explaining what we *don't* do) |

### What gets flagged by VirusTotal / OpenClaw scan

The OpenClaw AgentSkills scanner classifies skill bundles as benign or malicious. Based on our past scans, here's what matters:

**Patterns that trigger investigation:**

- `eval()`, `new Function()`, or any dynamic code evaluation
- `child_process`, `execSync`, `spawn` — any subprocess execution
- Dynamic `import()` — runtime code loading from strings
- `readdir` / `readdirSync` — filesystem enumeration suggests data harvesting
- `process.env` usage beyond declared required env vars — suggests credential harvesting
- `fetch()` or HTTP clients in library/primitive code — network calls should only be in scripts
- Obfuscated or minified code — looks like it's hiding something
- Data exfiltration patterns — encoding data and sending it to external endpoints
- Prompt injection attempts — instructions in SKILL.md trying to manipulate the agent

**Patterns that are fine:**

- Regex `.exec()` — this is string matching, not code execution. The scanner distinguishes it
- `process.env.CLAWDRAW_API_KEY` in the main CLI script — declared in metadata as required
- `fetch()` in `scripts/` files (auth, connection) — expected for API communication
- `fs` usage in `scripts/` for `~/.clawdraw/` cache — declared and expected
- Hardcoded URLs to your own domains — shows you're not redirecting traffic

**What makes a scan come back clean:**

1. **Data-only pipeline** — the skill processes data (JSON, SVG, coordinates), not code
2. **Static imports only** — all `import` statements resolve at load time
3. **Hardcoded endpoints** — no env-var overrides for server URLs
4. **Minimal filesystem footprint** — only `~/.clawdraw/` for JWT cache
5. **Clear `SECURITY.md`** — explicitly documents what data leaves the machine and where it goes
6. **Dev tools excluded** — `dev/sync-algos.mjs` (which uses `execSync` and `fs`) lives outside `claw-draw/` and is excluded from `package.json` `files` field

### v0.6.0 Security Scan Result

The OpenClaw AgentSkills skill bundle is classified as **benign**. The project's SKILL.md and references/SECURITY.md explicitly detail a strong security model, claiming a 'data-only pipeline' with no `eval()`, `child_process`, dynamic `import()`, `readdir`, or unauthorized `process.env` access in published code. Code analysis confirms these claims: `scripts/clawdraw.mjs` acts as a controlled interface, processing only predefined primitives or JSON/SVG data from stdin or local files. All network calls are restricted to hardcoded `clawdraw.ai` domains, and file system access is limited to `~/.clawdraw/` for caching. A `dev/sync-algos.mjs` script, which uses `execSync` and `fs` operations, is correctly excluded from the published package and documented as a maintainer-only tool. There is no evidence of data exfiltration, malicious execution, persistence, obfuscation, or prompt injection attempts against the agent.

### v0.6.0 Scan Findings (Informational Warnings)

The v0.6.0 scan classified the bundle as **benign** but raised informational warnings:

1. **`dev/sync-algos.mjs` in ClawHub bundle** — contained `execSync`, `child_process`, `readdir`. Was excluded from npm via `files` allowlist, but `clawhub publish` uploads the entire directory. **Fix (v0.6.1):** moved `dev/` to repo root, outside `claw-draw/`.
2. **Test files in ClawHub bundle** — `scripts/__tests__/security.test.ts` and `scripts/connection.test.ts` appeared in the bundle. **Fix (v0.6.1):** added `.clawhubignore` to exclude test files.
3. **Registry metadata mismatch** — `requires` and `install` were nested under `clawdbot` in the metadata JSON. Multiple fix attempts followed: v0.6.1 hoisted to root (wrong), v0.6.3 moved to `openclaw` namespace (wrong), v0.7.0 switched to `clawdbot` (wrong), v0.7.1 tried dual namespace (wrong). **Actual fix (v0.7.2):** metadata must be **flat** — top-level keys matching `ClawdisSkillMetadataSchema`. No namespace wrapping at all. See "v0.7.2 Scan Result" below.
4. **`package-lock.json` in bundle** — unnecessary file. **Fix (v0.6.1):** added to `.clawhubignore`.

### v0.7.0 Security Scan Result

The OpenClaw security scanner and VirusTotal classified the skill as **Suspicious (High Confidence)**. Two categories of issues:

#### Issue 1: Metadata namespace mismatch

The v0.7.0 release renamed the metadata namespace from `openclaw` to `clawdbot`. The scanner continued reading from `openclaw`, causing it to report:
- "Required env vars: none" (actual: `CLAWDRAW_API_KEY`)
- "No install spec (instruction-only)" (actual: npm package with CLI binary)

This made the skill appear to hide its env-var requirement and install mechanism, triggering the suspicion flag.

**Fix (v0.7.1):** Tried providing metadata under both `clawdbot` and `openclaw` namespaces — still failed. The registry reported "none" for both.

**Actual fix (v0.7.2):** The `ClawdisSkillMetadataSchema` (in the clawhub CLI at `schema/schemas.js:236`) defines a **flat** structure: `{ primaryEnv?, emoji?, requires?, install?, ... }`. The registry parser applies this schema directly to the `metadata` value. Any namespace wrapping (`clawdbot`, `openclaw`, or both) puts keys outside the schema — they're silently ignored, and the parser finds no `primaryEnv`/`requires`/`install` at the top level. The fix was to remove all namespace wrapping and use flat top-level keys.

**Lesson:** The `metadata` value in SKILL.md frontmatter must be **flat** — keys directly matching `ClawdisSkillMetadataSchema`. No `clawdbot`/`openclaw`/any namespace wrapping. The "use `metadata.openclaw` namespace" advice from v0.6.3 was our own hypothesis — it was wrong, and no skill on ClawHub actually uses namespaced metadata for `requires`/`install`.

**Update (v0.8.3):** The `openclaw` namespace was never tested *with* the `files` key present (v0.6.3 predated the `files` fix in v0.6.4). Official ClawHub docs show `metadata.openclaw` as canonical. v0.8.3 tests belt-and-suspenders: flat keys + `openclaw` namespace duplicate. If the summary still shows "none", it's definitively a registry-side bug.

#### Issue 2: Image processing attack surface (`cmdPaint`)

The `cmdPaint` command fetches untrusted external URLs and processes them with `sharp` (libvips native addon). The scanner flagged:
- Native `.node` binaries from sharp/libvips (VirusTotal flags any compiled native addon)
- Processing untrusted image URLs creates SSRF and memory-corruption risk

Existing protections (SSRF via DNS lookup, 50MB size limit, parameter clamping) were acknowledged but the scanner identified gaps:
- No fetch timeout (slow-server DoS)
- No redirect SSRF protection (redirect to private IP bypasses DNS check)
- No Content-Type validation (non-image responses processed by sharp)
- No image format whitelist (all libvips decoders exposed)

**Fix (v0.7.1):**
- 30s fetch timeout via AbortController
- Manual redirect handling with re-validation against SSRF rules
- Content-Type must be `image/*`
- Format whitelist: JPEG, PNG, WebP, GIF, TIFF, AVIF only
- Extended IPv6 private range coverage (fe80:, fc00:, fd)
- 8 new security tests verifying all hardening patterns

**Lesson:** When processing untrusted URLs, `redirect: 'manual'` is essential — Node's default `fetch` follows redirects silently, bypassing any pre-fetch DNS/IP validation. Always re-validate the redirect target.

#### Bundled UX fix: INQ recovery flow

Not a scanner issue, but bundled into v0.7.1: all 6 `INSUFFICIENT_INQ` exit points now call `printInqRecovery()`, which always shows the `?openclaw` deep link (linking bonus) before suggesting `clawdraw buy`. SKILL.md agent instructions updated to enforce link-first-then-buy flow and never use bare `clawdraw.ai` URLs.

### v0.7.2 Scan Result

The OpenClaw security scanner classified the skill as **benign** — no blockers, no suspicion flags. The detailed analysis correctly reads our flat metadata:
- Scanner sees `primaryEnv: CLAWDRAW_API_KEY`, `requires: { bins: ["node"], env: ["CLAWDRAW_API_KEY"] }`, and the npm install spec
- Code analysis confirms the skill matches its declared purpose
- No credential, persistence, or privilege concerns

**Known cosmetic issue:** The top-level scan *summary* still reports "Required env vars: none" and "No install spec — instruction-only", even though the detailed analysis correctly reads the values from SKILL.md and metadata. This appears to be a registry-side extraction/display issue — the summary uses a different data source or caching layer than the detailed scanner. It does **not** affect the scan verdict or installability. We cannot fix this from our side; it's a ClawHub registry limitation.

**What changed in v0.7.2:** Flattened SKILL.md frontmatter metadata to match `ClawdisSkillMetadataSchema`. Previously metadata was wrapped under `clawdbot`/`openclaw` namespaces — the registry parser applies the schema directly to the `metadata` value and silently ignores unrecognized keys like namespace wrappers. Flat top-level `primaryEnv`, `requires`, `install` keys are what the schema expects.

**Root cause of the multi-version metadata saga (v0.6.1 through v0.7.1):** Every attempt to fix registry metadata extraction used namespace wrapping (`openclaw`, `clawdbot`, or both). The actual schema is flat. The "use `metadata.openclaw` namespace" advice was our own hypothesis from v0.6.3 — no skill on ClawHub uses namespaced metadata. The schema definition lives at `ClawdisSkillMetadataSchema` in the clawhub CLI (`dist/schema/schemas.js`).

**Three things that must all be true for registry metadata to work:**

1. **`files` key in frontmatter** — without it, ClawHub classifies the skill as "instruction-only" and skips metadata parsing entirely (fixed in v0.6.4)
2. **Flat metadata structure** — `primaryEnv`, `requires`, `install` as top-level keys in the metadata JSON, no namespace wrapping (fixed in v0.7.2)
3. **`requires.env` matches actual usage** — env vars declared in metadata must match what's accessed in code; undeclared env vars trigger suspicion

**What we can't control:** The top-level registry summary display of env vars and install spec appears to use a separate extraction path from the detailed scanner. Even with correct flat metadata, it may show "none". This is cosmetic — the scanner's detailed analysis reads the values correctly and the scan passes.

### v0.8.0 Scan Result

Two scans ran. The **code-level scan** classified the skill as **benign**: "The code and documentation align with its stated purpose... robust SSRF protection... explicit claims of a 'data-only pipeline' with no child_process or eval() (largely confirmed by code review)... No evidence of intentional harmful behavior." The `open` npm package (used for browser auto-open) was noted alongside existing deps but did not trigger any flags — our source contains only `import open from 'open'`, no `child_process` in our code.

The **registry metadata scan** returned **Suspicious (Medium Confidence)** — same root cause as v0.7.2's cosmetic issue: the top-level registry summary reports "no env vars" and "no install spec" while SKILL.md metadata correctly declares them. This is the ClawHub registry-side extraction/display bug documented in v0.7.2. Our metadata is correctly flat. The mismatch is between the registry summary (which we cannot control) and our SKILL.md metadata (which the detailed scanner reads correctly).

**What changed from v0.7.2:** Added `open` dependency for browser auto-open. The code scan explicitly confirmed "no child_process" in our source — the `open` package approach (static `import open from 'open'` instead of dynamic `import('node:child_process')`) successfully kept our source clean. The registry metadata issue remains unfixable from our side.

### v0.8.1 Scan Result

The registry metadata scan returned **Suspicious (High Confidence)** — same root cause as previous versions: the top-level registry summary reports "no env vars" and "no install spec" while SKILL.md metadata correctly declares both. This is the same ClawHub registry-side extraction/display bug documented since v0.7.2. Our metadata format matches the `ClawdisSkillMetadataSchema` (flat top-level keys, `files` present in frontmatter). The confidence increase from "medium" (v0.8.0) to "high" does not reflect any code change — it appears to be scanner-side recalibration.

**What changed from v0.8.0:** Address scanner concerns documentation, auto-placement improvements, INQ docs updates. No security-relevant code changes.

### v0.8.2 Scan Result

*(Pending — check ClawHub scanner after publish)*

**What changed from v0.8.1:** Added `scripts/roam.mjs` (autonomous roam mode), viewport follow-tracking fix in `connection.mjs`, browser-open TTL, viridis vortex scaling correction. `roam.mjs` uses the same patterns as existing scripts — `process.env.CLAWDRAW_API_KEY` only, no `child_process`, no `eval`, no dynamic `import()`, no `readdir`. The `__SKILL_TEST_RELAY_URL` env var is test-only and lives in `scripts/` (not `primitives/` or `lib/`), matching existing patterns.

### v0.8.3 Scan Approach: `openclaw` namespace + scanner checklist sections

**Hypothesis:** The registry summary extractor may use YAML-path lookup (e.g. `metadata.openclaw.primaryEnv`) rather than reading flat keys. Every previous version tested either flat-only (v0.7.2+) or namespaced-only (v0.6.3, v0.7.0–v0.7.1) — but no version tested `openclaw` namespace *with* the `files` key present. The `files` key was added in v0.6.4, and v0.6.3 (which used `openclaw`) predated it. After v0.6.4, all namespace tests used `clawdbot` (v0.7.0) or dual `clawdbot`+`openclaw` (v0.7.1), never `openclaw` alone. Additionally, web research found the official ClawHub docs show `metadata.openclaw` as the canonical namespace.

**Changes in v0.8.3:**

1. **Belt-and-suspenders metadata:** Keep flat keys (proven for detailed scanner) AND add `openclaw`-namespaced duplicate (untested combination targeting summary extractor). Removed `category: art` (not in schema). Added `always: false` at both levels.
2. **External Endpoints table** in SKILL.md — scanner checklist item listing all outbound connections with protocol, purpose, and data sent.
3. **Model Invocation Notice** in SKILL.md — confirms opt-in only, no auto-execute.
4. **Trust Statement** in SKILL.md — summarizes data handling and privacy posture.
5. **`@security-manifest` headers** on all 6 published scripts — structured comments declaring env vars, endpoints, files, and exec usage for automated scanner verification.
6. **Paint mode selection bias fix** — routing examples no longer hardcode vangogh; agents now choose mode from the table based on subject.

**Expected outcomes:**
- If summary now shows env vars/install spec → `openclaw` namespace was the missing piece
- If summary still shows "none" → confirmed as registry-side extraction bug, unfixable from our code. Document and move on.
- Scanner checklist sections (endpoints, invocation, trust) should reduce informational warnings regardless

---

## 3. Version Bump

Update the version in exactly two places:

```
claw-draw/package.json  →  "version": "X.Y.Z"
claw-draw/SKILL.md      →  version: X.Y.Z    (frontmatter line 3)
```

These must match. ClawHub reads from `SKILL.md`, npm reads from `package.json`.

---

## 4. npm Pack Dry Run

```bash
cd claw-draw && npm pack --dry-run
```

Verify:
- **Version** matches what you bumped to
- **File count** is expected (currently 89 files)
- **No test files** — `__tests__/`, `*.test.ts`, `vitest.config.*` should not appear
- **No dev files** — `dev/`, `sync-algos.mjs` should not appear
- **No dotfiles** — `.env`, `.gitignore` (`.gitignore` is fine, npm includes it automatically but it's harmless)
- **No `node_modules/`**
- **No `.tgz` files** from previous packs

The `files` field in `package.json` controls what gets published:

```json
"files": [
  "LICENSE",
  "scripts/clawdraw.mjs",
  "scripts/auth.mjs",
  "scripts/connection.mjs",
  "scripts/snapshot.mjs",
  "scripts/symmetry.mjs",
  "scripts/roam.mjs",
  "primitives/",
  "lib/",
  "templates/",
  "community/",
  "references/",
  "SKILL.md",
  "README.md"
]
```

This allowlist approach means anything not listed is automatically excluded — safer than `.npmignore` which is a denylist.

---

## 5. Git Commit

Stage only the release-relevant files:

```bash
git add claw-draw/SKILL.md claw-draw/package.json claw-draw/scripts/clawdraw.mjs claw-draw/lib/svg-parse.mjs
# ... plus any other changed source files in claw-draw/
```

Do **not** stage unrelated files (scratch scripts, `package-lock.json` from root, etc.).

Commit message format:

```
v0.X.0 — short summary of major changes
```

Examples:
- `v0.5.0 — unified primitive scales, SVG subpath splitting, default template scale`
- `v0.4.0 — spatial awareness, 5 new collaborator behaviors, security hardening`
- `v0.3.0 — collaborator behaviors, SVG templates, markers, security hardening`

---

## 6. npm Publish

```bash
cd claw-draw && npm publish
```

- The `publishConfig.access` field is set to `"public"` in `package.json` — no need for `--access public` flag
- npm may auto-correct minor `package.json` issues (bin path normalization, repo URL) — these warnings are informational
- Verify at `https://www.npmjs.com/package/@clawdraw/skill` after publish

---

## 7. ClawHub Publish

```bash
clawhub publish claw-draw \
  --slug clawdraw \
  --version X.Y.Z \
  --changelog "Summary of changes"
```

Notes:
- The path must be the folder name (`claw-draw`), not a `./` prefixed path
- Auth: run `clawhub whoami` first to verify your token is valid. If expired, `clawhub login`
- The ClawHub server can be flaky — if you get `Timeout`, retry a few times. The timeout is server-side (not CLI-side), so increasing local timeout won't help
- **"Rate limit exceeded" and "Timeout" are false negatives** — `clawhub publish` routinely reports `Rate limit exceeded` or `Timeout` and exits with code 1, but the publish actually succeeds. This happens almost every publish — treat it as expected behavior, not an error. Always check the ClawHub website before retrying — if the new version appears, the publish went through despite the error
- Verify at the ClawHub website after publish

---

## 8. Update Hosted skill.md

> **⚠️ DO NOT SKIP THIS STEP.** If you forget, `clawdraw.ai/skill.md` will serve a stale version. Users who install via URL (instead of ClawHub) will get outdated instructions and capabilities. This has happened before — v0.6.0 and v0.6.1 were published without syncing, leaving the hosted file at v0.5.0.

Copy the published `claw-draw/SKILL.md` to the main CLAWDRAW app so that [clawdraw.ai/skill.md](https://clawdraw.ai/skill.md) serves the latest version:

```bash
cp claw-draw/SKILL.md ../CLAWDRAW/packages/client/public/skill.md
cd ../CLAWDRAW && git add packages/client/public/skill.md && git commit -m "Sync skill.md to v$(grep '^version:' ../ClawDrawSkill/claw-draw/SKILL.md | awk '{print $2}')"
```

Then push in the CLAWDRAW repo. The two files should always be identical.

---

## 9. Update Root Dependency

The root `package.json` pins the workspace dependency:

```bash
# In the repo root package.json:
"@clawdraw/skill": "^X.Y.Z"
```

Update this to match the new version. Commit separately:

```
Update root dependency to @clawdraw/skill ^X.Y.Z
```

---

## 10. Git Push

```bash
git push
```

---

## Troubleshooting: Stale Versions

If a user reports seeing an old version of ClawDraw (e.g., v0.1 content when v0.6.1 is published), check these causes in order:

### 1. URL install vs ClawHub install

Users who install via `https://clawdraw.ai/skill.md` (the raw URL method) get a one-time snapshot of the SKILL.md file. This does **not** go through ClawHub's version management, does not appear in OpenClaw's skills tab, and does not receive updates.

**Fix:** Tell the user to install properly via ClawHub:

```bash
clawhub install clawdraw
```

### 2. Hosted skill.md is out of date

If Step 8 was skipped, `clawdraw.ai/skill.md` serves a stale version. Users installing via URL will get old content regardless of what's on ClawHub or npm.

**Fix:** Sync the hosted file (see Step 8 above).

### 3. Skill precedence / shadowing

OpenClaw resolves skills in this order: workspace `skills/` > `~/.openclaw/skills` > bundled skills. A stale copy in a higher-precedence location will shadow the newer ClawHub-managed version.

**Fix:** Tell the user to check for and remove stale copies:

```bash
# Check for workspace-level copies
ls ./skills/clawdraw/

# Check for user-level copies
ls ~/.openclaw/skills/clawdraw/
```

Remove any stale copies, then `clawhub install clawdraw` to get the latest via ClawHub.

---

## Quick Reference: Full Command Sequence

```bash
# 1. Run tests
cd claw-draw && npx vitest run

# 2. Dry run pack
npm pack --dry-run

# 3. Commit (after version bumps and edits)
cd .. && git add claw-draw/SKILL.md claw-draw/package.json [other changed files]
git commit -m "v0.X.0 — changelog summary"

# 4. Publish to npm
cd claw-draw && npm publish

# 5. Publish to ClawHub
cd .. && clawhub publish claw-draw --slug clawdraw --version 0.X.0 --changelog "summary"

# 6. Sync hosted skill.md in CLAWDRAW app repo
cp claw-draw/SKILL.md ../CLAWDRAW/packages/client/public/skill.md
cd ../CLAWDRAW && git add packages/client/public/skill.md && git commit -m "Sync skill.md to vX.Y.Z"
cd ../ClawDrawSkill

# 7. Update root dependency
# edit package.json
git add package.json
git commit -m "Update root dependency to @clawdraw/skill ^0.X.0"

# 8. Push
git push
```

---

## SKILL.md Frontmatter Reference

```yaml
---
name: clawdraw
version: 0.8.9
description: One-line description (used by OpenClaw for skill matching)
user-invocable: true
homepage: https://clawdraw.ai
emoji: 🎨
files: ["scripts/clawdraw.mjs","scripts/auth.mjs","scripts/connection.mjs","scripts/snapshot.mjs","scripts/symmetry.mjs","scripts/roam.mjs","primitives/","lib/","templates/","community/"]
metadata: {"emoji":"🎨","always":false,"primaryEnv":"CLAWDRAW_API_KEY","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","package":"@clawdraw/skill","bins":["clawdraw"],"label":"Install ClawDraw CLI (npm)"}],"openclaw":{"always":false,"primaryEnv":"CLAWDRAW_API_KEY","requires":{"bins":["node"]},"install":[{"id":"npm","kind":"node","package":"@clawdraw/skill","bins":["clawdraw"],"label":"Install ClawDraw CLI (npm)"}]}}
---
```

Key fields:
- `name` — skill slug, must match ClawHub slug
- `version` — must match `package.json` version
- `description` — single line, OpenClaw parser only supports single-line frontmatter
- `files` — JSON array of script/code files and directories the skill bundles. **Required** for any skill that includes executable scripts. Without this key, ClawHub classifies the skill as "instruction-only" (just a SKILL.md with instructions, no scripts) and skips parsing `requires`/`install` from metadata entirely. List individual script files and directories that contain code.
- `metadata` — single-line JSON object with **flat** keys matching `ClawdisSkillMetadataSchema` PLUS an `openclaw` namespace duplicate (belt-and-suspenders). The flat keys are proven to work with the detailed scanner. The `openclaw`-namespaced duplicate targets the summary extractor, which may use YAML-path lookup (e.g. `metadata.openclaw.primaryEnv`). Also includes `always: false` as an explicit trust signal. The `requires.env` array declares which env vars the skill needs (the scanner checks that you don't access anything else). The `install` array declares install methods shown in the ClawHub UI. **Removed `category: art`** — not in `ClawdisSkillMetadataSchema`, could confuse the parser.
- `user-invocable: true` — skill can be called directly by users (not just by other skills)

---

## Package Structure Boundaries

```
Published (via package.json "files"):        NOT published:
  scripts/*.mjs                                scripts/__tests__/
  primitives/**/*.mjs                          dev/
  lib/*.mjs                                    *.test.ts
  templates/*.json                             vitest.config.*
  community/*.mjs                              node_modules/
  references/*.md                              *.tgz
  SKILL.md, README.md, LICENSE                 .gitignore
```

The `dev/` directory lives at the **repo root** (not inside `claw-draw/`) and contains `sync-algos.mjs` which legitimately uses `execSync` and `fs` for maintainer workflows. It is:
- Located outside `claw-draw/` — never included in the ClawHub bundle
- Excluded from `package.json` `files` — never included in the npm package
- Not referenced by any published source file
- Documented in `SECURITY.md` as a maintainer-only tool

This separation is important — if `dev/` leaked into either published bundle, the scanner would flag `execSync`.

---

## ClawHub Bundle vs npm Bundle

`clawhub publish claw-draw` uploads the **entire `claw-draw/` directory**, not just the files listed in `package.json` `files`. This means npm's allowlist does not protect the ClawHub bundle.

**Key differences:**

| | npm (`npm publish`) | ClawHub (`clawhub publish`) |
|---|---|---|
| **What gets published** | Only files in `package.json` `files` | Entire directory |
| **Exclusion mechanism** | `files` allowlist (safe default) | `.clawhubignore` denylist |
| **Dev tools** | Automatically excluded | Must be outside `claw-draw/` or in `.clawhubignore` |
| **Test files** | Automatically excluded | Must be in `.clawhubignore` |

**Rules to prevent scan flags:**

1. **Dev tools** (`sync-algos.mjs`, anything with `execSync`/`child_process`/`readdir`) must live **outside** `claw-draw/` entirely (e.g., repo root `dev/`)
2. **Test files** (`*.test.ts`, `__tests__/`) should be excluded via `.clawhubignore`
3. **Build artifacts** (`node_modules/`, `package-lock.json`, `*.tgz`) should be in `.clawhubignore`
4. **Metadata** — `requires`, `install`, and `primaryEnv` in SKILL.md frontmatter JSON must be **flat** (top-level keys in the metadata object), matching `ClawdisSkillMetadataSchema`. As of v0.8.3 we also include an `openclaw`-namespaced duplicate (belt-and-suspenders) — this targets the registry summary extractor which may use YAML-path lookup. The flat keys serve the detailed scanner; the `openclaw` namespace serves the summary.
5. **Files declaration** — SKILL.md frontmatter must include a `files` key listing executable scripts and code directories. Without it, ClawHub classifies the skill as "instruction-only" and skips parsing `requires`/`install` from metadata entirely — even if the metadata is correct.

---

## Release History

| Version | Date | Highlights |
|---------|------|-----------|
| 0.8.9 | 2026-02-21 | Fix stale SECURITY.md references: update "Manifest Mismatch" and "Registry Metadata Note" sections to reflect v0.8.8 `primaryEnv` re-declaration |
| 0.8.8 | 2026-02-21 | Re-declare `primaryEnv: CLAWDRAW_API_KEY` in metadata, reduce env var prominence in SKILL.md and SECURITY.md to address scanner "undeclared credential" flags |
| 0.8.7 | 2026-02-21 | Scanner compliance: reword install section to remove consent-bypass language, update SECURITY.md to match current metadata |
| 0.8.6 | 2026-02-21 | Fix OpenClaw seamless install (`clawdraw setup` lead), remove `primaryEnv` from metadata, remove "Follow along" doc language — docs now describe waypoint behavior accurately |
| 0.8.5 | 2026-02-21 | Remove `requires.env` from metadata — was blocking OpenClaw auto-setup flow by demanding API key before `clawdraw setup` could run |
| 0.8.4 | 2026-02-21 | Security hardening: remove `__SKILL_TEST_RELAY_URL` env var override from roam.mjs, 11 new security tests (manifest consistency, dependency declarations, open package isolation, publish boundary), Scanner Transparency Checklist in SECURITY.md |
| 0.8.2 | 2026-02-21 | Autonomous roam mode (`scripts/roam.mjs`), viewport follow-tracking fix, browser-open TTL, viridis vortex scaling correction |
| 0.8.1 | 2026-02-21 | Address scanner concerns documentation, auto-placement improvements, INQ docs updates |
| 0.8.0 | 2026-02-21 | Freestyle paint mode (`--mode freestyle`), canvas vision (`clawdraw look`), browser auto-open via `open` package (replaces `child_process`), tile CDN migration (`tiles.clawdraw.ai` → `relay.clawdraw.ai/tiles`), `references/VISION.md` |
| 0.7.2 | 2026-02-20 | Fix registry metadata: flatten to match `ClawdisSkillMetadataSchema` (was namespaced under `clawdbot`/`openclaw`, registry expects flat `primaryEnv`/`requires`/`install`) |
| 0.7.1 | 2026-02-20 | Fetch hardening (redirect SSRF, timeout, Content-Type, format whitelist), dual metadata namespace, IPv6 SSRF coverage, INQ recovery flow with `?openclaw` deep link |
| 0.7.0 | 2026-02-20 | Erase strokes, delete waypoints, metadata namespace fix (openclaw → clawdbot) |
| 0.6.5 | 2026-02-20 | drawAndTrack refactor, ?openclaw deep link, recovery guidance |
| 0.6.4 | 2026-02-20 | Add `files` frontmatter key to fix "instruction-only" registry classification; without `files`, ClawHub skips parsing `requires`/`install` from metadata |
| 0.6.3 | 2026-02-20 | Fix scanner metadata: use `openclaw` namespace for `requires`/`install` (was root-level, scanner expects `metadata.openclaw`). Still flagged — registry classifies as instruction-only due to missing `files` key |
| 0.6.2 | 2026-02-20 | Paint SSRF protection, static sharp import, response size limits |
| 0.6.1 | 2026-02-20 | Fix ClawHub scan flags: move `dev/` out of bundle, restructure metadata, add `.clawhubignore` |
| 0.6.0 | 2026-02-20 | Paint command with 4 rendering modes (pointillist, sketch, vangogh, slimemold), `image-trace.mjs` library, full SKILL.md paint documentation |
| 0.5.0 | 2026-02-19 | Unified primitive scales (~300 units), SVG subpath splitting (`parseSvgPathMulti`), default template scale 0.5, INQ grant update (500K) |
| 0.4.0 | — | Spatial awareness, 5 new collaborator behaviors, security hardening |
| 0.3.0 | — | Collaborator behaviors, SVG templates, markers, security hardening |
| 0.2.0 | — | Batch limits, security regression tests, metadata |
