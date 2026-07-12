// nav-churn (stress) — hammer N navigations toggling 2 routes; report throughput
// (navs/sec) + retained heap after N navs (forced GC) + per-nav CPU. Headline: the
// unified wall-clock per-nav (`navMsWall` = elapsed / N — the SAME `performance.now`
// window that yields `navsPerSec`, so `navMsWall = 1000 / navsPerSec` holds BY
// CONSTRUCTION — the wall-bound invariant the old paced `totalMsPerNav` violated,
// F1/#1452) + its ΔTaskDuration twin (`navMsTask`). script/blink kept as DIAGNOSTICS,
// the broken additive `totalMsPerNav = script + blink` retired. With the rAF-poll
// `waitFor` replaced by the precise MutationObserver settle, `navsPerSec` is now the
// REAL throughput (no per-nav frame quantization → no ~121/s cap). Heap delta is
// reported with a healthy baseline, not asserted (H2). ⚠ `heapDeltaKB` (0→200-nav
// retained delta) is WARMUP-DOMINATED, NOT a leak signal (#1462/CL4): a checkpoint
// probe (1/50/200/400/800 navs) found ~80-87% of Δ@200 is non-stationary warmup, and
// it is spread across navs (d@1 is only 16-21% of Δ@200) — a flat router still shows a
// positive Δ here. For a genuine per-nav leak use a two-point Δ (N=200 vs N=800); read
// this number as "warmup footprint", not accumulation.
import { forceGcHeapBytes, getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const N = 200;
const BLINK_NAVS = 16;

export const navChurn = {
  name: "nav-churn",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="link-about"]');
    await page.waitForSelector('[data-testid="link-home"]');

    const toggle = (count) =>
      page.evaluate(async (c) => {
        const settle = window.__navMetric.settle;
        const start = performance.now();
        for (let i = 0; i < c; i++) {
          const a = i % 2 === 0;
          document
            .querySelector(`[data-testid="${a ? "link-about" : "link-home"}"]`)
            .click();
          await settle(`[data-testid="${a ? "page-about" : "page-home"}"]`);
        }
        return performance.now() - start;
      }, count);

    const heapBefore = await forceGcHeapBytes(client);
    const cpuBefore = await getMetrics(client);
    const elapsedMs = await toggle(N);
    const cpuAfter = await getMetrics(client);
    const heapAfter = await forceGcHeapBytes(client);

    const navMsWall = elapsedMs / N;
    const navMsTask =
      ((cpuAfter.TaskDuration - cpuBefore.TaskDuration) * 1000) / N;
    const scriptMsPerNav =
      ((cpuAfter.ScriptDuration - cpuBefore.ScriptDuration) * 1000) / N;

    const blinkMsPerNav =
      (await traceBlinkUs(client, () => toggle(BLINK_NAVS))) /
      BLINK_NAVS /
      1000;

    return {
      navMsWall,
      navMsTask,
      navsPerSec: (N / elapsedMs) * 1000,
      scriptMsPerNav,
      blinkMsPerNav,
      heapDeltaKB: (heapAfter - heapBefore) / 1024,
    };
  },
};
