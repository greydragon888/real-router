// back-forward — per-navigation TOTAL main-thread for BROWSER back/forward
// (popstate), STEADY-STATE (N navs ÷ N). Every other scenario drives pushState
// FORWARD (link clicks); this is the distinct popstate code path — one of the
// most common real operations, and a different path in every router (rr:
// browser-plugin popstate listener → match → transition; competitors: their own).
//
// total = script (CDP `ScriptDuration`, V8) + Blink history. Pilot (2026-07-07)
// confirmed back/forward fires the SAME `updateForSameDocumentNavigation` event
// traceBlinkUs already sums — so the metric is directly comparable to nav-latency.
// NOTE the Blink component is HONESTLY heavier for real-router here: its
// browser-plugin calls `history.replaceState` on every popstate (to re-sync its
// `{name,params,path}` history.state), firing a SECOND same-document-navigation
// event per nav (2 events/nav vs 1 for tanstack/react-router). That real extra
// history work is what `blinkMs` captures — a genuine back/forward cost, not an
// artifact.
import {
  getMetrics,
  sampleAllocationBytes,
  traceBlinkUs,
} from "../harness/cdp.mjs";

const WARMUP_NAVS = 12;
const SCRIPT_NAVS = 40;
const BLINK_NAVS = 24;
const ALLOC_NAVS = 60;

export const backForward = {
  name: "back-forward",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="page-home"]');
    await page.waitForSelector('[data-testid="link-about"]');

    // Build a 2-entry history stack [home, about], currently on /about, so
    // history.back() ↔ history.forward() toggles between two adjacent entries
    // without growing the stack (steady-state popstate, no push).
    await page.evaluate(() =>
      document.querySelector('[data-testid="link-about"]').click(),
    );
    await page.waitForSelector('[data-testid="page-about"]');

    const drive = (navs, gap) =>
      page.evaluate(
        async ([n, g]) => {
          const waitFor = async (sel) => {
            for (let t = 0; t < 240; t++) {
              if (document.querySelector(sel)) return;
              await new Promise((r) => requestAnimationFrame(r));
            }
            throw new Error(`back-forward: target never rendered: ${sel}`);
          };
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
          // Each iteration is 2 navs: back → /home, forward → /about. Starts and
          // ends on /about, so consecutive drives chain (warmup ends forward'd).
          for (let i = 0; i < n / 2; i++) {
            history.back();
            await waitFor('[data-testid="page-home"]');
            if (g) await sleep(g);
            history.forward();
            await waitFor('[data-testid="page-about"]');
            if (g) await sleep(g);
          }
        },
        [navs, gap],
      );

    await drive(WARMUP_NAVS, 0);
    await page.waitForSelector('[data-testid="page-about"]');

    const before = await getMetrics(client);
    await drive(SCRIPT_NAVS, 0);
    const after = await getMetrics(client);
    const scriptDurationMs =
      ((after.ScriptDuration - before.ScriptDuration) * 1000) / SCRIPT_NAVS;

    const blinkMs =
      (await traceBlinkUs(client, () => drive(BLINK_NAVS, 80))) /
      BLINK_NAVS /
      1000;

    const allocKBPerNav =
      (await sampleAllocationBytes(client, () => drive(ALLOC_NAVS, 0))) /
      ALLOC_NAVS /
      1024;

    return {
      totalMs: scriptDurationMs + blinkMs,
      scriptDurationMs,
      blinkMs,
      allocKBPerNav,
    };
  },
};
