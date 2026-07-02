// Regression suite for #1094 — winner-keyed RouteView pipeline.
//
// Before #1094 the Solid `RouteView` re-materialized its winning `<Match>`
// subtree on EVERY node-signal fire (a navigation), disposing and recreating
// the child components even when the same `<Match>` stayed active — so a
// navigation within the active branch silently lost local component state
// (divergent from the React/Vue adapters, which preserve it). The winner-keyed
// `createMemo` (`pickWinner` + `winnersEqual`) fixes this: children are
// materialized once per winner CHANGE, not per navigation.
import { render, screen } from "@solidjs/testing-library";
import { createSignal, onCleanup } from "solid-js";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RouteView, RouterProvider } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

describe("RouteView — subtree preservation (#1094)", () => {
  let router: Router;

  beforeEach(() => {
    router = createTestRouterWithADefaultRouter();
  });

  afterEach(() => {
    router.stop();
  });

  it("preserves the active subtree across an in-winner navigation", async () => {
    await router.start("/users/list");

    let mounts = 0;
    let cleanups = 0;

    function Probe(): JSX.Element {
      mounts++;
      const [instance] = createSignal(mounts);

      onCleanup(() => {
        cleanups++;
      });

      return <div data-testid="probe" data-instance={String(instance())} />;
    }

    render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users">
            <Probe />
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ));

    expect(screen.getByTestId("probe").dataset.instance).toBe("1");

    // users.list -> users.view: the winning `<Match segment="users">` is
    // unchanged, so the Probe instance must survive (no dispose/recreate).
    await router.navigate("users.view", { id: "42" });

    expect(mounts).toBe(1);
    expect(cleanups).toBe(0);
    expect(screen.getByTestId("probe").dataset.instance).toBe("1");
  });

  it("remounts when the winning Match changes", async () => {
    await router.start("/users/list");

    let usersMounts = 0;
    let usersCleanups = 0;
    let aboutMounts = 0;

    function UsersProbe(): JSX.Element {
      usersMounts++;
      onCleanup(() => {
        usersCleanups++;
      });

      return <div data-testid="users-probe" />;
    }

    function AboutProbe(): JSX.Element {
      aboutMounts++;

      return <div data-testid="about-probe" />;
    }

    render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users">
            <UsersProbe />
          </RouteView.Match>
          <RouteView.Match segment="about">
            <AboutProbe />
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ));

    expect(screen.getByTestId("users-probe")).toBeInTheDocument();
    expect(usersMounts).toBe(1);
    expect(aboutMounts).toBe(0);

    // users.list -> about: the winner flips, so the users subtree disposes and
    // the about subtree mounts.
    await router.navigate("about");

    expect(usersCleanups).toBe(1);
    expect(aboutMounts).toBe(1);
    expect(screen.queryByTestId("users-probe")).not.toBeInTheDocument();
    expect(screen.getByTestId("about-probe")).toBeInTheDocument();
  });

  it("handles winner -> none -> winner without a stale render", async () => {
    await router.start("/users/list");

    let mounts = 0;

    function Probe(): JSX.Element {
      mounts++;

      return <div data-testid="probe" data-m={String(mounts)} />;
    }

    const { container } = render(() => (
      <RouterProvider router={router}>
        <RouteView nodeName="">
          <RouteView.Match segment="users">
            <Probe />
          </RouteView.Match>
        </RouteView>
      </RouterProvider>
    ));

    expect(mounts).toBe(1);

    // "test" (path "/") matches no Match here → winner becomes null → empty.
    await router.navigate("test");

    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();
    expect(container.innerHTML).toBe("");

    // Back into the branch → fresh mount, correct render.
    await router.navigate("users.list");

    expect(screen.getByTestId("probe")).toBeInTheDocument();
    expect(mounts).toBe(2);
  });
});
