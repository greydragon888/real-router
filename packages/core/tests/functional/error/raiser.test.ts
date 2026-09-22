import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { internalDefect, raiser } from "@real-router/core/utils";

/**
 * The raiser's own cells (#2487). What each flavour BUILDS is the contract; which
 * sites use which flavour is `refusal-census`'s subject, not this file's.
 */
describe("raiser", () => {
  const at = raiser("router", "buildPath");

  it("writes the head once and interleaves the body", () => {
    const error = at.type`Missing required param '${"id"}' of ${2}`;

    expect(error.message).toBe(
      "[router.buildPath] Missing required param 'id' of 2",
    );
  });

  it("omits the door when several doors reach one raiser", () => {
    expect(raiser("router").plain`cannot commit`.message).toBe(
      "[router] cannot commit",
    );
  });

  const CONSTRUCTORS: readonly (readonly [string, Error, ErrorConstructor])[] =
    [
      ["type", at.type`x`, TypeError],
      ["plain", at.plain`x`, Error],
      ["ref", at.ref`x`, ReferenceError],
      ["range", at.range`x`, RangeError],
    ];

  it("drives every tag flavour, so a dropped row cannot pass unseen", () => {
    expect(CONSTRUCTORS).toHaveLength(4);
  });

  it.each(CONSTRUCTORS)(
    "%s builds its own constructor",
    (_flavour, error, constructor) => {
      expect(error).toBeInstanceOf(constructor);
      expect(error.message).toBe("[router.buildPath] x");
    },
  );

  it("carries `cause` as the constructor does, not as an assignment would", () => {
    const cause = new Error("root");
    const error = at.type({ cause })`reading it threw`;

    expect(error.cause).toBe(cause);
    // The whole reason this flavour takes options instead of the site attaching
    // them: an assignment would make `cause` enumerable.
    expect(Object.keys(error)).toStrictEqual([]);
    expect(error.message).toBe("[router.buildPath] reading it threw");
  });

  it("`plain` takes options too, and both forms still interleave", () => {
    const cause = new TypeError("root");
    const error = at.plain({ cause })`wrapping ${"one"}`;

    expect(error.cause).toBe(cause);
    expect(error.message).toBe("[router.buildPath] wrapping one");
  });

  describe("code", () => {
    it("builds a coded RouterError, frozen for the throw", () => {
      const error = at.code(errorCodes.ROUTE_NOT_FOUND)`no route '${"a"}'`;

      expect(error).toBeInstanceOf(RouterError);
      expect(error.code).toBe(errorCodes.ROUTE_NOT_FOUND);
      expect(error.message).toBe("[router.buildPath] no route 'a'");
      expect(Object.isFrozen(error)).toBe(true);
    });

    it("carries the bag's other fields", () => {
      const error = at.code(errorCodes.ROUTE_NOT_FOUND, {
        routeName: "a",
        path: "/a",
      })`no route`;

      expect(error.path).toBe("/a");
      expect(error.getField("routeName")).toBe("a");
    });

    it("the template writes `message`, so a bag cannot override it", () => {
      const error = at.code(errorCodes.ROUTE_NOT_FOUND, {
        message: "mine",
      })`theirs`;

      expect(error.message).toBe("[router.buildPath] theirs");
    });
  });

  it("CONTROL — both polarities of the head", () => {
    // A wrong door is writable, which is why step 2 judges the ARGUMENT: the
    // type cannot. The pair pins that the door reaches the message it prints.
    expect(raiser("router", "clearRoutes").type`x`.message).toBe(
      "[router.clearRoutes] x",
    );
    expect(raiser("validation-plugin").plain`x`.message).toBe(
      "[validation-plugin] x",
    );
  });
});

describe("internalDefect", () => {
  it("carries the marker and no bracket", () => {
    const error = internalDefect.plain`unreachable: ${"why"}`;

    expect(error.message).toBe(
      "Internal error (please report): unreachable: why",
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message.startsWith("[")).toBe(false);
  });
});
