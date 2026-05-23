// packages/core/tests/functional/routeLifecycle/RouteLifecycleNamespace.unit.test.ts
//
// Direct-namespace unit tests for the origin-aware split storage introduced
// by issue #661. These exercise behaviour that the public lifecycle API does
// not currently surface — most notably the optional `origin` filter on
// `clearCanActivate` / `clearCanDeactivate` and `getFactoriesByOrigin()` —
// so they need to drive the namespace methods directly instead of going
// through `getLifecycleApi`.

import { describe, it, expect, vi } from "vitest";

import { RouteLifecycleNamespace } from "../../../src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace";

import type { GuardFn, State } from "@real-router/types";

const TO_STATE: State = {
  name: "users",
  path: "/users",
  params: {},
  context: {},
  transition: {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: [], intersection: "" },
  },
};
const FROM_STATE: State = {
  name: "home",
  path: "/home",
  params: {},
  context: {},
  transition: {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: [], intersection: "" },
  },
};

function createNamespace(
  compileFactory?: (factory: unknown) => GuardFn,
): RouteLifecycleNamespace {
  const ns = new RouteLifecycleNamespace();

  ns.setDependencies({
    compileFactory:
      (compileFactory as never) ??
      (((factory: () => GuardFn) => factory()) as never),
  });
  ns.setValidatorGetter(() => null);

  return ns;
}

