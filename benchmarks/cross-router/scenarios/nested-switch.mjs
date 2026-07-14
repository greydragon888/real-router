// nested-switch — sibling switch under a shared layout chain of DEPTH D (SWEPT
// 1 / 2 / 4 / 8 / 16 / 32, powers of 2, from `?n=`). STEADY-STATE toggle the a↔b leaves at the BOTTOM of the
// chain; every ancestor layout is REUSED, only the leaf swaps — so the curve tests
// whether swap cost stays flat with depth (true parent reuse) or grows (the router
// re-renders the reused chain). Depth lives in the app (nested route tree); the
// driver just navigates to the deep `a` and toggles. Headline per depth =
// `navMsTask@D` (CPU task-time, microtask-inclusive #1451 — carries the sub-ms
// curve without perf.now's ~100µs wall clamp); `navMsWall@D` (endpoint) +
// `scriptMs@D`/`blinkMs@D` diagnostics. Settle = the leaf's `data-n` attribute.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [1, 2, 4, 8, 16, 32]; // shared-layout depth above the a/b switch
const WARMUP_NAVS = 6;
const MEASURE_NAVS = 20;
const BLINK_NAVS = 16;

export const nestedSwitch = {
  name: "nested-switch",
  async run({ page, client, baseURL }) {
    const out = {};

    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const t0 = performance.now();
        for (let i = 0; i < n / 2; i++) {
          document.querySelector('[data-testid="link-sec-b"]').click();
          await settle('[data-testid="page-item"][data-n="b"]');
          document.querySelector('[data-testid="link-sec-a"]').click();
          await settle('[data-testid="page-item"][data-n="a"]');
        }
        return performance.now() - t0;
      }, navs);

    for (const depth of TARGETS) {
      try {
      // parent path of the a/b leaves at this depth: /sec/l2/.../l{depth}
      let parent = "sec";
      for (let k = 2; k <= depth; k++) parent += `/l${k}`;
      // ?n=<depth> → the app builds a depth-deep nested route tree at load.
      await page.goto(new URL(`${parent}/a?n=${depth}`, baseURL).href, {
        waitUntil: "load",
      });
      await page.waitForSelector('[data-testid="page-item"]');
      await page.waitForSelector('[data-testid="link-sec-b"]'); // chain built to bottom

      await drive(WARMUP_NAVS);

      const before = await getMetrics(client);
      const wallTotalMs = await drive(MEASURE_NAVS);
      const after = await getMetrics(client);
      out[`navMsTask@${depth}`] =
        ((after.TaskDuration - before.TaskDuration) * 1000) / MEASURE_NAVS;
      out[`scriptMs@${depth}`] =
        ((after.ScriptDuration - before.ScriptDuration) * 1000) / MEASURE_NAVS;
      out[`blinkMs@${depth}`] =
        (await traceBlinkUs(client, () => drive(BLINK_NAVS))) / BLINK_NAVS / 1000;
      // navMsWall (perf.now ~100µs clamp) only at the deepest, least-quantized point.
      if (depth === TARGETS[TARGETS.length - 1]) {
        out[`navMsWall@${depth}`] = wallTotalMs / MEASURE_NAVS;
      }
      } catch (sweepErr) { console.error(`nested-switch @${depth}: ${sweepErr.message} — skipping this point`); }
    }

    return out;
  },
};
