// param-nav — per-navigation TOTAL when changing :id on the same route component,
// STEADY-STATE: sweep /users/1 → /2 → /3 … (link-user-next advances id by 1),
// N navs ÷ N. total = script (`ScriptDuration`, V8) + Blink history (history.push
// State's `updateForSameDocumentNavigation`, which V8 does not count).
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const SCRIPT_NAVS = 20;
const BLINK_NAVS = 16;
const ALLOC_NAVS = 60;

export const paramNav = {
  name: "param-nav",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("users/1", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-user"]');
    await page.waitForSelector('[data-testid="link-user-next"]');

    const drive = (navs, gap) =>
      page.evaluate(
        async ([n, g]) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const cur = () =>
            document
              .querySelector('[data-testid="page-user"]')
              ?.getAttribute("data-id");
          for (let i = 0; i < n; i++) {
            const prev = cur();
            document.querySelector('[data-testid="link-user-next"]').click();
            let ok = false;
            for (let t = 0; t < 240; t++) {
              if (cur() !== prev) {
                ok = true;
                break;
              }
              await new Promise((r) => requestAnimationFrame(r));
            }
            if (!ok) throw new Error("param-nav: id did not advance");
            if (g) await sleep(g);
          }
        },
        [navs, gap],
      );

    await drive(WARMUP_NAVS, 0);

    const before = await getMetrics(client);
    await drive(SCRIPT_NAVS, 0);
    const after = await getMetrics(client);
    const scriptDurationMs =
      ((after.ScriptDuration - before.ScriptDuration) * 1000) / SCRIPT_NAVS;

    const blinkMs =
      (await traceBlinkUs(client, () => drive(BLINK_NAVS, 80))) /
      BLINK_NAVS /
      1000;

    // Allocation pass — transient bytes/nav (GC pressure), same navs, sampled.
    const allocKBPerNav =
      (await sampleAllocationBytes(client, () => drive(ALLOC_NAVS, 0))) /
      ALLOC_NAVS /
      1024;

    return {
      totalMs: scriptDurationMs + blinkMs,
      scriptDurationMs,
      blinkMs,
      allocKBPerNav,
    };
  },
};
