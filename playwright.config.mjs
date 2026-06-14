import { defineConfig, devices } from "@playwright/test";

// Dev-only visual regression config. No runtime impact on the shipped app.
// Start the server first: python3 -m http.server 8765 --bind 127.0.0.1 -d .
export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: true,
  reporter: "list",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
