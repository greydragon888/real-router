import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { getTransitionPath } from "../../../../src/transitionPath";
import { makeState, createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("core/routes", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  describe("shouldUpdateNode", () => {
    const meta = {
      id: 0,
      params: {
        a: {},
        "a.b": { p1: "url" },
        "a.b.c": { p2: "url" },
        "a.b.c.d": { p3: "url" },
        "a.b.c.e": { p4: "url" },
      },
      options: {},
      redirected: false,
    };

    describe("input validation", () => {
      describe("nodeName validation", () => {
        it("should throw TypeError when nodeName is not a string (number)", () => {
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(123);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(123);
          }).toThrowError(
            "[router.shouldUpdateNode] nodeName must be a string",
          );
        });

        it("should throw TypeError when nodeName is null", () => {
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(null);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(null);
          }).toThrowError(
            "[router.shouldUpdateNode] nodeName must be a string",
          );
        });

        it("should throw TypeError when nodeName is undefined", () => {
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(undefined);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(undefined);
          }).toThrowError(
            "[router.shouldUpdateNode] nodeName must be a string",
          );
        });

        it("should throw TypeError when nodeName is an object", () => {
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode({});
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode({ name: "test" });
          }).toThrowError(
            "[router.shouldUpdateNode] nodeName must be a string",
          );
        });

        it("should throw TypeError when nodeName is an array", () => {
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode([]);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            router.shouldUpdateNode(["a", "b"]);
          }).toThrowError(
            "[router.shouldUpdateNode] nodeName must be a string",
          );
        });

        it("should accept empty string as valid nodeName (root node)", () => {
          expect(() => {
            router.shouldUpdateNode("");
          }).not.toThrowError();
        });

        it("should accept regular string as valid nodeName", () => {
          expect(() => {
            router.shouldUpdateNode("home");
          }).not.toThrowError();
          expect(() => {
            router.shouldUpdateNode("users.list");
          }).not.toThrowError();
        });
      });

      describe("toState validation", () => {
        it("should throw TypeError when toState is null", () => {
          const predicate = router.shouldUpdateNode("home");

          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(null);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(null);
          }).toThrowError(
            "[router.shouldUpdateNode] toState must be valid State object",
          );
        });

        it("should throw TypeError when toState is undefined", () => {
          const predicate = router.shouldUpdateNode("home");

          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(undefined);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(undefined);
          }).toThrowError(
            "[router.shouldUpdateNode] toState must be valid State object",
          );
        });

        it("should throw TypeError when toState is a primitive (number)", () => {
          const predicate = router.shouldUpdateNode("home");

          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(123);
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate(123);
          }).toThrowError(
            "[router.shouldUpdateNode] toState must be valid State object",
          );
        });

        it("should throw TypeError when toState is a primitive (string)", () => {
          const predicate = router.shouldUpdateNode("home");

          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate("state");
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate("state");
          }).toThrowError(
            "[router.shouldUpdateNode] toState must be valid State object",
          );
        });

        it("should throw TypeError when toState is an object without name property", () => {
          const predicate = router.shouldUpdateNode("home");

          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate({});
          }).toThrowError(TypeError);
          expect(() => {
            // @ts-expect-error - testing runtime validation
            predicate({ path: "/test" });
          }).toThrowError(
            "[router.shouldUpdateNode] toState must be valid State object",
          );
        });

        it("should accept toState with name property", () => {
          const predicate = router.shouldUpdateNode("home");
          const validState = {
            name: "home",
            params: {},
            path: "/home",
          };

          expect(() => {
            predicate(validState);
          }).not.toThrowError();
        });

        it("should accept complete State object", () => {
          const predicate = router.shouldUpdateNode("home");
          const currentState = {
            name: "home",
            params: {},
            path: "/home",
          };

          expect(() => {
            predicate(currentState);
          }).not.toThrowError();
        });
      });

      describe("fromState validation", () => {
        it("should accept undefined fromState (initial navigation)", () => {
          const predicate = router.shouldUpdateNode("home");
          const toState = {
            name: "home",
            params: {},
            path: "/home",
          };

          expect(() => {
            predicate(toState, undefined);
          }).not.toThrowError();
        });

        it("should accept valid fromState", () => {
          const predicate = router.shouldUpdateNode("home");
          const toState = {
            name: "sign-in",
            params: {},
            path: "/sign-in",
          };
          const fromState = {
            name: "home",
            params: {},
            path: "/home",
          };

          expect(() => {
            predicate(toState, fromState);
          }).not.toThrowError();
        });
      });
    });

    describe("predicate factory pattern", () => {
      it("should create a new function on each call", () => {
        const predicate1 = router.shouldUpdateNode("home");
        const predicate2 = router.shouldUpdateNode("home");

        expect(predicate1).not.toBe(predicate2);
      });

      it("should capture nodeName in closure", () => {
        const predicateHome = router.shouldUpdateNode("home");
        const predicateSignIn = router.shouldUpdateNode("sign-in");

        const homeState = {
          name: "home",
          params: {},
          path: "/home",
        };

        // home is active, so predicateHome should return true for intersection
        expect(predicateHome(homeState, homeState)).toBe(true);

        // sign-in is not active, so predicateSignIn should return false
        expect(predicateSignIn(homeState, homeState)).toBe(false);
      });

      it("should work with different state objects", () => {
        const predicate = router.shouldUpdateNode("home");

        const state1 = {
          name: "home",
          params: {},
          path: "/home",
        };

        const state2 = {
          name: "sign-in",
          params: {},
          path: "/sign-in",
        };

        // Should work with different state objects
        expect(() => {
          predicate(state1);
          predicate(state2);
        }).not.toThrowError();
      });
    });

    it("should tell intersection node to update", () => {
      const shouldUpdate = router.shouldUpdateNode("a")(
        makeState("a.b.c.d", { p1: 0, p2: 2, p3: 3 }, meta.params),
        makeState("a.b.c.d", { p1: 1, p2: 2, p3: 3 }, meta.params),
      );

      expect(shouldUpdate).toStrictEqual(true);
    });

    it("should tell node above intersection to not update", () => {
      const shouldUpdate = router.shouldUpdateNode("")(
        makeState("a.b.c.d", { p1: 0, p2: 2, p3: 3 }, meta.params),
        makeState("a.b.c.d", { p1: 1, p2: 2, p3: 3 }, meta.params),
      );

      expect(shouldUpdate).toStrictEqual(false);
    });

    it("should update nodes when they become active, inactive, or change internally", () => {
      const fromState = makeState(
        "a.b.c.d",
        { p1: 0, p2: 2, p3: 3 },
        meta.params,
      );
      const toState = makeState(
        "a.b.c.e",
        { p1: 1, p2: 2, p4: 3 },
        meta.params,
      );

      // These nodes are reactivated (were active, became inactive due to p1 change, active again)
      expect(router.shouldUpdateNode("a.b")(toState, fromState)).toStrictEqual(
        true,
      );
      expect(
        router.shouldUpdateNode("a.b.c")(toState, fromState),
      ).toStrictEqual(true);

      // This node activates for the first time - component should be notified!
      expect(
        router.shouldUpdateNode("a.b.c.e")(toState, fromState),
      ).toStrictEqual(true); // fixed from false to true

      // This node deactivates - component should also be notified
      expect(
        router.shouldUpdateNode("a.b.c.d")(toState, fromState),
      ).toStrictEqual(true);
    });

    it("should always update node if reload option is set", () => {
      const toState = makeState("a.b.c", { p1: 1, p2: 2 }, meta.params, {
        reload: true,
      });

      expect(router.shouldUpdateNode("a.b.c")(toState)).toBe(true);
      expect(router.shouldUpdateNode("a")(toState)).toBe(true);
      expect(router.shouldUpdateNode("unrelated")(toState)).toBe(true);
    });

    it("should update nodes that become active on initial transition", () => {
      const toState = makeState("a.b.c", { p1: 1, p2: 2 }, meta.params);

      // These nodes become active - components should be notified
      expect(router.shouldUpdateNode("a")(toState)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(toState)).toBe(true);
      expect(router.shouldUpdateNode("a.b.c")(toState)).toBe(true);

      // Root node always updates
      expect(router.shouldUpdateNode("")(toState)).toBe(true);

      // Unrelated node does not update
      expect(router.shouldUpdateNode("unrelated")(toState)).toBe(false);
    });

    it("should not update node if it is not in toActivate", () => {
      const fromState = makeState(
        "a.b.c.d",
        { p1: 1, p2: 2, p3: 3 },
        meta.params,
      );
      const toState = makeState(
        "a.b.c.e",
        { p1: 1, p2: 2, p4: 4 },
        meta.params,
      );

      expect(router.shouldUpdateNode("x.y")(toState, fromState)).toBe(false);
    });

    it("should update node even if no params changed, when node is the intersection", () => {
      const fromState = makeState("a.b.c", { p1: 1 }, meta.params);
      const toState = makeState("a.b.c", { p1: 1 }, meta.params);

      expect(router.shouldUpdateNode("a.b.c")(toState, fromState)).toBe(true);
    });

    it("should not update node if both toState and fromState are root ('')", () => {
      const state = makeState("", {}, meta.params);

      expect(router.shouldUpdateNode("")(state, state)).toBe(true); // intersection
      expect(router.shouldUpdateNode("a")(state, state)).toBe(false);
    });

    it("should not update node in toActivate if all segments match but nodeName never matches any", () => {
      const fromState = makeState("a.b.c", { p1: 1, p2: 2 }, meta.params);
      const toState = makeState("a.b.c", { p1: 2, p2: 3 }, meta.params);

      expect(router.shouldUpdateNode("a.b.c.d")(toState, fromState)).toBe(
        false,
      );
    });

    it("should update node when deactivating but remaining in tree", () => {
      const fromState = makeState("a.b.c.d", { p1: 1 }, meta.params);
      const toState = makeState("a.b.x", { p1: 2 }, meta.params);

      // "a.b" is deactivated (was a.b.c.d) but remains in the tree (became a.b.x)
      expect(router.shouldUpdateNode("a.b")(toState, fromState)).toBe(true);
    });

    it("should update node when deactivating (leaving the tree)", () => {
      const fromState = makeState("a.b.c.d", {}, meta.params);
      const toState = makeState("x.y.z", {}, meta.params);

      // "a.b.c.d" deactivates - component should be notified
      expect(router.shouldUpdateNode("a.b.c.d")(toState, fromState)).toBe(true);

      // All nodes in "a" branch deactivate
      expect(router.shouldUpdateNode("a")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b.c")(toState, fromState)).toBe(true);

      // All nodes in "x" branch activate
      expect(router.shouldUpdateNode("x")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("x.y")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("x.y.z")(toState, fromState)).toBe(true);

      // Unaffected nodes
      expect(router.shouldUpdateNode("unrelated")(toState, fromState)).toBe(
        false,
      );
    });

    it("should update intersection node when only params change", () => {
      const fromState = makeState("a.b.c", { id: "1" }, meta.params);
      const toState = makeState("a.b.c", { id: "2" }, meta.params);

      // intersection = "a.b.c"
      expect(router.shouldUpdateNode("a.b.c")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(toState, fromState)).toBe(false);
      expect(router.shouldUpdateNode("a")(toState, fromState)).toBe(false);
    });

    it("should handle complex branch switching", () => {
      const fromState = makeState("app.users.list", {}, meta.params);
      const toState = makeState("app.settings.profile", {}, meta.params);

      // "app" - intersection, remains active
      expect(router.shouldUpdateNode("app")(toState, fromState)).toBe(true);

      // "app.users" - deactivates, component should be notified
      expect(router.shouldUpdateNode("app.users")(toState, fromState)).toBe(
        true,
      );

      // "app.users.list" - also deactivates
      expect(
        router.shouldUpdateNode("app.users.list")(toState, fromState),
      ).toBe(true);

      // "app.settings" - activates, component should be notified
      expect(router.shouldUpdateNode("app.settings")(toState, fromState)).toBe(
        true,
      );

      // "app.settings.profile" - also activates
      expect(
        router.shouldUpdateNode("app.settings.profile")(toState, fromState),
      ).toBe(true);

      // Unaffected nodes
      expect(router.shouldUpdateNode("admin")(toState, fromState)).toBe(false);
    });

    it("should update all nodes in transition path including unrelated checks", () => {
      const fromState = makeState(
        "a.b.c.d",
        { p1: 0, p2: 2, p3: 3 },
        meta.params,
      );
      const toState = makeState(
        "a.b.c.e",
        { p1: 1, p2: 2, p4: 3 },
        meta.params,
      );

      // All these nodes are affected by the transition - should update
      expect(router.shouldUpdateNode("a")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b.c")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("a.b.c.e")(toState, fromState)).toBe(true); // activates
      expect(router.shouldUpdateNode("a.b.c.d")(toState, fromState)).toBe(true); // deactivates
      expect(router.shouldUpdateNode("unrelated")(toState, fromState)).toBe(
        false,
      ); // unaffected
    });

    it("should update active nodes on initial transition", () => {
      const toState = makeState("a.b.c", { p1: 1, p2: 2 }, meta.params);

      // All activating nodes should update on initial navigation
      expect(router.shouldUpdateNode("a")(toState)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(toState)).toBe(true);
      expect(router.shouldUpdateNode("a.b.c")(toState)).toBe(true);
      expect(router.shouldUpdateNode("")(toState)).toBe(true); // root always
      expect(router.shouldUpdateNode("unrelated")(toState)).toBe(false);
    });

    it("should update nodes only when affected by transition", () => {
      const fromState = makeState("users.list", {});
      const toState = makeState("products.view", { id: "123" });

      // Deactivating nodes
      expect(router.shouldUpdateNode("users")(toState, fromState)).toBe(true);
      expect(router.shouldUpdateNode("users.list")(toState, fromState)).toBe(
        true,
      );

      // Activating nodes
      expect(router.shouldUpdateNode("products")(toState, fromState)).toBe(
        true,
      );
      expect(router.shouldUpdateNode("products.view")(toState, fromState)).toBe(
        true,
      );

      // Unaffected nodes
      expect(router.shouldUpdateNode("admin")(toState, fromState)).toBe(false);
      expect(router.shouldUpdateNode("settings")(toState, fromState)).toBe(
        false,
      );
    });

    it("should handle reload option correctly", () => {
      const state = makeState("a.b.c", {}, meta.params);
      const reloadState = {
        ...state,
        meta: {
          ...state.meta,
          id: 1,
          params: {},
          redirected: false,
          options: { reload: true },
        },
      };

      // On reload, all nodes update
      expect(router.shouldUpdateNode("a")(reloadState, state)).toBe(true);
      expect(router.shouldUpdateNode("a.b")(reloadState, state)).toBe(true);
      expect(router.shouldUpdateNode("unrelated")(reloadState, state)).toBe(
        true,
      );
    });

    describe("shouldUpdateNode edge cases", () => {
      it("should handle deep nesting with many matching segments", () => {
        const meta = {
          params: {
            a: {},
            "a.b": {},
            "a.b.c": {},
            "a.b.c.d": {},
            "a.b.c.d.e": {},
            "a.b.c.d.e.f": {},
          },
        };

        const fromState = makeState("a.b.c.d.e.f", {}, meta.params);
        const toState = makeState("a.b.c.x.y.z", {}, meta.params);

        // intersection - remains active
        expect(router.shouldUpdateNode("a.b.c")(toState, fromState)).toBe(true);

        // Deactivating nodes - components should be notified
        expect(router.shouldUpdateNode("a.b.c.d")(toState, fromState)).toBe(
          true,
        );
        expect(router.shouldUpdateNode("a.b.c.d.e")(toState, fromState)).toBe(
          true,
        );
        expect(router.shouldUpdateNode("a.b.c.d.e.f")(toState, fromState)).toBe(
          true,
        );

        // Activating nodes - components should be notified
        expect(router.shouldUpdateNode("a.b.c.x")(toState, fromState)).toBe(
          true,
        );
        expect(router.shouldUpdateNode("a.b.c.x.y")(toState, fromState)).toBe(
          true,
        );
        expect(router.shouldUpdateNode("a.b.c.x.y.z")(toState, fromState)).toBe(
          true,
        );

        // Unaffected nodes above intersection
        expect(router.shouldUpdateNode("a")(toState, fromState)).toBe(false);
        expect(router.shouldUpdateNode("a.b")(toState, fromState)).toBe(false);
      });

      it("should handle empty node name", () => {
        const fromState = makeState("a.b");
        const toState = makeState("x.y");

        expect(router.shouldUpdateNode("")(toState, fromState)).toBe(true);
      });
    });

    describe("Root node behavior on initial navigation", () => {
      it("should always update root node on initial navigation regardless of target route", () => {
        // Initial navigation to different routes
        const routes = [
          makeState("", {}),
          makeState("a", {}),
          makeState("a.b", {}),
          makeState("a.b.c.d.e.f", {}),
          makeState("x.y.z", { id: "123" }),
        ];

        routes.forEach((toState) => {
          expect(router.shouldUpdateNode("")(toState, undefined)).toBe(true);
        });
      });

      it("should update root node even when it's not in toActivate list", () => {
        // For route "a.b.c", nameToIDs function returns ["a", "a.b", "a.b.c"]
        // Root node "" is not in this list, but should still update
        const toState = makeState("a.b.c", { id: "test" });

        // Verify that root node is not in toActivate
        const { toActivate } = getTransitionPath(toState);

        expect(toActivate).not.toContain("");

        // But should still update thanks to special check
        expect(router.shouldUpdateNode("")(toState, undefined)).toBe(true);
      });

      it("should not update root node on transitions between non-root states", () => {
        // On transitions between non-root states, root node
        // should not update (unless it's the intersection)
        const fromState = makeState("a.b.c", {});
        const toState = makeState("a.b.d", {});

        // intersection will be "a.b", not root
        const { intersection } = getTransitionPath(toState, fromState);

        expect(intersection).not.toBe("");

        // Root node should not update
        expect(router.shouldUpdateNode("")(toState, fromState)).toBe(false);
      });

      it("should update root node when transitioning from any state to root", () => {
        const fromStates = [
          makeState("a", {}),
          makeState("a.b.c", {}),
          makeState("x.y.z", {}),
        ];

        const toState = makeState("", {});

        fromStates.forEach((fromState) => {
          expect(router.shouldUpdateNode("")(toState, fromState)).toBe(true);
        });
      });

      it("should handle root node consistently across different navigation patterns", () => {
        // Pattern 1: Initial navigation to root
        expect(router.shouldUpdateNode("")(makeState("", {}), undefined)).toBe(
          true,
        );

        // Pattern 2: Initial navigation to nested route
        expect(
          router.shouldUpdateNode("")(
            makeState("app.dashboard", {}),
            undefined,
          ),
        ).toBe(true);

        // Pattern 3: Transition from root to nested
        expect(
          router.shouldUpdateNode("")(makeState("app", {}), makeState("", {})),
        ).toBe(true); // root deactivates

        // Pattern 4: Transition from nested to root
        expect(
          router.shouldUpdateNode("")(makeState("", {}), makeState("app", {})),
        ).toBe(true); // root activates (and is intersection)
      });
    });
  });
});
