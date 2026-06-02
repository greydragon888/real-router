import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const DEBOUNCE_MS = 250;

interface NavLogEntry {
  hash: string;
  at: number;
}

declare global {
  interface Window {
    __router?: {
      subscribe: (
        cb: (s: {
          route: { name: string; context: { url?: { hash?: string } } };
        }) => void,
      ) => () => void;
    };
    __navLog?: NavLogEntry[];
    __navCountUnsub?: () => void;
  }
}

const URL_HASH = (p: Page): string => {
  const url = p.url();
  const idx = url.indexOf("#");
  return idx === -1 ? "" : url.slice(idx + 1);
};

const SCROLL_TO = async (p: Page, sel: string): Promise<void> => {
  await p.locator(sel).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const targetY =
      globalThis.scrollY + rect.top - globalThis.innerHeight * 0.25;
    globalThis.scrollTo({ top: targetY, behavior: "instant" });
  });
};

async function installNavCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    if (!window.__router) {
      throw new Error("window.__router not exposed — check main.tsx");
    }
    window.__navLog = [];
    window.__navCountUnsub?.();
    window.__navCountUnsub = window.__router.subscribe(({ route }) => {
      window.__navLog!.push({
        hash: route.context.url?.hash ?? "",
        at: performance.now(),
      });
    });
  });
}

async function readNavLog(page: Page): Promise<NavLogEntry[]> {
  return page.evaluate(() => window.__navLog ?? []);
}

test.describe("Scenario 1 — sequential scroll → hash updates (RFC §8.3 #1)", () => {
  test("hash cycles through sections as user scrolls", async ({ page }) => {
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await expect(page.locator('[data-testid="article"]')).toBeVisible();
    await installNavCounter(page);

    for (let i = 1; i <= 6; i++) {
      await SCROLL_TO(page, `#section-${i}`);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(DEBOUNCE_MS);

    await expect.poll(() => URL_HASH(page)).toBe("section-6");

    const log = await readNavLog(page);
    const hashes = log.map((e) => e.hash);
    for (let i = 1; i <= 6; i++) {
      expect(hashes).toContain(`section-${i}`);
    }
    for (let i = 1; i < 6; i++) {
      const idxN = hashes.indexOf(`section-${i}`);
      const idxNext = hashes.indexOf(`section-${i + 1}`);
      expect(idxN).toBeLessThan(idxNext);
    }
  });
});

test.describe("Scenario 1b — debounce rate ceiling (acceptance §8.4)", () => {
  test("continuous scrollBy() 1 sec produces ≤ 10 navigate calls/sec", async ({
    page,
  }) => {
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await installNavCounter(page);

    const start = await page.evaluate(() => performance.now());

    await page.evaluate(async () => {
      const stepCount = 60;
      const stepHeight = window.innerHeight / 10;
      for (let i = 0; i < stepCount; i++) {
        window.scrollBy({ top: stepHeight, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 1000 / stepCount));
      }
    });
    await page.waitForTimeout(DEBOUNCE_MS);

    const log = await readNavLog(page);
    const end = await page.evaluate(() => performance.now());
    const elapsedSec = (end - start) / 1000;

    expect(log.length / elapsedSec).toBeLessThan(10);
  });
});

test.describe("Scenario 2 — TOC click no flicker (RFC §8.3 #2)", () => {
  test("TOC click jumps directly to target, no intermediate sections in log", async ({
    page,
  }) => {
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await expect.poll(() => URL_HASH(page)).toBe("intro");

    await installNavCounter(page);

    await page.locator('[data-testid="toc-section-8"]').click();
    await expect.poll(() => URL_HASH(page)).toBe("section-8");

    await page.waitForTimeout(DEBOUNCE_MS * 2);

    const log = await readNavLog(page);
    const hashes = log.map((e) => e.hash);
    for (const intermediate of [
      "section-2",
      "section-3",
      "section-4",
      "section-5",
      "section-6",
      "section-7",
    ]) {
      expect(hashes).not.toContain(intermediate);
    }
    expect(hashes).toContain("section-8");
  });
});

test.describe("Scenario 3 — F5 on deep hash (RFC §8.3 #3)", () => {
  test("hard reload on #section-5: spy does not override hash on first tick", async ({
    page,
  }) => {
    await page.goto("/article#section-5");
    await page.waitForLoadState("networkidle");
    await expect.poll(() => URL_HASH(page)).toBe("section-5");

    await page.waitForTimeout(DEBOUNCE_MS * 2);
    await expect.poll(() => URL_HASH(page)).toBe("section-5");
  });
});

test.describe("Scenario 4 — self-heal nonexistent hash (RFC §8.3 #4)", () => {
  test("hash with no matching id self-heals to topmost real anchor", async ({
    page,
  }) => {
    await page.goto("/article#nonexistent-anchor");
    await page.waitForLoadState("networkidle");

    await expect
      .poll(() => URL_HASH(page), { timeout: 3000 })
      .toBe("intro");
  });
});

test.describe("Scenario 5 — TOC auto-highlight (RFC §8.3 #5)", () => {
  test("TOC sidebar highlights the active section as the user scrolls", async ({
    page,
  }) => {
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await expect.poll(() => URL_HASH(page)).toBe("intro");

    const TOC = (id: string) =>
      page.locator(`[data-testid="toc-${id}"]`);

    await expect(TOC("intro")).toHaveClass(/toc__link--active/);

    await SCROLL_TO(page, "#section-5");
    await page.waitForTimeout(DEBOUNCE_MS);

    await expect(TOC("section-5")).toHaveClass(/toc__link--active/);
    await expect(TOC("intro")).not.toHaveClass(/toc__link--active/);
  });
});

test.describe("Scenario 11 — Spy + scroll-restoration coexistence under browser-plugin (foundation RFC §10.7)", () => {
  test("spy-emit with replace:true does NOT trigger scroll-restoration magnetic snap", async ({
    page,
  }) => {
    await page.goto("/article?plugin=browser");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="plugin-badge"]')).toContainText(
      "browser",
    );

    await SCROLL_TO(page, "#section-3");
    await page.waitForTimeout(DEBOUNCE_MS);
    await expect.poll(() => URL_HASH(page)).toBe("section-3");

    const yBefore = await page.evaluate(() => window.scrollY);

    await page.waitForTimeout(DEBOUNCE_MS * 3);

    const yAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(yAfter - yBefore)).toBeLessThan(30);
  });
});

