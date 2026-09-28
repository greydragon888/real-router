// table-heap — ISOLATED route-table memory via a self-floor (deck's "Route-table memory").
// Each ?n=N is a fresh page → fresh router with N routes; forced GC then read JSHeapUsedSize.
// We measure TWO points and let deck-extract subtract them: @1 = the app/engine floor (bare
// framework + router engine + 1 route), @256 = that plus 255 more routes. The delta
// (@256 − @1) is the route table's own retained heap — the framework shell AND the engine
// floor cancel out, leaving just the matcher's data structure (trie vs ranked list). Memory
// counterpart to wide-config's CPU sweep: real-router trades upfront trie memory for O(1)
// match — this measures exactly that cost, isolated, in the browser.
import { forceGcHeapBytes } from "../harness/cdp.mjs";

const SIZES = [1, 256]; // @1 = engine/app floor · @256 = +255 routes; deck-extract charts the delta (route-table KB)

export const tableHeap = {
  name: "table-heap",
  async run({ page, baseURL, client }) {
    const out = {};
    for (const n of SIZES) {
      try {
      const url = new URL(baseURL);
      url.searchParams.set("n", String(n));
      await page.goto(url.href, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="page-ready"]');
      // settle a frame, then forced GC for a stable retained-heap read
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      );
      const bytes = await forceGcHeapBytes(client);
      out[`jsHeapMB@${n}`] = bytes / (1024 * 1024);
      } catch (sweepErr) { console.error(`table-heap @${n}: ${sweepErr.message} — skipping this point`); }
    }
    return out;
  },
};
