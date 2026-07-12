// cold-start — app init + parse/exec cost to first route painted.
// Fresh context per sample (measure.mjs) → cold cache.
//
// Heap is read RETAINED (post-GC), not raw (#1454): `JSHeapUsedSize` right after FCP
// includes the transient boot garbage (parse/exec/init allocations not yet collected)
// — ~19-28% of the reading, and that fraction DIFFERS per engine, so the raw number
// conflated footprint with garbage and produced misleading cross-engine gaps (the
// angular "real-router heavier heap" was a garbage differential — retained is parity).
// One `HeapProfiler.collectGarbage` (the same proven-stable path table-heap/nav-churn
// use, RME < 0.01%) after the FCP wait yields the true retained footprint. The raw
// pre-GC reading is kept as `jsHeapPreGcMB` (boot transient pressure — diagnostic).
import { forceGcHeapBytes, getMetrics } from "../harness/cdp.mjs";

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
    // Retained footprint after one full GC — the honest heap headline. Read AFTER the
    // raw metrics so `jsHeapPreGcMB` captures the pre-GC used heap (boot garbage incl).
    const retainedBytes = await forceGcHeapBytes(client);

    return {
      fcpMs,
      scriptDurationMs: m.ScriptDuration * 1000,
      // layoutDurationMs dropped (#1462): consumed by no table, ~identical across all
      // engines incl. _baseline (zero router signal) — a dead key, not a real axis.
      jsHeapMB: retainedBytes / (1024 * 1024),
      jsHeapPreGcMB: m.JSHeapUsedSize / (1024 * 1024),
    };
  },
};
