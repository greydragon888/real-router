import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { RouterError } from "@real-router/core";

import {
  constructorOptionsArbitrary,
  customFieldsArbitrary,
  errorCodeArbitrary,
  messageArbitrary,
  pathArbitrary,
  redirectArbitrary,
  segmentArbitrary,
} from "./helpers";

describe("RouterError Constructor Properties", () => {
  describe("Constructor determinism", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })(
      "same parameters create errors with identical properties",
      (code, options) => {
        const err1 = new RouterError(code, options);
        const err2 = new RouterError(code, options);

        // Same base properties
        expect(err1.code).toBe(err2.code);
        expect(err1.message).toBe(err2.message);
        expect(err1.segment).toBe(err2.segment);
        expect(err1.path).toBe(err2.path);

        // redirect should be equal by content
        if (options.redirect) {
          expect(err1.redirect).toStrictEqual(err2.redirect);
        } else {
          expect(err1.redirect).toBe(undefined);
          expect(err2.redirect).toBe(undefined);
        }

        return true;
      },
    );
  });

  describe("Constructor invariants", () => {
    test.prop([errorCodeArbitrary, constructorOptionsArbitrary], {
      numRuns: 10_000,
    })(
      "code is always accessible and matches passed value",
      (code, options) => {
        const err = new RouterError(code, options);

        expect(err.code).toBe(code);
        expect(typeof err.code).toBe("string");

        return true;
      },
    );

    test.prop([errorCodeArbitrary, messageArbitrary], {
      numRuns: 10_000,
    })("message defaults to code", (code, message) => {
      const err = new RouterError(code, { message });

      if (message === undefined) {
        expect(err.message).toBe(code);
      } else {
        expect(err.message).toBe(message);
      }

      return true;
    });

    test.prop([errorCodeArbitrary], { numRuns: 10_000 })(
      "always is an instance of Error and RouterError",
      (code) => {
        const err = new RouterError(code);

        expect(err).toBeInstanceOf(Error);
        expect(err).toBeInstanceOf(RouterError);

        return true;
      },
    );

    test.prop(
      [errorCodeArbitrary, segmentArbitrary, pathArbitrary, redirectArbitrary],
      {
        numRuns: 10_000,
      },
    )(
      "optional fields are correctly set or remain undefined",
      (code, segment, path, redirect) => {
        const err = new RouterError(code, { segment, path, redirect });

        expect(err.segment).toBe(segment);
        expect(err.path).toBe(path);

        if (redirect) {
          expect(err.redirect).toBeDefined();
          expect(err.redirect).toStrictEqual(redirect);
        } else {
          expect(err.redirect).toBe(undefined);
        }

        return true;
      },
    );
  });

  describe("Method protection", () => {
    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 5000 })(
      "arbitrary fields do not overwrite class methods",
      (code, customFields) => {
        // Add reserved keys to custom fields
        const fieldsWithReserved = {
          ...customFields,
          setCode: "not a function",
          toJSON: 123,
          hasField: null,
          getField: undefined,
          setAdditionalFields: "blocked",
          setErrorInstance: false,
        };

        const err = new RouterError(code, fieldsWithReserved);

        // Methods should remain functions
        expect(typeof err.setCode).toBe("function");
        expect(typeof err.toJSON).toBe("function");
        expect(typeof err.hasField).toBe("function");
        expect(typeof err.getField).toBe("function");
        expect(typeof err.setAdditionalFields).toBe("function");
        expect(typeof err.setErrorInstance).toBe("function");

        // Methods should work
        expect(err.hasField("code")).toBe(true);
        expect(err.getField("code")).toBe(code);

        return true;
      },
    );
  });

  describe("Arbitrary fields", () => {
    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "arbitrary fields are accessible via index access",
      (code, customFields) => {
        const err = new RouterError(code, customFields);

        for (const [key, value] of Object.entries(customFields)) {
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
          }
        }

        return true;
      },
    );

    test.prop([errorCodeArbitrary, customFieldsArbitrary], { numRuns: 10_000 })(
      "arbitrary fields are accessible via hasField and getField",
      (code, customFields) => {
        const err = new RouterError(code, customFields);

        for (const key of Object.keys(customFields)) {
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
            expect(err.getField(key)).toBe(customFields[key]);
          }
        }

        return true;
      },
    );
  });

  describe("Redirect deep freeze", () => {
    test.prop([errorCodeArbitrary, redirectArbitrary], { numRuns: 5000 })(
      "redirect is always returned frozen or undefined",
      (code, redirect) => {
        const err = new RouterError(code, { redirect });

        if (redirect) {
          const frozenRedirect = err.redirect;

          expect(frozenRedirect).toBeDefined();
          expect(Object.isFrozen(frozenRedirect)).toBe(true);

          // Verify original redirect is not modified
          expect(Object.isFrozen(redirect)).toBe(false);
        } else {
          expect(err.redirect).toBe(undefined);
        }

        return true;
      },
    );
  });
});
