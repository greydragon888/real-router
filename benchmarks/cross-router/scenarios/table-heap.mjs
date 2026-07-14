// table-heap — retained JS heap to HOLD a route table of N routes (sweep).
// Each ?n=N is a fresh page → fresh router with N routes; forced GC then read
// JSHeapUsedSize. The @1 point is the React/app floor; the growth @1→@10000 is
// the route table's memory. Memory counterpart to wide-config's CPU sweep:
// real-router trades upfront trie memory for O(1) match — this measures the cost.
import { forceGcHeapBytes } from "../harness/cdp.mjs";

const SIZES = [100]; // single point — route-table heap at 100 routes (realistic app size; charted as a bar)

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
