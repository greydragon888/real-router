#!/usr/bin/env node
/**
 * Bundle-size measurement for vs-tanstack fixtures. Builds are done separately
 * (vite build per fixture); this script measures the emitted client JS of every
 * built fixture and prints a comparison table in raw/gzip/brotli. Gzip is the
 * primary competitive signal (matches TanStack's bundle-size methodology).
 *
 * Run from the benchmarks/ workspace root:
 *   node vs-tanstack/bundle-size/measure.mjs
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const ENGINES = ["real-router", "tanstack"];
const FRAMEWORKS = ["react", "vue", "solid"];
const VARIANTS = ["minimal", "full"];

function measureDist(distDir) {
  if (!existsSync(distDir)) {
    return undefined;
  }

  const assetsDir = join(distDir, "assets");
  const dir = existsSync(assetsDir) ? assetsDir : distDir;
  const files = readdirSync(dir).filter((file) => file.endsWith(".js"));

  let raw = 0;
  let gzip = 0;
  let brotli = 0;

  for (const file of files) {
    const content = readFileSync(join(dir, file));

    raw += content.length;
    gzip += gzipSync(content).length;
    brotli += brotliCompressSync(content, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
  }

  return { raw, gzip, brotli, chunks: files.length };
}

function kib(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const rows = [];

for (const framework of FRAMEWORKS) {
  for (const variant of VARIANTS) {
    const measured = {};

    for (const engine of ENGINES) {
      measured[engine] = measureDist(
        `vs-tanstack/bundle-size/${engine}/${framework}/${variant}/dist`,
      );
    }

    rows.push({ framework, variant, measured });
  }
}

console.log("\n=== vs-tanstack bundle-size (client JS, gzip = primary) ===\n");
console.log(
  "fixture".padEnd(26) +
    "raw".padStart(11) +
    "gzip".padStart(11) +
    "brotli".padStart(11) +
    "chunks".padStart(8),
);

for (const { framework, variant, measured } of rows) {
  for (const engine of ENGINES) {
    const m = measured[engine];
    const label = `${engine} ${framework} ${variant}`;

    console.log(
      label.padEnd(26) +
        (m ? kib(m.raw).padStart(11) : "—".padStart(11)) +
        (m ? kib(m.gzip).padStart(11) : "—".padStart(11)) +
        (m ? kib(m.brotli).padStart(11) : "—".padStart(11)) +
        (m ? String(m.chunks).padStart(8) : "—".padStart(8)),
    );
  }

  const [a, b] = ENGINES.map((engine) => measured[engine]);

  if (a && b) {
    const delta = a.gzip - b.gzip;
    const sign = delta < 0 ? "" : "+";

    console.log(
      `  → real-router − tanstack (gzip): ${sign}${kib(delta)}`.padEnd(26) +
        "\n",
    );
  }
}
