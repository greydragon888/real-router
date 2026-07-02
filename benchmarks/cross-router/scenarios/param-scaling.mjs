// param-scaling — matcher param-extraction cost by PARAM COUNT (sweep 1 / 10 /
// 100 path params). Per size: `scriptMs@N` (V8 matcher + per-nav floor — the pure
// matcher-scaling signal, read the CURVE) + `blinkMs@N` (history.pushState's Blink
// work) → `totalMs@N` (honest absolute, so cross-router gaps aren't a ScriptDuration
// illusion). The matcher SHAPE lives in `script`; `total` just adds the ~constant
// per-nav Blink, so the curve survives while the absolute stops misleading.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const COUNTS = [1, 10, 100];

export const paramScaling = {
  name: "param-scaling",
  async run({ page, client, baseURL }) {
    const out = {};

    const navTo = (count) =>
      page.evaluate(async (c) => {
        document.querySelector(`[data-testid="link-param-${c}"]`).click();
        for (let t = 0; t < 240; t++) {
          const el = document.querySelector('[data-testid="page-param"]');
          if (el && el.getAttribute("data-count") === String(c)) return;
          await new Promise((r) => requestAnimationFrame(r));
        }
        throw new Error(`param-scaling: ${c} params not rendered`);
      }, count);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-param-${n}"]`);
    };

    await land(COUNTS[0]); // warmup (discarded)
    await getMetrics(client);
    await navTo(COUNTS[0]);

    for (const n of COUNTS) {
      // script pass — clean ScriptDuration (no tracing overhead)
      await land(n);
      const before = await getMetrics(client);
      await navTo(n);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // Blink pass — same nav, fresh load, traced (history.pushState work)
      await land(n);
      const blink = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`scriptMs@${n}`] = script;
      out[`blinkMs@${n}`] = blink;
      out[`totalMs@${n}`] = script + blink;
    }

    return out;
  },
};
