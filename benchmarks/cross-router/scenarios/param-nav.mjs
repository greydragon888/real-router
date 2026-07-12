// param-nav — per-navigation cost changing :id on the same route component,
// STEADY-STATE sweep /users/1 → /2 → /3 … (link-user-next advances id by 1),
// N navs ÷ N. Headline: unified wall-clock click→DOM-settle (`navMsWall`) + its
// ΔTaskDuration twin (`navMsTask`) — both capture async engines' microtask flush
// (#1451) AND the Blink pushState inside the click task (#1452). script/blink are
// kept as DIAGNOSTIC rows; the doubly-broken additive `totalMs = script + blink`
// headline is RETIRED. Settle here is the `data-id` ATTRIBUTE advancing to the
// next value (same component, new data — not an element swap).
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const MEASURE_NAVS = 20;
const BLINK_NAVS = 16;
const ALLOC_NAVS = 60;

export const paramNav = {
  name: "param-nav",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("users/1", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-user"]');
    await page.waitForSelector('[data-testid="link-user-next"]');

    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const cur = () =>
          document
            .querySelector('[data-testid="page-user"]')
            .getAttribute("data-id");
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          const next = String(Number(cur()) + 1);
          document.querySelector('[data-testid="link-user-next"]').click();
          await settle(`[data-testid="page-user"][data-id="${next}"]`);
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

    const allocKBPerNav =
      (await sampleAllocationBytes(client, () => drive(ALLOC_NAVS))) /
      ALLOC_NAVS /
      1024;

    return { navMsWall, navMsTask, scriptDurationMs, blinkMs, allocKBPerNav };
  },
};
