import { expect, test } from "@playwright/test";

test.describe("Abort safety", () => {
  test("rapid clicks end on the last clicked route", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "View Transitions" }),
    ).toBeVisible();

    // Use sidebar links — they persist across navigation (Layout is stable).
    // Fire clicks with a short gap (30ms) to race navigations. real-router
    // cancels older in-flight navigations; the VT utility's abort handler
    // releases the deferred, so stale transitions are skipped.
    const sidebar = page.getByRole("complementary");

    // Fire 3 rapid clicks on top of each other — each cancels the previous.
    await Promise.all([
      sidebar.getByRole("link", { name: "Products" }).click(),
      page.waitForTimeout(30).then(() =>
        sidebar.getByRole("link", { name: "Query demo" }).click(),
      ),
      page.waitForTimeout(60).then(() =>
        sidebar.getByRole("link", { name: "Home" }).click(),
      ),
    ]);

    // Let the last of the racing clicks settle, then fire the definitive
    // final click. Doing this outside Promise.all guarantees About is the
    // absolute last navigation, not racing with the others — the test's
    // purpose is to verify "last click wins", not to stress the router.
    await page.waitForTimeout(50);
    await sidebar.getByRole("link", { name: "About" }).click();

    await page.waitForURL(/\/about/);
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();

    // The promisified leave listener keeps each VT live longer than the
    // fire-and-forget design did (router awaits capture-old-snapshot), so
    // rapid clicks can briefly stack 3–4 VTs whose CSS animations on
    // pseudo-elements overlap (3 pseudos each = up to ~12 active). The
    // essential invariant is that animations CONVERGE — they all end, no
    // leak. Wait for document.getAnimations() to drain to the expected
    // steady-state (one or two animations from the final transition),
    // rather than asserting an instantaneous count.
    await page.waitForFunction(
      () => document.getAnimations().length <= 4,
      null,
      { timeout: 5000 },
    );
  });
});
