// wide-config — matcher scaling by WIDTH (sweep item-10 / -100 / -1000 in a flat
// 1000-route table). Headline per size = the UNIFIED wall-clock click→DOM-settle
// (`navMsWall@N`, felt) + its ΔTaskDuration twin (`navMsTask@N`) — both capture the
// microtask-flush work `ScriptDuration` is BLIND to (#1451) AND the Blink pushState
// inside the click task (#1452). `scriptMs@N` is kept as a ⚠ DIAGNOSTIC (V8-only,
// undercounts async engines) and `blinkMs@N` as a diagnostic; the old additive
// `totalMs@N = script + blink` is RETIRED (same reasons as the per-nav scenarios).
// Read the CURVE: flat = O(1)/trie, rising = O(N)/scan — the width signal.
//
// STEADY-STATE, not cold first-nav (#1453): measure.mjs runs each sample in a fresh
// context, and every `land()` is a full `page.goto` reload that resets V8 to
// baseline/interpreted code — so a single post-reload nav measured the INTERPRETER,
// not the optimized steady state, and the per-engine cold penalty poisoned the @N
// absolutes. Fix: warm the realm with WARM_NAVS in-document navs (toggling
// target↔pivot via the persistent nav) before the ONE measured nav; matcher cost is
// source-independent, so the width signal is unchanged and only the cold-JIT floor is
// removed. The measured nav closes on the shared MutationObserver settle (gap=0), the
// same signal the per-nav scenarios use — no rAF-poll frame quantization.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [4, 8, 16, 32, 64, 128, 256, 512, 1024];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring

export const wideConfig = {
  name: "wide-config",
  async run({ page, client, baseURL }) {
    const out = {};

    // One optimized nav to `target` via the persistent nav, timed click→settle
    // (perf.now). The MutationObserver settle closes the window on the async render
    // flush, so wall AND ΔTaskDuration capture the microtask work ScriptDuration
    // misses (#1451). Returns the wall ms (perf.now's ~100 µs clamp is medianed out
    // over the sample runs). Replaces the frame-quantized rAF-poll navTo.
    const navTo = (target) =>
      page.evaluate(async (t) => {
        const t0 = performance.now();
        document.querySelector(`[data-testid="link-item-${t}"]`).click();
        await window.__navMetric.settle(
          `[data-testid="page-item"][data-n="${t}"]`,
        );
        return performance.now() - t0;
      }, target);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-item-${n}"]`);
    };
    // Warm V8 in-realm by toggling target↔pivot (both matcher-exercising navs via the
    // persistent nav), ending on pivot so the measured navTo(n) is one optimized
    // pivot→N nav. Settles only on the universal `page-item[data-n]` marker (#1453).
    const warm = (target, pivot) =>
      page.evaluate(
        async ([t, p, rounds]) => {
          const { settle } = window.__navMetric;
          for (let i = 0; i < rounds; i++) {
            document.querySelector(`[data-testid="link-item-${t}"]`).click();
            await settle(`[data-testid="page-item"][data-n="${t}"]`);
            document.querySelector(`[data-testid="link-item-${p}"]`).click();
            await settle(`[data-testid="page-item"][data-n="${p}"]`);
          }
        },
        [target, pivot, WARM_NAVS / 2],
      );

    for (const n of TARGETS) {
      try {
      const pivot = n === TARGETS[0] ? TARGETS[1] : TARGETS[0];
      await land(n);
      await warm(n, pivot); // ends on pivot, realm optimized

      // measured pass — ONE optimized pivot→N nav: wall (felt) + task (microtask-
      // inclusive) + script (⚠ V8-only diagnostic) from one window.
      const before = await getMetrics(client);
      const wallMs = await navTo(n);
      const after = await getMetrics(client);
      const navMsTask =
        (after.TaskDuration - before.TaskDuration) * 1000;
      const scriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // blink diagnostic — same nav from the same pivot, traced (pushState work).
      await navTo(pivot); // reset N→pivot
      const blinkMs = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`navMsTask@${n}`] = navMsTask;
      out[`scriptMs@${n}`] = scriptMs;
      out[`blinkMs@${n}`] = blinkMs;
      // navMsWall is perf.now clamp-quantized (~100 µs) → emit ONLY at the endpoint
      // (largest, least-quantized point; matches the report row) so the noisy small
      // points don't flood rme-gate. navMsTask@N (unclamped) carries the curve.
      if (n === TARGETS[TARGETS.length - 1]) out[`navMsWall@${n}`] = wallMs;
      } catch (sweepErr) { console.error(`wide-config @${n}: ${sweepErr.message} — skipping this point`); }
    }

    return out;
  },
};
