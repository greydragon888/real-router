import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { createStartedRouter, NUM_RUNS, arbIdParam } from "./helpers";

describe("shouldUpdateNode Properties", () => {
  test.prop([arbIdParam], { numRuns: NUM_RUNS.fast })(
    "consistency with navigate: shouldUpdateNode returns true for activated/deactivated segments",
    async (_params) => {
      const router = await createStartedRouter("/users/abc");
      const fromState = router.getState()!;

      await router.navigate("admin.settings");
      const toState = router.getState()!;
      const { deactivated, activated } = toState.transition!.segments;

      for (const segment of [...deactivated, ...activated]) {
        expect(router.shouldUpdateNode(segment)(toState, fromState)).toBe(true);
      }

      router.stop();
    },
  );

  it("root node updates on first navigation", async () => {
    const router = await createStartedRouter("/users/abc");
    const state = router.getState()!;

    expect(router.shouldUpdateNode("")(state)).toBe(true);

    router.stop();
  });

  it("unrelated segment does not update", async () => {
    const router = await createStartedRouter("/users/abc");

    await router.navigate("users.edit", { id: "abc" });
    const toState = router.getState()!;
    const fromState = router.getPreviousState()!;

    expect(router.shouldUpdateNode("admin")(toState, fromState)).toBe(false);
    expect(router.shouldUpdateNode("admin.settings")(toState, fromState)).toBe(
      false,
    );

    router.stop();
  });

  it("intersection segment returns true (triggers re-render check)", async () => {
    const router = await createStartedRouter("/users/abc");

    await router.navigate("users.edit", { id: "abc" });
    const toState = router.getState()!;
    const fromState = router.getPreviousState()!;

    expect(toState.transition!.segments.intersection).toBe("users");
    expect(router.shouldUpdateNode("users")(toState, fromState)).toBe(true);

    router.stop();
  });
});
