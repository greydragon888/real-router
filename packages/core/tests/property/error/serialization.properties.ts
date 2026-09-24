import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { RouterError } from "@real-router/core";

import {
  constructorOptionsArbitrary,
  customFieldsArbitrary,
  errorCodeArbitrary,
} from "./helpers";

interface Options {
  message?: string | undefined;
  segment?: string | undefined;
  path?: string | undefined;
}

/**
 * What `JSON.stringify(err)` must print: `code`, `message` (the code when none
 * is given), `segment` and `path` when defined, and every custom field — the
 * record `toJSON` builds, in its insertion order. `toJSON` omits an undefined
 * `segment` or `path`, and `JSON.stringify` drops it from the expected record.
 * `fields` must avoid the names `RouterError` reserves, which
 * `customFieldsArbitrary` excludes. The expected text is taken before the
 * error is built, so an error that rewrote the caller's values would show.
 *
 * ⚑ Compared as TEXT. `JSON.parse` is the engine's, and V8's substitutes keys
 * in a way no printed seed replays (#1709, see `parseAdoptsPlantedKey`). The
 * text also checks the fields whose values `JSON.stringify` drops or rewrites.
 */
function assertStringifiesAsRecord(
  code: string,
  options: Options,
  fields: Record<string, unknown>,
): void {
  const expected = JSON.stringify({
    code,
    message: options.message ?? code,
    segment: options.segment,
    path: options.path,
    ...fields,
  });

  expect(JSON.stringify(new RouterError(code, { ...options, ...fields }))).toBe(
    expected,
  );
}

const BACKSLASH = "\\";

/**
 * An object whose second key is `second`, after `prefix`, padded to sixteen
 * keys. V8 roots object shapes by property count, and a root stops taking new
 * shapes once full; a check that parsed the generated inputs would fill the
 * small counts, not this one.
 */
function sixteenKeys(
  prefix: string,
  second: string,
  value: unknown,
): Record<string, unknown> {
  const record: Record<string, unknown> = { [prefix]: value, [second]: value };

  for (let index = 0; index < 14; index++) {
    record[`filler${index}`] = value;
  }

  return record;
}

function throughJsonParse(record: Record<string, unknown>): unknown {
  // eslint-disable-next-line unicorn/prefer-structured-clone -- the point is the shape `JSON.parse` leaves behind, which a clone never builds
  return JSON.parse(JSON.stringify(record));
}

/**
 * Parses an object whose `prefix` key is followed by a backslash key, which
 * leaves that shape in the realm for later parses to find.
 *
 * ⚠ The caller must hold the returned object until its check is done: once
 * nothing uses the shape, a full garbage collection drops it.
 */
function plantBackslashShape(prefix: string): unknown {
  return throughJsonParse(sixteenKeys(prefix, BACKSLASH, 0));
}

/**
 * Whether this engine's `JSON.parse` carries V8's escaped-key defect: once a
 * backslash key has been parsed after some prefix, a one-character ESCAPED key
 * after the same prefix, in an object of as many keys — a quote, a newline, a
 * `\u0041` — comes back as the backslash (#1709). Fixed upstream in V8
 * `93cd21e8254b` (Chromium bug 521080746).
 */
function parseAdoptsPlantedKey(): boolean {
  const prefix = "#1709 engine probe";
  const planted = plantBackslashShape(prefix);
  const parsed = throughJsonParse(sixteenKeys(prefix, '"', 0)) as object;

  // Reading `planted` after the parse keeps its shape alive through it.
  return (
    Object.hasOwn(planted as object, BACKSLASH) && !Object.hasOwn(parsed, '"')
  );
}

