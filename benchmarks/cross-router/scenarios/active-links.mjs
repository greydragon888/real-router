// active-links — per-navigation active-state recompute across 100 mounted links,
// STEADY-STATE toggle /tab/1 ↔ /tab/2 (all 100 links recompute active each nav).
// total = script (`ScriptDuration`, V8 — the O(links) recompute + render) + Blink
// history. (Was single-nav script-only — now steady-state + total.)
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const SCRIPT_NAVS = 20;
const BLINK_NAVS = 16;

export const activeLinks = {
  name: "active-links",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("tab/1", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-tab"]');
    await page.waitForSelector('[data-testid="link-tab-2"]');

    const drive = (navs, gap) =>
      page.evaluate(
        async ([n, g]) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const waitN = async (v) => {
            for (let t = 0; t < 240; t++) {
              const el = document.querySelector('[data-testid="page-tab"]');
              if (el && el.getAttribute("data-n") === v) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`active-links: tab ${v} not rendered`);
          };
          for (let i = 0; i < n / 2; i++) {
            document.querySelector('[data-testid="link-tab-2"]').click();
            await waitN("2");
            if (g) await sleep(g);
            document.querySelector('[data-testid="link-tab-1"]').click();
            await waitN("1");
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

    return { totalMs: scriptDurationMs + blinkMs, scriptDurationMs, blinkMs };
  },
};
