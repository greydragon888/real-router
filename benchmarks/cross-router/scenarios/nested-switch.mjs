// nested-switch — sibling switch under a shared layout (reuse axis), STEADY-STATE
// toggle /sec/a ↔ /sec/b; the shared SectionLayout + ancestors are REUSED, only
// the leaf swaps. total = script (`ScriptDuration`, V8) + Blink history. Low total
// ≈ good partial re-render + cheap history.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const WARMUP_NAVS = 6;
const SCRIPT_NAVS = 20;
const BLINK_NAVS = 16;

export const nestedSwitch = {
  name: "nested-switch",
  async run({ page, client, baseURL }) {
    await page.goto(new URL("sec/a", baseURL).href, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-item"]');
    await page.waitForSelector('[data-testid="link-sec-b"]');

    const drive = (navs, gap) =>
      page.evaluate(
        async ([n, g]) => {
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          const waitN = async (v) => {
            for (let t = 0; t < 240; t++) {
              const el = document.querySelector('[data-testid="page-item"]');
              if (el && el.getAttribute("data-n") === v) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`nested-switch: sibling ${v} not rendered`);
          };
          for (let i = 0; i < n / 2; i++) {
            document.querySelector('[data-testid="link-sec-b"]').click();
            await waitN("b");
            if (g) await sleep(g);
            document.querySelector('[data-testid="link-sec-a"]').click();
            await waitN("a");
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
