import { describe, expect, it } from "vitest";

import { validateLimits, validateOptions } from "../../src/validators/options";

/**
 * The option validators judge a bag by its PROTOTYPE, on the same pair every
 * other site in the tree tests (#2217).
 *
 * ⚠ **The door cannot state this, which is why the cells are on the functions.**
 * `validateOptions` has one non-test caller — the plugin's retrospective pass
 * over `ctx.getOptions()`, core's own copy — so a caller's prototype never
 * reaches here today. Measured: a router built with a null-prototype
 * `defaultParams` installs the plugin without a throw both before and after this
 * change. The cells below therefore pin the PREDICATE, which is the thing that
 * would be wrong the day a door hands these functions a bag the caller owns.
 */

const nullProtoBag = (
  source: Record<string, unknown>,
): Record<string, unknown> =>
  Object.assign(Object.create(null) as Record<string, unknown>, source);

/** Both plain prototypes, which is what "plain bag" means everywhere else. */
const ACCEPTED: readonly (readonly [string, () => Record<string, unknown>])[] =
  [
    ["an ordinary literal", () => ({ maxListeners: 50 })],
    ["a null-prototype bag", () => nullProtoBag({ maxListeners: 50 })],
    [
      "a literal demoted with setPrototypeOf",
      () =>
        Object.setPrototypeOf({ maxListeners: 50 }, null) as Record<
          string,
          unknown
        >,
    ],
  ];

/** Anything else, and the refusal is unchanged. */
const REFUSED: readonly (readonly [string, () => unknown])[] = [
  ["a Date", () => new Date(0)],
  [
    "a class instance",
    () =>
      new (class Limits {
        readonly maxListeners = 50;
      })(),
  ],
  ["an array", () => [50]],
  ["a string", () => "maxListeners=50"],
  ["null", () => null],
];

describe("option bags are judged by prototype, not by their own constructor (#2217)", () => {
  it("CONTROL — every table below registers the cells it claims to", () => {
    expect(ACCEPTED).toHaveLength(3);
    expect(REFUSED).toHaveLength(5);
  });

  it.each(ACCEPTED)("validateLimits accepts %s", (_label, build) => {
    expect(() => {
      validateLimits(build(), "test");
    }).not.toThrow();
  });

  it.each(REFUSED)("validateLimits refuses %s", (_label, build) => {
    expect(() => {
      validateLimits(build(), "test");
    }).toThrow(TypeError);
  });

  it.each(ACCEPTED)(
    "validateOptions accepts %s as defaultParams",
    (_label, build) => {
      expect(() => {
        validateOptions({ defaultParams: build() }, "test");
      }).not.toThrow();
    },
  );

  it.each(ACCEPTED)(
    "validateOptions accepts %s as defaultSearch",
    (_label, build) => {
      expect(() => {
        validateOptions({ defaultSearch: build() }, "test");
      }).not.toThrow();
    },
  );

  it("a function still passes where a bag is expected — the other accepted shape", () => {
    expect(() => {
      validateOptions({ defaultParams: () => ({}) }, "test");
    }).not.toThrow();
  });
});
