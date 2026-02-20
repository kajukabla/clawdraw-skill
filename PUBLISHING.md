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

### Automated tests (59 tests)

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
3. **Registry metadata mismatch** — `requires` and `install` were nested under `clawdbot` in the metadata JSON. ClawHub's parser expects them at the root level. **Fix (v0.6.1):** hoisted `requires` and `install` to root of metadata object.
4. **`package-lock.json` in bundle** — unnecessary file. **Fix (v0.6.1):** added to `.clawhubignore`.

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
- **File count** is expected (currently 88 files)
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
- Verify at the ClawHub website after publish

---

## 8. Update Hosted skill.md

Copy the published `claw-draw/SKILL.md` to the main CLAWDRAW app so that [clawdraw.ai/skill.md](https://clawdraw.ai/skill.md) serves the latest version:

```bash
cp claw-draw/SKILL.md /path/to/CLAWDRAW/packages/client/public/skill.md
```

Then commit that change in the CLAWDRAW repo. The two files should always be identical.

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
cp claw-draw/SKILL.md /path/to/CLAWDRAW/packages/client/public/skill.md
# commit in CLAWDRAW repo

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
version: 0.6.1
description: One-line description (used by OpenClaw for skill matching)
user-invocable: true
homepage: https://clawdraw.ai
emoji: 🎨
metadata: {"requires":{"bins":["node"],"env":["CLAWDRAW_API_KEY"]},"install":[{"id":"npm","kind":"node","package":"@clawdraw/skill","bins":["clawdraw"],"label":"Install ClawDraw CLI (npm)"}],"clawdbot":{"emoji":"🎨","category":"art","primaryEnv":"CLAWDRAW_API_KEY"}}
---
```

Key fields:
- `name` — skill slug, must match ClawHub slug
- `version` — must match `package.json` version
- `description` — single line, OpenClaw parser only supports single-line frontmatter
- `metadata` — single-line JSON object; `requires.env` declares which env vars the skill needs (scanner checks that you don't access anything else)
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
4. **Metadata** — `requires` and `install` in SKILL.md frontmatter JSON must be at the **root level** of the metadata object, not nested under a namespace like `clawdbot`. ClawHub's registry parser reads top-level keys only.

---

## Release History

| Version | Date | Highlights |
|---------|------|-----------|
| 0.6.1 | 2026-02-20 | Fix ClawHub scan flags: move `dev/` out of bundle, restructure metadata, add `.clawhubignore` |
| 0.6.0 | 2026-02-20 | Paint command with 4 rendering modes (pointillist, sketch, vangogh, slimemold), `image-trace.mjs` library, full SKILL.md paint documentation |
| 0.5.0 | 2026-02-19 | Unified primitive scales (~300 units), SVG subpath splitting (`parseSvgPathMulti`), default template scale 0.5, INQ grant update (500K) |
| 0.4.0 | — | Spatial awareness, 5 new collaborator behaviors, security hardening |
| 0.3.0 | — | Collaborator behaviors, SVG templates, markers, security hardening |
| 0.2.0 | — | Batch limits, security regression tests, metadata |
