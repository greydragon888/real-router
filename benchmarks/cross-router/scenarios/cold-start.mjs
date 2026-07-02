// cold-start — app init + parse/exec cost to first route painted.
// Fresh context per sample (measure.mjs) → cold cache.
import { getMetrics } from "../harness/cdp.mjs";

export const coldStart = {
  name: "cold-start",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-home"]');

    // Wait for the FCP entry via a buffered observer (reading synchronously
    // races the paint and returns 0 on some loads → bimodal/noisy).
    const fcpMs = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const existing = performance.getEntriesByName(
            "first-contentful-paint",
          )[0];
          if (existing) {
            resolve(existing.startTime);
            return;
          }
          new PerformanceObserver((list, obs) => {
            const entry = list.getEntriesByName("first-contentful-paint")[0];
            if (entry) {
              obs.disconnect();
              resolve(entry.startTime);
            }
          }).observe({ type: "paint", buffered: true });
        }),
    );

    const m = await getMetrics(client);

    return {
      fcpMs,
      scriptDurationMs: m.ScriptDuration * 1000,
      layoutDurationMs: m.LayoutDuration * 1000,
      jsHeapMB: m.JSHeapUsedSize / (1024 * 1024),
    };
  },
};
