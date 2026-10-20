import { createRouter, events } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loggerPluginFactory } from "../../src";

import type { LoggerPluginConfig } from "../../src";
import type { Router, State } from "@real-router/core";

// Core reports a refusal that starts no transition on `TRANSITION_ERROR`, with
// no `TRANSITION_START` before it (#2779). "home" is the committed route.
const REFUSALS: Record<string, (router: Router) => Promise<unknown>> = {
  SAME_STATES: (router) => router.navigate("home").catch(() => {}),
  ROUTE_NOT_FOUND: (router) => router.navigate("nowhere").catch(() => {}),
};

const WINDOWS = ["before the leave", "after the leave"] as const;

type Window = (typeof WINDOWS)[number];

const noop = (): void => {};

/**
 * Spies on the console and User Timing. Calls made while recording are kept
 * in call order, with timings normalised to `(T)`.
 */
function captureOutput(): {
  output: string[];
  setRecording: (on: boolean) => void;
} {
  const output: string[] = [];
  let recording = false;
  const record =
    (channel: string) =>
    (first?: unknown): void => {
      if (recording) {
        output.push(
          `${channel} ${String(first)}`.replace(
            / \(\d+(\.\d+)?(ms|μs)\)$/,
            " (T)",
          ),
        );
      }
    };

  for (const channel of [
    "group",
    "groupEnd",
    "log",
    "warn",
    "error",
  ] as const) {
    vi.spyOn(console, channel).mockImplementation(record(channel));
  }

  vi.spyOn(performance, "mark").mockImplementation(((name: string) => {
    record("mark")(name);
  }) as typeof performance.mark);
  vi.spyOn(performance, "measure").mockImplementation(((name: string) => {
    record("measure")(name);
  }) as typeof performance.measure);
  vi.spyOn(performance, "clearMarks").mockImplementation(noop);
  vi.spyOn(performance, "clearMeasures").mockImplementation(noop);

  return {
    output,
    setRecording: (on) => {
      recording = on;
    },
  };
}

function createFixtureRouter(): Router {
  return createRouter(
    [
      { name: "home", path: "/" },
      { name: "users", path: "/users" },
    ],
    { defaultRoute: "home", logger: { level: "none" } },
  );
}

/** Output of one held transition, in call order. */
async function heldTransition(
  window: Window,
  refuse: ((router: Router) => Promise<unknown>) | undefined,
  config?: Partial<LoggerPluginConfig>,
  allow = true,
): Promise<string[]> {
  const { output, setRecording } = captureOutput();
  const router = createFixtureRouter();

  router.usePlugin(loggerPluginFactory(config));
  await router.start("/");

  let release!: (allowed: boolean) => void;
  const hold = () =>
    new Promise<boolean>((resolve) => {
      release = resolve;
    });
  const lifecycle = getLifecycleApi(router);

  if (window === "before the leave") {
    lifecycle.addDeactivateGuard("home", () => hold);
  } else {
    lifecycle.addActivateGuard("users", () => hold);
  }

  setRecording(true);

  const navigation = router.navigate("users").catch(noop);

  await Promise.resolve();
  await refuse?.(router);

  release(allow);
  await navigation;

  setRecording(false);
  router.stop();
  vi.restoreAllMocks();

  return output;
}

