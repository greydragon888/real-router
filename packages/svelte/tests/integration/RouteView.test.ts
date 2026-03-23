import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import RouteViewBasicTest from "../helpers/RouteViewBasicTest.svelte";
import RouteViewNestedTest from "../helpers/RouteViewNestedTest.svelte";

import type { Router } from "@real-router/core";

describe("RouteView - Integration Tests", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("Navigation Switching", () => {
    it("should switch snippets on navigation", async () => {
      await router.start("/home");

      render(RouteViewBasicTest, { props: { router } });

      expect(screen.getByTestId("home")).toHaveTextContent("Home Page");

      await router.navigate("about");
      flushSync();

      expect(screen.queryByTestId("home")).toBeNull();
      expect(screen.getByTestId("about")).toHaveTextContent("About Page");

      await router.navigate("users.list");
      flushSync();

      expect(screen.queryByTestId("about")).toBeNull();
      expect(screen.getByTestId("users")).toHaveTextContent("Users Page");
    });

    it("should render notFound on UNKNOWN_ROUTE", async () => {
      await router.start("/nonexistent-path-xyz");

      render(RouteViewBasicTest, { props: { router } });

      expect(screen.getByTestId("not-found")).toHaveTextContent("Not Found");
    });
  });

  describe("Nested RouteView", () => {
    it("should match sub-segments correctly", async () => {
      await router.start("/users/list");

      render(RouteViewNestedTest, { props: { router } });

      expect(screen.getByTestId("users-list")).toHaveTextContent("Users List");

      await router.navigate("users.view", { id: "99" });
      flushSync();

      expect(screen.queryByTestId("users-list")).toBeNull();
      expect(screen.getByTestId("users-view")).toHaveTextContent("User View");

      await router.navigate("users.edit", { id: "99" });
      flushSync();

      expect(screen.queryByTestId("users-view")).toBeNull();
      expect(screen.getByTestId("users-edit")).toHaveTextContent("User Edit");
    });

    it("should render nothing when navigating away from parent", async () => {
      await router.start("/users/list");

      render(RouteViewNestedTest, { props: { router } });

      expect(screen.getByTestId("users-list")).toHaveTextContent("Users List");

      await router.navigate("home");
      flushSync();

      expect(screen.queryByTestId("users-list")).toBeNull();
      expect(screen.queryByTestId("users-view")).toBeNull();
    });
  });
});
