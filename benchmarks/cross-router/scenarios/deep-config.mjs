// deep-config — matcher + nested-layout composition scaling by DEPTH (sweep depth
// 3 / 30 / 60 / 90 in a 90-level nested chain). Headline per depth = the UNIFIED
// wall-clock click→DOM-settle (`navMsWall@D`, felt) + its ΔTaskDuration twin
// (`navMsTask@D`) — both capture the microtask-flush work `ScriptDuration` is BLIND
// to (#1451), which is load-bearing here: async-scheduling engines (@solidjs/router,
// vue-router, @tanstack/solid-router) do their composition in a microtask, so the old
// `scriptMs@D` under-counted them and printed a FALSE flat curve ("solid-router flat
// vs rr O(depth)") the audit flagged as instrumental. `scriptMs@D` is kept as a ⚠
// DIAGNOSTIC and `blinkMs@D` as a diagnostic; the additive `totalMs@D` is RETIRED.
// Read the CURVE: rising = composition cost grows with depth.
//
// STEADY-STATE, not cold first-nav (#1453): every `land()` is a full reload that
// resets V8 to interpreted code, so a single post-reload nav measured the cold
// interpreter (per-engine penalty poisons cross-engine @D absolutes). Fix: warm the
// realm with WARM_NAVS in-document home↔D round-trips before the ONE measured nav.
// Deep's nav is home-only (gone on a target), so the return leg is `history.back()`
// and "back on home" is detected by the target VANISHING (settleGone) — a universal
// signal. The measured nav stays exactly home→D, just optimized and settle-timed.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [3, 30, 60, 90];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring

export const deepConfig = {
  name: "deep-config",
  async run({ page, client, baseURL }) {
    const out = {};

    // One optimized home→D nav, timed click→settle (perf.now) — settle closes on the
    // async composition flush so wall AND ΔTaskDuration capture the microtask work
    // ScriptDuration misses (#1451). Returns wall ms.
    const navTo = (depth) =>
      page.evaluate(async (d) => {
        const t0 = performance.now();
        document.querySelector(`[data-testid="link-deep-${d}"]`).click();
        await window.__navMetric.settle(
          `[data-testid="page-item"][data-n="${d}"]`,
        );
        return performance.now() - t0;
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

      // measured pass — ONE optimized home→D nav: wall + task + script (⚠ diag).
      const before = await getMetrics(client);
      const wallMs = await navTo(d);
      const after = await getMetrics(client);
      const navMsTask =
        (after.TaskDuration - before.TaskDuration) * 1000;
      const scriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // blink diagnostic — same home→D nav, traced (history.pushState work).
      await backHome(); // reset D→home
      const blinkMs = (await traceBlinkUs(client, () => navTo(d))) / 1000;

      out[`navMsWall@${d}`] = wallMs;
      out[`navMsTask@${d}`] = navMsTask;
      out[`scriptMs@${d}`] = scriptMs;
      out[`blinkMs@${d}`] = blinkMs;
    }

    return out;
  },
};
