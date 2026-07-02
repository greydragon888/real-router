// nav-latency ⭐ — per-navigation TOTAL main-thread, STEADY-STATE (N navs ÷ N).
// total = script (CDP `ScriptDuration`, V8-only) + Blink history (`history.push
// State`'s `updateForSameDocumentNavigation`, which `ScriptDuration` does NOT
// count). A router that defers to the History API (vue-router calls pushState
// 2×/nav) looks lean on script alone while paying it in Blink — so script-only is
// misleading; total is fair. Two passes: pass 1 clean ScriptDuration (no trace
// overhead), pass 2 traces Blink (its event `dur` is the real work).
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const WARMUP_NAVS = 12;
const SCRIPT_NAVS = 40;
const BLINK_NAVS = 24;

export const navLatency = {
  name: "nav-latency",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-home"]');
    await page.waitForSelector('[data-testid="link-about"]');

    const drive = (navs, gap) =>
      page.evaluate(
        async ([n, g]) => {
          const waitFor = async (sel) => {
            for (let t = 0; t < 240; t++) {
              if (document.querySelector(sel)) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`nav-latency: target never rendered: ${sel}`);
          };
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          for (let i = 0; i < n / 2; i++) {
            document.querySelector('[data-testid="link-about"]').click();
            await waitFor('[data-testid="page-about"]');
            if (g) await sleep(g);
            document.querySelector('[data-testid="link-home"]').click();
            await waitFor('[data-testid="page-home"]');
            if (g) await sleep(g);
          }
        },
        [navs, gap],
      );

    await drive(WARMUP_NAVS, 0);
    await page.waitForSelector('[data-testid="page-home"]');

    const before = await getMetrics(client);
    await drive(SCRIPT_NAVS, 0);
    const after = await getMetrics(client);
    const scriptDurationMs =
      ((after.ScriptDuration - before.ScriptDuration) * 1000) / SCRIPT_NAVS;

    const blinkMs =
      (await traceBlinkUs(client, () => drive(BLINK_NAVS, 80))) /
      BLINK_NAVS /
      1000;

    return { totalMs: scriptDurationMs + blinkMs, scriptDurationMs, blinkMs };
  },
};
