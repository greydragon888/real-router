// #1837 finding 4 — the URL rollback writes a PROJECTION, like every other
// history write in the plugin.
//
// Every other write site goes through `updateBrowserState`, which persists four
// channels: `{ name, params, search, path }`. The rollback did
// `deps.browser.replaceState(currentState, url)` — the whole committed `State`,
// which additionally carries `context` and `transition`.
//
// It fires on every guard-rejected Back, every SAME_STATES popstate and every
// strict-mode unmatched URL, so this is not a rare path.
//
// ⚠ Why it matters, and it is not tidiness: `state.context` is a PUBLIC plugin
// slot whose contents this plugin does not control. A real browser runs
// StructuredSerializeForStorage inside `replaceState`, so a plugin publishing a
// non-cloneable value into `context` makes the rollback throw — into the empty
// `catch {}` that wraps it — and the URL is never rolled back at all. jsdom
// stores by identity, which is why the estate never saw this.
//
// ⚑ `transition` is the second half and needs no such argument: it is
// per-navigation metadata about a transition that already finished. Persisting
// it means a Back to this entry restores a `transition` describing a DIFFERENT
// navigation.
import { createRouter } from "@real-router/core";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { browserPluginFactory } from "@real-router/browser-plugin";

import { createMockedBrowser, routerConfig, noop } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Router } from "@real-router/core";

let mockedBrowser: Browser;
let router: Router | undefined;

describe("#1837 — the rollback writes the four-channel projection", () => {
  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(noop);
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(() => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    router?.stop();
    router = undefined;
    vi.clearAllMocks();
  });

  it("writes exactly {name, params, search, path} on a strict-mode rollback", async () => {
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });
    router.usePlugin(browserPluginFactory({}, mockedBrowser));
    await router.start("/users/list");

    const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

    globalThis.history.replaceState({}, "", "/nonexistent-path");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(replaceSpy).toHaveBeenCalled();

    const written = replaceSpy.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;

    // ⚑ The KEY SET is the assertion, not the values: `context` and
    // `transition` are what must not be there, and asserting the values would
    // pass with them present.
    expect(
      Object.keys(written).toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual(["name", "params", "path", "search"]);
  });

  it("POSITIVE CONTROL — the four channels still carry the surviving state", async () => {
    // Without this the cell above passes if the rollback started writing `{}`.
    router = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });
    router.usePlugin(browserPluginFactory({}, mockedBrowser));
    await router.start("/users/view/7");

    const surviving = router.getState();
    const replaceSpy = vi.spyOn(mockedBrowser, "replaceState");

    globalThis.history.replaceState({}, "", "/nonexistent-path");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const written = replaceSpy.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;

    expect(written.name).toBe(surviving?.name);
    expect(written.params).toStrictEqual(surviving?.params);
    expect(written.path).toBe(surviving?.path);
    // ...and the URL argument still names the surviving state's path.
    expect(replaceSpy.mock.calls.at(-1)?.[1]).toContain(surviving?.path);
  });

  it("survives a non-cloneable value in the PUBLIC context slot", async () => {
    // ⚠ The cell that needs a browser doing what a real one does. jsdom stores
    // `history.state` by identity and accepts anything; a real
    // `replaceState` runs StructuredSerializeForStorage and throws
    // `DataCloneError`. With the whole `State` written, a plugin publishing a
    // function into `state.context` killed the rollback silently — the throw
    // landed in the handler's empty `catch {}` and the URL stayed wrong.
    const cloning = createMockedBrowser(noop);
    const thrown: unknown[] = [];

    vi.spyOn(cloning, "replaceState").mockImplementation((state, url) => {
      try {
        structuredClone(state);
      } catch (error) {
        thrown.push(error);

        throw error;
      }

      globalThis.history.replaceState(state, "", url);
    });

    router = createRouter(routerConfig, {
      defaultRoute: "home",
      allowNotFound: false,
    });
    router.usePlugin(browserPluginFactory({}, cloning));
    // A plugin writing something un-cloneable into the shared context slot.
    router.usePlugin(() => ({
      onTransitionSuccess(toState) {
        (toState.context as Record<string, unknown>).probe = {
          notCloneable: () => 1,
        };
      },
    }));
    await router.start("/users/list");

    globalThis.history.replaceState({}, "", "/nonexistent-path");
    globalThis.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown).toStrictEqual([]);
  });
});
