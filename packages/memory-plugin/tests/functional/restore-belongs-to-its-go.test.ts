import { createRouter, events } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { afterEach, describe, expect, it } from "vitest";

import { memoryPluginFactory } from "@real-router/memory-plugin";

import type { Router, State } from "@real-router/core";

/**
 * A `back()` / `forward()` / `go()` restore is recognised by its own
 * navigation, not by a flag any restore of the plugin raises: its commit is
 * the one carrying the record the plugin filed when that navigation started,
 * and the stack follows it only while that navigation runs. A CONTROL lets the
 * restore land before the step its cell races against it.
 */

type MemoryRouter = Router & {
  back: () => void;
  forward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A guard factory that allows after `ms`. */
const heldFor = (ms: number) => () => () =>
  new Promise<boolean>((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, ms);
  });

let router: MemoryRouter | undefined;

async function make(): Promise<MemoryRouter> {
  const created = createRouter([
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "users", path: "/users" },
    { name: "settings", path: "/settings" },
    { name: "profile", path: "/profile" },
  ]) as MemoryRouter;

  created.usePlugin(memoryPluginFactory());
  await created.start("/");
  router = created;

  return created;
}

/** Where the router stands, what it published, and where the stack points. */
function report(r: MemoryRouter): {
  route: string | undefined;
  memory: string;
  canGoBack: boolean;
  canGoForward: boolean;
} {
  const memory = (
    r.getState()?.context as State["context"] & {
      memory?: { direction: string; historyIndex: number };
    }
  ).memory;

  return {
    route: r.getState()?.name,
    memory: `${memory?.direction}/${memory?.historyIndex}`,
    canGoBack: r.canGoBack(),
    canGoForward: r.canGoForward(),
  };
}

