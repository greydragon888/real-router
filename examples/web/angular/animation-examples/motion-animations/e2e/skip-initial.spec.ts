import { expect, test } from "@playwright/test";

test.describe("Skip initial load", () => {
  test("first-load suppresses entry animation via :appear=\"false\"", async ({
    page,
  }) => {
    await page.goto("/");
    // Heading should be visible immediately — `phase` signal default `"active"` in
    // TransitionHost prevents the wrapper from animating
    // on first mount.
    await expect(
      page.getByRole("heading", { name: "Motion Animations" }),
    ).toBeVisible();

    // Angular may still register an animation briefly during hydration,
    // but it should resolve fast (no slide-x animation start). Sample
    // animations after a small settle period — should be <= 1 (any
    // residual layout / mount transition that finished immediately).
    await page.waitForTimeout(100);
    const stillRunning = await page.evaluate(
      () =>
        document.getAnimations().filter((a) => a.playState === "running")
          .length,
    );
    expect(stillRunning).toBeLessThanOrEqual(1);
  });
});
