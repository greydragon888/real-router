import { createRouteSource } from "@real-router/sources";
import { render, screen } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { describe, afterEach, it, expect } from "vitest";

import { createSignalFromSource } from "@real-router/solid";

import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged.
// This is the solid P1 probe ported as a permanent guard: it locks the #765
// reconnect-reconcile fix at the adapter composition level.
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  // #765 manifestation in Solid: a publicly-lifted `createRouteSource` bridged
  // through `createSignalFromSource` inside a `<Show>`. When `show` flips off the
  // bridge's owner is disposed → unsubscribe → the lifted source disconnects; a
  // navigation that lands "off" was stale on re-show before #765. With the
  // reconnect reconcile (createRouteSource onFirstSubscribe) the re-subscribed
  // bridge sees the current route.
  it("P1: a lifted createRouteSource bridged inside <Show> is fresh after off → navigate → on", async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
    await router.navigate("users.list");

    const liftedSource = createRouteSource(router);
    const [show, setShow] = createSignal(true);

    const Reader = () => {
      const snap = createSignalFromSource(liftedSource);

      return <div data-testid="reader">{snap().route?.name ?? "none"}</div>;
    };

    render(() => (
      <Show when={show()} fallback={<div data-testid="off">off</div>}>
        <Reader />
      </Show>
    ));

    expect(screen.getByTestId("reader").textContent).toBe("users.list");

    // Hide → Reader's owner disposes → the lifted source loses its last
    // listener and disconnects from the router.
    setShow(false);

    expect(screen.getByTestId("off")).not.toBeNull();
    expect(screen.queryByTestId("reader")).toBeNull();

    // Navigate while the source is disconnected.
    await router.navigate("about");

    // Show → a fresh Reader re-subscribes → createRouteSource reconciles on
    // first subscribe → the bridge reads the current route, not the stale one.
    setShow(true);

    expect(screen.getByTestId("reader").textContent).toBe("about");
  });
});
