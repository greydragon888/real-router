import { createRouter } from "@real-router/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouteAnnouncer } from "../../../src/dom-utils";

/**
 * The announcer leaves out the initial page load: the commit of `start()`,
 * the one with no previous route, of a router that had committed nothing when
 * the announcer was created. Which commit that is does not depend on when the
 * announcer subscribed — the canonical mount order is `await router.start()`,
 * then render, and the provider's effect creates the announcer after the
 * initial commit. The CONTROL creates it before `start()`. A `start()` after
 * `stop()` changes the page with no load, and is announced.
 */

const ROUTES = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
];

function announced(): string | null | undefined {
  return document.querySelector("[data-real-router-announcer]")?.textContent;
}

describe("route announcer — the initial page load is the start() commit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.title = "";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("an announcer created after start() announces the first navigation it sees", async () => {
    const router = createRouter(ROUTES);

    await router.start("/");

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(100); // past the Safari-ready window
    document.title = "About";
    await router.navigate("about");

    expect(announced()).toBe("Navigated to About");

    announcer.destroy();
    router.stop();
  });

  it("CONTROL — an announcer created before start() leaves out the start() commit and announces the next", async () => {
    const router = createRouter(ROUTES);
    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(100);
    document.title = "Home";
    await router.start("/");

    expect(announced()).toBe("");

    document.title = "About";
    await router.navigate("about");

    expect(announced()).toBe("Navigated to About");

    announcer.destroy();
    router.stop();
  });

  it.each(["after", "before"] as const)(
    "an announcer created %s start() announces the start() of a restart",
    async (created) => {
      const router = createRouter(ROUTES);
      let announcer =
        created === "before" ? createRouteAnnouncer(router) : undefined;

      await router.start("/");
      announcer ??= createRouteAnnouncer(router);
      vi.advanceTimersByTime(100);
      document.title = "About";
      await router.navigate("about");
      router.stop();
      document.title = "Contact";
      await router.start("/contact");

      expect(announced()).toBe("Navigated to Contact");

      announcer.destroy();
      router.stop();
    },
  );
});
