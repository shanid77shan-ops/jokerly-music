// Downloads the static fpcalc (Chromaprint) binary for Linux x86_64 during Vercel build.
// On non-Linux platforms this is a no-op (devs use their locally installed fpcalc).
const { execSync } = require("child_process");
const { existsSync, mkdirSync } = require("fs");
const { join } = require("path");

if (process.platform !== "linux") {
  process.exit(0);
}

const binDir = join(process.cwd(), "bin");
const fpcalcPath = join(binDir, "fpcalc");

if (existsSync(fpcalcPath)) {
  process.exit(0);
}

mkdirSync(binDir, { recursive: true });

const url =
  "https://github.com/acoustid/chromaprint/releases/download/v1.5.1/chromaprint-fpcalc-1.5.1-linux-x86_64.tar.gz";

console.log("Downloading fpcalc...");
execSync(
  `curl -fsSL "${url}" | tar -xzf - --strip-components=1 -C "${binDir}" --wildcards "*/fpcalc"`,
  { stdio: "inherit" }
);
execSync(`chmod +x "${fpcalcPath}"`);
console.log("fpcalc installed at bin/fpcalc");