describe("logger-plugin — a refusal that starts no transition (#2779)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each(WINDOWS)("a transition held %s", (window) => {
    it.each(Object.keys(REFUSALS))(
      "an unrelated %s refusal is logged on its own and the transition's group stays whole",
      async (refusal) => {
        const control = await heldTransition(window, undefined);
        const outcome = await heldTransition(window, REFUSALS[refusal]);
        const own = `error [logger-plugin] Transition error: ${refusal}`;

        // The control is what the comparison stands on.
        expect(control).toStrictEqual([
          "group Router transition",
          "log [logger-plugin] Transition: home → users",
          "log [logger-plugin] Leave approved",
          "log [logger-plugin] Transition success (T)",
          "groupEnd undefined",
        ]);

        // The refusal is reported once, with no timing of its own.
        expect(
          outcome.filter((line) => line.startsWith("error ")),
        ).toStrictEqual([own]);
        expect(outcome.filter((line) => line !== own)).toStrictEqual(control);
      },
    );

    it.each(Object.keys(REFUSALS))(
      "an unrelated %s refusal adds no performance entry to the transition's",
      async (refusal) => {
        const config = { usePerformanceMarks: true, level: "none" } as const;
        const control = await heldTransition(window, undefined, config);
        const outcome = await heldTransition(window, REFUSALS[refusal], config);

        expect(control).toStrictEqual([
          "mark router:transition-start:home→users",
          "mark router:leave-approved:home→users",
          "mark router:transition-end:home→users",
          "measure router:transition:home→users",
        ]);
        expect(outcome).toStrictEqual(control);
      },
    );

    it.each(Object.keys(REFUSALS))(
      "the transition's own error still ends its log, with timing, after an unrelated %s refusal",
      async (refusal) => {
        const outcome = await heldTransition(
          window,
          REFUSALS[refusal],
          undefined,
          false,
        );
        const ownCode =
          window === "before the leave"
            ? "CANNOT_DEACTIVATE"
            : "CANNOT_ACTIVATE";

        expect(outcome).toStrictEqual([
          "group Router transition",
          "log [logger-plugin] Transition: home → users",
          ...(window === "after the leave"
            ? ["log [logger-plugin] Leave approved"]
            : []),
          `error [logger-plugin] Transition error: ${refusal}`,
          `error [logger-plugin] Transition error: ${ownCode} (T)`,
          "groupEnd undefined",
        ]);
      },
    );
  });

  it("a SAME_STATES refusal equal to the transition in flight in all but its context leaves its group open", async () => {
    const { output, setRecording } = captureOutput();
    const router = createFixtureRouter();

    router.usePlugin(loggerPluginFactory({ showParamsDiff: false }));
    await router.start("/users");

    let release!: () => void;

    // A reload of the active route runs no activation guard: hold it in a
    // leave listener instead.
    router.subscribeLeave(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    setRecording(true);

    const navigation = router
      .navigate("users", {}, undefined, { reload: true })
      .catch(noop);

    await Promise.resolve();
    // Refused against the committed `users`: the same name, params and path
    // as the reload in flight.
    await router.navigate("users").catch(noop);

    release();
    await navigation;

    setRecording(false);
    router.stop();

    expect(output).toStrictEqual([
      "group Router transition",
      "log [logger-plugin] Transition: users → users",
      "log [logger-plugin] Leave approved",
      "error [logger-plugin] Transition error: SAME_STATES",
      "log [logger-plugin] Transition success (T)",
      "groupEnd undefined",
    ]);
  });

  it("an error the plugin heard no start for adds no performance entry (#793)", async () => {
    const { output, setRecording } = captureOutput();
    const router = createFixtureRouter();

    await router.start("/");
    // Registered after the start: the plugin has heard none.
    router.usePlugin(
      loggerPluginFactory({ usePerformanceMarks: true, level: "none" }),
    );

    setRecording(true);
    await router.navigate("nowhere").catch(noop);
    setRecording(false);
    router.stop();

    expect(output).toStrictEqual([]);
  });

  // A failure the commit itself raises carries the committed copy of the
  // state, not the object the start did. A signal whose `aborted` getter throws
  // on read `n` fails the transition at each point the signal is read.
  it("a transition that fails wherever its signal is read closes its group, with timing", async () => {
    // The last two lines of each run whose failure carried the copy.
    const endings: string[][] = [];

    for (let n = 1; n <= 8; n++) {
      const { output, setRecording } = captureOutput();
      const router = createFixtureRouter();

      router.usePlugin(loggerPluginFactory());
      await router.start("/");

      const api = getPluginApi(router);
      let started: State | undefined;
      const copies: boolean[] = [];

      api.addEventListener(events.TRANSITION_START, (toState: State) => {
        started = toState;
      });
      api.addEventListener(
        events.TRANSITION_ERROR,
        (toState: State | undefined) => {
          copies.push(toState !== undefined && toState !== started);
        },
      );

      const controller = new AbortController();
      let reads = 0;

      Object.defineProperty(controller.signal, "aborted", {
        get() {
          reads++;

          if (reads === n) {
            throw new Error(`read ${n}`);
          }

          return false;
        },
      });

      setRecording(true);
      await router
        .navigate("users", {}, undefined, { signal: controller.signal })
        .catch(noop);
      setRecording(false);
      router.stop();
      vi.restoreAllMocks();

      if (copies.includes(true)) {
        endings.push(output.slice(-2));
      }
    }

    // The sweep reached the commit: some failure carried the copy.
    expect(endings).not.toHaveLength(0);

    for (const ending of endings) {
      expect(ending).toStrictEqual([
        expect.stringMatching(
          /^error \[logger-plugin\] Transition error: .* \(T\)$/,
        ),
        "groupEnd undefined",
      ]);
    }
  });
});
