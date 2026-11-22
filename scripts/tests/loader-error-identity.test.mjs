// loader-error-identity.test.mjs — the check behind the smoke test's
// loader-error phase (`scripts/loader-error-identity.mjs`).
//
// Run:  node --test scripts/tests/loader-error-identity.test.mjs
//
// The places here are copies of a family this file builds the way
// `@real-router/ssr-utils` builds its loader errors: a mark under
// `Symbol.for`, whose value is the class's code, and a `Symbol.hasInstance`
// that admits what the prototype chain admits and, on the class itself, a
// value that carries the mark as well. Each line the check reports has a
// cell, on copies that break the one property the line names.

import assert from "node:assert/strict";
import { test } from "node:test";

import { loaderErrorFailures } from "../loader-error-identity.mjs";

const KEY = "@real-router/ssr-utils/loader-error";
const ordinaryHasInstance = Function.prototype[Symbol.hasInstance];

const CODES = {
  LoaderNotFound: "LOADER_NOT_FOUND",
  LoaderRedirect: "LOADER_REDIRECT",
  LoaderTimeout: "LOADER_TIMEOUT",
};

/**
 * @typedef {object} Asked
 * @property {Function} family  the class whose `Symbol.hasInstance` runs
 * @property {unknown} receiver  the class `instanceof` was asked about
 * @property {any} value
 * @property {symbol} mark
 * @property {string} code
 */

/**
 * The package's `Symbol.hasInstance`.
 *
 * @param {Asked} asked
 */
function marked({ family, receiver, value, mark, code }) {
  if (ordinaryHasInstance.call(receiver, value)) {
    return true;
  }
  return (
    receiver === family &&
    typeof value === "object" &&
    value !== null &&
    value[mark] === code
  );
}

/**
 * One copy of the family.
 *
 * @param {object} [options]
 * @param {(asked: Asked) => boolean} [options.admits]  the body of each
 *   class's `Symbol.hasInstance`
 * @param {symbol} [options.mark]
 * @param {() => Function} [options.withTimeout]
 * @returns {Record<string, any>}
 */
function copy({ admits = marked, mark = Symbol.for(KEY), withTimeout } = {}) {
  /** @type {Record<string, any>} */
  const classes = {};
  for (const [name, code] of Object.entries(CODES)) {
    const family = class extends Error {
      /** @param {unknown[]} args */
      constructor(...args) {
        super(`${name} ${args.join(" ")}`);
        this.code = code;
        Object.defineProperty(this, mark, { value: code });
      }

      /** @param {unknown} value */
      static [Symbol.hasInstance](value) {
        return admits({ family, receiver: this, value, mark, code });
      }
    };
    classes[name] = family;
  }
  return {
    ...classes,
    withTimeout:
      withTimeout?.() ??
      /** @param {string} route @param {number} ms */
      ((route, ms) =>
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new classes.LoaderTimeout(route, ms));
          }, ms);
        })),
  };
}

/** Two copies of the family, built alike. */
const two = (options = {}) => [
  { label: "a", module: copy(options) },
  { label: "b", module: copy(options) },
];

/**
 * @param {string[]} failures
 * @param {string} line
 */
const reports = (failures, line) => {
  assert.ok(
    failures.includes(line),
    `no line\n  ${line}\nin\n  ${failures.join("\n  ")}`,
  );
};

test("CONTROL — two copies built as the package builds them report nothing", async () => {
  assert.deepEqual(await loaderErrorFailures(two(), { distinct: 2 }), []);
});

test("a copy without the mark admits no instance of another copy", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: ({ receiver, value }) =>
        ordinaryHasInstance.call(receiver, value),
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "LoaderNotFound of a is not an instance of LoaderNotFound of b",
  );
  reports(
    failures,
    "an instance of a subclass of LoaderRedirect of b is not an instance of LoaderRedirect of a",
  );
  reports(
    failures,
    "withTimeout of a rejects with no instance of LoaderTimeout of b",
  );
});

test("a copy whose mark is Symbol(), not Symbol.for, admits no instance of another copy", async () => {
  const places = [
    { label: "a", module: copy({ mark: Symbol(KEY) }) },
    { label: "b", module: copy({ mark: Symbol(KEY) }) },
  ];
  const failures = await loaderErrorFailures(places, { distinct: 2 });

  reports(
    failures,
    "LoaderTimeout of b is not an instance of LoaderTimeout of a",
  );
  reports(
    failures,
    "withTimeout of b rejects with no instance of LoaderTimeout of a",
  );
});