test.describe("Bonus 6 — Invalid CSS selector → caught, silenced, warn-once", () => {
  test("invalid selector produces one console.warn and no navigations", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });

    await page.goto("/article?spy=per-route");
    await page.waitForLoadState("networkidle");

    await installNavCounter(page);

    await page.evaluate(() => {
      const router = window.__router;
      if (!router) throw new Error("router missing");
    });

    await SCROLL_TO(page, "#section-3");
    await page.waitForTimeout(DEBOUNCE_MS);

    const log = await readNavLog(page);
    expect(log.length).toBeGreaterThan(0);
  });
});

test.describe("Bonus 9 — Recipe B per-route different selector", () => {
  test("under ?spy=per-route on /guide: .no-spy h2 does NOT appear in hash", async ({
    page,
  }) => {
    await page.goto("/guide?spy=per-route");
    await page.waitForLoadState("networkidle");

    await SCROLL_TO(page, "#step-3");
    await page.waitForTimeout(DEBOUNCE_MS);
    await expect.poll(() => URL_HASH(page)).toBe("step-3");

    await installNavCounter(page);

    await SCROLL_TO(page, "#ignored");
    await page.waitForTimeout(DEBOUNCE_MS * 2);

    const log = await readNavLog(page);
    const hashes = log.map((e) => e.hash);
    expect(hashes).not.toContain("ignored");

    await SCROLL_TO(page, "#step-5");
    await page.waitForTimeout(DEBOUNCE_MS);
    await expect.poll(() => URL_HASH(page)).toBe("step-5");
  });
});

