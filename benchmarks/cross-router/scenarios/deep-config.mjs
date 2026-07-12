// deep-config — matcher + nested-layout composition scaling by DEPTH (sweep depth
// 3 / 30 / 60 / 90 in a 90-level nested chain). Per depth: `scriptMs@D` (V8 matcher
// + composition + per-nav floor — the pure scaling signal, read the CURVE: rising =
// composition cost grows with depth) + `blinkMs@D` (history.pushState Blink) →
// `totalMs@D` (honest absolute). Blink is a per-nav constant (independent of D), so
// `total` = `script` + offset — the depth CURVE survives, the absolute stops misleading.
//
// STEADY-STATE, not cold first-nav (#1453): every `land()` is a full reload that
// resets V8 to interpreted code, so a single post-reload nav measured the cold
// interpreter (per-engine penalty poisons cross-engine @D absolutes). Fix: warm the
// realm with WARM_NAVS in-document home↔D round-trips before the ONE measured nav.
// Deep's nav is home-only (gone on a target), so the return leg is `history.back()`
// and "back on home" is detected by the target VANISHING (settleGone) — a universal
// signal, since every engine renders `page-item[data-n=D]` only on the target. The
// measured nav stays exactly home→D (identical semantics), just optimized.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [3, 30, 60, 90];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring

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
    // Warm V8 in-realm by round-tripping home↔D (click → settle target, back →
    // settleGone target = home), ending on home so the measured navTo(d) is one
    // optimized home→D nav — identical semantics, just no cold-JIT floor (#1453).
    const warm = (depth) =>
      page.evaluate(
        async ([d, rounds]) => {
          const { settle, settleGone } = window.__navMetric;
          for (let i = 0; i < rounds; i++) {
            document.querySelector(`[data-testid="link-deep-${d}"]`).click();
            await settle(`[data-testid="page-item"][data-n="${d}"]`);
            history.back();
            await settleGone('[data-testid="page-item"]');
          }
        },
        [depth, WARM_NAVS / 2],
      );
    // D→home (for the blink pass launch): pop back, wait for the target to vanish.
    const backHome = () =>
      page.evaluate(() => {
        history.back();
        return window.__navMetric.settleGone('[data-testid="page-item"]');
      });

    for (const d of TARGETS) {
      await land(d); // on home
      await warm(d); // ends on home, realm optimized

      // script pass — one optimized home→D nav, clean ScriptDuration (untraced)
      const before = await getMetrics(client);
      await navTo(d);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // blink pass — same home→D nav, traced (history.pushState work)
      await backHome(d); // reset D→home
      const blink = (await traceBlinkUs(client, () => navTo(d))) / 1000;

      out[`scriptMs@${d}`] = script;
      out[`blinkMs@${d}`] = blink;
      out[`totalMs@${d}`] = script + blink;
    }

    return out;
  },
};
