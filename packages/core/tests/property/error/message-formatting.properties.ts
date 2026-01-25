import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { RouterError, errorCodes } from "@real-router/core";

import { errorCodeArbitrary } from "./helpers";

import type { ErrorCodeKeys } from "@real-router/types";

describe("RouterError Message Formatting Properties", () => {
  describe("Default message formatting", () => {
    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "code is always present in default message",
      (code) => {
        const err = new RouterError(code);

        expect(err.message).toContain(code);

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message is not empty (except for empty code)",
      (code) => {
        const err = new RouterError(code);

        // Empty string as code gives empty message
        if (code === "") {
          expect(err.message).toBe("");
        } else {
          expect(err.message.length).toBeGreaterThan(0);
        }

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message contains only printable ASCII characters and spaces",
      (code) => {
        const err = new RouterError(code);

        // Printable ASCII: 32-126, plus newline (10), tab (9)
        const isPrintable = /^[\t\n\u0020-\u007E]*$/.test(err.message);

        expect(isPrintable).toBe(true);

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "identical codes give identical default messages",
      (code) => {
        const err1 = new RouterError(code);
        const err2 = new RouterError(code);

        expect(err1.message).toBe(err2.message);

        return true;
      },
    );
  });

  describe("Custom messages", () => {
    test.prop(
      [errorCodeArbitrary, fc.string({ minLength: 1, maxLength: 200 })],
      { numRuns: 5000 },
    )(
      "custom message completely replaces default message",
      (code, customMessage) => {
        const err = new RouterError(code, { message: customMessage });

        expect(err.message).toBe(customMessage);

        return true;
      },
    );

    test.prop([errorCodeArbitrary, fc.string({ minLength: 0, maxLength: 0 })], {
      numRuns: 1000,
    })("empty custom message is allowed", (code, emptyMessage) => {
      const err = new RouterError(code, { message: emptyMessage });

      expect(err.message).toBe("");

      return true;
    });

    test.prop(
      [errorCodeArbitrary, fc.string({ minLength: 1, maxLength: 200 })],
      { numRuns: 5000 },
    )(
      "Unicode characters are correctly preserved in message",
      (code, unicode) => {
        const err = new RouterError(code, { message: unicode });

        expect(err.message).toBe(unicode);
        expect(err.message).toHaveLength(unicode.length);

        return true;
      },
    );

    test.prop(
      [
        errorCodeArbitrary,
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
      ],
      { numRuns: 5000 },
    )(
      "two different custom messages do not affect each other",
      (code, msg1, msg2) => {
        const err1 = new RouterError(code, { message: msg1 });
        const err2 = new RouterError(code, { message: msg2 });

        expect(err1.message).toBe(msg1);
        expect(err2.message).toBe(msg2);

        // If messages are different, they should not match
        if (msg1 !== msg2) {
          expect(err1.message).not.toBe(err2.message);
        }

        return true;
      },
    );
  });

  describe("setCode and message change", () => {
    it("setCode updates code", () => {
      const err = new RouterError("ERR1");

      expect(err.code).toBe("ERR1");

      err.setCode("ERR2");

      expect(err.code).toBe("ERR2");

      return true;
    });

    test.prop(
      [
        errorCodeArbitrary,
        fc.string({ minLength: 1, maxLength: 200 }),
        errorCodeArbitrary,
      ],
      { numRuns: 5000 },
    )(
      "setCode with custom message does NOT change custom message",
      (code1, customMessage, code2) => {
        const err = new RouterError(code1, { message: customMessage });

        expect(err.message).toBe(customMessage);

        err.setCode(code2);

        // Custom message should remain unchanged
        expect(err.message).toBe(customMessage);

        return true;
      },
    );
  });

  describe("Message length and structure", () => {
    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message has reasonable length (< 1000 characters)",
      (code) => {
        const err = new RouterError(code);

        expect(err.message.length).toBeLessThan(1000);

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message does not start with space (except code with spaces)",
      (code) => {
        const err = new RouterError(code);

        // If message === code, this is expected behavior (copied as is)
        // Check only if message != code
        if (err.message.length > 0 && err.message !== code) {
          expect(err.message[0]).not.toBe(" ");
        }

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message does not end with space (except code with spaces)",
      (code) => {
        const err = new RouterError(code);

        // If message === code, this is expected behavior (copied as is)
        // Check only if message != code
        if (err.message.length > 0 && err.message !== code) {
          expect(err.message.at(-1)).not.toBe(" ");
        }

        return true;
      },
    );

    test.prop(
      [errorCodeArbitrary, fc.string({ minLength: 1, maxLength: 10_000 })],
      { numRuns: 2000 },
    )("very long custom messages are not truncated", (code, longMsg) => {
      const err = new RouterError(code, { message: longMsg });

      expect(err.message).toBe(longMsg);
      expect(err.message).toHaveLength(longMsg.length);

      return true;
    });
  });

  describe("Special characters in messages", () => {
    test.prop(
      [
        errorCodeArbitrary,
        fc.constantFrom("\n", "\r\n", "\t", "\r"),
        fc.string({ minLength: 0, maxLength: 50 }),
      ],
      { numRuns: 2000 },
    )(
      "line breaks and tabs are preserved in custom messages",
      (code, specialChar, prefix) => {
        const message = prefix + specialChar + prefix;
        const err = new RouterError(code, { message });

        expect(err.message).toBe(message);
        expect(err.message).toContain(specialChar);

        return true;
      },
    );

    test.prop(
      [
        errorCodeArbitrary,
        fc.array(fc.integer({ min: 0, max: 0xff_ff }), {
          minLength: 1,
          maxLength: 50,
        }),
      ],
      { numRuns: 2000 },
    )(
      "any Unicode code points are preserved in message",
      (code, codePoints) => {
        const message = String.fromCodePoint(...codePoints);
        const err = new RouterError(code, { message });

        expect(err.message).toBe(message);

        return true;
      },
    );

    test.prop(
      [errorCodeArbitrary, fc.constantFrom("", "\0", "\u0000", "\u0000")],
      { numRuns: 1000 },
    )("null bytes are handled correctly", (code, nullByteVariant) => {
      const message = `prefix${nullByteVariant}suffix`;
      const err = new RouterError(code, { message });

      expect(err.message).toBe(message);

      return true;
    });
  });

  describe("Message serialization", () => {
    test.prop(
      [errorCodeArbitrary, fc.string({ minLength: 1, maxLength: 200 })],
      { numRuns: 5000 },
    )("message is correctly serialized to JSON", (code, customMessage) => {
      const err = new RouterError(code, { message: customMessage });

      const json = err.toJSON();

      expect(json.message).toBe(customMessage);

      return true;
    });

    test.prop(
      [errorCodeArbitrary, fc.string({ minLength: 1, maxLength: 200 })],
      { numRuns: 5000 },
    )(
      "message remains unchanged after JSON.stringify/parse",
      (code, customMessage) => {
        const err = new RouterError(code, { message: customMessage });

        const json = structuredClone(err);

        expect(json.message).toBe(customMessage);

        return true;
      },
    );

    test.prop([errorCodeArbitrary], { numRuns: 5000 })(
      "default message is JSON-compatible",
      (code) => {
        const err = new RouterError(code);

        expect(() => JSON.stringify(err)).not.toThrowError();

        const json = structuredClone(err);

        expect(json.message).toBe(err.message);

        return true;
      },
    );
  });

  describe("Edge cases", () => {
    test.prop([errorCodeArbitrary, fc.string({ minLength: 0, maxLength: 0 })], {
      numRuns: 1000,
    })("empty message does not cause errors", (code, emptyMsg) => {
      expect(
        () => new RouterError(code, { message: emptyMsg }),
      ).not.toThrowError();

      const err = new RouterError(code, { message: emptyMsg });

      expect(err.message).toBe("");

      return true;
    });

    test.prop([errorCodeArbitrary], { numRuns: 1000 })(
      "undefined message uses default message",
      (code) => {
        const err = new RouterError(code, { message: undefined });

        // Empty string code gives empty message, this is expected behavior
        if (code === "") {
          expect(err.message).toBe("");
        } else {
          expect(err.message.length).toBeGreaterThan(0);
          expect(err.message).toContain(code);
        }

        return true;
      },
    );

    it("very long stack trace does not affect code", () => {
      const error = new Error("test");

      // Create long stack manually
      error.stack = `Error: test\n${"  at line\n".repeat(1000)}`;

      const err = new RouterError("ERR");

      err.setErrorInstance(error);

      // setErrorInstance copies message from Error, but code should remain
      expect(err.code).toBe("ERR");
      expect(err.stack).toContain("  at line");
      expect(err.stack).toContain("Error: test");
      // message will change to "test" from Error.message
      expect(err.message).toBe("test");

      return true;
    });
  });

  describe("Specific error code properties", () => {
    it("all standard error codes have informative messages", () => {
      const codes: ErrorCodeKeys[] = [
        "ROUTER_NOT_STARTED",
        "NO_START_PATH_OR_STATE",
        "ROUTER_ALREADY_STARTED",
        "ROUTE_NOT_FOUND",
        "SAME_STATES",
        "CANNOT_DEACTIVATE",
        "CANNOT_ACTIVATE",
        "TRANSITION_ERR",
        "TRANSITION_CANCELLED",
      ];

      for (const key of codes) {
        const code = errorCodes[key];
        const err = new RouterError(code);

        // Message should be informative (> 5 characters)
        // Shortest: "CANCELLED" = 9 characters
        expect(err.message.length).toBeGreaterThan(5);

        // Message should contain code or key
        const containsCodeOrKey =
          err.message.includes(code) || err.message.includes(key);

        expect(containsCodeOrKey).toBe(true);
      }

      return true;
    });

    test.prop(
      [
        fc.constantFrom(...(Object.keys(errorCodes) as ErrorCodeKeys[])),
        fc.string({ minLength: 1, maxLength: 100 }),
      ],
      { numRuns: 2000 },
    )("custom message works with all standard codes", (key, customMessage) => {
      const code = errorCodes[key];
      const err = new RouterError(code, { message: customMessage });

      expect(err.message).toBe(customMessage);
      expect(err.code).toBe(code);

      return true;
    });
  });
});
