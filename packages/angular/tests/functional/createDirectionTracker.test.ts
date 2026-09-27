import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { createDirectionTracker } from "@real-router/angular";

import type { DirectionTracker } from "@real-router/angular";

// The package entry exports the tracker (#2587). Its behaviour is pinned by
// `packages/react/tests/functional/dom-utils/direction-tracker.test.ts`.
describe("createDirectionTracker from the package entry", () => {
  let tracker: DirectionTracker | undefined;

  afterEach(() => {
    tracker?.destroy();
    tracker = undefined;
  });

  it("marks a popstate-driven leave 'back' and the next leave 'forward'", async () => {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    await router.start("/");
    tracker = createDirectionTracker(router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await router.navigate("about");

    expect(document.documentElement.dataset.navDirection).toBe("back");

    await router.navigate("home");

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
    tracker = undefined;

    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });
});
