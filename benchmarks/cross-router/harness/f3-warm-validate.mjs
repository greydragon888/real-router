// §B mutation-validation for the #1453 sweep warm-up fix. Proves, same-session on
// the REAL sweep app, that the OLD metric (single nav right after a full reload)
// measured the COLD V8 interpreter and the NEW metric (warm the realm first, then
// one nav) measures optimized steady state — AND that the cold penalty is larger for
// heavier-bundle engines, i.e. warming NARROWS the unfair cross-engine gap #1453
// describes. Per sample, from ONE reload: measure the cold first-nav, then warm and
// measure again. No results/ write.
//   node cross-router/harness/f3-warm-validate.mjs <engine> [framework=react] [variant=wide] [target=<sweep endpoint>]
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { build, preview } from "vite";

import { attachCDP, getMetrics, installNavMetric } from "./cdp.mjs";

const [engine, framework = "react", variant = "wide", targetArg] =
  process.argv.slice(2);
if (!engine) {
  console.error(
    "usage: node cross-router/harness/f3-warm-validate.mjs <engine> [framework] [variant] [target]",
  );
  process.exit(1);
}
// Defaults track the LIVE sweep sets (audit 07-18 K20: the old target=1000 and pivots
// 10/100 pointed at points that stopped existing after the 07-14 powers-of-2 reshape —
// the probe timed out unusable exactly when a warm regression needed checking). Keep in
// sync with scenarios/*.mjs TARGETS; a stale point fails loudly (waitForSelector
// timeout on the missing link).
const DEFAULT_TARGET = { wide: "1024", searchparams: "256", deep: "90" };
const TARGET = targetArg ?? DEFAULT_TARGET[variant] ?? "1024";
const WARM_NAVS = 12;
const SAMPLES = 24;
// link/marker prefixes per variant (wide/searchparams use a persistent nav → toggle
// target↔pivot; deep is home-only → home↔D via history.back + settleGone).
const KIND = {
  wide: { link: "link-item", marker: "page-item", attr: "data-n", pivot: "4" },
  searchparams: {
    link: "link-search",
    marker: "page-search",
    attr: "data-count",
    pivot: "1",
  },
  deep: { link: "link-deep", marker: "page-item", attr: "data-n", pivot: null },
};
const k = KIND[variant];
const pivot = k.pivot === TARGET ? (variant === "wide" ? "8" : "2") : k.pivot;

const here = dirname(fileURLToPath(import.meta.url));
const root = `${here}/../apps/${framework}/${engine}/${variant}`;
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
const cold = [];
const warm = [];
for (let s = 0; s < SAMPLES; s++) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(installNavMetric);
  const client = await attachCDP(page);
  await page.goto(baseURL, { waitUntil: "load" });
  await page.waitForSelector(`[data-testid="${k.link}-${TARGET}"]`);

  // A precise nav helper mirroring the scenarios' navTo — closes on the shared
  // MutationObserver settle (frame-quantization-free), the same signal the live
  // sweeps use (the rAF-poll here predated the R2 settle unification — K20).
  const go = (t) =>
    page.evaluate(
      async ([target, link, marker, attr]) => {
        document.querySelector(`[data-testid="${link}-${target}"]`).click();
        await window.__navMetric.settle(
          `[data-testid="${marker}"][${attr}="${target}"]`,
        );
      },
      [t, k.link, k.marker, k.attr],
    );

  // COLD — first nav after the reload (the OLD metric). Axis = ΔTaskDuration, the
  // live sweep headline (ScriptDuration here predated #1451/R2 and is blind to the
  // async engines' microtask work — K20).
  let b = await getMetrics(client);
  await go(TARGET);
  let a = await getMetrics(client);
  cold.push((a.TaskDuration - b.TaskDuration) * 1000);

  // WARM — warm the realm (toggle target↔pivot, or home↔D for deep), then one nav.
  if (variant === "deep") {
    await page.evaluate(
      async ([t, rounds]) => {
        const { settle, settleGone } = window.__navMetric;
        // the cold nav left us on the target; deep's nav is home-only, so pop back
        // to home before warming (the real scenario warms right after land()=home).
        if (document.querySelector('[data-testid="page-item"]')) {
          history.back();
          await settleGone('[data-testid="page-item"]');
        }
        for (let i = 0; i < rounds; i++) {
          document.querySelector(`[data-testid="link-deep-${t}"]`).click();
          await settle(`[data-testid="page-item"][data-n="${t}"]`);
          history.back();
          await settleGone('[data-testid="page-item"]');
        }
      },
      [TARGET, WARM_NAVS / 2],
    );
    // measured nav is home→D (we're on home after the last settleGone)
  } else {
    await page.evaluate(
      async ([t, p, link, marker, attr, rounds]) => {
        const { settle } = window.__navMetric;
        for (let i = 0; i < rounds; i++) {
          document.querySelector(`[data-testid="${link}-${t}"]`).click();
          await settle(`[data-testid="${marker}"][${attr}="${t}"]`);
          document.querySelector(`[data-testid="${link}-${p}"]`).click();
          await settle(`[data-testid="${marker}"][${attr}="${p}"]`);
        }
      },
      [TARGET, pivot, k.link, k.marker, k.attr, WARM_NAVS / 2],
    );
    // we're on pivot; measured nav is pivot→target
  }
  b = await getMetrics(client);
  await go(TARGET);
  a = await getMetrics(client);
  warm.push((a.TaskDuration - b.TaskDuration) * 1000);

  await context.close();
}
await browser.close();
await server.close();

const med = (arr) => {
  const srt = [...arr].sort((x, y) => x - y);
  return srt[Math.floor(srt.length / 2)];
};
const c = med(cold);
const w = med(warm);
console.log(
  `${engine} (${framework}) ${variant} @${TARGET}: cold=${c.toFixed(3)}ms  warm=${w.toFixed(3)}ms  Δ=${(c - w).toFixed(3)}ms  (${((1 - w / c) * 100).toFixed(0)}% lower)`,
);
process.exit(0);
