// wide-config — matcher scaling by WIDTH (sweep item-10 / -100 / -1000 in a flat
// 1000-route table). Per size: `scriptMs@N` (V8 matcher + per-nav floor — the pure
// matcher-scaling signal: flat = O(1)/trie, rising = O(N)/scan) + `blinkMs@N`
// (history.pushState Blink) → `totalMs@N` (honest absolute). Blink is a per-nav
// constant (independent of N), so `total` = `script` + offset — the matcher CURVE
// survives, the absolute stops misleading.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [10, 100, 1000];

export const wideConfig = {
  name: "wide-config",
  async run({ page, client, baseURL }) {
    const out = {};

    const navTo = (target) =>
      page.evaluate(async (t) => {
        document.querySelector(`[data-testid="link-item-${t}"]`).click();
        for (let k = 0; k < 240; k++) {
          const el = document.querySelector('[data-testid="page-item"]');
          if (el && el.getAttribute("data-n") === String(t)) return;
          await new Promise((r) => requestAnimationFrame(r));
        }
        throw new Error(`wide-config: item ${t} not rendered`);
      }, target);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-item-${n}"]`);
    };

    await land(TARGETS[0]); // warmup (discarded)
    await getMetrics(client);
    await navTo(TARGETS[0]);

    for (const n of TARGETS) {
      await land(n);
      const before = await getMetrics(client);
      await navTo(n);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      await land(n);
      const blink = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`scriptMs@${n}`] = script;
      out[`blinkMs@${n}`] = blink;
      out[`totalMs@${n}`] = script + blink;
    }

    return out;
  },
};