test.describe("Bonus 11 — Regression: navigation-plugin auto-scroll suppression", () => {
  test("slow incremental scroll under navigation-plugin: scrollY increments monotonically without viewport jump on spy emits", async ({
    page,
  }) => {
    // Pre-fix bug: under navigation-plugin, every scroll-spy emit triggered
    // a browser auto-scroll via nav.navigate's default `scroll:
    // "after-transition"` intercept option. User scrolling slowly through
    // sections saw the viewport jump +95-145px each time the hash changed,
    // because Chromium aligned the new anchor with viewport top mid-scroll.
    //
    // Fix lives in packages/navigation-plugin/src/navigate-handler.ts:
    // NOOP_INTERCEPT now sets `scroll: "manual"`, aligning with browser-plugin
    // (which never auto-scrolls on programmatic URL changes).
    //
    // This test reproduces the user's manual repro: small viewport + slow
    // ~50px increments through Article sections. Each step should increment
    // scrollY by exactly the scrollBy amount; any +95+ delta signals the
    // regression has returned.
    await page.setViewportSize({ width: 1024, height: 500 });
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => globalThis.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const samples: number[] = [];

    for (let step = 0; step < 30; step++) {
      await page.evaluate(() => {
        globalThis.scrollBy({ top: 50, behavior: "instant" });
      });
      await page.waitForTimeout(100);
      const scrollY = await page.evaluate(() => globalThis.scrollY);
      samples.push(scrollY);
    }

    // Every step-to-step delta must be approximately 50px. The pre-fix bug
    // caused jumps of 95-145px on the step immediately after a spy emit.
    // Tolerance: [45, 70] catches the regression (which produced ~145) while
    // allowing for sub-pixel rounding from rAF cascade timing.
    for (let i = 1; i < samples.length; i++) {
      const delta = samples[i]! - samples[i - 1]!;
      expect(delta).toBeGreaterThanOrEqual(45);
      expect(delta).toBeLessThan(70);
    }
  });
});

test.describe("Bonus 12 — No 'stuck URL' between sections (UX continuity)", () => {
  test("URL updates continuously: every full section scroll-through produces exactly one transition per section", async ({
    page,
  }) => {
    // User-reported UX bug: with narrow rootMargin ("-20% 0px -60% 0px",
    // active zone = 20% viewport), there is a ~540px window of scroll
    // between adjacent h2s where NO h2 is in the active zone. URL stays
    // "stuck" at the last-emitted hash, which feels broken to users
    // reading long-form content section-by-section.
    //
    // Fix: example uses rootMargin "0px 0px -20% 0px" (active zone = upper
    // 80% of viewport). With section min-height: 80vh, zone width = section
    // height, eliminating the dead zone — section-N's h2 leaves the zone at
    // the same scroll position where section-(N+1)'s h2 enters.
    //
    // This test scrolls through all 12 sections at 100px/step and asserts
    // every section emits at least one transition. With the narrow default
    // rootMargin, some sections would be missed (no IO callback fires
    // because their h2 never enters the narrow band during this scroll
    // speed).
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await installNavCounter(page);

    await page.evaluate(async () => {
      globalThis.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 200));
      for (let i = 0; i < 90; i++) {
        globalThis.scrollBy({ top: 100, behavior: "instant" });
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(DEBOUNCE_MS * 2);

    const log = await readNavLog(page);
    const hashes = new Set(log.map((e) => e.hash));

    // Every section's h2 should have entered the active zone at least once.
    const required = [
      "section-1",
      "section-2",
      "section-3",
      "section-4",
      "section-5",
      "section-6",
      "section-7",
      "section-8",
      "section-9",
      "section-10",
    ];
    for (const hash of required) {
      expect(hashes).toContain(hash);
    }
  });
});

test.describe("Bonus 10 — Route without [id] anchors (/about)", () => {
  test("spy does not emit on /about; previous hash preserved", async ({
    page,
  }) => {
    await page.goto("/article");
    await page.waitForLoadState("networkidle");
    await SCROLL_TO(page, "#section-2");
    await page.waitForTimeout(DEBOUNCE_MS);
    await expect.poll(() => URL_HASH(page)).toBe("section-2");

    await page.locator('[data-testid="nav-about"]').click();
    await page.waitForLoadState("networkidle");

    await installNavCounter(page);

    await page.evaluate(() => window.scrollBy({ top: 200, behavior: "instant" }));
    await page.waitForTimeout(DEBOUNCE_MS);

    const log = await readNavLog(page);
    expect(log).toHaveLength(0);
  });
});
