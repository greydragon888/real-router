// cold-start — app init + parse/exec cost to first route painted, at a SINGLE small
// route count (10, from `?n=`) — charted as a BAR, not a sweep (the boot floor is flat
// 1→1000; the trie-build term only dominates at large tables, which we don't chart here).
// Reuses the tableheap variant app
// (builds N synthetic routes, renders one minimal view — so boot cost = bundle parse
// + build N-route tree + first match + one paint, WITHOUT an N-link render muddying
// it). The curve separates the FIXED bundle-parse cost from the trie-build term
// (#1106): flat = boot is bundle-bound, rising = the route tree dominates at scale.
//
// COLD semantics: each measure.mjs sample is a fresh context (cold cache), so every
// sample is a genuine cold boot at 10 routes (n = runs). `sampleIndex` rotation over
// SIZES is retained for when a multi-size sweep is wanted, but degenerates to size 10
// with a single-entry SIZES.
//
// Heap is read RETAINED (post-GC), not raw (#1454): `JSHeapUsedSize` right after FCP
// includes transient boot garbage (~19-28%, engine-dependent). One
// `HeapProfiler.collectGarbage` yields the true retained footprint; raw pre-GC kept as
// `jsHeapPreGcMB` (diagnostic).
import { forceGcHeapBytes, getMetrics } from "../harness/cdp.mjs";

const SIZES = [10]; // single boot point — cold start at 10 routes (realistic small app; charted as a bar)

export const coldStart = {
  name: "cold-start",
  async run({ page, client, baseURL, sampleIndex = 0 }) {
    const n = SIZES[sampleIndex % SIZES.length]; // one cold size per sample
    try {
    const url = new URL(baseURL);
    url.searchParams.set("n", String(n));
    await page.goto(url.href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-ready"]');

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
    // Retained footprint after one full GC — read AFTER raw metrics so jsHeapPreGcMB
    // captures the pre-GC used heap (boot garbage incl).
    const retainedBytes = await forceGcHeapBytes(client);

    return {
      [`fcpMs@${n}`]: fcpMs,
      [`scriptDurationMs@${n}`]: m.ScriptDuration * 1000,
      // ΔTaskDuration twin (audit 07-18 K2-option): script-only inherits the F2 class
      // (blind to promise-microtask boot work of async engines), so the boot-CPU story
      // carries both axes; fcpMs above stays the felt axis.
      [`taskDurationMs@${n}`]: m.TaskDuration * 1000,
      [`jsHeapMB@${n}`]: retainedBytes / (1024 * 1024),
      [`jsHeapPreGcMB@${n}`]: m.JSHeapUsedSize / (1024 * 1024),
    };
    } catch (coldErr) {
      console.error(`cold-start @${n}: ${coldErr.message} — skipping this sample`);
      return {};
    }
  },
};
