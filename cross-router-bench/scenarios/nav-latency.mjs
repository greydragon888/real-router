// nav-latency ⭐ — per-navigation cost, STEADY-STATE (N navs ÷ N). Headline is a
// UNIFIED wall-clock window click→DOM-settle (`navMsWall`) plus its ΔTaskDuration
// twin (`navMsTask`) — both capture the microtask-flush work `ScriptDuration` is
// BLIND to (#1451) AND the Blink `pushState` inside the click task (#1452). The old
// additive `totalMs = script + blink` headline was doubly broken (blink measured in
// a paced idle pass → DVFS/E-core-wake-inflated ~5–15×; script blind to async
// engines' microtask work) and is RETIRED. `scriptDurationMs` / `blinkMs` stay as
// DIAGNOSTIC rows (never summed) — the two-factor split is what surfaced #1353 and
// vue's 2×-pushState, so the diagnostics are kept, only the headline changes.
// Pilot navMsWall (felt) vs navMsTask (main-thread task time): with the rAF-poll
// `waitFor` gone (→ MutationObserver settle in cdp.mjs), the driver floor is SMALL —
// the MO callback (× mutation batch) + a `querySelector` per settle — not literally
// zero, but symmetric across engines and visible in `_baseline`, so it does not skew
// the ranking. Merge-gate: harness/validate-per-nav-metric.mjs.
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const WARMUP_NAVS = 12;
const MEASURE_NAVS = 40;
const BLINK_NAVS = 24;
const ALLOC_NAVS = 60;

export const navLatency = {
  name: "nav-latency",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-home"]');
    await page.waitForSelector('[data-testid="link-about"]');

    // One nav = click a link, await its target via the shared MutationObserver
    // settle (precise, gap=0 — no frame quantization, no idle pacing). Returns the
    // summed wall time (ms); caller ÷ N. perf.now's ~100 µs clamp averages out over N.
    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const t0 = performance.now();
        for (let i = 0; i < n / 2; i++) {
          document.querySelector('[data-testid="link-about"]').click();
          await settle('[data-testid="page-about"]');
          document.querySelector('[data-testid="link-home"]').click();
          await settle('[data-testid="page-home"]');
        }
        return performance.now() - t0;
      }, navs);

    await drive(WARMUP_NAVS);
    await page.waitForSelector('[data-testid="page-home"]');

    // Measured pass (gap=0, untraced): wall (perf.now) + Task + Script from ONE
    // same-mode window — the unified metric plus its diagnostics.
    const before = await getMetrics(client);
    const wallTotalMs = await drive(MEASURE_NAVS);
    const after = await getMetrics(client);
    const navMsWall = wallTotalMs / MEASURE_NAVS;
    const navMsTask =
      ((after.TaskDuration - before.TaskDuration) * 1000) / MEASURE_NAVS;
    const scriptDurationMs =
      ((after.ScriptDuration - before.ScriptDuration) * 1000) / MEASURE_NAVS;

    // Blink diagnostic — gap=0 (same mode as everything else): the honest pushState
    // signal, no idle-wake inflation (#1452). Small by design.
    const blinkMs =
      (await traceBlinkUs(client, () => drive(BLINK_NAVS))) / BLINK_NAVS / 1000;

    const allocKBPerNav =
      (await sampleAllocationBytes(client, () => drive(ALLOC_NAVS))) /
      ALLOC_NAVS /
      1024;

    return { navMsWall, navMsTask, scriptDurationMs, blinkMs, allocKBPerNav };
  },
};
