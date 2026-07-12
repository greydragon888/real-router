// active-links — per-navigation active-state recompute across 100 mounted links,
// STEADY-STATE toggle /tab/1 ↔ /tab/2 (all 100 links recompute active each nav).
// Headline: unified wall-clock click→DOM-settle (`navMsWall`) + its ΔTaskDuration
// twin (`navMsTask`) — capture async engines' microtask flush (#1451) + Blink
// pushState (#1452); script/blink kept as DIAGNOSTICS, the broken additive
// `totalMs = script + blink` retired. Settle = the page's `data-n` ATTRIBUTE (the
// 100-link recompute + render completes as that leaf attribute flips).
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const MEASURE_NAVS = 20;
const BLINK_NAVS = 16;

export const activeLinks = {
  name: "active-links",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("tab/1", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-tab"]');
    await page.waitForSelector('[data-testid="link-tab-2"]');

    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const t0 = performance.now();
        for (let i = 0; i < n / 2; i++) {
          document.querySelector('[data-testid="link-tab-2"]').click();
          await settle('[data-testid="page-tab"][data-n="2"]');
          document.querySelector('[data-testid="link-tab-1"]').click();
          await settle('[data-testid="page-tab"][data-n="1"]');
        }
        return performance.now() - t0;
      }, navs);

    await drive(WARMUP_NAVS);

    const before = await getMetrics(client);
    const wallTotalMs = await drive(MEASURE_NAVS);
    const after = await getMetrics(client);
    const navMsWall = wallTotalMs / MEASURE_NAVS;
    const navMsTask =
      ((after.TaskDuration - before.TaskDuration) * 1000) / MEASURE_NAVS;
    const scriptDurationMs =
      ((after.ScriptDuration - before.ScriptDuration) * 1000) / MEASURE_NAVS;

    const blinkMs =
      (await traceBlinkUs(client, () => drive(BLINK_NAVS))) / BLINK_NAVS / 1000;

    return { navMsWall, navMsTask, scriptDurationMs, blinkMs };
  },
};
