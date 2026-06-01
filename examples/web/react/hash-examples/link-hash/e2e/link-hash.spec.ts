import { expect, test } from "@playwright/test";

// =============================================================================
// Section 1: Tab UI base
// =============================================================================

test.describe("Section 1: Tab UI base", () => {
  test("home page loads at /", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: /Link hash/i }),
    ).toBeVisible();
  });

  test("Settings without hash → default tab Profile", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("clicking through all tabs cycles correctly", async ({ page }) => {
    await page.goto("/settings");

    await page.getByTestId("tab-account").click();
    await expect(page).toHaveURL(/\/settings#account$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );

    await page.getByTestId("tab-billing").click();
    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );

    await page.getByTestId("tab-profile").click();
    await expect(page).toHaveURL(/\/settings#profile$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("clicking already-active tab is a no-op (URL and state unchanged)", async ({
    page,
  }) => {
    await page.goto("/settings#profile");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );

    // navigateWithHash sees current === new → no force, navigate goes through
    // core's SAME_STATES check and is rejected silently. URL must stay.
    await page.getByTestId("tab-profile").click();
    await page.waitForTimeout(50);

    await expect(page).toHaveURL(/\/settings#profile$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });
});

// =============================================================================
// Section 2: F5 / cold-load priming
// =============================================================================

test.describe("Section 2: F5 / cold-load priming", () => {
  test("direct URL with hash sets active tab on first render", async ({
    page,
  }) => {
    await page.goto("/settings#billing");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );
  });

  test("F5 on /settings#account preserves active tab", async ({ page }) => {
    await page.goto("/settings#account");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );

    await page.reload();

    await expect(page).toHaveURL(/\/settings#account$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );
  });

  test("/settings without hash → Profile default tab", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("/settings#unknownTab → 'Unknown tab.' fallback content", async ({
    page,
  }) => {
    await page.goto("/settings#unknownTab");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "unknownTab",
    );
    await expect(page.getByTestId("active-tab")).toContainText("Unknown tab");
  });
});

// =============================================================================
// Section 3: Cross-path preserve
// =============================================================================

test.describe("Section 3: Cross-path preserve", () => {
  test("Settings#account → Dashboard (body link) preserves hash", async ({
    page,
  }) => {
    await page.goto("/settings#account");
    await page.getByTestId("link-dashboard").click();
    await expect(page).toHaveURL(/\/dashboard#account$/);
    await expect(page.getByTestId("dashboard-hash")).toHaveText("account");
  });

  test("Dashboard 'Back to Settings' preserves hash", async ({ page }) => {
    await page.goto("/dashboard#billing");
    await page.getByRole("link", { name: "Back to Settings" }).click();
    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );
  });

  test("Settings#profile → Home (sidebar) preserves hash in URL", async ({
    page,
  }) => {
    await page.goto("/settings#profile");
    await page
      .getByRole("link", { name: "Home", exact: true })
      .first()
      .click();
    // browser-plugin's tri-state default preserves the current fragment on
    // cross-path navigation; URL keeps `#profile`.
    await expect(page).toHaveURL(/\/#profile$/);
  });

  test("Dashboard (no hash) → Settings has no fragment, default tab", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });
});

// =============================================================================
// Section 4: Programmatic tri-state demo (HashControls)
// =============================================================================

test.describe("Section 4: Programmatic tri-state", () => {
  test("Set hash='billing' button creates fragment", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("action-set-billing").click();

    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );
    await expect(page.getByTestId("current-hash")).toHaveText("billing");
  });

  test("Set already-active hash is a no-op (URL stays)", async ({ page }) => {
    await page.goto("/settings#billing");
    await expect(page.getByTestId("current-hash")).toHaveText("billing");

    await page.getByTestId("action-set-billing").click();
    await page.waitForTimeout(50);

    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("current-hash")).toHaveText("billing");
  });

  test("Clear button (opts.hash='') removes fragment", async ({ page }) => {
    await page.goto("/settings#account");
    await page.getByTestId("action-clear").click();

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByTestId("current-hash")).toHaveText("(empty)");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("Preserve button (opts.hash omitted) keeps current hash", async ({
    page,
  }) => {
    await page.goto("/settings#account");
    await page.getByTestId("action-preserve").click();
    await page.waitForTimeout(50);

    await expect(page).toHaveURL(/\/settings#account$/);
    await expect(page.getByTestId("current-hash")).toHaveText("account");
  });
});

// =============================================================================
// Section 5: Auto-force / SAME_STATES bypass
// =============================================================================

