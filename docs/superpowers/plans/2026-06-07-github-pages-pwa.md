# GitHub Pages + Installable Offline PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host the self-contained pickleball app on GitHub Pages as an installable, offline-capable PWA, served at `https://zigrivers.github.io/rumble-pickleball/`.

**Architecture:** The app stays a single self-contained file, renamed `pickleball.html` → `index.html`. A small PWA wrapper is added alongside it — `manifest.webmanifest`, `sw.js` (versioned cache-first service worker), and PNG icons. Service-worker registration is guarded to HTTPS so the same `index.html` still works offline via AirDrop/`file://`. Updates use a non-intrusive "new version" chip (no silent mid-tournament reload).

**Tech Stack:** Vanilla JS, no build step. GitHub Pages (main branch, root). Service Worker + Web App Manifest. Verification via `python3 -m http.server` + agent-browser (service workers require https or localhost).

**Spec:** `docs/superpowers/specs/2026-06-07-github-pages-pwa-design.md`

**Conventions:**
- The app's existing `<head>` already contains `<meta name="theme-color" content="#0f1419">` and `apple-mobile-web-app-capable` — do **not** duplicate these.
- App theme: `--bg: #0f1419`, `--accent: #fbbf24`, `--panel: #1a2028`.
- Historical plan/spec docs under `docs/superpowers/` intentionally keep the old `pickleball.html` name as point-in-time records — do **not** rewrite them.
- **Prerequisite — run all commands from the repo root:** `cd "$(git rev-parse --show-toplevel)"`. All paths below are repo-root-relative.
- Serve-for-testing command (used throughout):
  `python3 -m http.server 8765 --bind 127.0.0.1 -d . &`
- `el(tag, attrs, ...children)` referenced in Task 6 is the existing top-level DOM helper already defined in `index.html` (search `function el(`) and is in scope at the boot point where the PWA block is appended.

---

### Task 1: Rename the app to index.html

**Files:**
- Rename: `pickleball.html` → `index.html`

- [ ] **Step 1: Rename via git**

```bash
git mv pickleball.html index.html
```

- [ ] **Step 2: Verify the app + harnesses still run when served**

Start the server (background) and open the app:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 -d . &
```

```bash
agent-browser open "http://localhost:8765/index.html?test"
agent-browser wait --load domcontentloaded
# wait for self-tests, then read console
sleep 3
agent-browser console | grep "self-tests] complete"
```

Expected: `[self-tests] complete — 1 failure(s)` (the lone pre-existing keep-awake headless artifact).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename pickleball.html to index.html for Pages hosting"
```

---

### Task 2: Generate PWA icons from the 🏓 mark

**Files:**
- Create: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180), `icon-512-maskable.png` (extra safe-zone padding)

Icons are rendered in a real browser (reliable emoji rendering) via agent-browser, then written to disk from base64.

- [ ] **Step 1: Create the generator page**

Create `/tmp/icon-gen.html`:

```html
<!doctype html><html><body>
<canvas id="c"></canvas>
<script>
function makeIcon(size, pad) {
  const c = document.getElementById("c");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, size, size);
  const fontPx = Math.floor(size * (1 - pad));
  ctx.font = fontPx + "px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏓", size / 2, size / 2 + fontPx * 0.06);
  return c.toDataURL("image/png").split(",")[1];
}
window.ICONS = {
  "icon-192.png": makeIcon(192, 0.18),
  "icon-512.png": makeIcon(512, 0.18),
  "apple-touch-icon.png": makeIcon(180, 0.12),
  // Maskable: extra padding so the mark stays inside the adaptive-icon safe zone.
  "icon-512-maskable.png": makeIcon(512, 0.34),
};
</script>
</body></html>
```

- [ ] **Step 2: Render and write the PNGs**

Decode via `python3` (portable — avoids the GNU `base64 --decode` / BSD `base64 -D` split, and robustly strips any surrounding quotes/whitespace from the eval output):

```bash
agent-browser open "file:///tmp/icon-gen.html"
agent-browser wait --load domcontentloaded
for name in icon-192.png icon-512.png apple-touch-icon.png icon-512-maskable.png; do
  agent-browser eval "window.ICONS['$name']" \
    | python3 -c "import sys,base64; d=sys.stdin.read().strip().strip('\"'); open('$name','wb').write(base64.b64decode(d))"
done
file icon-192.png icon-512.png apple-touch-icon.png icon-512-maskable.png
```

