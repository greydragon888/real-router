import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

/**
 * 13 tests across 7 describe blocks. See ../README.md for the behavior
 * matrix and ../../../../.claude/plan-scroll-restoration-examples-ru.md
 * for design rationale.
 *
 * Tolerance: scroll values can drift ±5-15px due to rAF timing and hi-DPI
 * rounding. We use `expect.poll(() => Math.abs(y - target)).toBeLessThan(20)`
 * — `toBeCloseTo(val, -1)` only gives ±5 (too tight), `toSatisfy` is not in
 * Playwright's matcher set.
 */

const TOL = 20;

const readScrollY = async (page: Page): Promise<number> => {
  return page.evaluate(() => window.scrollY);
};

const readContainerTop = async (page: Page): Promise<number> => {
  return page
    .locator("#virtual-scroller")
    .evaluate((el: HTMLElement) => el.scrollTop);
};

const expectScrollNear = async (page: Page, target: number): Promise<void> => {
  await expect
    .poll(async () => Math.abs((await readScrollY(page)) - target))
    .toBeLessThan(TOL);
};

const expectContainerNear = async (
  page: Page,
  target: number,
): Promise<void> => {
  await expect
    .poll(async () => Math.abs((await readContainerTop(page)) - target))
    .toBeLessThan(TOL);
};

test.beforeEach(async ({ page }) => {
  // One-shot reset on test start. Note: do NOT use `addInitScript` for this
  // — it runs on every new document, including `page.reload()`, which would
  // erase the position saved by `pagehide` and break Scenario 7a/7b.
  await page.goto("/");
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
    history.scrollRestoration = "auto";
  });
});

// ----------------------------------------------------------------------------
// Scenario 1 — Restore on back
// ----------------------------------------------------------------------------

test.describe("Scenario 1: restore on back", () => {
  test("scroll position restored on browser Back", async ({ page }) => {
    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 3000));
    await expectScrollNear(page, 3000);

    // Click via dispatchEvent — bypasses Playwright's auto-scroll-into-view
    // which would otherwise change scrollY before the click event reaches
    // the React handler. The router's subscribe callback captures
    // `window.scrollY` at the moment of navigation.
    await page.locator('[data-testid="article-card-15"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/15$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/);
    await expectScrollNear(page, 3000);
  });
});

// ----------------------------------------------------------------------------
// Scenario 2 — Top on forward push
// ----------------------------------------------------------------------------

test.describe("Scenario 2: top on forward push", () => {
  test("forward navigation lands at scrollY 0", async ({ page }) => {
    await page.goto("/docs");
    await page.evaluate(() => window.scrollTo(0, 2000));
    await expectScrollNear(page, 2000);

    await page.click('[data-testid="nav-articles"]');
    await expect(page).toHaveURL(/\/articles$/);
    await expectScrollNear(page, 0);
  });
});

// ----------------------------------------------------------------------------
// Scenario 3 — Anchor scrolling (4 sub-tests after #531/#532)
// ----------------------------------------------------------------------------

