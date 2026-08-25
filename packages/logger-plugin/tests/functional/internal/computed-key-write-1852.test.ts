// #1852 — the diff this plugin builds is keyed by PARAM NAME, taken from the two
// states it is comparing. A plain `dst[key] = value` consults the destination's
// chain, so an application defining `Object.prototype.id` — the name it routes
// under — intercepts the write.
//
// ⚠ Two defects with one root, and the first hid the second. The branch
// conditions asked `key in toParams`, which walks the PROTOTYPE chain: a key the
// application also defined read as "still present" and stopped being reported as
// REMOVED — a diff stating something untrue about the navigation it describes.
// That same `in` is why two of the three branches looked immune to the write
// below: the branch that would have written was simply never taken.
//
// Measured before the fix, on the one branch whose condition never asked the
// chain: a getter threw from the write and took the whole log line with it
// (isolated by core as a listener error, so nothing else showed); a
// getter+setter printed the line empty.

import { createRouter } from "@real-router/core";
import { describe, expect, it, vi } from "vitest";

import { loggerPluginFactory } from "../../../src";

import type { SearchParams } from "@real-router/core/types";

/** The three ways `Object.prototype[name]` can intercept a `[[Set]]`. */
const HAZARDS: readonly (readonly [string, () => PropertyDescriptor])[] = [
  ["getter-only", () => ({ get: () => "hijack", configurable: true })],
  [
    "getter+setter",
    () => {
      let sink: unknown;

      return {
        get: () => sink,
        set: (value: unknown) => {
          sink = value;
        },
        configurable: true,
      };
    },
  ],
  [
    "non-writable",
    () => ({ value: "frozen", writable: false, configurable: true }),
  ],
];

/** `act` under a pristine prototype and under each hazard, answers keyed by shape. */
async function underHazard(
  name: string,
  act: () => Promise<unknown> | unknown,
): Promise<Record<string, unknown>> {
  const settle = async (): Promise<unknown> => {
    try {
      return { ok: await act() };
    } catch (error) {
      return { threw: (error as Error).message };
    }
  };

  const answers: Record<string, unknown> = { control: await settle() };

  for (const [label, descriptor] of HAZARDS) {
    Object.defineProperty(Object.prototype, name, descriptor());

    try {
      answers[label] = await settle();
    } finally {
      Reflect.deleteProperty(Object.prototype, name);
    }
  }

  return answers;
}

const uniform = (
  answers: Record<string, unknown>,
): Record<string, unknown> => ({
  control: answers.control,
  "getter-only": answers.control,
  "getter+setter": answers.control,
  "non-writable": answers.control,
});

/**
 * ⚠ The store goes through a helper on purpose: `eslint --fix` folds
 * `bag.k = v` into an object literal, and a literal DEFINES — which silently
 * turns this control into one that consults no chain and can never fail.
 */

/**
 * Drive one navigation with the logger installed and return every line it
 * printed, with the volatile parts removed.
 *
 * ⚑ The OUTPUT is the assertion subject rather than the internal diff object:
 * the defect this file covers is a log line that vanishes or prints empty, and
 * a consumer sees only the line.
 */
async function linesFor(
  from: SearchParams,
  to: SearchParams,
): Promise<string[]> {
  // ⚑ THREE navigations of the SAME route, and both details are fixture
  // constraints rather than simplifications, each established by measurement:
  //
  //   · a cross-route transition prints NO diff at all, so an `a → b` fixture
  //     leaves every cell here vacuously green;
  //   · the navigation that ESTABLISHES `from` prints a diff of its own, so the
  //     spy goes on after it — otherwise each cell asserts two lines and the one
  //     under test is not the one that discriminates.
  const router = createRouter([{ name: "a", path: "/a?id&keep" }]);

  router.usePlugin(loggerPluginFactory());
  await router.start("/a");
  await router.navigate("a", {}, from);

  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const groupSpy = vi
    .spyOn(console, "group")
    .mockImplementation(() => undefined);
  const groupEndSpy = vi
    .spyOn(console, "groupEnd")
    .mockImplementation(() => undefined);

  try {
    await router.navigate("a", {}, to);

    return spy.mock.calls
      .map((call) => call.map(String).join(" "))
      .filter((line) => /Added|Removed|Changed/.test(line));
  } finally {
    spy.mockRestore();
    groupSpy.mockRestore();
    groupEndSpy.mockRestore();
    router.dispose();
  }
}

describe("the params diff survives an ambient accessor of a param name (#1852)", () => {
  it("a CHANGED key still reports, with both values", async () => {
    // The only branch whose condition never asked the chain, and therefore the
    // only one that reached its write before the fix.
    const answers = await underHazard("id", () =>
      linesFor({ id: "1" }, { id: "2" }),
    );

    expect(answers.control).toStrictEqual({
      ok: ['[logger-plugin]  search Changed: { id: "1" → "2" }'],
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("a REMOVED key is still reported as removed, not swallowed by `in`", async () => {
    // The own-ness half: `key in toParams` walked the chain, so under the hazard
    // the key read as still present and the diff moved it out of `Removed`.
    const answers = await underHazard("id", () =>
      linesFor({ id: "1", keep: "y" }, { keep: "y" }),
    );

    expect(answers.control).toStrictEqual({
      ok: ['[logger-plugin]  search Removed: {"id":"1"}'],
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("an ADDED key is still reported as added", async () => {
    const answers = await underHazard("id", () =>
      linesFor({ keep: "y" }, { id: "1", keep: "y" }),
    );

    expect(answers.control).toStrictEqual({
      ok: ['[logger-plugin]  search Added: {"id":"1"}'],
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("CONTROL — the hazard is live in this environment", () => {
    // ⚠ Without this every cell above could pass because the accessor never
    // installed. The store goes through a helper on purpose: `eslint --fix`
    // folds `bag.k = v` into an object literal, and a literal DEFINES — which
    // would silently turn this control into one that consults no chain at all.
    const store = (bag: Record<string, unknown>, key: string): void => {
      bag[key] = "mine";
    };

    const outcomes = HAZARDS.map(([label, descriptor]) => {
      Object.defineProperty(Object.prototype, "zzLive", descriptor());

      try {
        const bag: Record<string, unknown> = {};

        store(bag, "zzLive");

        return [label, Object.hasOwn(bag, "zzLive") ? "stored" : "LOST"];
      } catch {
        return [label, "THREW"];
      } finally {
        Reflect.deleteProperty(Object.prototype, "zzLive");
      }
    });

    expect(Object.fromEntries(outcomes)).toStrictEqual({
      "getter-only": "THREW",
      "getter+setter": "LOST",
      "non-writable": "THREW",
    });
  });
});
