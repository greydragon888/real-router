import {
  test,
  expect,
  _electron as electron,
} from "@playwright/test";
import path from "node:path";

const MAIN = path.join(__dirname, "../dist-electron/main.js");

test.describe("Electron + custom protocol (app://)", () => {
  test("loads home at app:// root", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await expect(page).toHaveURL(/^app:\/\/real-router\/?$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    await app.close();
  });

  test("navigates to dashboard via Link click", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Dashboard" }).click();

    await expect(page).toHaveURL(/^app:\/\/real-router\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    await app.close();
  });

  test("list → detail → edit flow via Link clicks", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/^app:\/\/real-router\/users$/);
    await expect(page.getByRole("link", { name: "Alice" })).toBeVisible();

    await page.getByRole("link", { name: "Alice" }).click();
    await expect(page).toHaveURL(/^app:\/\/real-router\/users\/42$/);
    await expect(page.getByText("User ID: 42")).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/^app:\/\/real-router\/users\/42\/edit$/);
    await expect(page.getByRole("textbox")).toHaveValue("42");

    await app.close();
  });

  test("deep link: direct load of app://real-router/users/42", async () => {
    const app = await electron.launch({
      args: [MAIN, "--load-url=app://real-router/users/42"],
    });
    const page = await app.firstWindow();

    await expect(page.getByText("User ID: 42")).toBeVisible();

    await app.close();
  });

  test("deep link 3-level: direct load of app://real-router/users/42/edit", async () => {
    const app = await electron.launch({
      args: [MAIN, "--load-url=app://real-router/users/42/edit"],
    });
    const page = await app.firstWindow();

    await expect(page).toHaveURL(/^app:\/\/real-router\/users\/42\/edit$/);
    await expect(page.getByRole("textbox")).toHaveValue("42");

    await app.close();
  });

  test("back/forward preserves scheme", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Dashboard" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await page.goBack();

    await expect(page).toHaveURL(/app:\/\/real-router\/dashboard/);

    await app.close();
  });
});
