// back-forward — per-navigation cost for BROWSER back/forward (popstate),
// STEADY-STATE (N navs ÷ N). Every other scenario drives pushState FORWARD (link
// clicks); this is the distinct popstate code path — one of the commonest real ops,
// a different path in every router (rr: browser-plugin popstate listener → match →
// transition; competitors: their own).
//
// Headline: unified wall-clock click→DOM-settle (`navMsWall`) + its ΔTaskDuration
// twin (`navMsTask`) — capture async engines' microtask flush (#1451) + Blink
// history (#1452); script/blink kept as DIAGNOSTICS, the broken additive `totalMs =
// script + blink` retired. NOTE `blinkMs` is HONESTLY heavier for real-router here:
// its browser-plugin calls `history.replaceState` on every popstate to re-sync its
// `{name,params,path}` history.state, firing a SECOND `updateForSameDocumentNavi
// gation` per nav (2 events/nav vs 1 for tanstack/react-router) — a genuine back/
// forward cost the diagnostic still surfaces.
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const WARMUP_NAVS = 12;
const MEASURE_NAVS = 40;
const BLINK_NAVS = 24;
const ALLOC_NAVS = 60;

export const backForward = {
  name: "back-forward",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-home"]');
    await page.waitForSelector('[data-testid="link-about"]');

    // Build a 2-entry history stack [home, about], currently on /about, so
    // history.back() ↔ history.forward() toggles two adjacent entries without
    // growing the stack (steady-state popstate, no push).
    await page.evaluate(() =>
      document.querySelector('[data-testid="link-about"]').click(),
    );
    await page.waitForSelector('[data-testid="page-about"]');

    // Each iteration is 2 navs: back → /home, forward → /about. Starts and ends on
    // /about, so consecutive drives chain (warmup ends forward'd).
    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const t0 = performance.now();
        for (let i = 0; i < n / 2; i++) {
          history.back();
          await settle('[data-testid="page-home"]');
          history.forward();
          await settle('[data-testid="page-about"]');
        }
        return performance.now() - t0;
      }, navs);

    await drive(WARMUP_NAVS);
    await page.waitForSelector('[data-testid="page-about"]');

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
