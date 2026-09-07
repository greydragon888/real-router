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
   * Core's adopted copy of a bag: same KIND, same own entries, one level deep.
   *
   * ⚠ The kind check is not belt-and-braces. `copyOwnData` spreads, so an array
   * handed to `defaultParams` comes back as a plain `{}` — and without this
   * check an empty object counts as a copy of an empty array, which reported
   * two cells as DEFECTs that are nothing of the sort. The caller's value did
   * not survive in a judgeable form; it changed shape, which is `unreachable`.
   */
  const isOneLevelCopy = (stored: unknown, value: unknown): boolean => {
    if (
      typeof stored !== "object" ||
      stored === null ||
      typeof value !== "object" ||
      value === null
    ) {
      return false;
    }

    const a = stored as Record<string, unknown>;
    const b = value as Record<string, unknown>;
    const keys = Object.keys(b);

    if (Array.isArray(a) !== Array.isArray(b)) {
      return false;
    }

    return (
      Object.keys(a).length === keys.length &&
      keys.every((key) => Object.is(a[key], b[key]))
    );
  };

  /**
   * Did the caller's value survive into a place this plugin can READ AND JUDGE?
   *
   * ⚠ Not "is it the same object". It was spelled `Object.is` until core
   * adopted the route-config bags (#2172), and identity was an accurate proxy
   * only while the store held the caller's literal. A frozen copy with the same
   * own entries is judged exactly as well — what makes a cell unreachable is
   * the value being GONE, and the two ways that happens are unchanged: a falsy
   * structural field never reaches the store, and a codec is wrapped so the
   * slot holds core's closure instead of the caller's function.
   *
   * ⚠ One level, matching the adoption's own depth. A deeper walk here would
   * assert something core does not promise.
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

      return Object.is(stored, value) || isOneLevelCopy(stored, value);
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

    // … and a truthy bag ARRIVES, as core's own frozen copy of it since
    // #2172, which is what makes the rest of this table a statement about
    // coverage rather than about reach.
    const bag = { a: "1" };

    expect(inspectable("defaultSearch", bag)).toBe(true);

    // CONTROL for the relaxation itself: "same content" must not degrade
    // into "any object". A bag with different entries is not this bag's copy.
    expect(isOneLevelCopy({ a: "2" }, bag)).toBe(false);
    expect(isOneLevelCopy({ a: "1", b: "1" }, bag)).toBe(false);
    expect(isOneLevelCopy({ a: "1" }, bag)).toBe(true);
    // …and a change of KIND is not a copy either: `{}` is not `[]`.
    expect(isOneLevelCopy({}, [])).toBe(false);
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
