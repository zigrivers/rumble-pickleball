import { test, expect } from "@playwright/test";
import { stateForVisual, lifetimeLedgerPopulated } from "../../tools/visual-state-fixtures.mjs";

const STORAGE_KEY = "pb_tourney_v5";
const LIFETIME_KEY = "pb_lifetime_v1";
const BASE = "http://127.0.0.1:8765";

// Freeze time so elapsed game timers and "saved ago" text are deterministic across
// baseline runs (the design spec requires frozen/masked dynamic text).
function freezeTime() {
  const FIXED = 1790000600000;
  const RealDate = Date;
  function FakeDate(...args) { return args.length ? new RealDate(...args) : new RealDate(FIXED); }
  FakeDate.now = () => FIXED;
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;
}

async function seedState(page, name) {
  await page.addInitScript(freezeTime);
  const state = stateForVisual(name);
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(({ key, value }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: state });
  await page.reload({ waitUntil: "load" });
}

// Deterministic, network-free Firebase bridge for visual snapshots: stubs the
// C2 surface as signed-OUT so the Career modal's "Sign in to sync" row renders
// without depending on the gstatic CDN (which would otherwise race the modal and
// flake the baseline). Real gstatic imports are blocked below so the live module
// can't overwrite this stub.
function stubFirebaseSignedOut() {
  window.__rumbleFb = {
    auth: { currentUser: null },
    db: {},
    api: {
      GoogleAuthProvider: function () {},
      signInWithRedirect() { return Promise.resolve(); },
      getRedirectResult() { return Promise.resolve(null); },
      onAuthStateChanged(_auth, cb) { cb(null); return () => {}; },
      signOut() { return Promise.resolve(); },
      doc() { return {}; }, collection() { return {}; },
      setDoc() { return Promise.resolve(); }, getDoc() { return Promise.resolve({}); },
      getDocs() { return Promise.resolve({ forEach() {} }); },
      deleteDoc() { return Promise.resolve(); }, writeBatch() { return {}; },
    },
  };
  window.__rumbleFbReady = true;
  if (typeof window.__onRumbleFbReady === "function") window.__onRumbleFbReady();
}

// Seed BOTH localStorage keys, then open the Lifetime Stats (career) modal.
// `lifetime` may be null to exercise the empty-store state.
async function seedCareer(page, tourneyState, lifetime) {
  await page.route("https://www.gstatic.com/firebasejs/**", route => route.abort());
  await page.addInitScript(freezeTime);
  await page.addInitScript(stubFirebaseSignedOut);
  await page.goto(BASE + "/index.html", { waitUntil: "load" });
  await page.evaluate(({ tKey, tVal, lKey, lVal }) => {
    localStorage.clear();
    localStorage.setItem(tKey, JSON.stringify(tVal));
    if (lVal !== null) localStorage.setItem(lKey, JSON.stringify(lVal));
  }, { tKey: STORAGE_KEY, tVal: tourneyState, lKey: LIFETIME_KEY, lVal: lifetime });
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => window.openCareer());
  await page.waitForTimeout(200);
}

test("setup desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "setup-desktop");
  await expect(page).toHaveScreenshot("setup-desktop.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("setup mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedState(page, "setup-mobile");
  await expect(page).toHaveScreenshot("setup-mobile.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("playing 13 players 3 courts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "playing-13p-3c");
  await expect(page).toHaveScreenshot("playing-13p-3c.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("settings modal", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "settings-modal");
  await page.getByLabel("Settings").click();
  await expect(page).toHaveScreenshot("settings-modal.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("finals 13 players 3 courts", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "finals-13p-3c");
  await expect(page).toHaveScreenshot("finals-13p-3c.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("text results", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "text-results");
  await expect(page).toHaveScreenshot("text-results.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("guide flex section", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(freezeTime);
  await page.goto(BASE + "/guide.html#flex", { waitUntil: "load" });
  await expect(page).toHaveScreenshot("guide-flex.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("setup lifetime toggle", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedState(page, "setup-lifetime-toggle");
  await expect(page).toHaveScreenshot("setup-lifetime-toggle.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("career empty", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedCareer(page, stateForVisual("setup-desktop"), null);
  await expect(page).toHaveScreenshot("career-empty.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});

test("career populated", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seedCareer(page, stateForVisual("setup-desktop"), lifetimeLedgerPopulated());
  await expect(page).toHaveScreenshot("career-populated.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
});