test.describe("Scenario 3: anchor scrolling", () => {
  test("3a — initial goto with anchor scrolls to heading", async ({ page }) => {
    await page.goto("/docs#getting-started");
    await page.waitForLoadState("networkidle");

    const heading = page.locator("#getting-started");
    await expect(heading).toBeInViewport();
    expect(await readScrollY(page)).toBeGreaterThan(0);
  });

  test("3b — cross-path <Link hash> preserves hash and scrolls", async ({
    page,
  }) => {
    await page.goto("/");
    await page.click('[data-testid="link-docs-installation"]');
    await expect(page).toHaveURL(/\/docs#installation$/);

    const heading = page.locator("#installation");
    await expect(heading).toBeInViewport();
  });

  test("3c — same-path <Link hash> auto-force triggers anchor scroll", async ({
    page,
  }) => {
    await page.goto("/docs#api");
    await expect(page.locator("#api")).toBeInViewport();

    await page.click('[data-testid="toc-examples"]');
    await expect(page).toHaveURL(/\/docs#examples$/);
    await expect(page.locator("#examples")).toBeInViewport();
  });

  test("3d — cyrillic id decoded from state.context.url.hash", async ({
    page,
  }) => {
    // Browser percent-encodes Cyrillic in URL bar; URL plugin decodes it
    // into state.context.url.hash. Utility uses the decoded form directly.
    await page.goto(
      "/docs#%D1%81%D0%B5%D0%BA%D1%86%D0%B8%D1%8F-5",
    );
    await page.waitForLoadState("networkidle");

    const heading = page.locator('h2[id="секция-5"]');
    await expect(heading).toBeInViewport();
  });
});

// ----------------------------------------------------------------------------
// Scenario 4 — Replace no-op
// ----------------------------------------------------------------------------

test.describe("Scenario 4: replace is no-op for scroll", () => {
  test("replace preserves scrollY and stores under previousRoute key", async ({
    page,
  }) => {
    await page.goto("/articles/1");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expectScrollNear(page, 1500);

    await page.locator('[data-testid="replace-next"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/2$/);

    await expectScrollNear(page, 1500);

    const store: Record<string, number> = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("real-router:scroll") ?? "{}"),
    );
    expect(store['articles.article:{"id":"1"}']).toBeGreaterThan(1480);
    expect(store['articles.article:{"id":"2"}']).toBeUndefined();
  });
});

// ----------------------------------------------------------------------------
// Scenario 5 — Mode toggle (2 sub-tests)
// ----------------------------------------------------------------------------

test.describe("Scenario 5: mode toggle", () => {
  test("5a — top mode scrolls to top on Back", async ({ page }) => {
    await page.goto("/settings");
    await page.click('[data-testid="mode-top"]');
    await page.waitForLoadState("networkidle");

    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 3000));
    await expectScrollNear(page, 3000);

    await page.locator('[data-testid="article-card-1"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/1$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/);
    // top mode → back goes to top, NOT restored
    await expectScrollNear(page, 0);
  });

  test("5b — native mode persists to localStorage and updates UI", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.click('[data-testid="mode-native"]');

    expect(
      await page.evaluate(() =>
        localStorage.getItem("scroll-restoration-mode"),
      ),
    ).toBe("native");

    // ModeToggle's `onModeChange` callback updates App's state →
    // RouterProvider remounts via `key` → util destroyed + recreated in
    // native mode. The toggle visually reflects the new mode.
    await expect(page.locator('[data-testid="mode-native"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.locator('[data-testid="mode-restore"]')).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  test("5c — top mode: replace scrolls to top (NOT preserve scrollY)", async ({
    page,
  }) => {
    // In `top` mode the utility's first branch (`mode === "top"`) wins
    // before the replace-early-return check fires. So replace navigation
    // ends up at scrollY = 0, contrary to `restore` mode (Scenario 4).
    await page.goto("/settings");
    await page.click('[data-testid="mode-top"]');
    await expect(page.locator('[data-testid="mode-top"]')).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.goto("/articles/1");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expectScrollNear(page, 1500);

    await page.locator('[data-testid="replace-next"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/2$/);

    // top mode: scroll resets to 0, not preserved
    await expectScrollNear(page, 0);
  });

  test("5d — top mode: F5 scrolls to top (NOT restore)", async ({ page }) => {
    // After page.reload(), main.tsx reads localStorage = "top" → util in
    // top mode → first branch → scrollToHashOrTop. Saved position in
    // sessionStorage is ignored.
    await page.goto("/settings");
    await page.click('[data-testid="mode-top"]');
    await expect(page.locator('[data-testid="mode-top"]')).toHaveAttribute(
      "data-active",
      "true",
    );

    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expectScrollNear(page, 2500);

    await page.reload();
    await page.waitForLoadState("networkidle");
    // top mode on cold load → scroll = 0 even though pagehide saved 2500
    await expectScrollNear(page, 0);
  });

  test("5e — native mode leaves history.scrollRestoration at auto", async ({
    page,
  }) => {
    // beforeEach reset history.scrollRestoration to "auto". Switching to
    // native mode remounts RouterProvider with mode=native → utility
    // returns NOOP_INSTANCE before touching history.scrollRestoration.
    // The "auto" set in beforeEach survives the remount — browser handles
    // scroll restore natively from this point on.
    await page.goto("/settings");
    await page.click('[data-testid="mode-native"]');
    await expect(page.locator('[data-testid="mode-native"]')).toHaveAttribute(
      "data-active",
      "true",
    );

    expect(await page.evaluate(() => history.scrollRestoration)).toBe("auto");
  });

  test("5g — behavior toggle persists and forwards 'smooth' to scrollTo", async ({
    page,
  }) => {
    await page.goto("/settings");

    // 1. Click behavior-smooth → localStorage + React state updated.
    await page.click('[data-testid="behavior-smooth"]');
    await expect(
      page.locator('[data-testid="behavior-smooth"]'),
    ).toHaveAttribute("data-active", "true");
    expect(
      await page.evaluate(() =>
        localStorage.getItem("scroll-restoration-behavior"),
      ),
    ).toBe("smooth");

    // 2. Install scrollTo spy AFTER the remount has settled (waitForTimeout
    // guards against the transient unmount/remount window).
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      (window as unknown as { __scrollCalls: ScrollToOptions[] }).__scrollCalls =
        [];
      const orig = window.scrollTo.bind(window);
      window.scrollTo = ((...args: [ScrollToOptions] | [number, number]) => {
        if (typeof args[0] === "object") {
          (
            window as unknown as { __scrollCalls: ScrollToOptions[] }
          ).__scrollCalls.push(args[0]);
        }

        // eslint-disable-next-line prefer-spread -- forwarding rest args
        return orig.apply(window, args as never);
      }) as typeof window.scrollTo;
    });

    // 3. Trigger forward push — utility should call scrollTo({ behavior: "smooth" }).
    await page.click('[data-testid="nav-articles"]');
    await expect(page).toHaveURL(/\/articles$/);

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __scrollCalls: ScrollToOptions[] })
              .__scrollCalls.length,
        ),
      )
      .toBeGreaterThan(0);

    const calls: ScrollToOptions[] = await page.evaluate(
      () =>
        (window as unknown as { __scrollCalls: ScrollToOptions[] })
          .__scrollCalls,
    );
    expect(calls.some((c) => c.behavior === "smooth")).toBe(true);
  });

  test("5f — native mode: utility does not subscribe (no store writes)", async ({
    page,
  }) => {
    // Switch to native via toggle → RouterProvider remount → util NOOP.
    // No router.subscribe handler attached, so SPA navigation does not
    // write to the scroll-restore store.
    await page.goto("/settings");
    await page.click('[data-testid="mode-native"]');
    await expect(page.locator('[data-testid="mode-native"]')).toHaveAttribute(
      "data-active",
      "true",
    );

    // Clear any leftover entries from previous (restore-mode) mounts
    await page.evaluate(() => sessionStorage.removeItem("real-router:scroll"));

    // Now exercise SPA navigation in-app (no full reload — utility in
    // native mode is currently mounted and should be NOOP).
    await page.click('[data-testid="nav-articles"]');
    await expect(page).toHaveURL(/\/articles$/);
    await page.evaluate(() => window.scrollTo(0, 1000));
    await page
      .locator('[data-testid="article-card-15"]')
      .dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/15$/);

    // No router.subscribe in native mode → store untouched
    const store = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("real-router:scroll") ?? "{}"),
    );
    expect(Object.keys(store)).toEqual([]);
  });

  test("5h — native mode: Chromium browser-native restore preserves scrollY on Back", async ({
    page,
    browserName,
  }) => {
    // In `native` mode the utility returns NOOP_INSTANCE without touching
    // `history.scrollRestoration`. The DOM property stays at the browser
    // default `"auto"`, which means **the browser** is in charge of scroll
    // restore on back/forward. In Chromium this works identically to
    // `restore` mode — Chromium's built-in restore kicks in and lands the
    // user back at the saved position.
    //
    // This test validates the contract: "native" === "hand off to browser".
    // It explicitly skips on engines where `history.scrollRestoration: auto`
    // does NOT restore scroll on SPA back (some Firefox/Safari versions),
    // because that behavior is OUT of utility's control by design.
    test.skip(
      browserName !== "chromium",
      "Chromium-only: native scroll restore on history traversal",
    );

    await page.goto("/settings");
    await page.click('[data-testid="mode-native"]');
    await expect(page.locator('[data-testid="mode-native"]')).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(await page.evaluate(() => history.scrollRestoration)).toBe("auto");

    // Clear any leftover entries that the previous (default = restore) mount
    // wrote on its `pagehide` before remount swapped in the NOOP native mode.
    await page.evaluate(() => sessionStorage.removeItem("real-router:scroll"));

    // Navigate to a long page, scroll down, click into a child route, then
    // press Back. Chromium's native auto-restore should bring us back to
    // ~3000px even though the utility never wrote to sessionStorage.
    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 3000));
    await expectScrollNear(page, 3000);

    // Verify utility's store is empty after our SPA navigation — proving
    // the restore (if it works) is from Chromium native, not from us.
    const store = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("real-router:scroll") ?? "{}"),
    );
    expect(Object.keys(store)).toEqual([]);

    await page.locator('[data-testid="article-card-15"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/15$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/);

    // Browser-native restore: Chromium remembers scrollY across SPA history
    // entries when scrollRestoration === "auto". This proves "native" mode
    // does not block native restore.
    await expectScrollNear(page, 3000);
  });

  test("5i — cross-path <Link hash> with non-existent id falls through to scrollY=0", async ({
    page,
  }) => {
    // ctxHash !== undefined branch: utility tries getElementById(ctxHash) →
    // returns null → falls through to writePos(0). Validates the
    // "anchor-or-top" contract: no matching element means top.
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expectScrollNear(page, 1500);

    await page.click('[data-testid="link-docs-missing"]');
    await expect(page).toHaveURL(/\/docs#no-such-section$/);
    // No <h2 id="no-such-section"> exists in DOM → writePos(0)
    await expectScrollNear(page, 0);
  });

  test("5j — same-path <Link hash> with non-existent id resets to scrollY=0", async ({
    page,
  }) => {
    // Same-path different-hash via navigateWithHash adds force+hashChange,
    // bypasses SAME_STATES → transition fires → utility's subscribe
    // callback runs through the push-fallthrough → scrollToHashOrTop →
    // ctxHash defined but element missing → writePos(0). Documents that
    // hash-only nav with broken anchor IS a scroll reset, not a no-op.
    // (Tab UI authors must provide matching id elements to avoid jumps.)
    await page.goto("/docs#getting-started");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#getting-started")).toBeInViewport();
    const startScroll = await readScrollY(page);
    expect(startScroll).toBeGreaterThan(0);

    await page.click('[data-testid="toc-missing"]');
    await expect(page).toHaveURL(/\/docs#no-such-section$/);
    // No matching id → writePos(0)
    await expectScrollNear(page, 0);
  });

  test("5k — behavior 'smooth' is forwarded to anchor scrollIntoView", async ({
    page,
  }) => {
    // 5g covers behavior=smooth → window.scrollTo. This test covers the
    // OTHER call site: Element.prototype.scrollIntoView for hash anchors.
    await page.goto("/settings");
    await page.click('[data-testid="behavior-smooth"]');
    await expect(
      page.locator('[data-testid="behavior-smooth"]'),
    ).toHaveAttribute("data-active", "true");

    // Navigate to Home where the link-docs-installation lives.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for remount to settle, then patch scrollIntoView globally so we
    // capture the call from utility's rAF (after the click below).
    await page.evaluate(() => {
      (
        window as unknown as { __siCalls: ScrollIntoViewOptions[] }
      ).__siCalls = [];
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (
        this: Element,
        arg?: boolean | ScrollIntoViewOptions,
      ) {
        if (typeof arg === "object" && arg !== null) {
          (
            window as unknown as { __siCalls: ScrollIntoViewOptions[] }
          ).__siCalls.push(arg);
        }
        return orig.call(this, arg);
      } as Element["scrollIntoView"];
    });

    // Cross-path <Link hash> on a page that exists → utility runs
    // scrollIntoView with the configured behavior. Use dispatchEvent to
    // bypass Playwright's auto-scroll-into-view, which would otherwise
    // call scrollIntoView itself and pollute our spy.
    await page
      .locator('[data-testid="link-docs-installation"]')
      .dispatchEvent("click");
    await expect(page).toHaveURL(/\/docs#installation$/);

    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as unknown as { __siCalls: ScrollIntoViewOptions[] })
              .__siCalls.length,
        ),
      )
      .toBeGreaterThan(0);

    const calls: ScrollIntoViewOptions[] = await page.evaluate(
      () =>
        (window as unknown as { __siCalls: ScrollIntoViewOptions[] }).__siCalls,
    );
    expect(calls.some((c) => c.behavior === "smooth")).toBe(true);
  });

  test("5l — clicking active sidebar link is a SAME_STATES no-op (utility not invoked)", async ({
    page,
  }) => {
    // Click the same nav link the user is already on. Core's same-states
    // rejection prevents transition → router.subscribe callback never fires
    // → utility's rAF never runs. ScrollY is preserved as-is.
    //
    // This is a regression baseline: any future change to navigateWithHash
    // or core's same-states logic that accidentally promotes plain Link
    // clicks to forced transitions would break this.
    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 800));
    await expectScrollNear(page, 800);

    // dispatchEvent bypasses Playwright's auto-scroll-into-view + visibility
    // checks; we want to test the SAME_STATES path purely.
    await page
      .locator('[data-testid="nav-articles"]')
      .dispatchEvent("click");
    // URL unchanged
    await expect(page).toHaveURL(/\/articles$/);
    // ScrollY unchanged — utility never ran
    await expectScrollNear(page, 800);
  });
});

