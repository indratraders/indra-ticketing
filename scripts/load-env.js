/**
 * Load .env files for Node scripts (Next.js does this automatically for the app).
 * Hosting / OS environment variables always win.
 * File priority (lowest → highest): .env, .env.production, .env.local
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const fromOs = new Set(Object.keys(process.env));

function parseEnv(text) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function applyFileOverlay(filename) {
  const file = path.join(ROOT, filename);
  if (!fs.existsSync(file)) return;
  const parsed = parseEnv(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (fromOs.has(key)) continue;
    process.env[key] = value;
  }
}

applyFileOverlay(".env");
applyFileOverlay(".env.production");
applyFileOverlay(".env.local");

module.exports = { ROOT };
