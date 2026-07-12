// search-param-scaling — QUERY-param handling cost by count (sweep 1 / 10 / 50
// query params, the realistic marketplace/analytics vector — cf. path params which
// top out at ~4). Per size: `scriptMs@N` (V8 query-parse + per-nav floor — read the
// CURVE) + `blinkMs@N` (history.pushState's Blink work) → `totalMs@N` (honest
// absolute). The leaf reads EVERY query VALUE (not just keys), so lazy routers must
// materialize — apples-to-apples "cost to make all params usable". COUNTS mirrors
// SEARCH_COUNTS in apps/_shared/search-param-spec.ts (keep in sync).
//
// STEADY-STATE, not cold first-nav (#1453): every `land()` is a full reload that
// resets V8 to interpreted code, so a single post-reload nav measured the cold
// interpreter (per-engine penalty poisons cross-engine @N absolutes). Fix: warm the
// realm with WARM_NAVS in-document navs (toggling count↔pivot via the persistent
// nav) before the ONE measured nav — the query-parse cost is source-independent, so
// the count CURVE is unchanged; only the cold-JIT floor is removed.
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const COUNTS = [1, 10, 50];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring
const ALLOC_NAVS = 60;

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

    for (const n of COUNTS) {
      const pivot = n === COUNTS[0] ? COUNTS[1] : COUNTS[0];
      await land(n);
      await warm(n, pivot); // ends on pivot, realm optimized

      // script pass — one optimized pivot→N nav, clean ScriptDuration (untraced)
      const before = await getMetrics(client);
      await navTo(n);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // Blink pass — same nav from the same pivot, traced (history.pushState work)
      await navTo(pivot); // reset N→pivot
      const blink = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`scriptMs@${n}`] = script;
      out[`blinkMs@${n}`] = blink;
      out[`totalMs@${n}`] = script + blink;
    }

    // Allocation pass — GC pressure of high-count query handling (@max <-> @1
    // toggle; both leaves read ALL their values). The eager-vs-lazy allocation
    // contrast: eager immutable params reference URL-parsed strings (flat) while
    // parse / validate / structural-share pipelines produce O(count) garbage.
    const hi = COUNTS[COUNTS.length - 1];
    const driveToggle = (navs) =>
      page.evaluate(
        async ([n, h]) => {
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
            document.querySelector('[data-testid="link-search-1"]').click();
            await waitCount(1);
          }
        },
        [navs, hi],
      );

    await land(hi);
    await driveToggle(8); // warmup (discarded)
    out.allocKBPerNav =
      (await sampleAllocationBytes(client, () => driveToggle(ALLOC_NAVS))) /
      ALLOC_NAVS /
      1024;

    return out;
  },
};
