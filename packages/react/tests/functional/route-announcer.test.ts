import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouteAnnouncer } from "../../src/dom-utils";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router, State } from "@real-router/core";

const ANNOUNCER_SEL = "[data-real-router-announcer]";

/**
 * Direct unit tests for `resolveText` (internal — exercised via
 * `createRouteAnnouncer.subscribe` callback). The integration coverage in
 * `RouterProvider.a11y.test.tsx` only hits the happy path of a defined route
 * with `<h1>` text — the fallback chain (UNKNOWN_ROUTE / `@@*` /
 * document.title / pathname) and the `getAnnouncementText` option are not
 * reachable from there because RouterProvider does not expose options.
 *
 * The announcer skips the first subscribe callback (`isInitialNavigation`),
 * so each test does a primer navigation, then mutates DOM state, then
 * navigates again to the route whose announcement we actually verify.
 *
 * The announcer DOM node lives directly under `document.body`, so DOM mutations
 * use `appendChild`/explicit clears rather than `body.innerHTML = …` — the
 * latter detaches the announcer and silently breaks every assertion.
 */
describe("route-announcer — resolveText fallback chain", () => {
  let router: Router;

  function appendHeading(text: string): HTMLHeadingElement {
    const h1 = document.createElement("h1");

    h1.textContent = text;
    document.body.append(h1);

    return h1;
  }

  function clearHeadings(): void {
    document.querySelectorAll("h1").forEach((node) => {
      node.remove();
    });
  }

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
    clearHeadings();
    document.title = "";
  });

  function flush(): void {
    // Drain Safari-ready delay (100ms) + double rAF + clear timers.
    act(() => {
      vi.advanceTimersByTime(150);
    });
  }

  async function navigate(name: string): Promise<void> {
    await act(async () => {
      await router.navigate(name);
    });
    flush();
  }

  function announcerText(): string {
    const element = document.querySelector(ANNOUNCER_SEL);

    expect(element).not.toBeNull();

    return element!.textContent;
  }

  it("falls back to <h1> textContent when present (control case)", async () => {
    const announcer = createRouteAnnouncer(router);

    flush();
    await navigate("home"); // primer — skipped by isInitialNavigation

    appendHeading("Page Heading");
    document.title = "Doc Title";

    await navigate("about");

    expect(announcerText()).toBe("Navigated to Page Heading");

    announcer.destroy();
  });

  it("falls back to document.title when no <h1> is rendered", async () => {
    const announcer = createRouteAnnouncer(router);

    flush();
    await navigate("home"); // primer

    document.title = "My App — About";

    await navigate("about");

    expect(announcerText()).toBe("Navigated to My App — About");

    announcer.destroy();
  });

  it("falls back to route.name when no <h1> and document.title is empty", async () => {
    const announcer = createRouteAnnouncer(router);

    flush();
    await navigate("home"); // primer

    document.title = "";

    await navigate("about");

    expect(announcerText()).toBe("Navigated to about");

    announcer.destroy();
  });

  it("skips internal `@@*` route names and falls back further down the chain", async () => {
    // Use a router that allows UNKNOWN_ROUTE so we can navigate into a real
    // `@@router/UNKNOWN_ROUTE` state and exercise the internal-prefix branch
    // of resolveText without monkey-patching subscribe.
    router.stop();
    router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
      ],
      { defaultRoute: "home", allowNotFound: true },
    );
    router.usePlugin(browserPluginFactory({}));
    await router.start("/");

    const announcer = createRouteAnnouncer(router);

    flush();
    await navigate("about"); // primer

    // Set document.title so we can observe the fallback skipping route.name.
    document.title = "Resource Missing";

    await act(async () => {
      router.navigateToNotFound("/missing-resource");
    });
    flush();

    // route.name = "@@router/UNKNOWN_ROUTE" → starts with "@@" → resolveText
    // skips it, falls through to document.title.
    expect(announcerText()).toBe("Navigated to Resource Missing");

    announcer.destroy();
  });

  it("honors custom getAnnouncementText option (bypasses entire fallback chain)", async () => {
    const getCustom = vi.fn((route: State) => `Custom: ${route.name}`);
    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: getCustom,
    });

    flush();
    await navigate("home"); // primer

    appendHeading("Heading should be ignored");
    document.title = "Title should also be ignored";

    await navigate("about");

    expect(getCustom).toHaveBeenCalledWith(
      expect.objectContaining({ name: "about" }),
    );
    expect(announcerText()).toBe("Custom: about");

    announcer.destroy();
  });

  it("falls through to default chain + logs error when getAnnouncementText throws (review-2026-05-10 §5.7)", async () => {
    // Defensive: a user-provided callback running inside router.subscribe's
    // loop must not be allowed to tear down sibling listeners. Wrapping
    // the call in try/catch keeps the announcer alive and routes to the
    // built-in fallback chain (h1 → title → route.name).
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwingGetText = vi.fn(() => {
      throw new Error("user-code threw");
    });

    const announcer = createRouteAnnouncer(router, {
      getAnnouncementText: throwingGetText,
    });

    flush();
    await navigate("home"); // primer

    appendHeading("Visible Fallback Heading");

    await navigate("about");

    // Callback was invoked and threw; announcer caught and fell through
    // to the h1 textContent.
    expect(throwingGetText).toHaveBeenCalled();
    expect(announcerText()).toBe("Navigated to Visible Fallback Heading");
    // Error was logged so consumers can diagnose, but did not propagate.
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("[real-router] getAnnouncementText threw"),
      expect.any(Error),
    );

    announcer.destroy();
    errSpy.mockRestore();
  });

  it("respects custom prefix option", async () => {
    const announcer = createRouteAnnouncer(router, { prefix: "Page: " });

    flush();
    await navigate("home"); // primer

    appendHeading("Dashboard");

    await navigate("about");

    expect(announcerText()).toBe("Page: Dashboard");

    announcer.destroy();
  });

  it("focuses the <h1> after announcing (manageFocus side-effect)", async () => {
    const announcer = createRouteAnnouncer(router);

    flush();
    await navigate("home"); // primer

    const h1 = appendHeading("Focusable");

    await navigate("about");

    // tabindex was added by manageFocus and the h1 received focus.
    expect(h1.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(h1);

    announcer.destroy();
  });

  it("reuses the singleton announcer element across concurrent subscribers", () => {
    const a1 = createRouteAnnouncer(router);
    const a2 = createRouteAnnouncer(router);

    // Two subscribers share the same `[data-real-router-announcer]` element.
    expect(document.querySelectorAll(ANNOUNCER_SEL)).toHaveLength(1);

    a1.destroy();
    a2.destroy();

    // Both destroyers eventually clear the DOM (last destroy is a no-op).
    expect(document.querySelector(ANNOUNCER_SEL)).toBeNull();
  });
});
