// Orchestrator: launch Chromium once, run a scenario warmup+K times (fresh
// context per sample → cold cache / isolated heap), aggregate to median/p95/RME.
import { chromium } from "playwright";

import { attachCDP, installNavMetric } from "./cdp.mjs";
import { aggregate } from "./stats.mjs";

export async function measure({
  baseURL,
  scenario,
  runs = 30,
  warmup = 5,
  throttle = 0,
}) {
  const browser = await chromium.launch();
  const collected = {};

  try {
    for (let i = 0; i < warmup + runs; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      // Shared per-nav settle detector (window.__navMetric) for every scenario —
      // installed before any app load so it's present on the measured page (#1451).
      await page.addInitScript(installNavMetric);
      const client = await attachCDP(page);

      if (throttle > 1) {
        await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      }

      let sample;
      try {
        sample = await scenario.run({ page, client, baseURL, sampleIndex: i });
      } finally {
        await context.close();
      }

      if (i >= warmup) {
        for (const [key, value] of Object.entries(sample)) {
          (collected[key] ??= []).push(value);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const metrics = {};
  for (const [key, samples] of Object.entries(collected)) {
    metrics[key] = aggregate(samples);
  }

  return {
    runs,
    warmup,
    throttle: throttle > 1 ? `${throttle}x` : "off",
    metrics,
  };
}

// Interleaved matrix measure (#1460): run every cohort engine's samples ROUND-ROBIN in
// one browser session — sample i round rotates the engine order — instead of measuring
// one engine's full cell then the next. Machine drift then hits every engine equally
// (each engine's samples are spread across the whole window, and no engine is fixed
// first), which closes the position-bias class a fixed roster order leaves open. `apps`
// = [{engine, baseURL}]. Returns { engine: {runs, warmup, throttle, metrics} } — one
// cell per engine. An engine whose scenario THROWS is dropped from the interleave (its
// cell is omitted), preserving the per-cell fault isolation the old spawn-per-cell had.
export async function measureInterleaved({
  apps,
  scenario,
  runs = 30,
  warmup = 5,
  throttle = 0,
}) {
  const browser = await chromium.launch();
  const collected = Object.fromEntries(apps.map((a) => [a.engine, {}]));
  const failed = new Set();

  try {
    for (let i = 0; i < warmup + runs; i++) {
      // rotate the order each round so first-position is not a fixed engine either
      const order = apps.map((_, j) => apps[(j + i) % apps.length]);
      for (const app of order) {
        if (failed.has(app.engine)) continue;
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.addInitScript(installNavMetric);
        const client = await attachCDP(page);
        if (throttle > 1) {
          await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
        }

        let sample;
        try {
          sample = await scenario.run({
            page,
            client,
            baseURL: app.baseURL,
            sampleIndex: i,
          });
        } catch (error) {
          failed.add(app.engine);
          console.error(
            `measureInterleaved: ${app.engine} threw (${error.message}) — dropped from the interleave.`,
          );
          continue;
        } finally {
          await context.close();
        }

        if (i >= warmup) {
          for (const [key, value] of Object.entries(sample)) {
            (collected[app.engine][key] ??= []).push(value);
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const results = {};
  for (const app of apps) {
    if (failed.has(app.engine)) continue;
    const metrics = {};
    for (const [key, samples] of Object.entries(collected[app.engine])) {
      metrics[key] = aggregate(samples);
    }
    results[app.engine] = {
      runs,
      warmup,
      throttle: throttle > 1 ? `${throttle}x` : "off",
      metrics,
    };
  }
  return results;
}
