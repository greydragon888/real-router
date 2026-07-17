import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getActiveSegment } from "../../src/components/RouteView.helpers";
import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteViewBasicTest from "../helpers/RouteViewBasicTest.svelte";
import RouteViewNestedTest from "../helpers/RouteViewNestedTest.svelte";
import RouteViewNoNotFoundTest from "../helpers/RouteViewNoNotFoundTest.svelte";
import RouteViewSelfTest from "../helpers/RouteViewSelfTest.svelte";
import RouteViewSubtreeTest from "../helpers/RouteViewSubtreeTest.svelte";

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

  // #1439 — Svelte's structural exemption from the duplicate-<NotFound>
  // first-vs-last question. A RouteView marker is a named snippet, which
  // compiles to a lexical binding, so two same-named snippets are a duplicate
  // declaration — a COMPILE error, never a runtime last-wins/first-wins choice.
  // The other five adapters resolve duplicates in JS (React/Preact/Solid/Vue
  // first-wins via a guard, #1439); Svelte cannot express the duplicate at all.
  describe("duplicate marker exemption (#1439)", () => {
    it("two identically-named marker snippets fail to compile (declaration_duplicate)", async () => {
      const { compile } = await import("svelte/compiler");
      const duplicate =
        "{#snippet notFound()}first{/snippet}{#snippet notFound()}second{/snippet}";

      expect(() => compile(duplicate, { generate: "client" })).toThrow(
        /already been declared/,
      );
    });

    it("a single marker snippet compiles cleanly (control)", async () => {
      const { compile } = await import("svelte/compiler");
      const single = "{#snippet notFound()}only{/snippet}";

      expect(() => compile(single, { generate: "client" })).not.toThrow();
    });
  });

  // #1252 — F3: RouteView must PRESERVE the winning segment's rendered subtree
  // (and its component state) across an in-winner navigation (a route change
  // where the same top-level segment stays active). Remounting would lose local
  // state — the #1094 correctness bug the Solid adapter had. Mirrors
  // `packages/solid/tests/functional/RouteView.subtree.test.tsx`.
  describe("subtree preservation (F3, #1252)", () => {
    it("preserves the active subtree across an in-winner navigation", async () => {
      await router.start("/users/list");

      const probe = { mounts: 0, destroys: 0 };

      render(RouteViewSubtreeTest, { props: { router, probe } });
      flushSync();

      expect(screen.getByTestId("probe")).toBeInTheDocument();
      expect(probe.mounts).toBe(1);

      // users.list -> users.view: the winning "users" snippet stays active, so
      // the probe child must NOT remount.
      await router.navigate("users.view", { id: "42" });
      flushSync();

      expect(probe.mounts).toBe(1);
      expect(probe.destroys).toBe(0);
      expect(screen.getByTestId("probe")).toBeInTheDocument();
    });

    it("remounts when the winning segment changes (control)", async () => {
      await router.start("/users/list");

      const probe = { mounts: 0, destroys: 0 };

      render(RouteViewSubtreeTest, { props: { router, probe } });
      flushSync();

      expect(probe.mounts).toBe(1);

      // users.list -> about: the winner flips, so the probe subtree disposes and
      // the about subtree mounts. Proves the preservation above is real, not a
      // probe that never remounts.
      await router.navigate("about");
      flushSync();

      expect(probe.destroys).toBe(1);
      expect(screen.queryByTestId("probe")).toBeNull();
      expect(screen.getByTestId("about")).toBeInTheDocument();
    });
  });
});
