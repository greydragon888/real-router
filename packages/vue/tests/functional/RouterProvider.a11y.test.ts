import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { mount } from "@vue/test-utils";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { RouterProvider } from "../../src/RouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

describe("RouterProvider — announceNavigation", () => {
  let router: Router;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelector(ANNOUNCER_SEL)?.remove();
  });

  it("no announceNavigation prop — no announcer element in DOM", () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(RouterProvider, { router }, { default: () => h("div") }),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  it("announceNavigation=true — element appears and text updates after navigation", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toContain(
      "Navigated to",
    );
  });

  it("announcer textContent matches 'Navigated to {route name}'", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    // First navigation is skipped (initial navigation flag)
    await router.navigate("about");
    // Second navigation triggers the announcement
    await router.navigate("home");

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).toBe("Navigated to home");
  });

  it("announcer textContent uses h1 text when present", async () => {
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    // First navigation is skipped (initial navigation flag)
    await router.navigate("about");
    // Second navigation triggers the announcement — h1 is present
    await router.navigate("home");

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).toBe("Navigated to About Page");

    h1.remove();
  });

  it("announcer has aria-live='assertive' and aria-atomic='true'", () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer?.getAttribute("aria-live")).toBe("assertive");
    expect(announcer?.getAttribute("aria-atomic")).toBe("true");
  });

  it("announceNavigation prop toggle — announcer is created/destroyed reactively", async () => {
    const enabled = ref(false);

    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: enabled.value },
            { default: () => h("div") },
          ),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();

    enabled.value = true;
    await wrapper.vm.$nextTick();

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    enabled.value = false;
    await wrapper.vm.$nextTick();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();

    wrapper.unmount();
  });

  it("cleanup on unmount — announcer element removed from DOM", () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );

    expect(document.querySelector(ANNOUNCER_SEL)).not.toBeNull();

    wrapper.unmount();

    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });

  // ── announceNavigation options (getAnnouncementText / prefix) ─────────────
  // First navigation after mount is skipped (initial-navigation flag), so each
  // case navigates twice and asserts on the second route ("home").

  it("uses a custom getAnnouncementText", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            {
              router,
              announceNavigation: {
                getAnnouncementText: (route) => `You are on ${route.name}`,
              },
            },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "You are on home",
    );
  });

  it("falls back to default resolution when getAnnouncementText returns empty", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: { getAnnouncementText: () => "" } },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    // Empty custom result → fall through to the default chain.
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to home",
    );
  });

  it("falls back to default resolution when getAnnouncementText throws", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            {
              router,
              announceNavigation: {
                getAnnouncementText: () => {
                  throw new Error("boom");
                },
              },
            },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(errorSpy).toHaveBeenCalled();
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to home",
    );
  });

  it("uses a custom prefix", async () => {
    mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: { prefix: "Page: " } },
            { default: () => h("div") },
          ),
      }),
    );

    vi.advanceTimersByTime(100);

    await router.navigate("about");
    await router.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Page: home",
    );
  });
});

