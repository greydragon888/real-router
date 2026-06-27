#!/usr/bin/env node
/**
 * Bundle-size measurement for vs-tanstack fixtures. Builds are done separately
 * (vite build per fixture); this script measures the emitted client JS.
 *
 * TWO metrics, because the raw total is misleading on its own:
 *  - TOTAL client JS — the whole app bundle, framework runtime included. This is
 *    what TanStack's bundle-size methodology reports, but it is dominated by the
 *    framework (react-dom ~59 KB gzip, vue ~23 KB, solid ~3 KB), so the absolute
 *    number looks huge and hides the router's actual contribution.
 *  - ROUTER-ATTRIBUTABLE = total − framework baseline (the `_baseline/<fw>`
 *    fixture: same framework, "hello world", no router). This is the real
 *    "size of the router + adapter" and the PRIMARY competitive signal here.
 *
 * Gzip is the primary compression metric. Run from the benchmarks/ workspace:
 *   node vs-tanstack/bundle-size/measure.mjs
 * (build every fixture incl. _baseline/<fw> first, e.g. via the vite build loop)
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const ENGINES = ["real-router", "tanstack"];
const FRAMEWORKS = ["react", "vue", "solid"];
const VARIANTS = ["minimal", "full"];
const ROOT = "vs-tanstack/bundle-size";

function measureDist(distDir) {
  const assetsDir = join(distDir, "assets");
  const dir = existsSync(assetsDir) ? assetsDir : distDir;

  if (!existsSync(dir)) {
    return undefined;
  }

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

const baseline = {};

for (const framework of FRAMEWORKS) {
  baseline[framework] = measureDist(`${ROOT}/_baseline/${framework}/dist`);
}

console.log("\n=== framework runtime baseline (gzip, no router) ===\n");
for (const framework of FRAMEWORKS) {
  const b = baseline[framework];

  console.log(`  ${framework.padEnd(6)} ${b ? kib(b.gzip) : "— (not built)"}`);
}

console.log(
  "\n=== ROUTER-ATTRIBUTABLE (primary) = total − framework baseline ===\n",
);
console.log(
  "fixture".padEnd(26) +
    "total".padStart(10) +
    "router gz".padStart(11) +
    "router br".padStart(11),
);

for (const framework of FRAMEWORKS) {
  const base = baseline[framework];

  for (const variant of VARIANTS) {
    const measured = {};

    for (const engine of ENGINES) {
      const m = measureDist(`${ROOT}/${engine}/${framework}/${variant}/dist`);
      measured[engine] = m;

      const label = `${engine} ${framework} ${variant}`;
      const routerGz = m && base ? kib(m.gzip - base.gzip) : "—";
      const routerBr = m && base ? kib(m.brotli - base.brotli) : "—";

      console.log(
        label.padEnd(26) +
          (m ? kib(m.gzip) : "—").padStart(10) +
          routerGz.padStart(11) +
          routerBr.padStart(11),
      );
    }

    const [a, b] = ENGINES.map((engine) => measured[engine]);

    if (a && b && base) {
      const delta = a.gzip - b.gzip; // framework baseline cancels in the delta
      const sign = delta < 0 ? "" : "+";

      console.log(
        `  → real-router − tanstack (router gzip): ${sign}${kib(delta)}\n`,
      );
    }
  }
}