test("a class that reads the mark and not its value admits the other classes of the family", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: ({ family, receiver, value, mark }) =>
        receiver === family
          ? typeof value === "object" && value !== null && mark in value
          : ordinaryHasInstance.call(receiver, value),
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "LoaderNotFound of a is an instance of LoaderRedirect of b",
  );
});

test("a class that reads the mark on a subclass too admits an instance of the class it extends", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: ({ value, mark, code }) =>
        typeof value === "object" && value !== null && value[mark] === code,
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "LoaderNotFound of b is an instance of a subclass of LoaderNotFound of a",
  );
});

test("a class that admits by the mark alone refuses a subclass's own instance", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: ({ family, receiver, value, mark, code }) =>
        receiver === family &&
        typeof value === "object" &&
        value !== null &&
        value[mark] === code,
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "an instance of a subclass of LoaderNotFound of a is not an instance of that subclass",
  );
});

test("a class that admits only its own constructor's name refuses a subclass's instance", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: (asked) =>
        marked(asked) &&
        (asked.receiver !== asked.family ||
          asked.value.constructor.name === asked.family.name),
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "an instance of a subclass of LoaderTimeout of a is not an instance of LoaderTimeout of b",
  );
});

test("a class that admits a bare Error is reported", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: (asked) =>
        marked(asked) ||
        (asked.receiver === asked.family &&
          asked.value instanceof Error &&
          !(asked.mark in asked.value)),
    }),
    { distinct: 2 },
  );

  reports(failures, "an Error is an instance of LoaderNotFound of a");
});

test("a class that admits an object by its code is reported", async () => {
  const failures = await loaderErrorFailures(
    two({
      admits: (asked) =>
        marked(asked) ||
        (asked.receiver === asked.family && asked.value?.code === asked.code),
    }),
    { distinct: 2 },
  );

  reports(
    failures,
    "an object with the code LOADER_REDIRECT is an instance of LoaderRedirect of b",
  );
});

test("a withTimeout that rejects with another error is reported", async () => {
  const failures = await loaderErrorFailures(
    two({ withTimeout: () => () => Promise.reject(new Error("late")) }),
    { distinct: 2 },
  );

  assert.deepEqual(failures, [
    "withTimeout of a rejects with no instance of LoaderTimeout of a",
    "withTimeout of a rejects with no instance of LoaderTimeout of b",
    "withTimeout of b rejects with no instance of LoaderTimeout of a",
    "withTimeout of b rejects with no instance of LoaderTimeout of b",
  ]);
});

test(
  "a withTimeout that fulfils or stays pending is reported",
  { timeout: 2000 },
  async () => {
    const places = [
      {
        label: "a",
        module: copy({ withTimeout: () => () => Promise.resolve("value") }),
      },
      {
        label: "b",
        module: copy({ withTimeout: () => () => new Promise(() => {}) }),
      },
    ];

    assert.deepEqual(
      await loaderErrorFailures(places, { distinct: 2, settleMs: 20 }),
      [
        "withTimeout of a has not rejected in 20 ms",
        "withTimeout of b has not rejected in 20 ms",
      ],
    );
  },
);

test("a place without an export is named, and nothing else is judged", async () => {
  const places = [
    { label: "a", module: {} },
    { label: "b", module: { ...copy(), withTimeout: undefined } },
  ];

  assert.deepEqual(await loaderErrorFailures(places, { distinct: 2 }), [
    "a: no LoaderNotFound",
    "a: no LoaderRedirect",
    "a: no LoaderTimeout",
    "a: no withTimeout",
    "b: no withTimeout",
  ]);
});

test("places that hold fewer copies than the caller names are reported", async () => {
  const one = copy();
  const places = [
    { label: "a", module: one },
    { label: "b", module: one },
  ];

  assert.deepEqual(await loaderErrorFailures(places, { distinct: 2 }), [
    "expected 2 different LoaderTimeout classes among the places, found 1",
  ]);
});

test("fewer than two places is refused", async () => {
  await assert.rejects(
    loaderErrorFailures([{ label: "a", module: copy() }], { distinct: 1 }),
    { message: "loaderErrorFailures compares two places or more, and got 1" },
  );
});

test("a count of distinct classes that is not a positive integer is refused", async () => {
  await assert.rejects(loaderErrorFailures(two(), /** @type {any} */ ({})), {
    message:
      "loaderErrorFailures needs the number of distinct classes, and got undefined",
  });
});
