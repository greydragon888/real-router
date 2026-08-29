import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { RouterError } from "@real-router/core";

import {
  createErrorInstance,
  customFieldsArbitrary,
  errorCodeArbitrary,
  errorInstanceArbitrary,
  isStandardErrorCode,
  messageArbitrary,
} from "./helpers";

describe("RouterError Methods Properties", () => {
  describe("setCode", () => {
    test.prop([errorCodeArbitrary, errorCodeArbitrary, messageArbitrary], {
      numRuns: 10_000,
    })("deterministically updates code", (initialCode, newCode, message) => {
      const err = new RouterError(initialCode, { message });
      const messageBefore = err.message;

      err.setCode(newCode);

      expect(err.code).toBe(newCode);

      // Verify message update logic
      if (isStandardErrorCode(messageBefore)) {
        // If message was a standard code, it gets updated
        expect(err.message).toBe(newCode);
      } else {
        // If message was custom, it is preserved
        expect(err.message).toBe(messageBefore);
      }
    });

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "multiple setCode calls work correctly",
      (initialCode) => {
        const err = new RouterError(initialCode, { message: initialCode });

        // First setCode
        err.setCode("CODE1");

        expect(err.code).toBe("CODE1");

        if (isStandardErrorCode(initialCode)) {
          // If initialCode was standard, message was updated to CODE1
          expect(err.message).toBe("CODE1");

          // Second setCode - CODE1 is not a standard code, message stays CODE1
          err.setCode("CODE2");

          expect(err.code).toBe("CODE2");
          expect(err.message).toBe("CODE1"); // Preserved
        } else {
          // If initialCode was custom, message was not updated
          expect(err.message).toBe(initialCode);
        }
      },
    );

    test.prop([errorCodeArbitrary, errorCodeArbitrary], { numRuns: 10_000 })(
      "setCode idempotency",
      (initialCode, newCode) => {
        const err1 = new RouterError(initialCode);

        err1.setCode(newCode);
        const code1 = err1.code;
        const message1 = err1.message;

        err1.setCode(newCode);
        const code2 = err1.code;
        const message2 = err1.message;

        expect(code1).toBe(code2);
        expect(message1).toBe(message2);
      },
    );
  });

  describe("setErrorInstance", () => {
    test.prop([errorCodeArbitrary, errorInstanceArbitrary], {
      numRuns: 10_000,
    })("copies Error instance properties", (code, errorData) => {
      const err = new RouterError(code);
      const nativeErr = createErrorInstance(errorData);

      err.setErrorInstance(nativeErr);

      expect(err.message).toBe(errorData.message);

      if (errorData.stack) {
        expect(err.stack).toBe(errorData.stack);
      } else {
        expect(err.stack).toBe("");
      }

      if (errorData.cause !== undefined) {
        expect(err.cause).toBe(errorData.cause);
      }
    });

    test.prop([errorCodeArbitrary], { numRuns: 1000 })(
      "throws TypeError for null/undefined",
      (code) => {
        const err = new RouterError(code);

        expect(() => {
          err.setErrorInstance(null as unknown as Error);
        }).toThrow(TypeError);

        expect(() => {
          err.setErrorInstance(undefined as unknown as Error);
        }).toThrow(TypeError);
      },
    );

    test.prop(
      [errorCodeArbitrary, errorInstanceArbitrary, errorInstanceArbitrary],
      {
        numRuns: 5000,
      },
    )(
      "multiple setErrorInstance calls overwrite values",
      (code, errorData1, errorData2) => {
        const err = new RouterError(code);

        const nativeErr1 = createErrorInstance(errorData1);

        err.setErrorInstance(nativeErr1);

        expect(err.message).toBe(errorData1.message);

        const nativeErr2 = createErrorInstance(errorData2);

        err.setErrorInstance(nativeErr2);

        expect(err.message).toBe(errorData2.message);
      },
    );
  });

  describe("setAdditionalFields", () => {
    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "adds arbitrary fields",
      (code, fields) => {
        const err = new RouterError(code);

        err.setAdditionalFields(fields);

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
            expect((err as Record<string, unknown>)[key]).toBe(value);
            expect(err.hasField(key)).toBe(true);
            expect(err.getField(key)).toBe(value);
          }
        }
      },
    );

    test.prop(
      [
        errorCodeArbitrary,
        fc.constantFrom("code", "segment", "path"),
        fc.string(),
      ],
      { numRuns: 1000 },
    )(
      "throws TypeError for reserved DATA property keys",
      (code, reservedKey, value) => {
        const err = new RouterError(code);

        // Reserved DATA properties (code/segment/path) — distinct from
        // the reserved METHODS covered below — must be REJECTED, not silently
        // dropped. The shared `customFieldsArbitrary` filters these keys out, so
        // this throw path (RouterError.setAdditionalFields) had no generative
        // coverage at all.
        expect(() => {
          err.setAdditionalFields({ [reservedKey]: value });
        }).toThrow(TypeError);
      },
    );

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 5000 })(
      "does not overwrite methods",
      (code, fields) => {
        const err = new RouterError(code);

        const fieldsWithReserved = {
          ...fields,
          setCode: "blocked",
          toJSON: "blocked",
          hasField: "blocked",
          getField: "blocked",
          setAdditionalFields: "blocked",
          setErrorInstance: "blocked",
        };

        err.setAdditionalFields(fieldsWithReserved);

        // Methods remain functions
        expect(typeof err.setCode).toBe("function");
        expect(typeof err.toJSON).toBe("function");
        expect(typeof err.hasField).toBe("function");
        expect(typeof err.getField).toBe("function");
        expect(typeof err.setAdditionalFields).toBe("function");
        expect(typeof err.setErrorInstance).toBe("function");
      },
    );

    test.prop(
      [errorCodeArbitrary, customFieldsArbitrary, customFieldsArbitrary],
      {
        numRuns: 5000,
      },
    )("multiple calls accumulate fields", (code, fields1, fields2) => {
      const err = new RouterError(code);

      err.setAdditionalFields(fields1);
      err.setAdditionalFields(fields2);

      // All fields from both calls should be present
      for (const key of Object.keys(fields1)) {
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
          expect(err.hasField(key)).toBe(true);
        }
      }

      for (const key of Object.keys(fields2)) {
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
          expect(err.hasField(key)).toBe(true);
        }
      }
    });
  });

  describe("hasField / getField", () => {
    // ⚑ The key generator is the whole point of this property, and it used to be
    // `__non_existent_${randomKey}__` — prefixed AND suffixed, so no
    // `fc.string()` could ever produce `toString`, `constructor` or any other
    // name the old `key in this` answered `true` for. It ran 10 000 times
    // against the #1829 defect and could not see it: a vacuous guard on exactly
    // the axis it names.
    //
    // Widening the GENERATOR is the fix rather than adding a second cell beside
    // it — the names are non-existent fields, which is what this property is
    // about, and a non-generative twin here would only duplicate
    // `tests/functional/error/field-access-own-only-1829.test.ts`.
    //
    // Derived, never listed: a hand-written enumeration of `Object.prototype`
    // is what the sibling sweep #1798 got wrong, and the set grows with the
    // engine.
    const CHAIN_ONLY_NAMES = [
      ...new Set([
        ...Object.getOwnPropertyNames(Object.prototype),
        ...Object.getOwnPropertyNames(
          Object.getPrototypeOf(new RouterError("SOME_CODE")) as object,
        ),
      ]),
    ];

    const absentKeyArbitrary = fc.oneof(
      fc.string().map((randomKey) => `__non_existent_${randomKey}__`),
      fc.constantFrom(...CHAIN_ONLY_NAMES),
    );

    test.prop([errorCodeArbitrary, absentKeyArbitrary], { numRuns: 10_000 })(
      "hasField returns false for non-existent fields",
      (code, absentKey) => {
        const err = new RouterError(code);

        expect(err.hasField(absentKey)).toBe(false);
        expect(err.getField(absentKey)).toBeUndefined();
      },
    );

    it("CONTROL — the generator actually reaches the chain names", () => {
      // Without this the widening above can be reverted, or the arbitrary can
      // start producing only its random half, and the property goes back to
      // guarding nothing while still passing.
      expect(CHAIN_ONLY_NAMES).toContain("toString");
      expect(CHAIN_ONLY_NAMES).toContain("constructor");
      expect(CHAIN_ONLY_NAMES).toContain("hasField");
      expect(CHAIN_ONLY_NAMES.length).toBeGreaterThan(15);

      const samples = fc.sample(absentKeyArbitrary, 500);

      expect(samples.some((key) => CHAIN_ONLY_NAMES.includes(key))).toBe(true);
      expect(samples.some((key) => key.startsWith("__non_existent_"))).toBe(
        true,
      );

      // ⚑ The PRECONDITION the property leans on, asserted rather than assumed:
      // a field-less error carries none of these as an OWN property, so every
      // generated key really is absent and the property never has to skip one.
      //
      // ⚠ A `if (Object.hasOwn(err, absentKey)) return;` guard stood in the
      // property body instead, justified by "`message`, `stack` and `name` are
      // own properties of every Error" — true, and irrelevant: none of those
      // three is on `Object.prototype` or on the class prototype, so none is in
      // this set. Measured across four codes, the guard swallowed NOTHING. A
      // dead branch with a plausible comment on it is worse than no comment.
      const probe = new RouterError("SOME_CODE");

      expect(
        CHAIN_ONLY_NAMES.filter((name) => Object.hasOwn(probe, name)),
      ).toStrictEqual([]);
    });

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "hasField/getField are consistent",
      (code, fields) => {
        const err = new RouterError(code, fields);

        // ⚑ The six reserved METHOD names used to be skipped here by a
        // hard-coded list. The skip was DEAD: `customFieldsArbitrary` already
        // filters exactly those names (plus `__proto__` / `constructor` /
        // `prototype` and the reserved data keys), so the condition was true on
        // every run. It read as compensation for the old `key in this` — which
        // did answer `true` for all six — and survived because a dead branch in
        // a test costs nothing visible.
        //
        // ⚠ Replacing it with `if (reserved) expect(false) else expect(true)`
        // was tried and is equally dead, for the same reason. The generator owns
        // the exclusion; re-deriving it here duplicates it. The reserved names
        // are pinned where a generator CAN reach them — the chain-only property
        // above, which reds on the `key in this` mutant.
        //
        // ⚠ Two SIBLINGS in this file carry the identical dead skip ("adds
        // arbitrary fields", "multiple calls accumulate fields") and are left
        // alone deliberately: they predate #1829 and cleaning them is not this
        // fix's business. Recorded because measuring something and saying
        // nothing is how it stays. ("does not overwrite methods" is NOT one of
        // them — it injects the reserved keys itself, so its list is live.)
        for (const [key, value] of Object.entries(fields)) {
          expect(err.hasField(key)).toBe(true);
          expect(err.getField(key)).toBe(value);
        }
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "hasField/getField work for built-in fields",
      (code) => {
        const err = new RouterError(code);

        expect(err.hasField("code")).toBe(true);
        expect(err.getField("code")).toBe(code);

        expect(err.hasField("message")).toBe(true);
        expect(err.getField("message")).toBe(code); // message = code by default
      },
    );
  });
});
