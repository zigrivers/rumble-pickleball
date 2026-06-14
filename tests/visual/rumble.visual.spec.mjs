import { test, expect } from "@playwright/test";
import { stateForVisual } from "../../tools/visual-state-fixtures.mjs";

const STORAGE_KEY = "pb_tourney_v5";
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
