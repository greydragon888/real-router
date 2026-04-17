import { createRouter } from "@real-router/core";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createRouteAnnouncer } from "../../src/dom-utils";

const ANNOUNCER_ATTR = "data-real-router-announcer";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
  { name: "about", path: "/about" },
];

async function triggerAnnouncement(
  router: ReturnType<typeof createRouter>,
): Promise<void> {
  await router.navigate("users");
  await router.navigate("about");
}

describe("createRouteAnnouncer", () => {
  let router: ReturnType<typeof createRouter>;
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

  it("creates an aria-live announcer element in the DOM", () => {
    const announcer = createRouteAnnouncer(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    expect(element).not.toBeNull();
    expect(element?.getAttribute("aria-live")).toBe("assertive");
    expect(element?.getAttribute("aria-atomic")).toBe("true");

    announcer.destroy();
  });

  it("reuses existing announcer element", () => {
    const announcer1 = createRouteAnnouncer(router);
    const element1 = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    const announcer2 = createRouteAnnouncer(router);
    const element2 = document.querySelector(`[${ANNOUNCER_ATTR}]`);

    expect(element1).toBe(element2);
    expect(document.querySelectorAll(`[${ANNOUNCER_ATTR}]`)).toHaveLength(1);

    announcer1.destroy();
    announcer2.destroy();
  });

  it("removes announcer on destroy", () => {
    const announcer = createRouteAnnouncer(router);

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).not.toBeNull();

    announcer.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("skips initial navigation announcement", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await router.navigate("users");

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("announces text after second navigation once ready", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("about");

    announcer.destroy();
  });

  it("does not announce before safari ready delay", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("does not announce after destroy", async () => {
    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);
    announcer.destroy();

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });

  it("uses custom getAnnouncementText when provided", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: (route) => `Custom: ${route.name}`,
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("Custom: about");

    announcer.destroy();
  });

  it("uses custom prefix when provided", async () => {
    const announcer = createRouteAnnouncer(router, {
      prefix: "Now at: ",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("Now at:");

    announcer.destroy();
  });

  it("clears announcement text after 7s delay", async () => {
    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toContain("Navigated");

    vi.advanceTimersByTime(7000);

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("reads h1 text for announcement", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("About Page");

    announcer.destroy();
  });

  it("sets tabindex=-1 on h1 and focuses it", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(h1.getAttribute("tabindex")).toBe("-1");

    announcer.destroy();
  });

  it("does not override existing tabindex on h1", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    h1.setAttribute("tabindex", "0");
    document.body.append(h1);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(h1.getAttribute("tabindex")).toBe("0");

    announcer.destroy();
  });

  it("falls back to document.title when no h1", async () => {
    const originalTitle = document.title;

    document.title = "Test Title";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("Test Title");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("falls back to route name when no h1 and no title", async () => {
    const originalTitle = document.title;

    document.title = "";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("about");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("does not repeat the same announcement text", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => "Same Text",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("Same Text");

    vi.advanceTimersByTime(7000);

    expect(element.textContent).toBe("");

    await router.navigate("home");

    expect(element.textContent).toBe("Same Text");

    announcer.destroy();
  });

  it("excludes internal @@-prefixed route name from announcement text", async () => {
    const originalTitle = document.title;

    document.title = "";

    const announcer = createRouteAnnouncer(router);
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).not.toContain("@@");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("skips empty announcement text from custom handler", async () => {
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: () => "",
    });
    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    expect(element.textContent).toBe("");

    announcer.destroy();
  });

  it("falls back to document.title when h1 has empty textContent", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "";
    document.body.append(h1);

    const originalTitle = document.title;

    document.title = "Fallback Title";

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("Fallback Title");

    document.title = originalTitle;
    announcer.destroy();
  });

  it("uses first h1 when multiple h1 elements are present", async () => {
    const first = document.createElement("h1");
    const second = document.createElement("h1");

    first.textContent = "First Heading";
    second.textContent = "Second Heading";
    document.body.append(first, second);

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await triggerAnnouncement(router);

    const element = document.querySelector(`[${ANNOUNCER_ATTR}]`)!;

    expect(element.textContent).toContain("First Heading");
    expect(element.textContent).not.toContain("Second Heading");

    announcer.destroy();
  });

  it("does not announce when destroyed during rAF", async () => {
    let rAFCallbacks: FrameRequestCallback[] = [];

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      rAFCallbacks.push(cb);

      return 0;
    };

    const announcer = createRouteAnnouncer(router);

    vi.advanceTimersByTime(150);

    await router.navigate("users");
    await router.navigate("about");

    announcer.destroy();

    for (const cb of rAFCallbacks) {
      cb(performance.now());
    }

    rAFCallbacks = [];

    expect(document.querySelector(`[${ANNOUNCER_ATTR}]`)).toBeNull();
  });
});