// ----------------------------------------------------------------------------
// Scenario 6b — scrollContainer null fallback (cross-route)
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Scenario 6 — Custom scrollContainer
// ----------------------------------------------------------------------------

test.describe("Scenario 6: custom scrollContainer", () => {
  test("scroll inside #virtual-scroller is captured + restored, window untouched", async ({
    page,
  }) => {
    await page.goto("/gallery");
    await page
      .locator("#virtual-scroller")
      .evaluate((el: HTMLElement) => el.scrollTo(0, 2000));

    await expectContainerNear(page, 2000);
    expect(await readScrollY(page)).toBeLessThan(50);

    await page.click('[data-testid="nav-home"]');
    await expect(page).toHaveURL(/\/$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/gallery$/);
    await expectContainerNear(page, 2000);
  });

  test("6b — scrollContainer null fallback: window scroll on routes without container", async ({
    page,
  }) => {
    // scrollContainer is `() => document.getElementById("virtual-scroller")`,
    // global to RouterProvider. On routes that don't render that div the
    // getter returns null and `readPos`/`writePos` lazy-fall back to
    // window. This test exercises BOTH paths in one flow:
    //
    //   /articles  →  window scroll captured under "articles:{}"
    //       ↓
    //   /gallery   →  container scrollTop captured under "gallery:{}"
    //       ↓ Back
    //   /articles  →  window scroll restored from "articles:{}"
    //       ↓ Forward
    //   /gallery   →  container scrollTop restored from "gallery:{}"
    //
    // Demonstrates that fallback is not just a graceful degradation but a
    // correct two-target solution working transparently across routes.
    await page.goto("/articles");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expectScrollNear(page, 1200);

    // dispatchEvent bypasses Playwright auto-scroll-into-view; sidebar
    // anchors stay in viewport but click checks may still flake when
    // ScrollMeter overlays.
    await page.locator('[data-testid="nav-gallery"]').dispatchEvent("click");
    await expect(page).toHaveURL(/\/gallery$/);
    await page
      .locator("#virtual-scroller")
      .evaluate((el: HTMLElement) => el.scrollTo(0, 800));
    await expectContainerNear(page, 800);

    // Back to /articles → window restored
    await page.goBack();
    await expect(page).toHaveURL(/\/articles$/);
    await expectScrollNear(page, 1200);

    // Forward to /gallery → container restored
    await page.goForward();
    await expect(page).toHaveURL(/\/gallery$/);
    await expectContainerNear(page, 800);

    // Both keys live in store under their own routes
    const store: Record<string, number> = await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("real-router:scroll") ?? "{}"),
    );
    expect(store["articles:{}"]).toBeGreaterThan(1180);
    expect(store["gallery:{}"]).toBeGreaterThan(780);
  });
});

