import { chromium } from "@playwright/test";

const [url, expectedFlag, expectedValue] = process.argv.slice(2);
if (!url || expectedFlag !== "--expected-failures" || expectedValue == null) {
  console.error("Usage: node tools/run-url-check.mjs <url> --expected-failures <n>");
  process.exit(2);
}

const expected = Number(expectedValue);
const browser = await chromium.launch();
const page = await browser.newPage();
const logs = [];
page.on("console", msg => logs.push(msg.text()));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1500);
await browser.close();

const joined = logs.join("\n");
// The app logs summary lines like "[self-tests] complete — N failure(s)" and
// "[simulate] complete — N failure(s)". In ?test mode BOTH appear, so match the
// summary for the mode under test (the page also logs [simulate], not [simulation]).
const isSimulate = /[?&]simulate\b/.test(url);
const re = isSimulate
  ? /\[(?:simulate|simulation)\][^\n]*?(\d+) failure\(s\)/g
  : /\[self-tests\][^\n]*?(\d+) failure\(s\)/g;
const matches = [...joined.matchAll(re)];
if (!matches.length) {
  console.error(joined);
  console.error("Could not find failure count in console output.");
  process.exit(1);
}

const actual = Number(matches[matches.length - 1][1]);
if (actual !== expected) {
  console.error(joined);
  console.error("Expected " + expected + " failure(s), got " + actual + ".");
  process.exit(1);
}

console.log(url + " -> " + actual + " failure(s)");
