// nested-switch — sibling switch under a shared layout (reuse axis), STEADY-STATE
// toggle /sec/a ↔ /sec/b; the shared SectionLayout + ancestors are REUSED, only the
// leaf swaps. Headline: unified wall-clock click→DOM-settle (`navMsWall`) + its
// ΔTaskDuration twin (`navMsTask`) — capture async engines' microtask flush (#1451)
// + Blink pushState (#1452); script/blink kept as DIAGNOSTICS, the broken additive
// `totalMs = script + blink` retired. Settle = the leaf's `data-n` ATTRIBUTE.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const MEASURE_NAVS = 20;
const BLINK_NAVS = 16;

export const nestedSwitch = {
  name: "nested-switch",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("sec/a", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-item"]');
    await page.waitForSelector('[data-testid="link-sec-b"]');

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
