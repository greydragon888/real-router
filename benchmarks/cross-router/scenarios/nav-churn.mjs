// nav-churn (stress) — hammer N navigations toggling 2 routes; report throughput
// (navs/sec) + retained heap after N navs (forced GC) + per-nav CPU. Now also a
// Blink-history pass → total / nav (script `ScriptDuration` V8 + Blink history,
// which V8 does not count). Heap delta is REPORTED with a healthy baseline, not
// asserted (H2): a flat router does not accumulate per-nav.
import { forceGcHeapBytes, getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const N = 200;
const BLINK_NAVS = 16;

export const navChurn = {
  name: "nav-churn",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="link-about"]');
    await page.waitForSelector('[data-testid="link-home"]');

    const toggle = (n, gap) =>
      page.evaluate(
        async ([count, g]) => {
          const waitFor = async (sel) => {
            for (let t = 0; t < 240; t++) {
              if (document.querySelector(sel)) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`nav-churn: ${sel} not rendered`);
          };
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const start = performance.now();
          for (let i = 0; i < count; i++) {
            const a = i % 2 === 0;
            document
              .querySelector(`[data-testid="${a ? "link-about" : "link-home"}"]`)
              .click();
            await waitFor(`[data-testid="${a ? "page-about" : "page-home"}"]`);
            if (g) await sleep(g);
          }
          return performance.now() - start;
        },
        [n, gap],
      );

    const heapBefore = await forceGcHeapBytes(client);
    const cpuBefore = await getMetrics(client);
    const elapsedMs = await toggle(N, 0);
    const cpuAfter = await getMetrics(client);
    const heapAfter = await forceGcHeapBytes(client);
    const scriptMsPerNav =
      ((cpuAfter.ScriptDuration - cpuBefore.ScriptDuration) * 1000) / N;

    const blinkMsPerNav =
      (await traceBlinkUs(client, () => toggle(BLINK_NAVS, 80))) /
      BLINK_NAVS /
      1000;

    return {
      navsPerSec: (N / elapsedMs) * 1000,
      totalMsPerNav: scriptMsPerNav + blinkMsPerNav,
      scriptMsPerNav,
      blinkMsPerNav,
      heapDeltaKB: (heapAfter - heapBefore) / 1024,
    };
  },
};
