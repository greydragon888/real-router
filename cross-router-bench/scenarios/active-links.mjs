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
// K10 live-control knob: reverse the sweep order — the residual first-point bump (if
// any survives the sacrificial episode) must FOLLOW the position, not the size.
// Measure-only: write-cell refuses to persist under this knob.
if (process.env.BENCH_REVERSE_TARGETS === "1") TARGETS.reverse();
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

    // Sacrificial first episode (audit 07-18 K10 — replaces the lighter mid-size
    // pre-warm): even WITH a pre-warm, the first measured point read systematically
    // high, and the residual bump is NOT cross-engine-uniform (direction varies by
    // engine), tinting first-point classes. Run the FULL point pipeline once at
    // TARGETS[0] and discard the numbers — every retained point then has an identical
    // warm predecessor. (Live control — TARGETS.reverse() — is the owner's re-run.)
    const POINTS = [TARGETS[0], ...TARGETS]; // POINTS[0] = sacrificial, discarded
    for (const [idx, count] of POINTS.entries()) {
      const record = idx > 0;
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
      if (!record) continue; // sacrificial episode — numbers discarded (K10)
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