describe("RouterError Serialization Properties", () => {
  describe("toJSON basic properties", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON always contains code and message", (code, options) => {
      const err = new RouterError(code, options);
      const json = err.toJSON();

      expect(json).toHaveProperty("code");
      expect(json).toHaveProperty("message");
      expect(json.code).toBe(code);
      expect(json.message).toBe(options.message ?? code);
    });

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON includes segment/path only if defined", (code, options) => {
      const err = new RouterError(code, options);
      const json = err.toJSON();

      if (options.segment === undefined) {
        expect(json).not.toHaveProperty("segment");
      } else {
        expect(json).toHaveProperty("segment", options.segment);
      }

      if (options.path === undefined) {
        expect(json).not.toHaveProperty("path");
      } else {
        expect(json).toHaveProperty("path", options.path);
      }
    });

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON never includes stack", (code, options) => {
      const err = new RouterError(code, options);

      err.stack = "long stack trace here";

      const json = err.toJSON();

      expect(json).not.toHaveProperty("stack");
    });
  });

  describe("toJSON with arbitrary fields", () => {
    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "toJSON includes arbitrary fields",
      (code, fields) => {
        const err = new RouterError(code, fields);
        const json = err.toJSON();

        for (const [key, value] of Object.entries(fields)) {
          if (
            ![
              "setCode",
              "toJSON",
              "hasField",
              "getField",
              "setAdditionalFields",
              "setErrorInstance",
            ].includes(key)
          ) {
            expect(json[key]).toBe(value);
          }
        }
      },
    );

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 5000 })(
      "toJSON + setAdditionalFields includes all fields",
      (code, fields) => {
        const err = new RouterError(code);

        err.setAdditionalFields(fields);

        const json = err.toJSON();

        for (const [key, value] of Object.entries(fields)) {
          if (
            ![
              "setCode",
              "toJSON",
              "hasField",
              "getField",
              "setAdditionalFields",
              "setErrorInstance",
            ].includes(key)
          ) {
            expect(json[key]).toBe(value);
          }
        }
      },
    );
  });

  describe("toJSON determinism", () => {
    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )(
      "multiple toJSON calls return identical result",
      (code, options, fields) => {
        const err = new RouterError(code, { ...options, ...fields });

        const json1 = err.toJSON();
        const json2 = err.toJSON();

        expect(json1).toStrictEqual(json2);
        // Verify these are different objects (not same reference)
        expect(json1).not.toBe(json2);
      },
    );

    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("identical errors serialize identically", (code, options) => {
      const err1 = new RouterError(code, options);
      const err2 = new RouterError(code, options);

      const json1 = err1.toJSON();
      const json2 = err2.toJSON();

      expect(json1).toStrictEqual(json2);
    });
  });

  describe("JSON.stringify compatibility", () => {
    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )(
      "JSON.stringify prints exactly the expected record",
      (code, options, fields) => {
        assertStringifiesAsRecord(code, options, fields);
      },
    );

    it.skipIf(!parseAdoptsPlantedKey())(
      "the check does not depend on object shapes an earlier JSON.parse left behind (#1709)",
      () => {
        const prefix = "#1709 regression cell";
        const planted = plantBackslashShape(prefix);

        expect(() => {
          assertStringifiesAsRecord(
            "NOT_STARTED",
            {},
            { field: sixteenKeys(prefix, '"', {}) },
          );
        }).not.toThrow();
        // Keeps `planted` reachable until the check above has run.
        expect(planted).toStrictEqual(sixteenKeys(prefix, BACKSLASH, 0));
      },
    );
  });

  describe("toJSON invariants", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })("toJSON always returns plain object", (code, options) => {
      const err = new RouterError(code, options);
      const json = err.toJSON();

      expect(typeof json).toBe("object");
      expect(json).not.toBeNull();
      expect(Array.isArray(json)).toBe(false);

      // Should not be instance of RouterError or Error
      expect(json).not.toBeInstanceOf(Error);
      expect(json).not.toBeInstanceOf(RouterError);
    });

    test.prop(
      [errorCodeArbitrary, constructorOptionsArbitrary, customFieldsArbitrary],
      {
        numRuns: 10_000,
      },
    )("toJSON result contains no methods", (code, options, fields) => {
      const err = new RouterError(code, { ...options, ...fields });
      const json = err.toJSON();

      // Verify there are no functions in JSON
      for (const value of Object.values(json)) {
        expect(typeof value).not.toBe("function");
      }
    });

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "toJSON result does not have Error prototype",
      (code) => {
        const err = new RouterError(code);
        const json = err.toJSON();

        // JSON object should have Object.prototype, not Error.prototype
        expect(Object.getPrototypeOf(json)).toBe(Object.prototype);
      },
    );
  });
});
