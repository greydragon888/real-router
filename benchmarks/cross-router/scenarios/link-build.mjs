// link-build — CPU to mount 1000 <Link>s at once. Each Link builds its href via
// the router's reverse-matcher (buildPath / generatePath / buildLocation), so
// this isolates href-construction + Link render from route construction (done
// once at startup). A real cost for link-heavy pages: nav menus, sitemaps,
// paginated lists. Measured as the ScriptDuration delta around the mount click.
import { getMetrics } from "../harness/cdp.mjs";

export const linkBuild = {
  name: "link-build",
  async run({ page, client, baseURL }) {
    await page.goto(baseURL, { waitUntil: "load" });
    await page.waitForSelector('[data-testid="mount-links"]');

    const before = (await getMetrics(client)).ScriptDuration;
    await page.click('[data-testid="mount-links"]');
    await page.waitForSelector('[data-testid="last-link"]');
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = (await getMetrics(client)).ScriptDuration;

    return { scriptMs: (after - before) * 1000 };
  },
};
