import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getActiveSegment } from "../../src/components/RouteView.svelte";
import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteViewBasicTest from "../helpers/RouteViewBasicTest.svelte";
import RouteViewNestedTest from "../helpers/RouteViewNestedTest.svelte";
import RouteViewNoNotFoundTest from "../helpers/RouteViewNoNotFoundTest.svelte";
import RouteViewSelfTest from "../helpers/RouteViewSelfTest.svelte";

import type { Router } from "@real-router/core";

describe("RouteView", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("State", () => {
    it("should render nothing if route is undefined (router not started)", () => {
      render(RouteViewBasicTest, { props: { router } });

      expect(screen.queryByTestId("test")).toBeNull();
      expect(screen.queryByTestId("home")).toBeNull();
      expect(screen.queryByTestId("not-found")).toBeNull();
    });
  });

  describe("Snippet Rendering", () => {
    it("should render matching snippet when router is started", async () => {
      await router.start("/");

      render(RouteViewBasicTest, { props: { router } });

      expect(screen.getByTestId("test")).toHaveTextContent("Test Page");
    });

    it("should render different snippet when route changes", async () => {
      await router.start("/");

      render(RouteViewBasicTest, { props: { router } });

      expect(screen.getByTestId("test")).toHaveTextContent("Test Page");

      await router.navigate("users.list");
      flushSync();

      expect(screen.queryByTestId("test")).toBeNull();
      expect(screen.getByTestId("users")).toHaveTextContent("Users Page");
    });

    it("should render notFound snippet for unknown route", async () => {
      await router.start("/nonexistent-path-xyz");

      render(RouteViewBasicTest, { props: { router } });

      expect(screen.getByTestId("not-found")).toHaveTextContent("Not Found");
    });

    it("should render nothing when no snippet matches and no notFound", async () => {
      await router.start("/nonexistent-path-xyz");

      render(RouteViewNoNotFoundTest, { props: { router } });

      expect(screen.queryByTestId("home")).toBeNull();
      expect(document.body.textContent.trim()).toBe("");
    });
  });

  describe("Nested RouteView", () => {
    it("should match sub-segments with nodeName", async () => {
      await router.start("/users/list");

      render(RouteViewNestedTest, { props: { router } });

      expect(screen.getByTestId("users-list")).toHaveTextContent("Users List");
    });

    it("should switch between sub-segments", async () => {
      await router.start("/users/list");

      render(RouteViewNestedTest, { props: { router } });

      expect(screen.getByTestId("users-list")).toHaveTextContent("Users List");

      await router.navigate("users.view", { id: "42" });
      flushSync();

      expect(screen.queryByTestId("users-list")).toBeNull();
      expect(screen.getByTestId("users-view")).toHaveTextContent("User View");
    });

    it("should render nothing when parent route is not active", async () => {
      await router.start("/home");

      render(RouteViewNestedTest, { props: { router } });

      expect(screen.queryByTestId("users-list")).toBeNull();
      expect(screen.queryByTestId("users-view")).toBeNull();
    });
  });

  describe("Self snippet", () => {
    it("renders self snippet when active route name === nodeName", async () => {
      await router.start("/users");

      render(RouteViewSelfTest, { props: { router } });

      expect(screen.getByTestId("users-self")).toHaveTextContent("UsersList");
      expect(screen.queryByTestId("users-view")).toBeNull();
    });

    it("does not render self when a descendant snippet matches", async () => {
      await router.start("/users/42");

      render(RouteViewSelfTest, { props: { router } });

      expect(screen.getByTestId("users-view")).toHaveTextContent("User View");
      expect(screen.queryByTestId("users-self")).toBeNull();
    });

    it("does not render self when route is unrelated to nodeName", async () => {
      await router.start("/home");

      render(RouteViewSelfTest, { props: { router } });

      expect(screen.queryByTestId("users-self")).toBeNull();
      expect(screen.queryByTestId("users-view")).toBeNull();
    });
  });

  describe("getActiveSegment (pure helper)", () => {
    it("returns the matching segment for a top-level node", () => {
      expect(
        getActiveSegment("users.list", "", { users: () => {}, home: () => {} }),
      ).toBe("users");
    });

    it("returns the matching segment for a nested node", () => {
      expect(
        getActiveSegment("users.list", "users", {
          list: () => {},
          view: () => {},
        }),
      ).toBe("list");
    });

    it("returns empty string when no segment matches", () => {
      expect(
        getActiveSegment("about", "", { home: () => {}, users: () => {} }),
      ).toBe("");
    });

    it("returns empty string for an empty routeName", () => {
      expect(getActiveSegment("", "", { home: () => {} })).toBe("");
    });

    it("treats hyphens as part of the segment, not as boundaries", () => {
      // "one-more-test" must NOT match snippet "one"
      expect(getActiveSegment("one-more-test", "", { one: () => {} })).toBe("");
    });

    it("matches a segment that itself contains hyphens", () => {
      expect(
        getActiveSegment("users-extra.list", "users-extra", {
          list: () => {},
        }),
      ).toBe("list");
    });

    it("is case-sensitive", () => {
      expect(getActiveSegment("users.list", "", { Users: () => {} })).toBe("");
    });

    // Critical: a snippet named "notFound" must NEVER be picked as a regular
    // segment match — it is reserved for the UNKNOWN_ROUTE fallback. Even if a
    // route is literally named "notFound", the snippet must not be returned
    // from getActiveSegment.
    it("never returns 'notFound' even when the route name matches it exactly", () => {
      expect(getActiveSegment("notFound", "", { notFound: () => {} })).toBe("");
    });

    it("never returns 'notFound' for a child route under a 'notFound' parent", () => {
      expect(
        getActiveSegment("notFound.detail", "", { notFound: () => {} }),
      ).toBe("");
    });

    it("never returns 'self' even when the route name matches it exactly", () => {
      expect(getActiveSegment("self", "", { self: () => {} })).toBe("");
    });

    it("never returns 'self' for a child route under a 'self' parent", () => {
      expect(getActiveSegment("self.detail", "", { self: () => {} })).toBe("");
    });
  });
});
