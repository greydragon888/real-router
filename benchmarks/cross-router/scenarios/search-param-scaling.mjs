// search-param-scaling — QUERY-param handling cost by count (sweep 1 / 10 / 50
// query params, the realistic marketplace/analytics vector — cf. path params which
// top out at ~4). Per size: `scriptMs@N` (V8 query-parse + per-nav floor — read the
// CURVE) + `blinkMs@N` (history.pushState's Blink work) → `totalMs@N` (honest
// absolute). The leaf reads EVERY query VALUE (not just keys), so lazy routers must
// materialize — apples-to-apples "cost to make all params usable". COUNTS mirrors
// SEARCH_COUNTS in apps/_shared/search-param-spec.ts (keep in sync).
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const COUNTS = [1, 10, 50];

export const searchParamScaling = {
  name: "search-param-scaling",
  async run({ page, client, baseURL }) {
    const out = {};

    const navTo = (count) =>
      page.evaluate(async (c) => {
        document.querySelector(`[data-testid="link-search-${c}"]`).click();
        for (let t = 0; t < 240; t++) {
          const el = document.querySelector('[data-testid="page-search"]');
          if (el && el.getAttribute("data-count") === String(c)) return;
          await new Promise((r) => requestAnimationFrame(r));
        }
        throw new Error(`search-param-scaling: ${c} params not rendered`);
      }, count);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-search-${n}"]`);
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
