import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteViewBasicTest from "../helpers/RouteViewBasicTest.svelte";
import RouteViewNestedTest from "../helpers/RouteViewNestedTest.svelte";
import RouteViewNoNotFoundTest from "../helpers/RouteViewNoNotFoundTest.svelte";

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
});
