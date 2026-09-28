// search-param-scaling — QUERY-param handling cost by count (sweep 1 … 256 query
// params, the realistic marketplace/analytics vector — cf. path params which top out
// at ~4). Headline per size = the UNIFIED wall-clock click→DOM-settle (`navMsWall@N`,
// felt) + its ΔTaskDuration twin (`navMsTask@N`) — both capture the microtask-flush
// work `ScriptDuration` is BLIND to (#1451: lazy routers materialize query values in a
// reactive microtask). `scriptMs@N` is a ⚠ DIAGNOSTIC (V8-only), `blinkMs@N` a
// diagnostic; the additive `totalMs@N` is RETIRED. The leaf reads EVERY query VALUE
// (not just keys) so lazy routers must materialize — apples-to-apples "cost to make all
// params usable". Read the CURVE. COUNTS mirrors SEARCH_COUNTS in
// apps/_shared/search-param-spec.ts (keep in sync).
//
// ONE-REALM measurement (supersedes the per-point-reload #1453 warm). Unlike the
// depth/link-count sweeps, search-param's count is CLIENT-navigable — clicking
// link-search-N rewrites the query with no page reload — so every point is measured in
// a SINGLE page load: goto once, warm the realm across the whole count range, then time
// each pivot→N nav IN that warm realm. This removes the first-point elevation the old
// per-point `land()` reload caused: each `land()` started a fresh V8 realm (JIT feedback
// + ICs gone), so the first swept point was measured coldest and read ~1.3× its steady
// cost — a per-point-cold-realm artifact the in-realm `warm()` could NOT remove (the
// next `land()` destroyed it). A direction/position probe confirmed all single-nav
// transitions are symmetric ~0.19 ms in a warmed realm. Absolutes now reflect the true
// steady-state per-nav cost; the flat-then-O(count) SHAPE is unchanged. (The
// depth/link-count sweeps can't do this — their N is a load-time param, so per-point
// reload stays forced. Their residual first-point bump proved NOT cross-engine-uniform
// — audit 07-18 K10: rr 1.08–1.69×, sv-router up to 2.2×, direction varies by engine —
// so nested/active/wide now run a sacrificial first episode at TARGETS[0], discarded,
// before the measured sweep; search itself is one-realm and immune.)
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const COUNTS = [1, 2, 4, 8, 16, 32, 64, 128, 256];
const WARM_PASSES = 5; // full sweeps of the count range to tier-up the realm before measuring
// 60→20 (2026-07-19): the toggle navs are rAF-poll-paced (≥1 frame each — ~17 ms on a
// 60 Hz headless runner), so this pass dominated the scenario's runtime (~65% local).
// Same-session A/B ×3 vue engines certified the cut: Δ(20 vs 60) = −0.78%/+0.09%/+0.32%
// (rr/vue-router/tanstack), each inside its arm's 95% CI; fixed per-window overhead
// F≈3 KB ⇒ +0.1 KB/nav (<0.1%); per-sample RME grows ×√3 to ≤0.3% (gate 15). The
// window still starts at `lo` (post-setup) so every sampled nav is real and the 50/50
// hi↔lo mix (K8) is unchanged.
const ALLOC_NAVS = 20;

export const searchParamScaling = {
  name: "search-param-scaling",
  async run({ page, client, baseURL }) {
    const out = {};

    // One nav to search-`count`, timed click→settle (perf.now) — settle closes on the
    // async render flush so wall AND ΔTaskDuration capture the reactive materialization
    // microtask ScriptDuration misses (#1451). Returns wall ms.
    const navTo = (count) =>
      page.evaluate(async (c) => {
        const t0 = performance.now();
        document.querySelector(`[data-testid="link-search-${c}"]`).click();
        await window.__navMetric.settle(
          `[data-testid="page-search"][data-count="${c}"]`,
        );
        return performance.now() - t0;
      }, count);

    // Load ONCE, then warm the whole realm across the count range so every measured
    // point below is timed in a fully tiered-up realm (no per-point reload → no
    // first-point cold-realm bump).
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector(`[data-testid="link-search-${COUNTS[0]}"]`);
    for (let p = 0; p < WARM_PASSES; p++) {
      for (const c of COUNTS) await navTo(c);
    }

    for (const n of COUNTS) {
      try {
        const pivot = n === COUNTS[0] ? COUNTS[1] : COUNTS[0];
        // Reach `pivot` via a REAL n→pivot transition — never a no-op click on the
        // count we're already on (that leaves a transient bleeding into the very next
        // measured window). navTo(n) first guarantees pivot is arrived at from a
        // different count, so every point's measured nav is a clean pivot→N.
        await navTo(n);
        await navTo(pivot);

        // measured pass — ONE nav pivot→N: wall + task + script (⚠ diag).
        const before = await getMetrics(client);
        const wallMs = await navTo(n);
        const after = await getMetrics(client);
        out[`navMsTask@${n}`] =
          (after.TaskDuration - before.TaskDuration) * 1000;
        out[`scriptMs@${n}`] =
          (after.ScriptDuration - before.ScriptDuration) * 1000;

        // Blink diagnostic — same nav from the same pivot, traced (pushState work).
        await navTo(pivot);
        out[`blinkMs@${n}`] =
          (await traceBlinkUs(client, () => navTo(n))) / 1000;

        // navMsWall is perf.now clamp-quantized (~100 µs) → emit ONLY at the endpoint
        // (largest, least-quantized point; matches the report row) so the noisy small
        // points don't flood rme-gate. navMsTask@N (unclamped) carries the curve.
        if (n === COUNTS[COUNTS.length - 1]) out[`navMsWall@${n}`] = wallMs;
      } catch (sweepErr) {
        console.error(
          `search-param-scaling @${n}: ${sweepErr.message} — skipping this point`,
        );
      }
    }

    // Allocation pass — same warm realm; GC pressure of high-count query handling
    // (@max <-> @min toggle; both leaves read ALL their values). The eager-vs-lazy
    // allocation contrast: eager immutable params reference URL-parsed strings (flat)
    // while parse / validate / structural-share pipelines produce O(count) garbage.
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
      await navTo(hi); // establish in-realm (was land(hi) — no reload needed)
      await driveToggle(8); // warmup (discarded)
      out.allocKBPerNav =
        (await sampleAllocationBytes(client, () => driveToggle(ALLOC_NAVS))) /
        ALLOC_NAVS /
        1024;
    } catch (allocErr) {
      console.error(
        `search-param-scaling alloc @${hi}: ${allocErr.message} — skipping allocKBPerNav`,
      );
    }

    return out;
  },
};
