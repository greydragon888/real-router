import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

/**
 * Every structural field, at every registration door, for both junk polarities
 * (#1787).
 *
 * ⚑ The criterion is CLASSIFICATION, not "zero accepts". A cell has three
 * legitimate outcomes — refused by bare core, refused by this plugin, or
 * structurally unreachable — and only a fourth is a defect: admitted by both
 * while the caller's own value is sitting in the store, inspectable.
 *
 * ⚠ "Unreachable" is DERIVED, never asserted from a list. Core drops a falsy
 * structural field before anything is stored, and wraps a codec in a closure so
 * the slot holds a function whatever was passed — in both cases the value this
 * plugin would have to judge does not exist by the time it installs, because it
 * installs through `usePlugin`, i.e. after construction.
 */
describe("structural-field coverage, classified per cell (#1787)", () => {
  /** The five fields core keeps in a `config` slot, and the slot's name. */
  const CONFIG_SLOT = {
    forwardTo: "forwardFnMap",
    defaultParams: "defaultParams",
    defaultSearch: "defaultSearch",
    decodeParams: "decoders",
    encodeParams: "encoders",
  } as const;

  const FIELDS = [
    ...(Object.keys(CONFIG_SLOT) as (keyof typeof CONFIG_SLOT)[]),
    "canActivate",
    "canDeactivate",
  ] as const;

  const JUNK = [
    ["0", 0],
    ['""', ""],
    ["false", false],
    ["NaN", Number.NaN],
    ["[]", []],
    ["42", 42],
  ] as const;

  const DOORS = ["constructor", "add", "replace", "update"] as const;

  type Outcome = "core" | "plugin" | "unreachable" | "valid";

  /**
   * What each slot's declared type admits — the predicate the table is measured
   * against, so "junk" means type-invalid FOR THIS FIELD and not "a value from
   * the list above".
   *
   * ⚠ `forwardTo: ""` is a `string`, so it is type-VALID here and the table says
   * so. Refusing an empty forward target is a SEMANTIC rule, not this issue's,
   * and core already drops it at registration (#1797).
   */
  const typeValid: Record<string, (v: unknown) => boolean> = {
    forwardTo: (v) => typeof v === "string" || typeof v === "function",
    defaultParams: (v) =>
      typeof v === "object" && v !== null && !Array.isArray(v),
    defaultSearch: (v) =>
      typeof v === "object" && v !== null && !Array.isArray(v),
    decodeParams: (v) => typeof v === "function",
    encodeParams: (v) => typeof v === "function",
    canActivate: (v) => typeof v === "function",
    canDeactivate: (v) => typeof v === "function",
  };

  const base = () => [
    { name: "home", path: "/home" },
    { name: "t", path: "/t" },
  ];

  const refuses = (
    door: (typeof DOORS)[number],
    field: string,
    value: unknown,
    withPlugin: boolean,
  ): boolean => {
    try {
      if (door === "constructor") {
        const router = createRouter([
          { name: "home", path: "/home" },
          { name: "x", path: "/x", [field]: value },
        ] as never);

        if (withPlugin) {
          router.usePlugin(validationPlugin());
        }

        router.dispose();

        return false;
      }

      const router = createRouter(base() as never);

      if (withPlugin) {
        router.usePlugin(validationPlugin());
      }

      const routes = getRoutesApi(router);

      if (door === "update") {
        routes.update("t", { [field]: value });
      } else {
        const batch = [{ name: "x", path: "/x", [field]: value }] as never;

        if (door === "add") {
          routes.add(batch);
        } else {
          routes.replace(batch);
        }
      }

      router.dispose();

      return false;
    } catch {
      return true;
    }
  };

  /**
   * Did the CALLER's own value survive into a place this plugin can read? Only
   * then can it judge the value at all — a dropped field and a wrapped codec
   * are both gone by `usePlugin` time.
   */
  const inspectable = (field: string, value: unknown): boolean => {
    if (!(field in CONFIG_SLOT)) {
      // The guard slots hold a COMPILED function, never the factory the caller
      // passed — same laundering as the codecs, one store over.
      return false;
    }

    try {
      const router = createRouter([
        { name: "x", path: "/x", [field]: value },
      ] as never);
      const config = (
        getInternals(router) as never as {
          routeGetStore: () => {
            config: Record<string, Record<string, unknown>>;
          };
        }
      ).routeGetStore().config;
      const stored = config[CONFIG_SLOT[field as keyof typeof CONFIG_SLOT]].x;

      router.dispose();

      return Object.is(stored, value);
    } catch {
      return false;
    }
  };

  const classify = (
    door: (typeof DOORS)[number],
    field: string,
    value: unknown,
  ): Outcome | "DEFECT" => {
    if (refuses(door, field, value, false)) {
      return "core";
    }
    if (refuses(door, field, value, true)) {
      return "plugin";
    }

    // Both layers admit it. Correct when the value is what the slot's type
    // declares …
    if (typeValid[field](value)) {
      return "valid";
    }

    // … and on the three post-construction doors the plugin sees the caller's
    // argument directly, so a type-invalid value there is never out of reach.
    if (door !== "constructor") {
      return "DEFECT";
    }

    return inspectable(field, value) ? "DEFECT" : "unreachable";
  };

  const CELLS = FIELDS.flatMap((field) =>
    DOORS.flatMap((door) =>
      JUNK.map(([label, value]) => ({ field, door, label, value })),
    ),
  );

  it("CONTROL — no list that indexes a loop can empty itself in silence", () => {
    expect(FIELDS).toHaveLength(7);
    expect(DOORS).toHaveLength(4);
    expect(JUNK).toHaveLength(6);
    expect(CELLS).toHaveLength(168);
  });

  it("CONTROL — the type predicate discriminates, in both directions", () => {
    expect(typeValid.forwardTo("")).toBe(true);
    expect(typeValid.forwardTo(42)).toBe(false);
    expect(typeValid.defaultSearch({})).toBe(true);
    expect(typeValid.defaultSearch("")).toBe(false);
    expect(typeValid.canActivate(() => true)).toBe(true);
    expect(typeValid.canActivate(false)).toBe(false);
  });

  it("CONTROL — the two mechanisms that make a cell unreachable are real", () => {
    // A falsy structural field never reaches the store …
    expect(inspectable("defaultSearch", 0)).toBe(false);
    // … a codec is wrapped, so the slot holds a function, not the caller's value …
    expect(inspectable("decodeParams", 42)).toBe(false);

    // … and a truthy bag IS the caller's own object, which is what makes the
    // rest of this table a statement about coverage rather than about reach.
    const bag = { a: "1" };

    expect(inspectable("defaultSearch", bag)).toBe(true);
  });

  it("no cell is admitted by both layers while the value is inspectable", () => {
    const defects = CELLS.filter(
      ({ door, field, value }) => classify(door, field, value) === "DEFECT",
    ).map(({ field, door, label }) => `${field} @ ${door} = ${label}`);

    expect(defects).toStrictEqual([]);
  });

  it("the classification is exactly this, and a change re-classifies a cell", () => {
    const byOutcome: Record<string, number> = {};

    for (const { door, field, value } of CELLS) {
      const outcome = classify(door, field, value);

      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
    }

    expect(byOutcome).toStrictEqual({
      core: 16,
      plugin: 118,
      unreachable: 31,
      // `forwardTo: ""` at the three doors that admit a string — see `typeValid`.
      valid: 3,
    });

    // Anti-vacuity: the four buckets must account for every cell, so a
    // classifier that silently stopped classifying cannot pass this file.
    const total = Object.values(byOutcome).reduce((a, b) => a + b, 0);

    expect(total).toBe(CELLS.length);
  });
});
