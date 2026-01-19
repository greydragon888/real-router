import { fc, test } from "@fast-check/vitest";
import { describe } from "vitest";

import { validateState, isState } from "type-guards";

import {
  stateMinimalArbitrary,
  stateFullArbitrary,
  historyStateArbitrary,
  invalidStateArbitrary,
  arbitraryInvalidTypes,
} from "../helpers";

describe("State Validators - Property-Based Tests", () => {
  describe("validateState", () => {
    // Generator for valid method names
    const methodNameArbitrary = fc.oneof(
      fc.constantFrom("navigate", "matchPath", "buildPath", "canActivate"),
      fc.string({ minLength: 1, maxLength: 20 }),
    );

    describe("Successful validation", () => {
      test.prop([stateMinimalArbitrary, methodNameArbitrary], {
        numRuns: 5000,
      })(
        "does not throw exception for minimal valid State",
        (state, method) => {
          expect(() => {
            validateState(state, method);
          }).not.toThrow();

          return true;
        },
      );

      test.prop([stateFullArbitrary, methodNameArbitrary], { numRuns: 5000 })(
        "does not throw exception for full valid State with meta",
        (state, method) => {
          expect(() => {
            validateState(state, method);
          }).not.toThrow();

          return true;
        },
      );

      test.prop([historyStateArbitrary, methodNameArbitrary], {
        numRuns: 5000,
      })("does not throw exception for valid HistoryState", (state, method) => {
        expect(() => {
          validateState(state, method);
        }).not.toThrow();

        return true;
      });
    });

    describe("Failed validation - throws exception", () => {
      test.prop([invalidStateArbitrary, methodNameArbitrary], {
        numRuns: 5000,
      })("throws TypeError for invalid State objects", (state, method) => {
        expect(() => {
          validateState(state, method);
        }).toThrow(TypeError);

        return true;
      });

      test.prop([arbitraryInvalidTypes, methodNameArbitrary], {
        numRuns: 5000,
      })("throws TypeError for primitives and non-objects", (value, method) => {
        expect(() => {
          validateState(value, method);
        }).toThrow(TypeError);

        return true;
      });

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "throws TypeError for null",
        (method) => {
          expect(() => {
            validateState(null, method);
          }).toThrow(TypeError);

          return true;
        },
      );

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "throws TypeError for undefined",
        (method) => {
          expect(() => {
            validateState(undefined, method);
          }).toThrow(TypeError);

          return true;
        },
      );
    });

    describe("Error messages", () => {
      test.prop([arbitraryInvalidTypes, methodNameArbitrary], {
        numRuns: 2000,
      })("includes method name in error message", (value, method) => {
        try {
          validateState(value, method);
          // If no exception was thrown, fail the test
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
          expect((error as Error).message).toContain(`[${method}]`);
        }

        return true;
      });

      test.prop([arbitraryInvalidTypes, methodNameArbitrary], {
        numRuns: 2000,
      })(
        'includes "Invalid state structure" in error message',
        (value, method) => {
          try {
            validateState(value, method);
            expect.fail("Should have thrown an error");
          } catch (error) {
            expect(error).toBeInstanceOf(TypeError);
            expect((error as Error).message).toContain(
              "Invalid state structure",
            );
          }

          return true;
        },
      );

      test.prop([arbitraryInvalidTypes, methodNameArbitrary], {
        numRuns: 2000,
      })("includes type description in error message", (value, method) => {
        try {
          validateState(value, method);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).toBeInstanceOf(TypeError);
          const message = (error as Error).message;

          // Message should contain type description (null, undefined, string, number, etc.)
          expect(message).toMatch(
            /null|undefined|string|number|boolean|symbol|function|array|object/,
          );
        }

        return true;
      });

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        'includes "Expected State object" in error message',
        (method) => {
          try {
            validateState(null, method);
            expect.fail("Should have thrown an error");
          } catch (error) {
            expect(error).toBeInstanceOf(TypeError);
            expect((error as Error).message).toContain("Expected State object");
          }

          return true;
        },
      );
    });

    describe("Determinism", () => {
      test.prop([stateMinimalArbitrary, methodNameArbitrary], {
        numRuns: 2000,
      })(
        "always gives the same result for identical input",
        (state, method) => {
          const result1 = (() => {
            try {
              validateState(state, method);

              return "success";
            } catch {
              return "error";
            }
          })();

          const result2 = (() => {
            try {
              validateState(state, method);

              return "success";
            } catch {
              return "error";
            }
          })();

          expect(result1).toBe(result2);
          expect(result1).toBe("success"); // Minimal state is always valid

          return true;
        },
      );

      test.prop([invalidStateArbitrary, methodNameArbitrary], {
        numRuns: 2000,
      })("always throws error for invalid State", (state, method) => {
        const result1 = (() => {
          try {
            validateState(state, method);

            return "success";
          } catch {
            return "error";
          }
        })();

        const result2 = (() => {
          try {
            validateState(state, method);

            return "success";
          } catch {
            return "error";
          }
        })();

        expect(result1).toBe(result2);
        expect(result1).toBe("error"); // Invalid state is always invalid

        return true;
      });
    });

    describe("Type assertion behavior", () => {
      test.prop([stateMinimalArbitrary, methodNameArbitrary], {
        numRuns: 2000,
      })(
        "works as type assertion - TypeScript knows the type after call",
        (state, method) => {
          const unknownState: unknown = state;

          // Before call TypeScript doesn't know the type
          // After call TypeScript knows it's State
          validateState(unknownState, method);

          // If call succeeded, TypeScript now knows it's State
          // This is verified at compile time
          expect(unknownState).toHaveProperty("name");
          expect(unknownState).toHaveProperty("params");
          expect(unknownState).toHaveProperty("path");

          return true;
        },
      );
    });

    describe("Edge cases", () => {
      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "handles empty object",
        (method) => {
          expect(() => {
            validateState({}, method);
          }).toThrow(TypeError);

          return true;
        },
      );

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "handles object with only name",
        (method) => {
          expect(() => {
            validateState({ name: "home" }, method);
          }).toThrow(TypeError);

          return true;
        },
      );

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "handles object with only name and params",
        (method) => {
          expect(() => {
            validateState({ name: "home", params: {} }, method);
          }).toThrow(TypeError);

          return true;
        },
      );

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "accepts minimal valid State with empty params",
        (method) => {
          expect(() => {
            validateState({ name: "home", params: {}, path: "/" }, method);
          }).not.toThrow();

          return true;
        },
      );

      test.prop([methodNameArbitrary], { numRuns: 1000 })(
        "accepts State with additional fields",
        (method) => {
          expect(() => {
            validateState(
              {
                name: "home",
                params: {},
                path: "/",
                extraField: "allowed",
                anotherExtra: 123,
              },
              method,
            );
          }).not.toThrow();

          return true;
        },
      );
    });

    describe("Mutation after validation", () => {
      test.prop([stateMinimalArbitrary, methodNameArbitrary], {
        numRuns: 1000,
      })(
        "validation does not depend on mutation after check",
        (state, method) => {
          // First validation
          expect(() => {
            validateState(state, method);
          }).not.toThrow();

          // Mutate state
          state.name = "mutated";
          state.params = { mutated: true };

          // Second validation should pass (mutated state is still valid)
          expect(() => {
            validateState(state, method);
          }).not.toThrow();

          return true;
        },
      );
    });

    describe("Invariants", () => {
      test.prop([fc.anything(), methodNameArbitrary], { numRuns: 5000 })(
        "validateState(x) succeeds if and only if isState(x) === true",
        (value, method) => {
          const isStateResult = isState(value);
          let validateStateResult: boolean;

          try {
            validateState(value, method);
            validateStateResult = true;
          } catch {
            validateStateResult = false;
          }

          expect(validateStateResult).toBe(isStateResult);

          return true;
        },
      );

      test.prop([stateMinimalArbitrary, methodNameArbitrary], {
        numRuns: 2000,
      })(
        "if validateState succeeds twice, results are identical",
        (state, method) => {
          validateState(state, method);
          validateState(state, method);

          // Both calls succeeded - test passes
          expect(true).toBe(true);

          return true;
        },
      );
    });
  });
});
