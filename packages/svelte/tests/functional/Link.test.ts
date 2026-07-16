import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import Link from "../../src/components/Link.svelte";
import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";

import type { Router, State } from "@real-router/core";

describe("Link component", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("should render an anchor with correct href", () => {
    renderWithRouter(router, Link, {
      routeName: "one-more-test",
    });

    const link = document.querySelector("a")!;

    expect(link.getAttribute("href")).toBe("/test");
  });

  it("should render component with passed class name", () => {
    renderWithRouter(router, Link, {
      routeName: "one-more-test",
      class: "test-class",
    });

    const link = document.querySelector("a");

    expect(link!.classList.contains("test-class")).toBe(true);
  });

  describe("activeClassName", () => {
    it("should set active class when route matches", async () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        activeClassName: "active",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(false);

      await userEvent.click(link);
      flushSync();

      expect(link.classList.contains("active")).toBe(true);
    });

    it("should apply default 'active' class when no activeClassName prop is provided", async () => {
      renderWithRouter(router, Link, {
        routeName: "one-more-test",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(false);

      await userEvent.click(link);
      flushSync();

      expect(link.classList.contains("active")).toBe(true);
    });

    it("should add active class based on activeStrict", async () => {
      await router.navigate("items.item", { id: 6 });

      renderWithRouter(router, Link, {
        routeName: "items",
        activeStrict: false,
        activeClassName: "active",
      });

      expect(document.querySelector("a")!.classList.contains("active")).toBe(
        true,
      );
    });

    // Closes CLAUDE.md gotcha #10 audit gap: Link's `ignoreQueryParams`
    // default is `true` (Link.svelte:22). Without an explicit functional
    // test, an unobservant refactor (e.g. flipping the default to `false`
    // for "safer" param matching) would silently break every consumer that
    // relies on tab-style query-param links staying active across page
    // changes. This test pins the default value behaviorally — `Link`
    // mounted WITHOUT the prop must stay active when only query params
    // change on the same route.
    it("ignoreQueryParams defaults to true — same route + different query params still active", async () => {
      // Navigate first so the link's params match the active state.
      await router.navigate("items.item", { id: "6", page: "1" });
      flushSync();

      renderWithRouter(router, Link, {
        routeName: "items.item",
        routeParams: { id: "6" },
        activeClassName: "active",
        // NOTE: ignoreQueryParams intentionally omitted — drives the default.
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(true);

      // Same route name + same path params, ONLY the query param differs.
      // Default behavior must keep the link active.
      await router.navigate("items.item", { id: "6", page: "2" });
      flushSync();

      expect(link.classList.contains("active")).toBe(true);
    });

    // Symmetry pin: when consumers explicitly opt out via
    // `ignoreQueryParams={false}`, the link MUST drop active on query-param
    // change. Catches a hypothetical regression that ignored the prop value
    // entirely and always treated query params as "ignore".
    it("ignoreQueryParams={false} — same route + different query params drops active", async () => {
      await router.navigate("items.item", { id: "6", page: "1" });
      flushSync();

      renderWithRouter(router, Link, {
        routeName: "items.item",
        routeParams: { id: "6", page: "1" },
        activeStrict: true,
        ignoreQueryParams: false,
        activeClassName: "active",
      });

      const link = document.querySelector("a")!;

      expect(link.classList.contains("active")).toBe(true);

      await router.navigate("items.item", { id: "6", page: "2" });
      flushSync();

      // ignoreQueryParams=false → different query params → NOT active.
      expect(link.classList.contains("active")).toBe(false);
    });
  });

  describe("clickHandler", () => {
    it("should not navigate when target is _blank", async () => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        target: "_blank",
      });

      await userEvent.click(document.querySelector("a")!);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should not navigate when custom onclick calls preventDefault", () => {
      vi.spyOn(router, "navigate");

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        onclick: (evt: MouseEvent) => {
          evt.preventDefault();
        },
      });

      const link = document.querySelector("a")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      link.dispatchEvent(event);

      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("should navigate when custom onclick does not prevent default", () => {
      vi.spyOn(router, "navigate").mockResolvedValue({} as State);

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        onclick: () => {},
      });

      const link = document.querySelector("a")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      link.dispatchEvent(event);

      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
    });

    it("still navigates (isolated) when the onclick handler throws (#1436)", () => {
      // Native <a> semantics: a throwing click listener is logged and the
      // default action still runs — mirrors vue's #1352 isolation. Pre-fix the
      // throw escapes handleClick before navigateWithHash, aborting navigation.
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      vi.spyOn(router, "navigate").mockResolvedValue({} as State);

      renderWithRouter(router, Link, {
        routeName: "one-more-test",
        onclick: () => {
          throw new Error("boom");
        },
      });

      const link = document.querySelector("a")!;
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });

      // Swallow the pre-fix propagated throw so the discriminating asserts run.
      try {
        link.dispatchEvent(event);
      } catch {
        /* pre-fix: unisolated throw */
      }

      expect(router.navigate).toHaveBeenCalledWith("one-more-test", {}, {});
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[real-router]"),
        expect.any(Error),
      );

      errorSpy.mockRestore();
    });
  });

  describe("URL Building", () => {
    it("should use buildPath when router has no buildUrl", async () => {
      const routerWithoutBuildUrl = createRouter([
        { name: "test", path: "/" },
        { name: "users", path: "/users" },
      ]);

      await routerWithoutBuildUrl.start("/");

      renderWithRouter(routerWithoutBuildUrl, Link, {
        routeName: "users",
      });

      expect(document.querySelector("a")!.getAttribute("href")).toBe("/users");

      routerWithoutBuildUrl.stop();
    });
  });

  it("should render without href and log error for invalid routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderWithRouter(router, Link, { routeName: "@@nonexistent-route" });

    const link = document.querySelector("a")!;

    expect(link.hasAttribute("href")).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(
        /Route ".*@@nonexistent-route.*" is not defined\. The element will render without an href attribute\./,
      ),
    );

    consoleError.mockRestore();
  });

  // Documents buildHref behavior when routeName is an empty string.
  // router.buildPath("") throws in core, buildHref catches it and returns undefined
  // while logging a console.error. Consumers that pass routeName="" should expect
  // an anchor without href — this test locks the contract.
  it("should render without href and log error for empty routeName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderWithRouter(router, Link, { routeName: "" });

    const link = document.querySelector("a")!;

    expect(link.hasAttribute("href")).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('Route ""'),
    );

    consoleError.mockRestore();
  });

  describe("no-params active state — fast path (#1099) vs slow-path dedup (#776)", () => {
    it("a default no-params <Link> uses the shared name-selector fast path, NOT a per-link createActiveRouteSource (#1099)", () => {
      // #1099 — a default-options no-params `<Link routeName="users">` resolves
      // active state through the per-router `createActiveNameSelector` (ONE
      // shared `router.subscribe` for any number of distinct-name links), NOT a
      // per-link `createActiveRouteSource` (a `BaseSource` + its own router
      // subscription EACH). That per-link source was the bulk of the Svelte
      // `<Link>`'s excess link-build cost over the Solid adapter.
      //
      // Discriminator: the canonical undefined-params slow-path source is
      // therefore still UNBUILT after the Link mounts. Building it now is a cache
      // MISS — `buildActiveRouteSource` computes its initial value via
      // `router.isActiveRoute`. (Pre-#1099 the Link built this exact source, so
      // the same call was a cache HIT and `isActiveRoute` was NOT re-run.)
      renderWithRouter(router, Link, { routeName: "users" });

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "users", undefined, {
        strict: false,
        ignoreQueryParams: true,
      });

      expect(isActiveRouteSpy).toHaveBeenCalled();
    });

    it("a slow-path no-params <Link> (activeStrict) still shares the canonical undefined-params source (#776)", () => {
      // When a no-params Link falls to the slow path (here via `activeStrict`,
      // which the fast path excludes), it must still pass `routeParams` straight
      // through as `undefined` — keying the source "" (not "{}") — so a manual
      // `useIsActiveRoute` / a matching Link shares the SAME cached source (one
      // router subscription, not two). Discriminator: after the Link mounts +
      // subscribes (building the source, calling `isActiveRoute` before the spy),
      // asking for the identical source is a cache HIT → `isActiveRoute` is NOT
      // re-run.
      renderWithRouter(router, Link, {
        routeName: "users",
        activeStrict: true,
      });

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "users", undefined, {
        strict: true,
        ignoreQueryParams: true,
      });

      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });
  });
});