// Review §5.7 — announcer edge cases. The shared `createRouteAnnouncer`
// utility (consumed via the dom-utils symlink) has several documented
// branches that are not reachable through the standard test router setup:
// `@@`-prefixed internal routes, the rapid-nav SAFARI_READY_DELAY buffer,
// the same-text dedupe gate, etc. Pin them as functional regressions so
// Vue does not silently drift from React/Preact behaviour.
describe("RouterProvider — announceNavigation edge cases", () => {
  // The @@-prefix test uses a dedicated router with allowNotFound so
  // navigateToNotFound() lands on core's internal `@@router/UNKNOWN_ROUTE`
  // without disturbing the shared baseRouter. Other tests reuse the default
  // router via a setup wrapper.
  let baseRouter: Router;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    baseRouter = createTestRouterWithADefaultRouter();
    await baseRouter.start("/");
  });

  afterEach(() => {
    baseRouter.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.querySelectorAll(ANNOUNCER_SEL).forEach((node) => {
      node.remove();
    });
    document.querySelectorAll("h1").forEach((node) => {
      node.remove();
    });
    document.title = "";
  });

  function mountAnnouncer(router: Router) {
    return mount(
      defineComponent({
        setup: () => () =>
          h(
            RouterProvider,
            { router, announceNavigation: true },
            { default: () => h("div") },
          ),
      }),
    );
  }

  it("`@@`-prefixed route name (internal marker) is skipped — announcement falls back to document.title", async () => {
    // A not-found navigation lands on core's reserved internal name
    // `@@router/UNKNOWN_ROUTE`; the announcer's resolveText must drop the route
    // name and fall through the chain (no <h1>, empty title) to document.title.
    // #1351 rejects a user-defined `@@` route at construction, so this drives
    // the genuine internal route via navigateToNotFound() rather than a
    // fabricated `@@notfound` route — parity with the React adapter's test.
    const internalRouter = createRouter(
      [
        { name: "test", path: "/" },
        { name: "other", path: "/other" },
      ],
      { defaultRoute: "test", allowNotFound: true },
    );

    internalRouter.usePlugin(browserPluginFactory({}));
    await internalRouter.start("/");

    document.title = "Fallback Title";

    const wrapper = mountAnnouncer(internalRouter);

    vi.advanceTimersByTime(100);

    // Primer: skipped by isInitialNavigation flag.
    await internalRouter.navigate("other");
    // Target: a not-found navigation lands on `@@router/UNKNOWN_ROUTE` → the
    // internal-route guard blanks the route name → resolution falls through to
    // document.title.
    internalRouter.navigateToNotFound("/does-not-exist");
    vi.advanceTimersByTime(10);

    const text = document.querySelector(ANNOUNCER_SEL)?.textContent;

    expect(text).toBe("Navigated to Fallback Title");
    expect(text).not.toContain("@@");

    wrapper.unmount();
    internalRouter.stop();
  });

  it("h1 with empty textContent — fallback chain proceeds to document.title", async () => {
    // resolveText does `(h1?.textContent ?? "").trim()` and treats the empty
    // result as falsy — the `||` chain falls through to document.title even
    // though the h1 element exists.
    const h1 = document.createElement("h1");

    h1.textContent = "";
    document.body.append(h1);
    document.title = "Backup Title";

    mountAnnouncer(baseRouter);

    vi.advanceTimersByTime(100);

    await baseRouter.navigate("about"); // primer (initial-skip)
    await baseRouter.navigate("home");

    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to Backup Title",
    );
  });

  it("h1 without an existing tabindex — manageFocus sets tabindex='-1' transiently", async () => {
    // The announcer is responsible for moving focus to the active page's
    // <h1>. If the heading has no tabindex it cannot receive focus, so the
    // helper installs tabindex='-1' (programmatic-only focus). Lock the
    // attribute that ends up on the DOM.
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    document.body.append(h1);

    mountAnnouncer(baseRouter);

    vi.advanceTimersByTime(100);

    await baseRouter.navigate("about"); // primer
    await baseRouter.navigate("home");

    expect(h1.getAttribute("tabindex")).toBe("-1");
  });

  it("h1 with a pre-existing tabindex='0' — manageFocus must NOT overwrite it", async () => {
    // Symmetric: if the consumer already exposed the h1 to keyboard
    // navigation (tabindex='0'), the announcer must preserve their choice.
    const h1 = document.createElement("h1");

    h1.textContent = "About Page";
    h1.setAttribute("tabindex", "0");
    document.body.append(h1);

    mountAnnouncer(baseRouter);

    vi.advanceTimersByTime(100);

    await baseRouter.navigate("about");
    await baseRouter.navigate("home");

    expect(h1.getAttribute("tabindex")).toBe("0");
  });

  it("rapid navigations within SAFARI_READY_DELAY (100ms) — `pendingText` overwrite silently drops the first text", async () => {
    // The announcer buffers pre-ready announcements in `pendingText`. A
    // *second* navigation arriving in the same window overwrites the first
    // — by design, since voiceOver only has one slot. Pin the drop.
    mountAnnouncer(baseRouter);

    // The Safari-ready timeout has not fired yet (default state after mount).
    // Each navigation runs the subscribe callback synchronously through the
    // stubbed rAF, so both will land in pendingText before isReady flips.
    // Advance time by 50ms between them to assert we are still in-window.
    await baseRouter.navigate("about"); // primer (skipped — initial)
    vi.advanceTimersByTime(50);
    await baseRouter.navigate("home"); // first real → pendingText
    vi.advanceTimersByTime(40); // still within 100ms window
    await baseRouter.navigate("items"); // second real → overwrites pendingText

    // Now flush the Safari-ready timer (100ms total) so the buffered text
    // is committed to the live region.
    vi.advanceTimersByTime(20);

    // Only the latest pending text reaches the announcer — the "home"
    // navigation was silently dropped.
    expect(document.querySelector(ANNOUNCER_SEL)?.textContent).toBe(
      "Navigated to items",
    );
  });

  it("`text === lastAnnouncedText` — repeated navigation to the same route does not re-trigger the announcement", async () => {
    // After the first announcement lands, the subscribe callback's guard
    // `text === lastAnnouncedText` short-circuits the announcer.textContent
    // assignment. Verify by:
    //  1) Navigate to a route → announcement lands.
    //  2) Capture textContent.
    //  3) Manually clear the announcer's textContent (simulate AT having
    //     read it).
    //  4) Re-navigate via `{ force: true }` to the same route.
    //  5) Expect textContent to stay empty — the dedupe gate suppresses
    //     the re-announce.
    mountAnnouncer(baseRouter);

    vi.advanceTimersByTime(100);

    await baseRouter.navigate("about"); // primer
    await baseRouter.navigate("home");

    const announcer = document.querySelector(ANNOUNCER_SEL);

    expect(announcer).not.toBeNull();
    expect(announcer!.textContent).toBe("Navigated to home");

    // Clear textContent to simulate the AT having read the live region.
    announcer!.textContent = "";

    // Force the router into a fresh subscribe event for the same route.
    await baseRouter.navigate("home", undefined, undefined, { force: true });

    // dedupe gate fires → no re-announce.
    expect(announcer!.textContent).toBe("");
  });

  it("a pre-existing announcer in the DOM is reused — no duplicate element is created", async () => {
    // Pre-install an announcer node that mimics one left over from a prior
    // mount (e.g. SSR hydration or a sibling RouterProvider). The factory's
    // `getOrCreateAnnouncer` should pick it up via the
    // `[data-real-router-announcer]` query and reuse it.
    const existing = document.createElement("div");

    existing.dataset.realRouterAnnouncer = "";
    existing.textContent = "pre-existing";
    document.body.prepend(existing);

    mountAnnouncer(baseRouter);

    // Should still be exactly one announcer element in the DOM.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);
    // The pre-existing node was reused — the helper does not clear its
    // textContent until the first real announcement lands.
    expect(document.querySelector(ANNOUNCER_SEL)).toBe(existing);
  });
});
