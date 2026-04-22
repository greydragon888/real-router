import {
  test,
  expect,
  _electron as electron,
} from "@playwright/test";
import path from "node:path";

const MAIN = path.join(__dirname, "../dist-electron/main.js");

test.describe("Electron + hash-plugin (file://)", () => {
  test("loads home at file:// + hash root", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await expect(page).toHaveURL(/^file:\/\/.*\/dist\/index\.html#!\/?$/);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

    await app.close();
  });

  test("navigates via hash — scheme stays file://", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Dashboard" }).click();

    await expect(page).toHaveURL(/file:\/\/.*#!\/dashboard$/);
    await app.close();
  });

  test("list → detail → edit flow via hash Link clicks (3-level nesting)", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/file:\/\/.*#!\/users$/);

    await page.getByRole("link", { name: "Alice" }).click();
    await expect(page).toHaveURL(/file:\/\/.*#!\/users\/42$/);
    await expect(page.getByText("User ID: 42")).toBeVisible();

    await page.getByRole("link", { name: "Edit" }).click();
    await expect(page).toHaveURL(/file:\/\/.*#!\/users\/42\/edit$/);
    await expect(page.getByRole("textbox")).toHaveValue("42");

    await app.close();
  });

  test("deep link 3-level via hash: params decoded on file://…#!/users/42/edit", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.evaluate(() => {
      globalThis.location.hash = "#!/users/42/edit";
    });

    await expect(page).toHaveURL(/#!\/users\/42\/edit$/);
    await expect(page.getByRole("textbox")).toHaveValue("42");

    await app.close();
  });

  test("reload preserves hash route", async () => {
    const app = await electron.launch({ args: [MAIN] });
    const page = await app.firstWindow();

    await page.getByRole("link", { name: "Settings" }).click();
    await page.reload();

    await expect(page).toHaveURL(/#!\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    await app.close();
  });
});
