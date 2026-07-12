// §B settle-symmetry probe for the per-nav re-instrumentation (#1451/#1452).
//
// `navMsWall` closes its window at the FIRST matching DOM mutation (target appears).
// If an engine keeps mutating the DOM AFTER that (post-mount effects: Vue onMounted,
// Solid post-insert effects), the settle point sits before the work finishes — a
// per-engine fairness risk (R2). This probes, on the REAL app, per nav: the settle
// point (click→first-target-mutation) vs the full window (click→DOM quiet for ≥Q ms).
// tail = window − settle.
//   tail_ratio < ~10%  → settle-at-target is FAIR (post-target work negligible).
//   tail_ratio > ~10%  → the engine works past the target; the metric's total/N
//                        absorbs it into the next nav, but flag it (per-nav view is
//                        skewed; consider a task-boundary / double-rAF settle point).
// Run across a sync engine (near-0 tail expected) and the async ones (the concern).
//   node cross-router/harness/settle-symmetry-probe.mjs <engine> [framework=react]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build, preview } from "vite";

import { attachCDP, installNavMetric } from "./cdp.mjs";

const [engine, framework = "react"] = process.argv.slice(2);
if (!engine) {
  console.error(
    "usage: node cross-router/harness/settle-symmetry-probe.mjs <engine> [framework=react]",
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const root = `${here}/../apps/${framework}/${engine}`; // nav-latency uses the base app
const configFile = `${root}/vite.config.ts`;

await build({ root, configFile, logLevel: "warn" });
const server = await preview({
  root,
  configFile,
  preview: { port: 0 },
  logLevel: "warn",
});
const baseURL = server.resolvedUrls.local[0];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.addInitScript(installNavMetric);
await attachCDP(page);
await page.goto(baseURL, { waitUntil: "load" });
await page.waitForSelector('[data-testid="page-home"]');

const NAVS = 24;
const samples = await page.evaluate(async (n) => {
  const QUIET = 16; // ms of no DOM mutation after the target = settled
  const results = [];
  const one = async (clickSel, targetSel) => {
    const t0 = performance.now();
    let firstTarget = null;
    let lastMut = t0;
    const obs = new MutationObserver(() => {
      lastMut = performance.now();
      if (firstTarget === null && document.querySelector(targetSel)) {
        firstTarget = lastMut;
      }
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    document.querySelector(clickSel).click();
    const deadline = t0 + 2000;
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      if (firstTarget !== null && now - lastMut >= QUIET) break;
      if (now > deadline) break;
    }
    obs.disconnect();
    const settle = (firstTarget ?? lastMut) - t0;
    const windowMs = lastMut - t0;
    return { settle, windowMs, tail: windowMs - settle };
  };
  for (let i = 0; i < 4; i++) {
    await one('[data-testid="link-about"]', '[data-testid="page-about"]');
    await one('[data-testid="link-home"]', '[data-testid="page-home"]');
  }
  for (let i = 0; i < n / 2; i++) {
    results.push(
      await one('[data-testid="link-about"]', '[data-testid="page-about"]'),
    );
    results.push(
      await one('[data-testid="link-home"]', '[data-testid="page-home"]'),
    );
  }
  return results;
}, NAVS);

await browser.close();
await server.close();

const med = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const settle = med(samples.map((s) => s.settle));
const windowMs = med(samples.map((s) => s.windowMs));
const tail = med(samples.map((s) => s.tail));
const ratio = windowMs > 0 ? tail / windowMs : 0;

console.log(
  `${engine} (${framework}): settle=${settle.toFixed(3)}ms  window=${windowMs.toFixed(3)}ms  tail=${tail.toFixed(3)}ms  tail_ratio=${(ratio * 100).toFixed(1)}%`,
);
console.log(
  ratio < 0.1
    ? "  ✓ settle-at-target FAIR (post-target DOM work <10% of window)"
    : "  ⚠ tail >10% — engine keeps mutating past the target; per-nav view skewed (total/N absorbs it into the next nav)",
);
process.exit(0);