Expected: `file` reports `PNG image data, 192 x 192` / `512 x 512` / `180 x 180` / `512 x 512`.

- [ ] **Step 3: Eyeball one icon**

```bash
agent-browser open "file://$(pwd)/icon-512.png"
agent-browser screenshot /tmp/icon-check.png
```

Read `/tmp/icon-check.png` — confirm a dark square with a centered 🏓. If the emoji is missing/clipped, adjust the `pad`/baseline offset in Step 1 and re-run.

- [ ] **Step 4: Commit**

```bash
git add icon-192.png icon-512.png apple-touch-icon.png icon-512-maskable.png
git commit -m "feat: add PWA icons generated from the paddle mark"
rm -f /tmp/icon-gen.html /tmp/icon-check.png
```

---

### Task 3: Add the web app manifest

**Files:**
- Create: `manifest.webmanifest`

- [ ] **Step 1: Create the manifest**

Create `manifest.webmanifest` (relative paths — the app is served from the `/rumble-pickleball/` subpath):

```json
{
  "name": "Rumble Pickleball",
  "short_name": "Rumble",
  "description": "8-player pickleball tournament manager — Round Robin, Stack, King, Gauntlet, Crown.",
  "display": "standalone",
  "orientation": "portrait",
  "start_url": ".",
  "scope": "./",
  "background_color": "#0f1419",
  "theme_color": "#0f1419",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add manifest.webmanifest
git commit -m "feat: add web app manifest"
```

---

### Task 4: Link the manifest + icons in index.html

**Files:**
- Modify: `index.html` (after the existing favicon `<link>` at line ~10)

- [ ] **Step 1: Add manifest + apple-touch-icon links**

In `index.html`, immediately after the existing line:

```html
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext y='52' font-size='52'%3E%F0%9F%8F%93%3C/text%3E%3C/svg%3E">
```

insert these two lines:

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
```

(Do **not** add a `theme-color` meta — it already exists on line 9.)

- [ ] **Step 2: Verify the manifest is detected**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
agent-browser eval "(async () => { const r = await fetch('manifest.webmanifest'); const m = await r.json(); return m.name + ' | icons:' + m.icons.length; })()"
```

Expected: `Rumble Pickleball | icons:3`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: link manifest and apple-touch-icon"
```

---

### Task 5: Create the service worker

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Write the service worker**

Create `sw.js`:

```js
// App-specific cache prefix. github.io is a shared origin across all of the
// owner's project Pages, so cleanup must only touch THIS app's caches — never
// delete by "everything that isn't the current version".
const CACHE_PREFIX = "rumble-pickleball-";
// Bump VERSION on every deploy so clients pick up changes.
const VERSION = CACHE_PREFIX + "v1";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png",
  "apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Do NOT skipWaiting here — the page decides when to activate (update chip).
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // ignoreSearch so cached shell serves any query string (?test, ?simulate)
  // and update-induced reloads that preserve the query.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((cached) => cached || fetch(event.request))
  );
});

// The page posts this when the user taps "update".
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
```

- [ ] **Step 2: Verify it registers and caches (added in Task 6 — placeholder check now)**

The registration code is added in Task 6. For now, just confirm the file is valid JS:

```bash
node --check sw.js
```

Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add sw.js
git commit -m "feat: add versioned cache-first service worker"
```

---

### Task 6: Register the SW + add the update chip in index.html

**Files:**
- Modify: `index.html` — append a registration block at the very end of the main `<script>` (immediately before the closing `</script>` that precedes `</body>`; just after the final `render();` boot call).

- [ ] **Step 1: Add registration + update-chip code**

At the end of the script block (after `render();`), insert:

