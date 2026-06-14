import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const sections = ["STYLE", "STATE", "TESTS", "CORE", "FORMATS", "STATS", "LIFETIME", "RENDER", "MODALS", "BOOT"];
let last = -1;
const failures = [];

for (const section of sections) {
  const start = html.indexOf("RUMBLE:" + section + ":start");
  const end = html.indexOf("RUMBLE:" + section + ":end");
  if (start === -1) failures.push(section + " missing start sentinel");
  if (end === -1) failures.push(section + " missing end sentinel");
  if (start !== -1 && end !== -1 && start > end) failures.push(section + " start appears after end");
  if (start !== -1 && start < last) failures.push(section + " appears out of order");
  if (end !== -1) last = end;
}

if (failures.length) {
  console.error("[check-index-boundaries] failed");
  failures.forEach(f => console.error("- " + f));
  process.exit(1);
}

console.log("[check-index-boundaries] ok - " + sections.length + " sections");
