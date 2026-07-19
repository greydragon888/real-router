// eslint-disable-next-line import-x/no-extraneous-dependencies -- test-only helper; vitest is a root devDependency. The eslint vitest block (section 12) auto-exempts only *.test.ts / *.properties.ts / *.stress.ts / helpers.ts, not arbitrarily-named helpers like this one.
import { vi, type Mock } from "vitest";

import { getInternals } from "@real-router/core/validation";

import type { RouterValidator, DefaultDependencies } from "@real-router/core";
import type { Router } from "@real-router/core/types";

/**
 * A `RouterValidator` whose every namespace method is a `vi.fn()` spy.
 *
 * Core normally runs with `ctx.validator === null` (validation is opt-in via
 * `@real-router/validation-plugin`, a separate package). That makes every
 * `ctx.validator?.ns.method(arg, "caller")` call-site short-circuit to
 * `undefined` in the core suite — line coverage stays at 100 % while the
 * mutation tester reports the `"caller"` strings and the surrounding decision
 * logic (isNewKey / isChanging / bothAreNaN / isOverwrite / option-guards) as
 * survived/uncovered.
 *
 * Installing this spy validator exercises those branches WITHOUT depending on
 * the validation-plugin package (which would create a dependency cycle:
 * validation-plugin already depends on core). It tests the **call-site
 * contract** — "does core invoke the right validator method, with the right
 * caller string, under the right condition?" — which is core's responsibility,
 * distinct from the plugin's own job of validating inputs correctly.
 *
 * Lazily materialised via nested Proxies so the helper never has to enumerate
 * the ~50 methods of `RouterValidator` (which would rot as the interface grows).
 * Each accessed method returns a STABLE `vi.fn()` (cached per name), so
 * `expect(v.dependencies.warnOverwrite).toHaveBeenCalledWith(...)` works.
 */
export function createSpyValidator(): RouterValidator {
  const namespaces = new Map<string, Record<string, Mock>>();

  return new Proxy({} as RouterValidator, {
    get(_target, nsName) {
      if (typeof nsName !== "string") {
        return;
      }

      let ns = namespaces.get(nsName);

      if (!ns) {
        const fns = new Map<string, Mock>();

        ns = new Proxy({} as Record<string, Mock>, {
          get(_t, fnName) {
            if (typeof fnName !== "string") {
              return;
            }

            let fn = fns.get(fnName);

            if (!fn) {
              fn = vi.fn();
              fns.set(fnName, fn);
            }

            return fn;
          },
        });

        namespaces.set(nsName, ns);
      }

      return ns;
    },
  });
}

/**
 * Creates a spy validator and installs it into `router` via the internal
 * `RouterInternals` slot (the same slot `validationPlugin()` writes to at
 * registration time). Returns the validator so tests can assert on its spies.
 */
export function installSpyValidator<
  D extends DefaultDependencies = DefaultDependencies,
>(router: Router<D>): RouterValidator {
  const validator = createSpyValidator();

  getInternals(router).validator = validator;

  return validator;
}
