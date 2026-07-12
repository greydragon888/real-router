// §B merge-gate for the per-nav CPU re-instrumentation (#1451/#1452).
//
// MUTATION kill-test: inject a known busy-loop INSIDE A PROMISE MICROTASK — exactly
// the work `ScriptDuration` is blind to (F2) — and assert the new metric SEES it
// LINEARLY (detect-AND-scale) while ΔScriptDuration stays flat. Two things at once:
//   1. proves the new headline (navMsWall / navMsTask) captures microtask work;
//   2. independently RE-CONFIRMS F2 (if ScriptDuration caught it, the fix would be
//      unnecessary — so a "blind" verdict here is a positive result).
// Relative/binary (Δ between inject levels on ONE machine in seconds) → load-tolerant,
// unlike the competitive bench. Do NOT merge the re-instrumentation without this green.
//
//   node cross-router/harness/validate-per-nav-metric.mjs
import { chromium } from "playwright";

import { attachCDP, getMetrics, installNavMetric } from "./cdp.mjs";

const HTML = `<!doctype html><html><body><div id="root"></div><script>
  window.__gen = 0;
  window.__delayMs = 0;
  window.__nav = function () {
    var target = ++window.__gen;
    // Router-analogue work in a PROMISE MICROTASK — the F2 blind spot.
    Promise.resolve().then(function () {
      var end = performance.now() + window.__delayMs;
      while (performance.now() < end) { /* busy-loop CPU inside the microtask */ }
      var el = document.createElement('div');
      el.setAttribute('data-testid', 'nav-' + target);
      document.getElementById('root').replaceChildren(el);
    });
  };
<\/script></body></html>`;

const NAVS = 40;

async function measureAt(page, delayMs) {
  await page.evaluate((d) => {
    window.__delayMs = d;
  }, delayMs);

  const wallTotal = await page.evaluate(async (n) => {
    const settle = window.__navMetric.settle;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const next = window.__gen + 1;
      window.__nav();
      await settle(`[data-testid="nav-${next}"]`);
    }
    return performance.now() - t0;
  }, NAVS);

  return wallTotal;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await page.setContent(HTML);
await page.evaluate(installNavMetric); // install window.__navMetric directly
await page.waitForFunction(() => typeof window.__nav === "function");
const client = await attachCDP(page);

await measureAt(page, 0); // warmup

const rows = [];
for (const d of [0, 2, 4]) {
  const before = await getMetrics(client);
  const wallTotal = await measureAt(page, d);
  const after = await getMetrics(client);
  rows.push({
    d,
    wall: wallTotal / NAVS,
    task: ((after.TaskDuration - before.TaskDuration) * 1000) / NAVS,
    script: ((after.ScriptDuration - before.ScriptDuration) * 1000) / NAVS,
  });
}
await browser.close();

console.log("inject(ms) | navMsWall | navMsTask | scriptDurationMs");
for (const r of rows) {
  console.log(
    `  ${String(r.d).padEnd(8)} |  ${r.wall.toFixed(3)}    |  ${r.task.toFixed(3)}    |  ${r.script.toFixed(3)}`,
  );
}

const [base, mid, hi] = rows;
const dWall = hi.wall - base.wall; // expect ≈ 4 ms
const dTask = hi.task - base.task; // expect ≈ 4 ms
const dScript = hi.script - base.script; // expect ≈ 0 (F2 blind spot)
const ratio = dWall > 0 ? (mid.wall - base.wall) / dWall : 0; // expect ≈ 0.5

const checks = [
  [dWall >= 3, `navMsWall sees the 4 ms inject (Δ=${dWall.toFixed(2)} ms, want ≥3)`],
  [dTask >= 3, `navMsTask sees the 4 ms inject (Δ=${dTask.toFixed(2)} ms, want ≥3)`],
  [
    ratio > 0.25 && ratio < 0.75,
    `navMsWall scales LINEARLY (2ms/4ms ratio=${ratio.toFixed(2)}, want ~0.5)`,
  ],
  [
    dScript < 1,
    `ScriptDuration BLIND to microtask work (Δ=${dScript.toFixed(2)} ms <1) — re-confirms F2`,
  ],
];

console.log("");
let failed = 0;
for (const [ok, msg] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${msg}`);
  if (!ok) failed++;
}

if (failed) {
  console.error(
    `\n✗ kill-test FAILED (${failed}/4) — do NOT trust the new metric; re-instrument.`,
  );
  process.exit(1);
}
console.log(
  "\n✓ kill-test PASSED — new metric captures microtask work linearly; ScriptDuration confirmed blind (F2).",
);
process.exit(0);
