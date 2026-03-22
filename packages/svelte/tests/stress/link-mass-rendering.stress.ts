import { tick } from "svelte";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import ManyLinks from "./components/ManyLinks.svelte";

import {
  createStressRouter,
  renderWithRouter,
  navigateSequentially,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("link-mass-rendering stress tests (Svelte)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(200);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  it("2.1: 100 Links mount — correct DOM, all links present", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 100,
    });

    await tick();

    const links = container.querySelectorAll("a");

    expect(links).toHaveLength(100);

    unmount();
  });

  it("2.2: 100 Links + navigate to one — only active Link gets active class", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 100,
    });

    await tick();

    await router.navigate("route5");
    await tick();

    const activeLinks = container.querySelectorAll(".active");

    expect(activeLinks).toHaveLength(1);

    const link5 = container.querySelector("[data-testid='link-5']");

    expect(link5?.classList.contains("active")).toBe(true);

    unmount();
  });

  it("2.3: 100 Links + 50 navigations round-robin — correct final active state", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 100,
    });

    await tick();

    await router.navigate("users.list");
    await tick();

    const routeNames = Array.from({ length: 50 }, (_, i) => `route${i}`);

    await navigateSequentially(
      router,
      routeNames.map((name) => ({ name })),
    );

    const link49 = container.querySelector("[data-testid='link-49']");

    expect(link49?.classList.contains("active")).toBe(true);

    const activeLinks = container.querySelectorAll(".active");

    expect(activeLinks).toHaveLength(1);

    unmount();
  });

  it("2.4: 100 Links with deep routeParams — correct active state", async () => {
    const { container, unmount } = renderWithRouter(router, ManyLinks, {
      count: 100,
    });

    await tick();

    await router.navigate("route10");
    await tick();

    const link10 = container.querySelector("[data-testid='link-10']");

    expect(link10?.classList.contains("active")).toBe(true);

    await router.navigate("route50");
    await tick();

    const link50 = container.querySelector("[data-testid='link-50']");

    expect(link50?.classList.contains("active")).toBe(true);
    expect(link10?.classList.contains("active")).toBe(false);

    const activeLinks = container.querySelectorAll(".active");

    expect(activeLinks).toHaveLength(1);

    unmount();
  });
});
