import { describe, expect, it, vi } from "vitest";

import {
  createEntryPositions,
  distanceBetween,
  readPosition,
  withEntryPositions,
} from "../../../src/browser-env";

import type { Browser } from "../../../src/browser-env";

describe("readPosition (#2740)", () => {
  it("reads a position", () => {
    expect(readPosition({ position: { run: "r", index: 3 } })).toStrictEqual({
      run: "r",
      index: 3,
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "state"],
    ["a state with no position", { name: "home" }],
    ["a null position", { position: null }],
    ["a position that is not an object", { position: 3 }],
    ["a run that is not a string", { position: { run: 1, index: 0 } }],
    ["an index that is not a number", { position: { run: "r", index: "0" } }],
    ["a negative index", { position: { run: "r", index: -1 } }],
    ["a fractional index", { position: { run: "r", index: 0.5 } }],
    [
      "an index past the safe integers",
      { position: { run: "r", index: Number.MAX_SAFE_INTEGER + 1 } },
    ],
  ])("answers undefined for %s", (_, state) => {
    expect(readPosition(state)).toBeUndefined();
  });

  it("answers undefined for a state whose getter throws", () => {
    const state = {
      get position(): never {
        throw new Error("getter");
      },
    };

    expect(readPosition(state)).toBeUndefined();
  });

  it("reads each member of the position once", () => {
    const reads = { run: 0, index: 0 };
    const position = {
      get run(): string {
        reads.run++;

        return "r";
      },
      get index(): number {
        reads.index++;

        return 1;
      },
    };

    expect(readPosition({ position })).toStrictEqual({ run: "r", index: 1 });
    expect(reads).toStrictEqual({ run: 1, index: 1 });
  });
});

describe("distanceBetween (#2740)", () => {
  const from = { run: "r", index: 1 };

  it.each([
    ["forward", { run: "r", index: 3 }, 2],
    ["back", { run: "r", index: 0 }, -1],
    ["onto itself", { run: "r", index: 1 }, 0],
  ])("measures a move %s within one run", (_, to, distance) => {
    expect(distanceBetween(from, to)).toBe(distance);
  });

  it.each([
    ["another run", { run: "s", index: 1 }],
    ["no position", undefined],
  ])("knows no distance to %s", (_, to) => {
    expect(distanceBetween(from, to)).toBeUndefined();
    expect(distanceBetween(to, from)).toBeUndefined();
  });
});

describe("createEntryPositions (#2740)", () => {
  it("starts a run at index 0 for a push or a replace from an unknown position", () => {
    const pushed = createEntryPositions().push();
    const replaced = createEntryPositions().replace();

    expect(pushed.index).toBe(0);
    expect(replaced.index).toBe(0);
    expect(pushed.run).not.toBe(replaced.run);
  });

  it("a push follows the current position in its run, a replace keeps it", () => {
    const positions = createEntryPositions();
    const first = positions.replace();

    expect(positions.push()).toStrictEqual({ run: first.run, index: 1 });
    expect(positions.replace()).toStrictEqual({ run: first.run, index: 1 });
    expect(positions.current).toStrictEqual({ run: first.run, index: 1 });
  });

  it("adopts the position an entry carries, and forgets it for one that carries none", () => {
    const positions = createEntryPositions();

    positions.adopt({ position: { run: "x", index: 4 } });

    expect(positions.push()).toStrictEqual({ run: "x", index: 5 });

    positions.adopt(null);

    expect(positions.current).toBeUndefined();
  });

  it("awaits a return once, and moves to its origin", () => {
    const positions = createEntryPositions();
    const origin = { run: "x", index: 2 };

    positions.returnTo(origin);

    expect(positions.current).toBe(origin);
    expect(positions.takeReturn()).toBe(origin);
    expect(positions.takeReturn()).toBeUndefined();
  });

  it.each(["push", "replace"] as const)(
    "a %s drops the awaited return",
    (write) => {
      const positions = createEntryPositions();

      positions.returnTo({ run: "x", index: 2 });
      positions[write]();

      expect(positions.takeReturn()).toBeUndefined();
    },
  );
});

describe("withEntryPositions (#2740)", () => {
  function browserOn(live: unknown) {
    const pushState = vi.fn<(state: unknown, path: string) => void>();
    const replaceState = vi.fn<(state: unknown, path: string) => void>();
    const browser: Browser = {
      getLocation: () => "/",
      getHash: () => "",
      getState: () => live,
      pushState,
      replaceState,
      addPopstateListener: () => () => undefined,
      addHashChangeListener: () => () => undefined,
    };

    return { browser, pushState, replaceState };
  }

  it("a replace keeps the position of the entry the browser stands on", () => {
    const { browser, replaceState } = browserOn({
      position: { run: "x", index: 7 },
    });
    const positions = createEntryPositions();

    withEntryPositions(browser, positions).replaceState(
      { name: "home" },
      "/home",
    );

    expect(replaceState).toHaveBeenCalledWith(
      { name: "home", position: { run: "x", index: 7 } },
      "/home",
    );
    expect(positions.current).toStrictEqual({ run: "x", index: 7 });
  });

  it("a push follows the entry the browser stands on, not the last one written", () => {
    const { browser, pushState } = browserOn({
      position: { run: "x", index: 2 },
    });
    const positions = createEntryPositions();

    positions.adopt({ position: { run: "x", index: 9 } });
    withEntryPositions(browser, positions).pushState({}, "/a");

    expect(pushState).toHaveBeenCalledWith(
      { position: { run: "x", index: 3 } },
      "/a",
    );
  });

  it("a write onto an entry that carries no position starts a run", () => {
    const { browser } = browserOn(null);
    const positions = createEntryPositions();

    positions.adopt({ position: { run: "x", index: 4 } });
    withEntryPositions(browser, positions).replaceState({}, "/a");

    expect(positions.current?.index).toBe(0);
    expect(positions.current?.run).not.toBe("x");
  });

  it("hands the browser a stamped copy and leaves the writer's state alone (#2741)", () => {
    const { browser, pushState } = browserOn(null);
    const state = { name: "home" };

    withEntryPositions(browser, createEntryPositions()).pushState(state, "/a");

    const passed = pushState.mock.calls[0]?.[0];

    expect(passed).not.toBe(state);
    expect(passed).toStrictEqual({
      name: "home",
      position: { run: expect.any(String), index: 0 },
    });
    expect(state).toStrictEqual({ name: "home" });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
  ])("passes a %s state through unstamped", (_, state) => {
    const { browser, pushState } = browserOn(null);

    withEntryPositions(browser, createEntryPositions()).pushState(state, "/a");

    expect(pushState).toHaveBeenCalledWith(state, "/a");
  });

  it("forwards every other member to the browser when it is called", () => {
    const { browser } = browserOn({ position: { run: "x", index: 1 } });
    const positioned = withEntryPositions(browser, createEntryPositions());
    const go = vi.fn<(delta: number) => void>();
    const remove = vi.fn<() => void>();
    const listener = vi.fn<(evt: PopStateEvent) => void>();

    // Members the browser gains or changes after it was wrapped are the ones
    // called; the two optional ones are decided when it is wrapped.
    browser.getLocation = () => "/later";
    browser.getHash = () => "later";
    browser.addPopstateListener = (fn) => {
      fn(new PopStateEvent("popstate"));

      return remove;
    };
    browser.addHashChangeListener = () => remove;

    expect(positioned.getLocation()).toBe("/later");
    expect(positioned.getHash()).toBe("later");
    expect(positioned.getState?.()).toStrictEqual({
      position: { run: "x", index: 1 },
    });
    expect(positioned.addPopstateListener(listener)).toBe(remove);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(positioned.addHashChangeListener(() => undefined)).toBe(remove);
    expect(positioned.go).toBeUndefined();

    const withGo = withEntryPositions(
      {
        ...browser,
        go: (delta) => {
          go(delta);
        },
      },
      createEntryPositions(),
    );

    withGo.go?.(-2);

    expect(go).toHaveBeenCalledWith(-2);
  });

  it("calls a class instance's methods on the instance", () => {
    class ClassBrowser implements Browser {
      readonly #location = "/class";

      getLocation(): string {
        return this.#location;
      }

      getHash(): string {
        return `#${this.#location}`;
      }

      pushState(): void {
        // not exercised
      }

      replaceState(): void {
        // not exercised
      }

      addPopstateListener(): () => void {
        return () => undefined;
      }

      addHashChangeListener(): () => void {
        return () => undefined;
      }
    }

    const positioned = withEntryPositions(
      new ClassBrowser(),
      createEntryPositions(),
    );

    expect(positioned.getLocation()).toBe("/class");
    expect(positioned.getHash()).toBe("#/class");
    expect(positioned.getState).toBeUndefined();
  });

  it("names the runs of another copy of the module apart from this one's", async () => {
    vi.resetModules();
    const other = await import("../../../src/browser-env/history-position.js");
    const { browser } = browserOn(null);
    const ours = createEntryPositions();
    const theirs = other.createEntryPositions();

    withEntryPositions(browser, ours).replaceState({}, "/a");
    other.withEntryPositions(browser, theirs).replaceState({}, "/a");

    const prefix = (run: string | undefined): string | undefined =>
      run?.slice(0, run.lastIndexOf("."));

    expect(prefix(theirs.current?.run)).not.toBe(prefix(ours.current?.run));
  });
});