describe("a restore belongs to the go that started it", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("a second back() onto the path the router shows supersedes the first one still in flight", async () => {
    const r = await make();

    await r.navigate("about");
    await r.navigate("home"); // [home, about, home], at 2
    getLifecycleApi(r).addActivateGuard("about", heldFor(20));

    r.back(); // to about, held
    r.back(); // to entry 0 — the path the router still shows
    await wait(40);

    expect(report(r)).toStrictEqual({
      route: "home",
      memory: "back/0",
      canGoBack: false,
      canGoForward: true,
    });

    r.forward();
    await wait(40);

    expect(report(r)).toMatchObject({ route: "about", memory: "forward/1" });
  });

  it("CONTROL — the first back() lands before the second", async () => {
    const r = await make();

    await r.navigate("about");
    await r.navigate("home");

    r.back();
    await wait(5);
    r.back();
    await wait(5);

    expect(report(r)).toStrictEqual({
      route: "home",
      memory: "back/0",
      canGoBack: false,
      canGoForward: true,
    });
  });

  it("a replace that supersedes a restore in flight leaves the stack where the router stands", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));

    r.back(); // to users, held
    await r.navigate("profile", {}, undefined, { replace: true });
    await wait(40);

    // As if the back() had landed and the replace followed it: profile takes
    // the entry the back() reached.
    expect(report(r)).toStrictEqual({
      route: "profile",
      memory: "navigate/1",
      canGoBack: true,
      canGoForward: true,
    });

    r.back();
    await wait(5);

    expect(report(r)).toMatchObject({ route: "home", memory: "back/0" });
  });

  it("CONTROL — the replace follows a back() that has landed", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings");

    r.back();
    await wait(5);
    await r.navigate("profile", {}, undefined, { replace: true });

    expect(report(r)).toStrictEqual({
      route: "profile",
      memory: "navigate/1",
      canGoBack: true,
      canGoForward: true,
    });
  });

  it("a second back() its guard refuses leaves the stack on the entry the router shows", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));
    getLifecycleApi(r).addActivateGuard("home", () => () => false);

    r.back(); // to users, held
    r.back(); // to home: cancels the first, then refused
    await wait(40);

    expect(report(r)).toStrictEqual({
      route: "settings",
      memory: "navigate/2",
      canGoBack: true,
      canGoForward: false,
    });

    // The next push keeps the entry the router showed.
    await r.navigate("profile");
    r.back();
    await wait(40);

    expect(report(r)).toMatchObject({ route: "settings", memory: "back/2" });
  });

  it("CONTROL — the second back() is refused after the first one lands", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings");
    getLifecycleApi(r).addActivateGuard("home", () => () => false);

    r.back();
    await wait(5);
    r.back();
    await wait(5);

    expect(report(r)).toStrictEqual({
      route: "users",
      memory: "back/1",
      canGoBack: true,
      canGoForward: true,
    });
  });

  it("a first back() cancelled by a second leaves the stack to the second while it is held", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));
    getLifecycleApi(r).addActivateGuard("home", heldFor(20));

    r.back(); // to users, held
    r.back(); // to home, held: cancels the first
    await wait(5);

    expect([r.canGoBack(), r.canGoForward()]).toStrictEqual([false, true]);

    await wait(40);

    expect(report(r)).toMatchObject({ route: "home", memory: "back/0" });
  });

  it("a navigation that commits over a restore in flight shows its own position to its commit's listeners", async () => {
    const r = await make();
    const seen: boolean[] = [];

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));
    r.subscribe(({ route }) => {
      if (route.name === "profile") {
        seen.push(r.canGoForward());
      }
    });

    r.back(); // to users, held
    await r.navigate("profile"); // cancels the back() and commits at once

    expect(seen).toStrictEqual([false]);
    expect(report(r)).toStrictEqual({
      route: "profile",
      memory: "navigate/2",
      canGoBack: true,
      canGoForward: false,
    });
  });

  it("a guard of the back() target that redirects pushes the redirect, not a restore", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", () => () => {
      r.navigate("profile").catch(() => {});

      return false;
    });

    r.back();
    await wait(5);

    expect(report(r)).toStrictEqual({
      route: "profile",
      memory: "navigate/2",
      canGoBack: true,
      canGoForward: false,
    });
  });

  it("a back() refused before its navigation starts does not move the stack, even within the same tick", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getRoutesApi(r).remove("users");

    r.back(); // to users: refused ROUTE_NOT_FOUND, no navigation starts

    expect([r.canGoBack(), r.canGoForward()]).toStrictEqual([true, false]);

    r.back(); // to users again
    await wait(5);

    expect(report(r)).toStrictEqual({
      route: "settings",
      memory: "navigate/2",
      canGoBack: true,
      canGoForward: false,
    });
  });

  it("a same-path back() after a restore lands moves the stack without a navigation", async () => {
    const r = await make();
    let successes = 0;

    await r.navigate("users");
    await r.navigate("users", {}, undefined, { force: true });
    await r.navigate("settings"); // [home, users, users, settings], at 3

    r.back(); // to the second users entry: lands at once
    await wait(5);

    const landed = r.getState();

    r.subscribe(() => {
      successes++;
    });
    r.back(); // to the first users entry: the path the router shows

    expect(r.getState()).toBe(landed);
    expect(successes).toBe(0);
    expect(report(r)).toMatchObject({ route: "users", memory: "back/1" });
  });

  it("stop() with a restore in flight leaves no history to go to at once", async () => {
    const r = await make();

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));

    r.back(); // to users, held
    r.stop();

    expect([r.canGoBack(), r.canGoForward()]).toStrictEqual([false, false]);
  });

  it("a second back() from a listener that runs before the plugin's own leaves the first one's restore", async () => {
    let refused: unknown;
    let once = false;
    const created = createRouter([
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
      { name: "settings", path: "/settings" },
    ]) as MemoryRouter;

    // Registered before the plugin, so its listener runs first.
    getPluginApi(created).addEventListener(events.TRANSITION_START, () => {
      if (!once || refused !== undefined) {
        return;
      }

      try {
        created.back();
      } catch (error) {
        refused = (error as { code?: unknown }).code;
      }
    });
    created.usePlugin(memoryPluginFactory());
    await created.start("/");
    router = created;

    await created.navigate("users");
    await created.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(created).addActivateGuard("users", heldFor(20));

    once = true;
    created.back(); // to users, held
    await wait(40);

    expect(refused).toBe("REENTRANT_NAVIGATION");
    expect(report(created)).toStrictEqual({
      route: "users",
      memory: "back/1",
      canGoBack: true,
      canGoForward: true,
    });
  });

  it("a second back() refused inside the first one's announce leaves the first one's restore", async () => {
    const r = await make();
    let refused: unknown;

    await r.navigate("users");
    await r.navigate("settings"); // [home, users, settings], at 2
    getLifecycleApi(r).addActivateGuard("users", heldFor(20));

    let once = false;

    getPluginApi(r).addEventListener(events.TRANSITION_START, () => {
      if (once) {
        return;
      }

      once = true;

      try {
        r.back(); // inside the dispatch: core refuses synchronously
      } catch (error) {
        refused = (error as { code?: unknown }).code;
      }
    });

    r.back(); // to users, held
    await wait(40);

    expect(refused).toBe("REENTRANT_NAVIGATION");
    expect(report(r)).toStrictEqual({
      route: "users",
      memory: "back/1",
      canGoBack: true,
      canGoForward: true,
    });
  });
});
