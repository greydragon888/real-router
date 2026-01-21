import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

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

      return true;
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

        return true;
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

        return true;
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

      return true;
    });

    test.prop([errorCodeArbitrary], { numRuns: 1000 })(
      "throws TypeError for null/undefined",
      (code) => {
        const err = new RouterError(code);

        expect(() => {
          err.setErrorInstance(null as unknown as Error);
        }).toThrowError(TypeError);

        expect(() => {
          err.setErrorInstance(undefined as unknown as Error);
        }).toThrowError(TypeError);

        return true;
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

        return true;
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

        return true;
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

        return true;
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

      return true;
    });
  });

  describe("hasField / getField", () => {
    test.prop([errorCodeArbitrary, fc.string()], { numRuns: 10_000 })(
      "hasField returns false for non-existent fields",
      (code, randomKey) => {
        const err = new RouterError(code);

        // Generate random key that definitely doesn't exist
        const nonExistentKey = `__non_existent_${randomKey}__`;

        expect(err.hasField(nonExistentKey)).toBe(false);
        expect(err.getField(nonExistentKey)).toBe(undefined);

        return true;
      },
    );

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "hasField/getField are consistent",
      (code, fields) => {
        const err = new RouterError(code, fields);

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
            expect(err.hasField(key)).toBe(true);
            expect(err.getField(key)).toBe(value);
          }
        }

        return true;
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

        return true;
      },
    );
  });
});
