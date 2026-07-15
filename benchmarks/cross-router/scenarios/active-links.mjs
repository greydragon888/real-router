// active-links — per-navigation active-state recompute across a SWEEP of mounted
// link counts (4 / 8 / 16 / … / 256 — log-uniform ×2 steps, so the flat O(1) floor
// and the rising O(N) tail get even coverage). STEADY-STATE toggle /tab/1 ↔ /tab/2; every mounted
// link recomputes active each nav, so cost ∝ link count — the curve is the O(1)
// shared-source (flat) vs O(N) per-link (rising) signal. Link count comes from `?n=`
// (read by the app's links-spec at load), so one app renders any size.
// Headline per size = `navMsTask@N` (CPU task-time, microtask-inclusive #1451 —
// carries the sub-ms curve without perf.now's ~100µs wall clamp); `navMsWall@N`
// (felt, endpoint only) + `scriptMs@N`/`blinkMs@N` kept as diagnostics. Settle = the
// page's `data-n` attribute flip (the N-link recompute + render completes as it flips).
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [4, 8, 16, 32, 64, 128, 256]; // links mounted per page — the active-recompute axis (capped at 256 = the deck's endpoint; each point costs ∝ N × navs, and 512/1024 were ~75% of runtime for points the deck no longer charts)
const WARMUP_NAVS = 6;
const MEASURE_NAVS = 20;
const BLINK_NAVS = 16;

export const activeLinks = {
  name: "active-links",
  async run({ page, client, baseURL }) {
    const out = {};

    const drive = (navs) =>
      page.evaluate(async (n) => {
        const settle = window.__navMetric.settle;
        const t0 = performance.now();
        for (let i = 0; i < n / 2; i++) {
          document.querySelector('[data-testid="link-tab-2"]').click();
          await settle('[data-testid="page-tab"][data-n="2"]');
          document.querySelector('[data-testid="link-tab-1"]').click();
          await settle('[data-testid="page-tab"][data-n="1"]');
        }
        return performance.now() - t0;
      }, navs);

    // Pre-sweep warmup (#1453 class): the first goto in a fresh context is colder than
    // the rest (one-time app parse/compile), so the first swept point reads slightly
    // high vs its warm neighbours. Warm the realm once (goto + WARMUP_NAVS toggles)
    // so every measured point is steady-state.
    try {
      await page.goto(new URL(`tab/1?n=32`, baseURL).href, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="page-tab"]');
      await page.waitForSelector('[data-testid="link-tab-32"]');
      await drive(WARMUP_NAVS);
    } catch (warmErr) {
      console.error(`active-links warmup: ${warmErr.message}`);
    }

    for (const count of TARGETS) {
      try {
      // ?n=<count> → the app's links-spec renders exactly `count` active-aware links.
      await page.goto(new URL(`tab/1?n=${count}`, baseURL).href, {
        waitUntil: "load",
      });
      await page.waitForSelector('[data-testid="page-tab"]');
      await page.waitForSelector(`[data-testid="link-tab-${count}"]`); // all N mounted

      await drive(WARMUP_NAVS);

      const before = await getMetrics(client);
      const wallTotalMs = await drive(MEASURE_NAVS);
      const after = await getMetrics(client);
      out[`navMsTask@${count}`] =
        ((after.TaskDuration - before.TaskDuration) * 1000) / MEASURE_NAVS;
      out[`scriptMs@${count}`] =
        ((after.ScriptDuration - before.ScriptDuration) * 1000) / MEASURE_NAVS;
      out[`blinkMs@${count}`] =
        (await traceBlinkUs(client, () => drive(BLINK_NAVS))) / BLINK_NAVS / 1000;
      // navMsWall (perf.now ~100µs clamp) only at the largest, least-quantized point.
      if (count === TARGETS[TARGETS.length - 1]) {
        out[`navMsWall@${count}`] = wallTotalMs / MEASURE_NAVS;
      }
      } catch (sweepErr) { console.error(`active-links @${count}: ${sweepErr.message} — skipping this point`); }
    }

    return out;
  },
};
