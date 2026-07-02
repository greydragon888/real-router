// Orchestrator: launch Chromium once, run a scenario warmup+K times (fresh
// context per sample → cold cache / isolated heap), aggregate to median/p95/RME.
import { chromium } from "playwright";

import { attachCDP } from "./cdp.mjs";
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
      const client = await attachCDP(page);

      if (throttle > 1) {
        await client.send("Emulation.setCPUThrottlingRate", { rate: throttle });
      }

      let sample;
      try {
        sample = await scenario.run({ page, client, baseURL });
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
