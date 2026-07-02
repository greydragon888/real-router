// deep-config — matcher + nested-layout composition scaling by DEPTH (sweep depth
// 3 / 30 / 60 / 90 in a 90-level nested chain). Per depth: `scriptMs@D` (V8 matcher
// + composition + per-nav floor — the pure scaling signal, read the CURVE: rising =
// composition cost grows with depth) + `blinkMs@D` (history.pushState Blink) →
// `totalMs@D` (honest absolute). Blink is a per-nav constant (independent of D), so
// `total` = `script` + offset — the depth CURVE survives, the absolute stops misleading.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [3, 30, 60, 90];

export const deepConfig = {
  name: "deep-config",
  async run({ page, client, baseURL }) {
    const out = {};

    const navTo = (depth) =>
      page.evaluate(async (d) => {
        document.querySelector(`[data-testid="link-deep-${d}"]`).click();
        for (let k = 0; k < 240; k++) {
          const el = document.querySelector('[data-testid="page-item"]');
          if (el && el.getAttribute("data-n") === String(d)) return;
          await new Promise((r) => requestAnimationFrame(r));
        }
        throw new Error(`deep-config: depth ${d} not rendered`);
      }, depth);
    const land = async (d) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-deep-${d}"]`);
    };

    await land(TARGETS[0]); // warmup (discarded)
    await getMetrics(client);
    await navTo(TARGETS[0]);

    for (const d of TARGETS) {
      await land(d);
      const before = await getMetrics(client);
      await navTo(d);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      await land(d);
      const blink = (await traceBlinkUs(client, () => navTo(d))) / 1000;

      out[`scriptMs@${d}`] = script;
      out[`blinkMs@${d}`] = blink;
      out[`totalMs@${d}`] = script + blink;
    }

    return out;
  },
};