// ----------------------------------------------------------------------------
// Scenario 7 — Persistence across F5 (3 sub-tests after #531)
// ----------------------------------------------------------------------------

test.describe("Scenario 7: F5 persistence", () => {
  test("7a — pagehide saves position before reload", async ({ page }) => {
    await page.goto("/articles");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expectScrollNear(page, 2500);

    await page.reload();
    await page.waitForLoadState("networkidle");

    const stored: number = await page.evaluate(() => {
      const raw = sessionStorage.getItem("real-router:scroll") ?? "{}";
      const store = JSON.parse(raw) as Record<string, number>;

      return store["articles:{}"] ?? 0;
    });
    expect(stored).toBeGreaterThan(2480);
  });

  test("7b — F5 restore (after #531 priming)", async ({ page }) => {
    await page.goto("/articles");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await expectScrollNear(page, 2500);

    await page.reload();
    await page.waitForLoadState("networkidle");
    // After #531 priming, navigation-plugin emits navigationType:"reload"
    // on the first transition after F5 → utility's restore branch runs.
    // Userland `applyInitialF5Restore` in main.tsx bridges the race where
    // the utility subscribes after `router.start()` already fired its first
    // TRANSITION_SUCCESS.
    await expectScrollNear(page, 2500);
  });

  test("7c — programmatic reload restores from store", async ({ page }) => {
    await page.goto("/articles/3");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 1800));
    await expectScrollNear(page, 1800);

    await page
      .locator('[data-testid="programmatic-reload"]')
      .dispatchEvent("click");
    await expect(page).toHaveURL(/\/articles\/3$/);
    await expectScrollNear(page, 1800);
  });
});
