// #1837 finding 3 — a PERSISTED not-found answers to `allowNotFound` like a
// live one.
//
// `allowNotFound: false` means "an unmatched URL is an error; do not commit
// `UNKNOWN_ROUTE`". The popstate handler enforces it on exactly one of its two
// entry paths:
//
//     const matched = getRouteFromEvent(evt, api, location);
//     if (matched)                 -> navigateToState(...)     <- no gate
//     else if (deps.allowNotFound) -> navigateToNotFound(...)  <- the gate
//     else                         -> ROUTE_NOT_FOUND + rollback
//
// `getRouteFromEvent` returns a state whenever `isStateStrict` passes, and the
// guard waves through a name starting with `@@` — core's system namespace,
// deliberately, because that is what `UNKNOWN_ROUTE` is. So an entry whose
// `history.state` says `@@router/UNKNOWN_ROUTE` takes the FIRST branch and
// commits, whatever `allowNotFound` says.
//
// ⚠ Not an adversarial shape. It is what THIS PLUGIN writes: with
// `allowNotFound: true` every unmatched URL persists such an entry. Flip the
// option in the next deploy, and Back to that entry still commits the 404 the
// option now forbids.
//
// ⚑ The fix routes a restored `UNKNOWN_ROUTE` through the same branch a LIVE
// unmatched URL takes, rather than adding a second gate beside the first. One
// rule, one place: whether the not-found arrived from the address bar or from
// `history.state`, `allowNotFound` decides it.
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

const PERSISTED_NOT_FOUND = {
  name: "@@router/UNKNOWN_ROUTE",
  params: {},
  path: "/nope",
};

let mockedBrowser: Browser;
let router: Router | undefined;

async function startWith(allowNotFound: boolean): Promise<Router> {
  const created = createRouter(routerConfig, {
    defaultRoute: "home",
    allowNotFound,
  });

  created.usePlugin(browserPluginFactory({}, mockedBrowser));
  await created.start("/users/list");

  return created;
}

async function popstateTo(state: unknown, url: string): Promise<void> {
  globalThis.history.replaceState({}, "", url);
  globalThis.dispatchEvent(new PopStateEvent("popstate", { state }));
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("#1837 — a persisted UNKNOWN_ROUTE answers to allowNotFound", () => {
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

  it("is REFUSED under allowNotFound:false, like a live unmatched URL", async () => {
    router = await startWith(false);

    const before = router.getState()?.name;

    await popstateTo(PERSISTED_NOT_FOUND, "/nope");

    // The committed state must not have moved to the persisted 404.
    expect(router.getState()?.name).toBe(before);
    expect(router.getState()?.name).not.toBe("@@router/UNKNOWN_ROUTE");
  });

  it("reports it through the SAME channel a live unmatched URL uses", async () => {
    // Not just "does not commit": the strict-mode branch emits
    // `ROUTE_NOT_FOUND` and re-syncs the URL. A refusal that went silent would
    // pass the cell above and still be a different behaviour from the live one.
    router = await startWith(false);

    const errors: unknown[] = [];

    router.usePlugin(() => ({
      onTransitionError: (_t, _f, error) => errors.push(error),
    }));

    await popstateTo(PERSISTED_NOT_FOUND, "/nope");

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("POSITIVE CONTROL — under allowNotFound:true it still restores", async () => {
    // The cell that stops the fix from being "refuse it everywhere". This is
    // the working scenario the plugin itself creates, and it must survive.
    router = await startWith(true);

    await popstateTo(PERSISTED_NOT_FOUND, "/nope");

    expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");
    expect(router.getState()?.path).toBe("/nope");
  });

  it("CONTROL — an ordinary route entry is unaffected by either setting", async () => {
    // The gate must key on the persisted 404, not on "came from history.state".
    for (const allowNotFound of [true, false]) {
      router?.stop();
      router = await startWith(allowNotFound);

      await popstateTo(
        { name: "users.view", params: { id: "1" }, path: "/users/view/1" },
        "/users/view/1",
      );

      expect(router.getState()?.name, `allowNotFound=${allowNotFound}`).toBe(
        "users.view",
      );
    }
  });

  it("CONTROL — an ordinary NONEXISTENT name is still refused, as it was before", async () => {
    // Already refused downstream by `navigateToState` (ROUTE_NOT_FOUND); the
    // fix must not change it, and it is what makes `@@` the odd one out.
    router = await startWith(false);

    const before = router.getState()?.name;

    await popstateTo({ name: "ghost", params: {}, path: "/nope2" }, "/nope2");

    expect(router.getState()?.name).toBe(before);
  });
});
