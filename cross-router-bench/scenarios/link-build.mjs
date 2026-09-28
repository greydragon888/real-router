// link-build — elapsed time to mount N <Link>s at once, SWEPT 4 / 8 / … / 256
// (log-uniform ×2 steps — even coverage of the flat floor and the rising mount-cost tail;
// link count comes from `?n=` at load). Each Link builds its href via the
// router's reverse-matcher (buildPath / generatePath / buildLocation), so this
// isolates href-construction + Link render from route construction (done once at
// startup). A real cost for link-heavy pages: nav menus, sitemaps, paginated lists.
// The CURVE shows whether mount cost is linear in link count and the SHAPE of the
// component-<Link>-vs-plain-<a> gap (constant factor or growing).
//
// Measured as WALL-CLOCK from the mount click to the last link in the DOM: a
// MutationObserver resolves on the microtask that inserts `last-link`, so no RAF
// frame wait inflates it. This replaced the old `ScriptDuration` delta (#1418),
// which is BLIND to engines that mount asynchronously — Vue schedules its render
// on a microtask scheduler, so its link-build work lands outside the
// synchronous-task V8 script accounting: `ScriptDuration` read ~0.2 ms for every
// Vue engine regardless of the real ~3–25 ms of work, and even INVERTED with
// load (more work → lower number). Wall-clock captures every engine's real mount
// cost and ≈ the old `ScriptDuration` for the synchronous cohorts
// (react/solid/svelte/angular mount in-task, so wall ≈ script there — the
// numbers barely move; only Vue is un-blinded).
const TARGETS = [4, 8, 16, 32, 64, 128, 256]; // links mounted per page — the mount-cost axis (capped at 256 = the deck's endpoint; 512/1024 were ~75% of runtime for points the deck no longer charts)

export const linkBuild = {
  name: "link-build",
  async run({ page, baseURL }) {
    const out = {};

    // Mount N links, resolving with the wall-clock ms from click to the Nth link in
    // the DOM (a MutationObserver fires on the microtask that inserts `last-link`).
    const mountMeasure = () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
            const btn = document.querySelector('[data-testid="mount-links"]');
            let t0 = 0;
            const obs = new MutationObserver(() => {
              if (document.querySelector('[data-testid="last-link"]')) {
                obs.disconnect();
                resolve(performance.now() - t0);
              }
            });
            obs.observe(document.body, { childList: true, subtree: true });
            t0 = performance.now();
            btn.click();
          }),
      );

    // Pre-sweep warmup (#1453 class): the FIRST goto+mount in a fresh context pays a
    // one-time V8 parse + bytecode-compile + cold-cache cost that later points don't
    // (once any mount has run, the path is compiled). Without it the first swept point
    // reads ~4x its true cost — a universal cold-start floor, NOT per-link work: the
    // bare-framework `_baseline` shows the identical @4-vs-@8 hook. One throwaway
    // mount at TARGETS[0] — the first MEASURED page, so its predecessor is identical
    // (audit 07-18 K10 alignment; the class's TARGETS.reverse() live check is the
    // owner's re-run) — warms the path so every measured point is steady-state.
    try {
      await page.goto(new URL(`?n=${TARGETS[0]}`, baseURL).href, { waitUntil: "load" });
      await page.waitForSelector('[data-testid="mount-links"]');
      await mountMeasure();
    } catch (warmErr) {
      console.error(`link-build warmup: ${warmErr.message}`);
    }

    for (const count of TARGETS) {
      try {
      // ?n=<count> → the app renders `count` links on mount; `last-link` marks the Nth.
      await page.goto(new URL(`?n=${count}`, baseURL).href, {
        waitUntil: "load",
      });
      await page.waitForSelector('[data-testid="mount-links"]');

      out[`mountMs@${count}`] = await mountMeasure();
      } catch (sweepErr) { console.error(`link-build @${count}: ${sweepErr.message} — skipping this point`); }
    }

    return out;
  },
};