```js
// ---------- PWA: service worker registration + update chip ----------
// Register on secure contexts: https in production, and localhost/127.0.0.1 for
// local testing (both are valid SW secure contexts). file:// is excluded, so
// AirDrop use is unaffected (SW won't register there; the local file still runs).
// Uses the existing top-level el() DOM helper defined earlier in this file.
{
  const _host = location.hostname;
  const _swOk = "serviceWorker" in navigator &&
    (location.protocol === "https:" || _host === "localhost" || _host === "127.0.0.1" || _host === "[::1]");
  if (_swOk) {
    // Reload only when an UPDATE takes control — never on first-load claim().
    // hadController is false on a fresh first visit (clients.claim() fires
    // controllerchange then, which must NOT reload), true once controlled.
    const hadController = !!navigator.serviceWorker.controller;
    let _pwaReloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController && !_pwaReloaded) { _pwaReloaded = true; location.reload(); }
    });

    navigator.serviceWorker.register("sw.js").then((reg) => {
      function showUpdateChip(worker) {
        if (document.getElementById("pwa-update-chip")) return;
        const chip = el("button", {
          id: "pwa-update-chip",
          style: "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);" +
            "z-index:300;background:var(--accent);color:#1a1207;border:none;" +
            "border-radius:999px;padding:10px 18px;font-weight:600;font-size:14px;" +
            "box-shadow:0 4px 16px rgba(0,0,0,.4);cursor:pointer;",
        }, "🆕 New version — tap to update");
        chip.addEventListener("click", () => {
          chip.disabled = true;
          worker.postMessage("skipWaiting");
        });
        document.body.appendChild(chip);
      }
      // Show the chip once a NEW worker is installed alongside an active controller.
      function trackWorker(worker) {
        if (!worker) return;
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateChip(worker);
          return;
        }
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateChip(worker);
          }
        });
      }
      // Cover all three sources: one already waiting, one mid-install, future updates.
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateChip(reg.waiting);
      trackWorker(reg.installing);
      reg.addEventListener("updatefound", () => trackWorker(reg.installing));
    });
  }
}
```

- [ ] **Step 2: Verify registration on localhost**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
sleep 1
agent-browser eval "navigator.serviceWorker.getRegistration().then(r => r ? 'registered scope ' + r.scope : 'NONE')"
```

Expected: `registered scope http://localhost:8765/`.

- [ ] **Step 3: Verify it does NOT register on file://**

```bash
agent-browser open "file://$(pwd)/index.html"
agent-browser wait --load domcontentloaded
agent-browser eval "('serviceWorker' in navigator) ? (navigator.serviceWorker.controller ? 'CONTROLLED(bad)' : 'no controller (ok for file://)') : 'no SW API'"
```

Expected: `no controller (ok for file://)` — and the app still renders normally.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: register service worker with non-intrusive update chip"
```

---

### Task 7: Verify offline + update flow end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Confirm offline load works**

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
sleep 1   # let the SW cache the shell
# Confirm the shell is cached:
agent-browser eval "caches.open('rumble-pickleball-v1').then(c => c.keys()).then(k => 'cached:' + k.length)"
```

Expected: `cached:7`.

- [ ] **Step 2: Reload offline**

```bash
agent-browser eval "navigator.serviceWorker.controller ? 'controlled' : 'NOT controlled'"
# Second visit is controlled; simulate offline by stopping the server, then reload.
kill %1 2>/dev/null || pkill -f "http.server 8765"
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
agent-browser eval "document.querySelector('h1, .app') ? 'app rendered offline' : 'blank'"
```

Expected: `app rendered offline` (served from cache with the server down).

- [ ] **Step 3: Verify the update chip path**

```bash
# Restart server, bump VERSION to force an update.
python3 -m http.server 8765 --bind 127.0.0.1 -d . &
```

Edit `sw.js`: change `const VERSION = CACHE_PREFIX + "v1";` to `CACHE_PREFIX + "v2";` and save.

```bash
agent-browser open "http://localhost:8765/index.html"
agent-browser wait --load domcontentloaded
sleep 2
agent-browser eval "document.getElementById('pwa-update-chip') ? 'chip shown' : 'no chip'"
```

Expected: `chip shown`. Then click it and confirm a single reload to the new version:

```bash
agent-browser click "#pwa-update-chip"
sleep 2
agent-browser eval "caches.keys().then(k => k.join(','))"
```

Expected: `rumble-pickleball-v2` only (old cache deleted on activate).

- [ ] **Step 4: Revert VERSION and commit**