describe("RouteLifecycleNamespace — origin-aware split storage (#661)", () => {
  describe("addCanActivate stores per origin", () => {
    it("definition add lands in definition Map, external add lands in external Map", () => {
      const ns = createNamespace();

      ns.addCanActivate("home", () => () => true, true);
      ns.addCanActivate("admin", () => () => true, false);

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("home" in definition[1]).toBe(true);
      expect("home" in external[1]).toBe(false);

      expect("admin" in external[1]).toBe(true);
      expect("admin" in definition[1]).toBe(false);
    });

    it("cross-origin same-slot stores both factories; last add wins for compiled function", () => {
      const ns = createNamespace();

      ns.addCanActivate("contested", () => () => true, false); // external = allow
      ns.addCanActivate("contested", () => () => false, true); // definition added last

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("contested" in definition[1]).toBe(true);
      expect("contested" in external[1]).toBe(true);

      const [, activate] = ns.getFunctions();
      const guardFn = activate.get("contested");

      expect(guardFn).toBeDefined();
      // Last add (definition = block) wins
      expect(guardFn?.(TO_STATE, FROM_STATE)).toBe(false);
    });
  });

  describe("clearCanActivate honours origin filter", () => {
    it("origin='external' removes only external slot; definition remains and recompiles", () => {
      const ns = createNamespace();

      ns.addCanActivate("contested", () => () => false, true); // definition = block
      ns.addCanActivate("contested", () => () => true, false); // external = allow

      const [, activateBefore] = ns.getFunctions();

      expect(activateBefore.get("contested")?.(TO_STATE, FROM_STATE)).toBe(
        true,
      );

      ns.clearCanActivate("contested", "external");

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("contested" in definition[1]).toBe(true);
      expect("contested" in external[1]).toBe(false);

      const [, activateAfter] = ns.getFunctions();

      // Function recompiled from remaining definition slot — block
      expect(activateAfter.get("contested")?.(TO_STATE, FROM_STATE)).toBe(
        false,
      );
    });

    it("origin='definition' removes only definition slot; external remains and recompiles", () => {
      const ns = createNamespace();

      ns.addCanActivate("contested", () => () => true, true); // definition = allow
      ns.addCanActivate("contested", () => () => false, false); // external = block

      ns.clearCanActivate("contested", "definition");

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("contested" in definition[1]).toBe(false);
      expect("contested" in external[1]).toBe(true);

      const [, activate] = ns.getFunctions();

      // Function reflects the surviving external slot — block
      expect(activate.get("contested")?.(TO_STATE, FROM_STATE)).toBe(false);
    });

    it("default (no origin) clears both slots; function deleted", () => {
      const ns = createNamespace();

      ns.addCanActivate("contested", () => () => true, true);
      ns.addCanActivate("contested", () => () => false, false);

      ns.clearCanActivate("contested");

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("contested" in definition[1]).toBe(false);
      expect("contested" in external[1]).toBe(false);

      const [, activate] = ns.getFunctions();

      expect(activate.get("contested")).toBeUndefined();
    });

    it("no-op when slot does not exist on either origin Map", () => {
      const ns = createNamespace();

      expect(() => {
        ns.clearCanActivate("ghost");
      }).not.toThrow();
      expect(() => {
        ns.clearCanActivate("ghost", "external");
      }).not.toThrow();
    });
  });

  describe("clearCanDeactivate honours origin filter (symmetric)", () => {
    it("origin='external' falls back to definition slot", () => {
      const ns = createNamespace();

      ns.addCanDeactivate("home", () => () => true, true);
      ns.addCanDeactivate("home", () => () => false, false);

      ns.clearCanDeactivate("home", "external");

      const [deactivate] = ns.getFunctions();

      // Recompiled from remaining definition slot — allow
      expect(deactivate.get("home")?.(TO_STATE, FROM_STATE)).toBe(true);
    });

    it("origin='definition' falls back to external slot", () => {
      const ns = createNamespace();

      ns.addCanDeactivate("home", () => () => true, true);
      ns.addCanDeactivate("home", () => () => false, false);

      ns.clearCanDeactivate("home", "definition");

      const [deactivate] = ns.getFunctions();

      // Recompiled from remaining external slot — block
      expect(deactivate.get("home")?.(TO_STATE, FROM_STATE)).toBe(false);
    });

    it("default clears both slots and deletes the function", () => {
      const ns = createNamespace();

      ns.addCanDeactivate("home", () => () => true, true);
      ns.addCanDeactivate("home", () => () => true, false);

      ns.clearCanDeactivate("home");

      const [deactivate] = ns.getFunctions();

      expect(deactivate.get("home")).toBeUndefined();
    });
  });

  describe("getHandlerCount counts distinct slots across origins", () => {
    it("counts each (name, type) once even when both origins hold the slot", () => {
      const ns = createNamespace();

      ns.addCanActivate("a", () => () => true, true);
      ns.addCanActivate("a", () => () => true, false);
      ns.addCanActivate("b", () => () => true, false);

      expect(ns.getHandlerCount("activate")).toBe(2);
      expect(ns.getHandlerCount("deactivate")).toBe(0);
    });

    it("returns the active Map size when one origin is empty", () => {
      const ns = createNamespace();

      ns.addCanDeactivate("x", () => () => true, true);
      ns.addCanDeactivate("y", () => () => true, true);

      expect(ns.getHandlerCount("deactivate")).toBe(2);
    });
  });

  describe("clearDefinitionGuards preserves external slots and their functions", () => {
    it("definition-only slot — function deleted", () => {
      const ns = createNamespace();

      ns.addCanActivate("def-only", () => () => false, true);
      ns.clearDefinitionGuards();

      const [, activate] = ns.getFunctions();

      expect(activate.get("def-only")).toBeUndefined();
    });

    it("definition-and-external slot — definition cleared, external function survives", () => {
      const ns = createNamespace();

      ns.addCanActivate("both", () => () => true, true);
      ns.addCanActivate("both", () => () => false, false);

      ns.clearDefinitionGuards();

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("both" in definition[1]).toBe(false);
      expect("both" in external[1]).toBe(true);

      const [, activate] = ns.getFunctions();

      expect(activate.get("both")?.(TO_STATE, FROM_STATE)).toBe(false);
    });

    it("symmetric deactivate path — definition-and-external slot preserves external function", () => {
      const ns = createNamespace();

      ns.addCanDeactivate("both-deact", () => () => true, true);
      ns.addCanDeactivate("both-deact", () => () => false, false);

      ns.clearDefinitionGuards();

      const { definition, external } = ns.getFactoriesByOrigin();

      expect("both-deact" in definition[0]).toBe(false);
      expect("both-deact" in external[0]).toBe(true);

      const [deactivate] = ns.getFunctions();

      expect(deactivate.get("both-deact")?.(TO_STATE, FROM_STATE)).toBe(false);
    });
  });

  describe("#registerHandler rollback preserves cross-origin slot", () => {
    it("when external add throws on compile, surviving definition slot stays valid", () => {
      const compileFactory = vi.fn((factory: unknown) => {
        const fn = (factory as () => GuardFn)();

        if (typeof fn !== "function") {
          throw new TypeError("bad factory");
        }

        return fn;
      });

      const ns = createNamespace(compileFactory);

      ns.addCanActivate("contested", () => () => true, true); // definition

      expect(() => {
        // External add with a bad factory that returns non-function
        ns.addCanActivate(
          "contested",

          (() => null) as any,
          false,
        );
      }).toThrow();

      // External rolled back; definition still in place; function recompiled
      const { external, definition } = ns.getFactoriesByOrigin();

      expect("contested" in external[1]).toBe(false);
      expect("contested" in definition[1]).toBe(true);

      const [, activate] = ns.getFunctions();

      expect(activate.get("contested")?.(TO_STATE, FROM_STATE)).toBe(true);
    });
  });

  describe("getFactories — backward-compatible flat shape", () => {
    it("merges definition + external; external wins on duplicate name", () => {
      const ns = createNamespace();

      const defFactory = (): GuardFn => () => true;
      const extensionFactory = (): GuardFn => () => false;

      ns.addCanActivate("dup", defFactory, true);
      ns.addCanActivate("dup", extensionFactory, false);

      const [, activate] = ns.getFactories();

      expect(activate.dup).toBe(extensionFactory);
    });
  });
});
