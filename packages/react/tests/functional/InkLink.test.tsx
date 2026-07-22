import { createActiveRouteSource } from "@real-router/sources";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InkLink } from "../../src/components/InkLink";
import { InkRouterProvider } from "../../src/components/InkRouterProvider";
import { createTestRouterWithADefaultRouter } from "../helpers";

import type { Router } from "@real-router/core";

const ENTER = "\r";
const TAB = "\t";
const ESC = String.fromCodePoint(27);

// Ink's focus-manager applies autoFocus inside an effect, and each frame commit
// is scheduled via setImmediate. CI runners are slower than local machines, so
// the default settle time is generous; individual tests can override. Post-input
// assertions use `vi.waitFor` instead of a fixed delay. The 1000ms default is
// tuned to survive slow GitHub Actions runners — it ran into intermittent
// failures at 250ms under load (Enter sent before useInput activated on focus).
const flushInk = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const WAIT_OPTS = { timeout: 3000, interval: 50 } as const;

describe("InkLink", () => {
  let router: Router;

  beforeEach(async () => {
    router = createTestRouterWithADefaultRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("renders children text", () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="users.list" autoFocus>
          Go to users
        </InkLink>
      </InkRouterProvider>,
    );

    expect(lastFrame()).toContain("Go to users");
  });

  it("navigates on Enter when focused", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="users.list" autoFocus>
          Users
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    stdin.write(ENTER);

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("users.list", {}, undefined, {});
    }, WAIT_OPTS);
  });

  it("forwards routeParams and routeOptions to navigate", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");
    const params = { id: "42" };
    const options = { replace: true };

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink
          routeName="users.view"
          routeParams={params}
          routeOptions={options}
          autoFocus
        >
          View
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    stdin.write(ENTER);

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "users.view",
        params,
        undefined,
        options,
      );
    }, WAIT_OPTS);
  });

  it("calls onSelect before navigate", async () => {
    const calls: string[] = [];
    const onSelect = vi.fn(() => calls.push("onSelect"));
    const navigateSpy = vi.spyOn(router, "navigate").mockImplementation(() => {
      calls.push("navigate");

      return Promise.resolve({}) as never;
    });

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" onSelect={onSelect} autoFocus>
          About
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    stdin.write(ENTER);

    await vi.waitFor(() => {
      expect(calls).toStrictEqual(["onSelect", "navigate"]);
    }, WAIT_OPTS);

    expect(navigateSpy).toHaveBeenCalled();
  });

  it("swallows navigate rejection — does not throw", async () => {
    const navigateSpy = vi
      .spyOn(router, "navigate")
      .mockRejectedValue(new Error("boom"));

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" autoFocus>
          About
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    stdin.write(ENTER);
    await flushInk();

    // Navigate was attempted with the correct route; rejection was caught internally.
    expect(navigateSpy).toHaveBeenCalledWith("about", {}, undefined, {});
  });

  it("isolates a throwing onSelect: navigation still fires and the error is logged, not propagated to ink's stdin handler", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error");
    const onSelect = vi.fn(() => {
      throw new Error("onSelect boom");
    });
    const navigateSpy = vi.spyOn(router, "navigate");

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" onSelect={onSelect} autoFocus>
          About
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    // A throwing onSelect must neither swallow the navigation nor escape into
    // ink's stdin handler — an uncaughtException there would crash a real CLI
    // (Node has no browser-style event-listener isolation).
    stdin.write(ENTER);

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("about", {}, undefined, {});
    }, WAIT_OPTS);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[real-router] InkLink onSelect threw; proceeding with navigation.",
      expect.any(Error),
    );
  });

  it("does not navigate when not focused", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    const { stdin } = render(
      <InkRouterProvider router={router}>
        {/* No autoFocus — nothing is focused */}
        <InkLink routeName="users.list">Users</InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    stdin.write(ENTER);
    await flushInk();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("Tab moves focus between InkLinks; only focused one navigates", async () => {
    const navigateSpy = vi.spyOn(router, "navigate");

    const { stdin } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="users.list" autoFocus>
          First
        </InkLink>
        <InkLink routeName="about">Second</InkLink>
      </InkRouterProvider>,
    );

    await flushInk();
    stdin.write(TAB);
    await flushInk();
    stdin.write(ENTER);

    await vi.waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("about", {}, undefined, {});
    }, WAIT_OPTS);
  });

  it("applies focusColor when focused", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" autoFocus focusColor="cyan">
          Target
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    // Ink emits ANSI escape codes for cyan foreground (code 36).
    expect(lastFrame()).toContain(`${ESC}[36m`);
  });

  it("applies activeColor when route matches", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="test" activeColor="green">
          Current
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    // Route "test" matches "/" (default) → active → green (ANSI 32).
    expect(lastFrame()).toContain(`${ESC}[32m`);
  });

  it("applies plain color when neither focused nor active", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" color="yellow">
          Other
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    // Route "about" is not active, no focus → yellow (ANSI 33).
    expect(lastFrame()).toContain(`${ESC}[33m`);
  });

  it("applies inverse styling when active", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="test" activeInverse>
          Current
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    // ANSI inverse on = ESC[7m
    expect(lastFrame()).toContain(`${ESC}[7m`);
  });

  it("bails out of re-render when memo-compared props are stable", async () => {
    let outerRenders = 0;
    const params = { id: "1" };
    // Spy before render to capture all InkLink-driven isActiveRoute calls.
    const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

    const Harness = ({ counter }: { counter: number }) => {
      outerRenders++;

      return (
        <InkRouterProvider router={router}>
          <Text>tick:{counter}</Text>
          <InkLink routeName="users.view" routeParams={params} autoFocus>
            stable
          </InkLink>
        </InkRouterProvider>
      );
    };

    const { rerender, lastFrame } = render(<Harness counter={0} />);

    await flushInk();
    rerender(<Harness counter={1} />);
    await flushInk();
    rerender(<Harness counter={2} />);
    await flushInk();

    // Harness always re-renders (counter prop changes each time).
    expect(outerRenders).toBeGreaterThan(1);
    // InkLink's memo bails out when props are stable: isActiveRoute is called on
    // mount only, not on subsequent Harness re-renders — proving the bail-out.
    expect(isActiveRouteSpy.mock.calls.length).toBeLessThan(outerRenders);
    // Ink frame still updates because the non-memoised Harness Text changed.
    expect(lastFrame()).toContain("tick:2");
    expect(lastFrame()).toContain("stable");
  });

  it("defaults: no color when none provided and not focused/active", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about">Bare</InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    const frame = lastFrame();

    // If Ink produced no output, lastFrame() returns undefined — catch that before proceeding.
    expect(frame).toBeDefined();
    expect(frame).toContain("Bare");

    // No ANSI foreground-color escape when no color props are set.
    for (let code = 30; code <= 37; code++) {
      expect(frame).not.toContain(`${ESC}[${code}m`);
    }
  });

  it("accepts custom useFocus id for programmatic focus", async () => {
    const { lastFrame } = render(
      <InkRouterProvider router={router}>
        <InkLink routeName="about" id="about-link" autoFocus>
          Labeled
        </InkLink>
      </InkRouterProvider>,
    );

    await flushInk();

    expect(lastFrame()).toContain("Labeled");
  });

  it("no-params <InkLink> shares the canonical undefined-params active source (#776)", () => {
    // Mirror of the DOM Link dedup guard: a no-params `<InkLink>` must NOT default
    // routeParams to EMPTY_PARAMS ({}) before the active-route call, or it keys "{}"
    // and splits from the canonical undefined key "" used by useIsActiveRoute(name).
    // Discriminator: a cache HIT skips construction (no router.isActiveRoute); a MISS
    // constructs a fresh source and calls isActiveRoute once.
    // #1248 re-target: default-options fast path no longer builds a
    // `createActiveRouteSource`; this #776 undefined-vs-"{}" dedup now exercises
    // the SLOW path via `ignoreQueryParams={false}` (still passes `routeParams`
    // through as `undefined`, keying "").
    render(
      <InkRouterProvider router={router}>
        <InkLink routeName="users.list" ignoreQueryParams={false}>
          Users
        </InkLink>
      </InkRouterProvider>,
    );

    const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

    createActiveRouteSource(router, "users.list", undefined, undefined, {
      strict: false,
      ignoreQueryParams: false,
    });

    expect(isActiveRouteSpy).not.toHaveBeenCalled();
  });
});
