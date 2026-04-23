import {
  test,
  expect,
  _electron as electron,
} from "@playwright/test";
import path from "node:path";

const LAUNCH_ARGS = {
  args: [path.join(__dirname, "../dist-electron/main.js")],
};

test.describe("Electron + navigation-plugin — exclusive history extensions", () => {
  test("getVisitedRoutes grows after navigation", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await expect(page.getByText("Visited routes (1)")).toBeVisible();
    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByText("Visited routes (2)")).toBeVisible();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("Visited routes (3)")).toBeVisible();

    await app.close();
  });

  test("getRouteVisitCount reflects repeated visits", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Home" }).click();
    await page.getByRole("link", { name: "Dashboard" }).click();

    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*dashboard × 2\s*$/ }),
    ).toBeVisible();

    await app.close();
  });

  test("hasVisited marks sidebar Link with ✓ after first visit", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await expect(
      page.getByRole("link", { name: /Dashboard/ }),
    ).not.toContainText("✓");

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Home" }).click();

    await expect(
      page.getByRole("link", { name: /Dashboard/ }),
    ).toContainText("✓");

    await app.close();
  });

  test("hasVisited differentiates users / users.user / users.user.edit", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Users" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users × 1\s*$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /users\.user/ }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Alice" }).click();
    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users\.user × 1\s*$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: /users\.user\.edit/ }),
    ).toHaveCount(0);

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: /^\s*users\.user\.edit × 1\s*$/ }),
    ).toBeVisible();

    await app.close();
  });

  test("getRouteVisitCount ignores :id params (counts by route name)", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Alice" }).click();
    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Bob" }).click();
    await page.getByRole("link", { name: "Users" }).click();
    await page.getByRole("link", { name: "Carol" }).click();

    await expect(
      page.getByRole("listitem").filter({ hasText: /^\s*users\.user × 3\s*$/ }),
    ).toBeVisible();

    await app.close();
  });

  test("peekBack / peekForward labels update around current entry", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Settings" }).click();

    await expect(page.getByText("← previous: dashboard")).toBeVisible();
    await expect(page.getByText("(no forward)")).toBeVisible();

    await page.goBack();
    await expect(page.getByText("← previous: home")).toBeVisible();
    await expect(page.getByText("next: settings →")).toBeVisible();

    await app.close();
  });

  test("canGoBack / canGoForward toggle Back/Forward buttons", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await expect(page.getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Forward" })).toBeDisabled();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await expect(page.getByRole("button", { name: "Back" })).toBeEnabled();

    await page.goBack();
    await expect(page.getByRole("button", { name: "Forward" })).toBeEnabled();

    await app.close();
  });

  test("canGoBackTo + traverseToLast jump to last Dashboard entry", async () => {
    const app = await electron.launch(LAUNCH_ARGS);
    const page = await app.firstWindow();

    await expect(
      page.getByRole("button", { name: /Jump to last Dashboard/ }),
    ).toBeDisabled();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("link", { name: "Home" }).click();

    await expect(
      page.getByRole("button", { name: /Jump to last Dashboard/ }),
    ).toBeEnabled();

    await page.getByRole("button", { name: /Jump to last Dashboard/ }).click();

    await expect(page).toHaveURL(/^app:\/\/real-router\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    await app.close();
  });
});
