# GitHub Pages + Installable Offline PWA — Design Spec

**Status:** Approved (brainstorm)
**Author:** Claude (with Ken)
**Date:** 2026-06-07
**Repo:** `github.com/zigrivers/rumble-pickleball` (public)

## Goal

Host the pickleball app on GitHub Pages so it is shareable by URL instead of
only by AirDrop, and turn it into an installable, offline-capable Progressive
Web App (PWA). The app's logic is unchanged; this is a distribution and
packaging change plus a service-worker update story.

Out of scope (explicitly): custom domain, push notifications, background sync,
app-store packaging, any backend. No shared/server state — the app stays 100%
client-side with per-device `localStorage`.

## Why this is mostly orthogonal to the texting feature

GitHub Pages is static hosting with no backend, so it cannot send SMS
server-side. The separately-designed "Text Results" feature (per-player `sms:`
drafts) stands as-is. Hosting changes *distribution* and unlocks adjacent
upgrades (installable, offline, and the HTTPS-only Web Share API). The texting
spec is written after this one and may assume HTTPS to add share-sheet delivery
as an enhancement over `sms:` links.

## Constraints / facts established

- The app is a **single self-contained file** (`pickleball.html`) — zero
  external resources; the only `<link>` is an inline data-URI favicon. Offline
  caching is therefore trivial (cache the shell, no dependency graph).
- The repo is already **public**, so Pages has no visibility blocker.
- A service worker **must** be a separate same-origin `.js` file served with a
  JS MIME type — it cannot be inlined or delivered via `file://`/AirDrop. This
  is the one place the project grows beyond a single file.
- `localStorage` is per-origin. A `file://` AirDrop copy and the hosted
  `https://` copy have **separate** storage; browsers forbid migrating between
  origins. Not a blocker.

## File layout (main branch, root)

Pages source = `main` branch, `/` (root). Deploy = `git push`.

| File | Role |
|---|---|
| `index.html` | The app, renamed from `pickleball.html`. Logic unchanged; `?test` and `?simulate` continue to work. |
| `sw.js` | Service worker (cache-first shell, versioned). |
| `manifest.webmanifest` | PWA manifest. |
| `icon-192.png`, `icon-512.png` | Manifest icons, generated from the 🏓 mark. |
| `apple-touch-icon.png` | 180px iOS home-screen icon. |

Dev docs (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `docs/`, specs) remain as
harmless siblings — already public, not linked from the app. The rename
requires updating any `pickleball.html` references in `docs/` (a repo grep
during implementation; the served URL becomes `…/rumble-pickleball/`).

Published URL: `https://zigrivers.github.io/rumble-pickleball/`.

## Manifest

```json
{
  "name": "Rumble Pickleball",
  "short_name": "Rumble",
  "display": "standalone",
  "start_url": ".",
  "scope": "./",
  "background_color": "#0f1419",
  "theme_color": "#0f1419",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Paths are **relative** because the app is served from a project subpath
(`/rumble-pickleball/`); `start_url: "."` / `scope: "./"` keep the SW scope and
launch URL correct under the subpath. Colors match the app's existing dark UI.

## index.html additions

Small, additive changes to `<head>`:

- `<link rel="manifest" href="manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="apple-touch-icon.png">`
- `<meta name="theme-color" content="#0f1419">`
- A guarded service-worker registration:

```js
if (location.protocol === "https:" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}
```

The `https:` guard means **AirDrop / `file://` use is unaffected** — the SW
never registers there, and the app still runs fully offline because it is a
local file. `?test` / `?simulate` are likewise unaffected.

## Service worker + update strategy

This is the only genuinely new architecture.

- A `VERSION` constant names the cache (e.g. `rumble-v1`). Bumping it on each
  deploy is the release ritual.
- **Install:** pre-cache the app shell — `index.html` (and `./`), the icons,
  and the manifest.
- **Fetch:** cache-first for the shell; network fallback. (The app has no other
  assets, so this is simple and complete.)
- **Activate:** delete caches whose name ≠ current `VERSION`.
- **Update prompt — no silent reload.** A mid-tournament auto-refresh is
  unacceptable. Instead: when a new SW reaches the `waiting` state, the page
  shows a small "🆕 New version — tap to update" chip (reusing the app's
  existing toast/chip styling). Tapping posts `skipWaiting` to the waiting SW;
  on `controllerchange` the page reloads once. Until tapped, the running version
  keeps serving.

## Data continuity caveat

Moving from a `file://` AirDrop copy to the hosted `https` origin starts that
device fresh (separate `localStorage`). There is no cross-origin migration path.
Documented behavior, acceptable for a new group/event.

## Testing

Service workers require `https` or `localhost`, so verification runs against a
local server: `python3 -m http.server 8765 --bind 127.0.0.1 -d <repo>` and
agent-browser at `http://localhost:8765/`.

1. **Manifest valid + detected** — browser reports the manifest, name, icons,
   `standalone` display, installability.
2. **SW registers and controls the page** on https/localhost; does **not**
   register on `file://` (open the file directly; confirm no registration and
   app still works).
3. **Offline load** — first visit online, then go offline (agent-browser
   offline mode / DevTools) and reload; app still loads from cache.
4. **Update prompt path** — bump `VERSION`, reload, confirm the "New version"
   chip appears and that tapping it updates and reloads exactly once (no reload
   loop, no surprise mid-use refresh).
5. **App regression** — `?test` self-tests and `?simulate` still pass when
   served from the hosted/localhost origin, and the in-app "Verify Scoreboard"
   button works.

## Implementation notes / sequencing

- Keep the single-file *app* discipline: all app logic stays in `index.html`;
  only the PWA wrapper (sw.js, manifest, icons) is added alongside.
- After this ships, the Text Results spec is written next; it may add Web Share
  API delivery (HTTPS-only) as an enhancement over the `sms:` per-player drafts.
