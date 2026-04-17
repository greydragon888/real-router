import { createRouter } from "@real-router/core";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createRouteAnnouncer } from "../../src/dom-utils";

import type { Router } from "@real-router/core";

const ANNOUNCER_ATTR = "data-real-router-announcer";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "about", path: "/about" },
  { name: "settings", path: "/settings" },
  { name: "profile", path: "/profile" },
];

describe("announcer rapid navigation (Angular)", () => {
  let router: Router;
  let originalRAF: typeof globalThis.requestAnimationFrame;

  beforeEach(async () => {
    vi.useFakeTimers();
    originalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(performance.now());

      return 0;
    };
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    document.querySelector(`[${ANNOUNCER_ATTR}]`)?.remove();
    document.querySelectorAll("h1").forEach((element) => {
      element.remove();
    });
    globalThis.requestAnimationFrame = originalRAF;
    vi.useRealTimers();
  });

  it("100 rapid navigations — no duplicate announcer elements", async () => {
    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    const routeNames = ["home", "users", "about", "settings", "profile"];

    for (let i = 0; i < 100; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    const announcerNodes = document.querySelectorAll(`[${ANNOUNCER_ATTR}]`);

    expect(announcerNodes).toHaveLength(1);

    announcer.destroy();
  });

  it("destroy after 50 rapid navigations cleans up all timers", async () => {
    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    const routeNames = ["home", "users", "about"];

    for (let i = 0; i < 50; i++) {
      const target = routeNames[i % routeNames.length];

      if (router.getState()?.name !== target) {
        await router.navigate(target);
      }
    }

    announcer.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();

    vi.advanceTimersByTime(10_000);

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("3 announcers attached to same router — single shared announcer element", async () => {
    const a1 = createRouteAnnouncer(router);
    const a2 = createRouteAnnouncer(router);
    const a3 = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await router.navigate("users");
    await router.navigate("about");

    const announcers = document.querySelectorAll(`[${ANNOUNCER_ATTR}]`);

    expect(announcers).toHaveLength(1);

    a1.destroy();
    a2.destroy();
    a3.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("custom getAnnouncementText returning identical text deduplicates", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => "Identical announcement",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await router.navigate("users");
    await router.navigate("about");

    expect(element.textContent).toBe("Identical announcement");

    vi.advanceTimersByTime(7000);

    expect(element.textContent).toBe("");

    await router.navigate("settings");

    expect(element.textContent).toBe("Identical announcement");

    announcer.destroy();
  });
});
