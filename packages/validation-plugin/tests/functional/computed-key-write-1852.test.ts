// #1852 — `validateForwardTo` builds a combined forward map keyed by ROUTE NAME
// into a plain `{ ...existing }`. That is a `[[Set]]`, so an application that
// defines `Object.prototype.<routeName>` intercepts it.
//
// Measured before the fix: `getRoutesApi(router).add([...])` THREW and the routes
// were never registered — the validator becoming the failure it exists to report.
//
// ⚠ Written because nothing covered the site: reverting it to a plain store left
// the whole package green.

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

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

/**
 * The shape a cell expects: every hazard answering exactly what the pristine run
 * answered.
 *
 * ⚠ This comparison alone is NOT a test — it is blind to a UNIFORM failure, and
 * that is measured rather than theoretical: with `putField`'s body replaced by a
 * no-op, all four answers agree on the wrong value and the cell stays green.
 * Every cell therefore pins the CONTROL's content first.
 */
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

describe("registering a forwarding route survives an ambient accessor of its name (#1852)", () => {
  // ⚠ What this cell can and cannot show, measured rather than assumed. It DOES
  // discriminate the hazard: without `putField`, an ambient accessor named after
  // a route makes `add()` throw a raw `TypeError` out of the validator and the
  // routes are never registered — the validator becoming the failure it exists
  // to report.
  //
  // It does NOT discriminate "the site stopped writing", and nothing could:
  // `combinedForwardMap` feeds cycle detection only, and core's own
  // `resolveForwardChain` reaches the same verdict first. Instrumented on two
  // shapes (a cycle inside one batch, a chain resolving to an existing route),
  // emptying the map changes neither answer. The write is guarded because the
  // KEY is a route name, not because the map's contents are load-bearing here.
  it("`add` still registers, and the alias still resolves", async () => {
    const answers = await underHazard("alias", () => {
      const router = createRouter([{ name: "home", path: "/" }]);

      router.usePlugin(validationPlugin());

      getRoutesApi(router).add([
        { name: "target", path: "/target" },
        { name: "alias", path: "/alias", forwardTo: "target" },
      ]);

      const answer = { href: router.buildPath("alias") };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { href: "/alias" },
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