Restore `sw.js` `VERSION` to `CACHE_PREFIX + "v1"` (v2 was only to exercise the update path).

```bash
git add sw.js
git diff --cached --quiet && echo "no change" || git commit -m "test: verified PWA update flow (VERSION reverted to v1)"
```

(If reverting produced no net diff, there is nothing to commit — that's fine.)

---

### Task 8: Enable GitHub Pages and verify the live site

**Files:** none (repo configuration)

- [ ] **Step 1: Push all work to main**

```bash
git push origin main
```

- [ ] **Step 2: Enable Pages (main / root) via the API**

Use a JSON body (the `/pages` endpoint expects a nested `source` object; form `-f` flags don't reliably produce that shape):

```bash
gh api -X POST repos/zigrivers/rumble-pickleball/pages \
  --input - <<<'{"source":{"branch":"main","path":"/"}}' 2>&1 || \
  echo "If this errors (already enabled / scope), enable manually: repo Settings → Pages → Source: main / root."
```

- [ ] **Step 2b: Confirm Pages status**

```bash
gh api repos/zigrivers/rumble-pickleball/pages --jq '.html_url, .status'
```

Expected: `https://zigrivers.github.io/rumble-pickleball/` and a status of `building` then `built` (may take 1–2 min; re-run until `built`).

- [ ] **Step 3: Verify the live PWA**

```bash
agent-browser open "https://zigrivers.github.io/rumble-pickleball/"
agent-browser wait --load networkidle
agent-browser eval "navigator.serviceWorker.getRegistration().then(r => r ? 'SW ok' : 'NONE')"
agent-browser eval "(async()=>{const m=await (await fetch('manifest.webmanifest')).json();return m.short_name;})()"
```

Expected: `SW ok` and `Rumble`.

- [ ] **Step 4: Verify scoreboard integrity on the live origin**

```bash
agent-browser open "https://zigrivers.github.io/rumble-pickleball/?simulate"
agent-browser wait --load domcontentloaded
sleep 3
agent-browser console | grep "simulate] complete"
```

Expected: `[simulate] complete — 0 failure(s) across 3 tournaments`.

- [ ] **Step 5: Clean up**

```bash
agent-browser eval "localStorage.clear(); 'ok'"
agent-browser close
pkill -f "http.server 8765" 2>/dev/null || true
```

---

## Self-Review

**Spec coverage:**
- File layout (rename + siblings) → Tasks 1–5. ✅
- Manifest with relative subpath paths → Task 3. ✅
- index.html additions (manifest/apple-touch links; theme-color already present) → Task 4. ✅
- Guarded SW registration (https **+ localhost**; file:// unaffected) → Task 6 (Steps 2–3 verify both). ✅
- Service worker cache-first + versioned + prefix-scoped activate cleanup + no silent reload → Tasks 5–6. ✅
- Update chip (tap → skipWaiting → single reload, `hadController`-guarded so first-load claim never reloads) → Task 6 + Task 7 Step 3. ✅
- Data-continuity caveat → documented in spec; no code task needed (per-origin storage is browser behavior). ✅
- Pages enablement (main/root) + live URL → Task 8. ✅
- Testing: manifest detected, SW registers on https/localhost & not on file://, offline load (incl. query strings via `ignoreSearch`), update path, app `?test`/`?simulate` pass → Tasks 4,6,7,8 (Task 8 exercises the real `/rumble-pickleball/` subpath live). ✅
- Texting interplay → out of scope for this plan (separate spec), correctly excluded. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete; all commands have expected output; all paths repo-root-relative. ✅

**Type/name consistency:** cache prefix `rumble-pickleball-`, `VERSION = CACHE_PREFIX + "v1"`, `SHELL` (7 entries → `cached:7`), message string `"skipWaiting"`, chip id `pwa-update-chip` — consistent across Tasks 5, 6, 7. ✅

**MMR review (2026-06-07):** 5-model review (claude/gemini/codex/grok/antigravity), 9 distinct findings, all addressed in this revision — localhost SW guard, `hadController` reload guard, `ignoreSearch`, prefix-scoped cache cleanup, portable `python3` base64 decode, dedicated maskable icon, JSON `gh api` Pages body, `installing`-transition tracking, repo-relative paths.
