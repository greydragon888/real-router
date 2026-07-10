// link-build — elapsed time to mount 1000 <Link>s at once. Each Link builds its
// href via the router's reverse-matcher (buildPath / generatePath /
// buildLocation), so this isolates href-construction + Link render from route
// construction (done once at startup). A real cost for link-heavy pages: nav
// menus, sitemaps, paginated lists.
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
export const linkBuild = {
  name: "link-build",
  async run({ page, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="mount-links"]');

    const mountMs = await page.evaluate(
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

    return { mountMs };
  },
};