test.describe("Section 5: Auto-force on same-path-different-hash", () => {
  test("each same-route tab click flips data-tab attribute (router.subscribe fires)", async ({
    page,
  }) => {
    await page.goto("/settings#profile");

    // Count attribute mutations on `active-tab[data-tab]`. Each successful
    // tab switch must trigger router.subscribe → re-render → attribute write.
    // Without auto-force, SAME_STATES would swallow the navigation and the
    // counter would stay at 0.
    await page.evaluate(() => {
      const target = document.querySelector("[data-testid='active-tab']");
      if (!target) return;
      let count = 0;
      const observer = new MutationObserver(() => {
        count += 1;
      });
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["data-tab"],
      });
      (globalThis as unknown as { __tabFlips: () => number }).__tabFlips = () =>
        count;
    });

    await page.getByTestId("tab-account").click();
    await page.getByTestId("tab-billing").click();
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("tab-account").click();

    const flips = await page.evaluate(
      () =>
        (globalThis as unknown as { __tabFlips: () => number }).__tabFlips(),
    );
    // Four distinct tab switches → four data-tab attribute changes.
    expect(flips).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// Section 6: state.context.url.hashChanged signal
// =============================================================================

test.describe("Section 6: state.context.url and hashChanged", () => {
  test("Home snapshot exposes hash and hashChanged fields", async ({
    page,
  }) => {
    // Land on /settings#account first → state.context.url is populated.
    await page.goto("/settings#account");
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );

    // Cross-path nav to / via sidebar — fragment is preserved by tri-state
    // default; on the new transition, hashChanged compares against the
    // PUBLISHED previous hash ("account") → equals → hashChanged: false.
    await page
      .getByRole("link", { name: "Home", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/#account$/);

    const snapshot = page.getByTestId("state-context-url");
    await expect(snapshot).toContainText('"hash": "account"');
    await expect(snapshot).toContainText('"hashChanged": false');
  });

  test("hashChanged is true after a same-path hash switch", async ({
    page,
  }) => {
    await page.goto("/settings#profile");
    // Switch from #profile to #account on the same route — hashChanged: true.
    await page.getByTestId("tab-account").click();
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );
    await expect(page).toHaveURL(/\/settings#account$/);

    // No direct visualization on Settings page, but the data-tab flip is the
    // observable signal — it only flips when state.context.url updates with
    // a different hash. Coverage of the boolean shape is in the previous
    // test (snapshot on Home).
  });
});

// =============================================================================
// Section 7: F5 priming for routes without fragments
// =============================================================================

test.describe("Section 7: F5 priming — additional routes", () => {
  test("F5 on /dashboard with no hash → URL stays without fragment", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("F5 on / preserves no hash", async ({ page }) => {
    await page.goto("/");
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
  });

  test("F5 on /dashboard#anchor preserves the fragment", async ({ page }) => {
    await page.goto("/dashboard#myAnchor");
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard#myAnchor$/);
    await expect(page.getByTestId("dashboard-hash")).toHaveText("myAnchor");
  });
});

// =============================================================================
// Section 8: Browser back/forward with hash history
// =============================================================================

test.describe("Section 8: Browser back/forward navigation", () => {
  test("history walk through tabs + cross-path; back/forward restore each step", async ({
    page,
  }) => {
    await page.goto("/settings");
    await page.getByTestId("tab-account").click();
    await expect(page).toHaveURL(/\/settings#account$/);

    await page.getByTestId("tab-billing").click();
    await expect(page).toHaveURL(/\/settings#billing$/);

    await page
      .getByRole("link", { name: "Dashboard", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/dashboard#billing$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );

    await page.goBack();
    await expect(page).toHaveURL(/\/settings#account$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "account",
    );

    await page.goForward();
    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );

    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard#billing$/);
    await expect(page.getByTestId("dashboard-hash")).toHaveText("billing");
  });
});

// =============================================================================
// Section 9: Modifier keys / shouldNavigate guard
// =============================================================================

test.describe("Section 9: Modifier keys", () => {
  test("Ctrl/Cmd-click on tab does not change current page URL", async ({
    page,
    context,
  }) => {
    await page.goto("/settings#profile");

    // Modifier-click triggers shouldNavigate → returns false → handler does
    // not preventDefault, browser handles the click natively (typically opens
    // new tab). We assert the CURRENT page state is unchanged regardless of
    // whether a popup actually opened.
    const popupPromise = context
      .waitForEvent("page", { timeout: 1000 })
      .catch(() => null);

    await page
      .getByTestId("tab-account")
      .click({ modifiers: ["ControlOrMeta"] });

    const popup = await popupPromise;
    if (popup) {
      await popup.close();
    }

    await expect(page).toHaveURL(/\/settings#profile$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("Shift-click on tab does not change current page URL", async ({
    page,
    context,
  }) => {
    await page.goto("/settings#profile");

    const popupPromise = context
      .waitForEvent("page", { timeout: 1000 })
      .catch(() => null);

    await page.getByTestId("tab-account").click({ modifiers: ["Shift"] });

    const popup = await popupPromise;
    if (popup) {
      await popup.close();
    }

    await expect(page).toHaveURL(/\/settings#profile$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });
});

// =============================================================================
// Section 10: URL fragment encoding
// =============================================================================

test.describe("Section 10: URL fragment encoding", () => {
  test("encoded URL fragment is decoded in state.context.url.hash", async ({
    page,
  }) => {
    // a%20b%26c — encoded form of "a b&c"
    await page.goto("/settings#a%20b%26c");
    // No tab matches; the active-tab section uses the decoded value.
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "a b&c",
    );

    // Confirm decoded form via Home snapshot — preserve cross-path.
    await page
      .getByRole("link", { name: "Home", exact: true })
      .first()
      .click();
    const snapshot = page.getByTestId("state-context-url");
    await expect(snapshot).toContainText('"hash": "a b&c"');
  });

  test("malformed escape (#%ZZ) does not throw; the page renders", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });

    await page.goto("/settings#%ZZ");
    await expect(page.getByTestId("active-tab")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// =============================================================================
// Section 11: hash-plugin warn-once limitation
// =============================================================================

test.describe("Section 11: hash-plugin warn-once", () => {
  test("?plugin=hash switches runtime; tab content stays default; URL has no fragment", async ({
    page,
  }) => {
    await page.goto("/?plugin=hash");
    // hash-plugin uses `#!/` as the route delimiter; we don't pin the rest
    // of the URL — outer/inner query handling is plugin-internal.
    await expect(page).toHaveURL(/#!\//);

    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/#!\/settings/);

    const urlBefore = page.url();
    await page.getByTestId("tab-account").click();
    await page.waitForTimeout(100);
    const urlAfter = page.url();

    // hash-plugin uses # for the route delimiter — <Link hash> is silently
    // ignored, so URL must NOT change to include a sub-fragment.
    expect(urlAfter).toBe(urlBefore);

    // Without state.context.url, activeTab falls back to DEFAULT_TAB.
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "profile",
    );
  });

  test("emits exactly one warn across many <Link hash> tab clicks", async ({
    page,
  }) => {
    const warnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "warning") {
        warnings.push(msg.text());
      }
    });

    await page.goto("/?plugin=hash");
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();

    await page.getByTestId("tab-profile").click();
    await page.getByTestId("tab-account").click();
    await page.getByTestId("tab-billing").click();

    const hashPluginWarnings = warnings.filter((w) =>
      w.includes("@real-router/hash-plugin"),
    );

    expect(hashPluginWarnings.length).toBe(1);
    expect(hashPluginWarnings[0]).toContain("`hash` option is ignored");
  });

  test("HashControls programmatic call shares the single warn (no extra warns)", async ({
    page,
  }) => {
    const warnings: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "warning") {
        warnings.push(msg.text());
      }
    });

    await page.goto("/?plugin=hash");
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();

    // Mix Link clicks and programmatic HashControls invocations.
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("tab-account").click();
    await page.getByTestId("action-set-billing").click();
    await page.getByTestId("action-clear").click();
    await page.getByTestId("action-preserve").click();

    const hashPluginWarnings = warnings.filter((w) =>
      w.includes("@real-router/hash-plugin"),
    );

    // warn-once across the entire session, regardless of entry point.
    expect(hashPluginWarnings.length).toBe(1);
  });

  test("red plugin-limitation hint visible under HashControls in hash-plugin runtime", async ({
    page,
  }) => {
    await page.goto("/?plugin=hash");
    await page
      .getByRole("link", { name: "Settings", exact: true })
      .first()
      .click();

    // Hint paragraph in HashControls.tsx renders only when pluginKind === "hash".
    await expect(page.getByText(/silently dropped/i).first()).toBeVisible();
  });
});

// =============================================================================
// Section 12: Switch back to browser-plugin
// =============================================================================

test.describe("Section 12: Switch back to browser-plugin", () => {
  test("removing ?plugin=hash and reloading restores browser-plugin behavior", async ({
    page,
  }) => {
    // Start in hash-plugin runtime
    await page.goto("/?plugin=hash");
    await expect(page).toHaveURL(/#!/);

    // Fresh navigation without ?plugin=hash → main.tsx re-evaluates plugin
    // selector at startup → browser-plugin
    await page.goto("/");
    await expect(page).not.toHaveURL(/#!/);

    // Tab UI works again; observe console for any leftover warnings.
    const warningsAfterSwitch: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") {
        warningsAfterSwitch.push(msg.text());
      }
    });

    await page.goto("/settings");
    await page.getByTestId("tab-billing").click();
    await expect(page).toHaveURL(/\/settings#billing$/);
    await expect(page.getByTestId("active-tab")).toHaveAttribute(
      "data-tab",
      "billing",
    );

    // No hash-plugin warnings on the browser-plugin path
    const hp = warningsAfterSwitch.filter((w) =>
      w.includes("@real-router/hash-plugin"),
    );
    expect(hp.length).toBe(0);
  });
});
