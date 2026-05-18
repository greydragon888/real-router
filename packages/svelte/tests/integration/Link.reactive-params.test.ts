// Closes review §8.2 row 3 (MED): pin actual behavior of `<Link>` when
// `routeParams` change reactively after mount.
//
// The audit flagged this as a potential bug: `useIsActiveRoute(...)` is
// called once in the Link `<script>` block, capturing initial `routeParams`.
// Reactive prop changes do NOT recreate the underlying active source.
//
// This test pins the documented behavior. Consumers who need active-state
// to track dynamic params must re-mount Link via `{#key}` or `{#each (id)}`.
// Documented as a Svelte 5 ergonomic trade-off in CLAUDE.md gotchas.

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestRouterWithADefaultRouter,
  renderWithRouter,
} from "../helpers";
import LinkReactiveParamsTest from "../helpers/LinkReactiveParamsTest.svelte";

import type { Router } from "@real-router/core";

describe("Link — Reactive routeParams (CLAUDE.md gotcha: captured at mount)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  // Pin the documented limitation: Link's active state binds to the
  // initial `routeParams`. Swap the prop after mount → active state still
  // tracks ORIGINAL params, not new ones. Locks this behavior so any
  // future ergonomic fix is intentional (and must update CLAUDE.md gotcha).
  it("swapping routeParams after mount: active class continues to track INITIAL params", async () => {
    await router.navigate("users.view", { id: "1" });
    flushSync();

    const { component } = renderWithRouter(router, LinkReactiveParamsTest, {
      initialParams: { id: "1" },
    });

    flushSync();

    const link = document.querySelector("a")!;

    // Initial params match current route → active class is set.
    expect(link.classList.contains("active")).toBe(true);

    // Swap to a different params via the exported `swap` accessor.
    component.swap({ id: "2" });
    flushSync();

    // Navigate to users.view#2 — but Link still has its INITIAL source for
    // id="1", so the cached active result reflects the old params.
    await router.navigate("users.view", { id: "2" });
    flushSync();

    // **Documented limitation**: even though the visible `routeParams` prop
    // is now `{id: "2"}` AND the route is `users.view` with id=2, the active
    // class does NOT light up — the underlying createActiveRouteSource was
    // bound to `{id: "1"}` at mount.
    //
    // Note: by Svelte 5 reactivity, `href` (which is wrapped in $derived)
    // DOES update — so the href will show /users/2. Only the active state is
    // stale.
    expect(link.getAttribute("href")).toContain("/users/2");
    expect(link.classList.contains("active")).toBe(false);
  });

  // Workaround test: re-mounting via `{#key}` provides correct active state
  // for dynamic params. Documented escape hatch for consumers.
  it("re-mount via Svelte's reactivity (test-driven swap + reset): new mount gets fresh source", async () => {
    await router.navigate("users.view", { id: "1" });
    flushSync();

    // First mount with id=1.
    const first = renderWithRouter(router, LinkReactiveParamsTest, {
      initialParams: { id: "1" },
    });

    flushSync();

    expect(document.querySelector("a")!.classList.contains("active")).toBe(
      true,
    );

    first.unmount();

    // Second fresh mount with id=2 — simulates `{#key id}` re-mount pattern.
    await router.navigate("users.view", { id: "2" });
    flushSync();

    renderWithRouter(router, LinkReactiveParamsTest, {
      initialParams: { id: "2" },
    });

    flushSync();

    // Fresh source bound to id=2 → active correctly reflects current route.
    const link = document.querySelector("a")!;

    expect(link.classList.contains("active")).toBe(true);
  });
});
