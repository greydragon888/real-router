// wide-config — matcher scaling by WIDTH (sweep item-10 / -100 / -1000 in a flat
// 1000-route table). Per size: `scriptMs@N` (V8 matcher + per-nav floor — the pure
// matcher-scaling signal: flat = O(1)/trie, rising = O(N)/scan) + `blinkMs@N`
// (history.pushState Blink) → `totalMs@N` (honest absolute). Blink is a per-nav
// constant (independent of N), so `total` = `script` + offset — the matcher CURVE
// survives, the absolute stops misleading.
//
// STEADY-STATE, not cold first-nav (#1453): measure.mjs runs each sample in a fresh
// context, and every `land()` is a full `page.goto` reload that resets V8 to
// baseline/interpreted code — so a single post-reload nav measured the INTERPRETER,
// not the optimized steady state a real app pays, and the per-engine cold penalty
// (larger for heavier bundles) poisoned the cross-engine @N absolutes. Fix: warm the
// realm with WARM_NAVS in-document navs (toggling target↔pivot via the persistent
// nav) before the ONE measured nav. Matcher cost is source-independent, so the width
// signal is unchanged; only the cold-JIT floor is removed. The old top-of-run warmup
// was dead — the loop's first `land()` reload wiped it.
import { getMetrics, traceBlinkUs } from "../harness/cdp.mjs";

const TARGETS = [10, 100, 1000];
const WARM_NAVS = 12; // in-realm navs to reach optimized steady state before measuring

export const wideConfig = {
  name: "wide-config",
  async run({ page, client, baseURL }) {
    const out = {};

    const navTo = (target) =>
      page.evaluate(async (t) => {
        document.querySelector(`[data-testid="link-item-${t}"]`).click();
        for (let k = 0; k < 240; k++) {
          const el = document.querySelector('[data-testid="page-item"]');
          if (el && el.getAttribute("data-n") === String(t)) return;
          await new Promise((r) => requestAnimationFrame(r));
        }
        throw new Error(`wide-config: item ${t} not rendered`);
      }, target);
    const land = async (n) => {
      await page.goto(baseURL, { waitUntil: "load" });
      await page.waitForSelector(`[data-testid="link-item-${n}"]`);
    };
    // Warm V8 in-realm by toggling target↔pivot (both matcher-exercising navs via
    // the persistent nav), ending on pivot so the measured navTo(n) is one optimized
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
      const pivot = n === TARGETS[0] ? TARGETS[1] : TARGETS[0];
      await land(n);
      await warm(n, pivot); // ends on pivot, realm optimized

      // script pass — one optimized pivot→N nav, clean ScriptDuration (untraced)
      const before = await getMetrics(client);
      await navTo(n);
      const after = await getMetrics(client);
      const script = (after.ScriptDuration - before.ScriptDuration) * 1000;

      // blink pass — same nav from the same pivot, traced (history.pushState work)
      await navTo(pivot); // reset N→pivot
      const blink = (await traceBlinkUs(client, () => navTo(n))) / 1000;

      out[`scriptMs@${n}`] = script;
      out[`blinkMs@${n}`] = blink;
      out[`totalMs@${n}`] = script + blink;
    }

    return out;
  },
};
