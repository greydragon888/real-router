// search-param-scaling — QUERY-param handling cost by count (sweep 1 … 256
// query params, the realistic marketplace/analytics vector — cf. path params which
// top out at ~4). Headline per size = the UNIFIED wall-clock click→DOM-settle
// (`navMsWall@N`, felt) + its ΔTaskDuration twin (`navMsTask@N`) — both capture the
// microtask-flush work `ScriptDuration` is BLIND to (#1451, which matters here: lazy
// routers materialize query values in a reactive microtask). `scriptMs@N` is a ⚠
// DIAGNOSTIC (V8-only) and `blinkMs@N` a diagnostic; the additive `totalMs@N` is
// RETIRED. The leaf reads EVERY query VALUE (not just keys), so lazy routers must
// materialize — apples-to-apples "cost to make all params usable". Read the CURVE.
// COUNTS mirrors SEARCH_COUNTS in apps/_shared/search-param-spec.ts (keep in sync).
//
// STEADY-STATE, not cold first-nav (#1453): every `land()` is a full reload that
// resets V8 to interpreted code, so a single post-reload nav measured the cold
// interpreter (per-engine penalty poisons cross-engine @N absolutes). Fix: warm the
// realm with WARM_NAVS in-document navs (toggling count↔pivot via the persistent nav)
// before the ONE measured nav — the query-parse cost is source-independent, so the
// count CURVE is unchanged; only the cold-JIT floor is removed.
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const COUNTS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring
const ALLOC_NAVS = 60;

export const searchParamScaling = {
  name: "search-param-scaling",
  async run({ page, client, baseURL }) {
    const out = {};

    // One optimized nav to search-`count`, timed click→settle (perf.now) — settle
    // closes on the async render flush so wall AND ΔTaskDuration capture the reactive
    // materialization microtask ScriptDuration misses (#1451). Returns wall ms.
    const navTo = (count) =>
      page.evaluate(async (c) => {
        const t0 = performance.now();
        document.querySelector(`[data-testid="link-search-${c}"]`).click();
        await window.__navMetric.settle(
          `[data-testid="page-search"][data-count="${c}"]`,
        );
        return performance.now() - t0;
      }, count);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-search-${n}"]`);
    };
    // Warm V8 in-realm by toggling count↔pivot (both parse-exercising navs via the
    // persistent nav), ending on pivot so the measured navTo(n) is one optimized
    // pivot→N nav. Settles only on the universal `page-search[data-count]` (#1453).
    const warm = (count, pivot) =>
      page.evaluate(
        async ([c, p, rounds]) => {
          const { settle } = window.__navMetric;
          for (let i = 0; i < rounds; i++) {
            document.querySelector(`[data-testid="link-search-${c}"]`).click();
            await settle(`[data-testid="page-search"][data-count="${c}"]`);
            document.querySelector(`[data-testid="link-search-${p}"]`).click();
            await settle(`[data-testid="page-search"][data-count="${p}"]`);
          }
        },
        [count, pivot, WARM_NAVS / 2],
      );

    // Pre-sweep warmup (#1453 first-point): the per-point warm() tiers up the nav path,
    // but TurboFan tier-up ACCUMULATES across points — the first measured point (@1)
    // has the fewest accumulated nav executions in the isolate and reads ~1.2-2.5x high
    // (worst on heavier frameworks: angular ~2.5x). One extra land+warm cycle before the
    // loop lifts point 1 to the same steady state as its neighbours.
    try {
      await land(COUNTS[0]);
      await warm(COUNTS[0], COUNTS[1]);
    } catch (warmErr) {
      console.error(`search-param-scaling pre-warmup: ${warmErr.message}`);
    }

    for (const n of COUNTS) {
      try {
      const pivot = n === COUNTS[0] ? COUNTS[1] : COUNTS[0];
      await land(n);
      await warm(n, pivot); // ends on pivot, realm optimized

      // measured pass — ONE optimized pivot→N nav: wall + task + script (⚠ diag).
      const before = await getMetrics(client);
      const wallMs = await navTo(n);
      const after = await getMetrics(client);
      const navMsTask =
        (after.TaskDuration - before.TaskDuration) * 1000;
      const scriptMs = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // Blink diagnostic — same nav from the same pivot, traced (pushState work).
      await navTo(pivot); // reset N→pivot
      const blinkMs = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`navMsTask@${n}`] = navMsTask;
      out[`scriptMs@${n}`] = scriptMs;
      out[`blinkMs@${n}`] = blinkMs;
      // navMsWall is perf.now clamp-quantized (~100 µs) → emit ONLY at the endpoint
      // (largest, least-quantized point; matches the report row) so the noisy small
      // points don't flood rme-gate. navMsTask@N (unclamped) carries the curve.
      if (n === COUNTS[COUNTS.length - 1]) out[`navMsWall@${n}`] = wallMs;
      } catch (sweepErr) { console.error(`search-param-scaling @${n}: ${sweepErr.message} — skipping this point`); }
    }

    // Allocation pass — GC pressure of high-count query handling (@max <-> @min
    // toggle; both leaves read ALL their values). The eager-vs-lazy allocation
    // contrast: eager immutable params reference URL-parsed strings (flat) while
    // parse / validate / structural-share pipelines produce O(count) garbage.
    const hi = COUNTS[COUNTS.length - 1];
    const lo = COUNTS[0]; // pivot leaf (lowest count)
    const driveToggle = (navs) =>
      page.evaluate(
        async ([n, h, l]) => {
          const waitCount = async (c) => {
            for (let t = 0; t < 240; t++) {
              const el = document.querySelector('[data-testid="page-search"]');
              if (el && el.getAttribute("data-count") === String(c)) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`search-param alloc: ${c} params not rendered`);
          };
          for (let i = 0; i < n / 2; i++) {
            document.querySelector(`[data-testid="link-search-${h}"]`).click();
            await waitCount(h);
            document.querySelector(`[data-testid="link-search-${l}"]`).click();
            await waitCount(l);
          }
        },
        [navs, hi, lo],
      );

    try {
      await land(hi);
      await driveToggle(8); // warmup (discarded)
      out.allocKBPerNav =
        (await sampleAllocationBytes(client, () => driveToggle(ALLOC_NAVS))) /
        ALLOC_NAVS /
        1024;
    } catch (allocErr) {
      console.error(`search-param-scaling alloc @${hi}: ${allocErr.message} — skipping allocKBPerNav`);
    }

    return out;
  },
};
