// eslint-disable-next-line import-x/no-extraneous-dependencies -- test-only helper; vitest is a root devDependency. The eslint vitest block (section 12) auto-exempts only *.test.ts / *.properties.ts / *.stress.ts / helpers.ts, not arbitrarily-named helpers like this one.
import { vi, type Mock } from "vitest";

import { getInternals } from "@real-router/core/validation";

import type { RouterValidator, DefaultDependencies } from "@real-router/core";
import type { Router } from "@real-router/core/types";

/**
 * A `RouterValidator` whose every namespace method is a `vi.fn()` spy.
 *
 * Core normally runs with `ctx.validator === null` (validation is opt-in via
 * `@real-router/validation-plugin`, a separate package). The route resolver
 * asks the three `state` reports through that slot
 * (`ctx.validator?.state.report…`), so in the core suite those calls
 * short-circuit to `undefined` and the port's getters answer `undefined`.
 *
 * Installing this spy validator exercises those branches WITHOUT depending on
 * the validation-plugin package (which would create a dependency cycle:
 * validation-plugin already depends on core). It tests the **call-site
 * contract** — "does core ask the right report, with the right arguments,
 * under the right condition?" — which is core's responsibility, distinct from
 * the plugin's own job of judging inputs correctly. A door that refuses and
 * reports through check positions and diagnostic kinds (#2388) records no
 * consultation on it at all.
 *
 * Lazily materialised via nested Proxies so the helper never enumerates the
 * methods of `RouterValidator`. Each accessed method returns a STABLE `vi.fn()`
 * (cached per name), so
 * `expect(v.state.reportDroppedQueryKey).toHaveBeenCalledWith(...)` works.
 */
/**
 * The spies each validator materialised, by namespace — the side channel
 * {@link consultationsOn} reads.
 *
 * ⚠ The surface is nested PROXIES with no `ownKeys` trap, so `Object.entries`
 * on a spy validator answers `[]` for every namespace however many calls it
 * recorded. A census built on enumeration is therefore not merely incomplete,
 * it is empty — which reads as "this door consults nothing".
 */
const RECORDED = new WeakMap<RouterValidator, Map<string, Map<string, Mock>>>();

/** Every member a call was recorded on, as `namespace.member`, sorted. */
export function consultationsOn(validator: RouterValidator): string[] {
  const made: string[] = [];

  for (const [ns, fns] of RECORDED.get(validator) ?? []) {
    for (const [member, fn] of fns) {
      if (fn.mock.calls.length > 0) {
        made.push(`${ns}.${member}`);
      }
    }
  }

  return made.toSorted((left, right) => left.localeCompare(right));
}

export function createSpyValidator(): RouterValidator {
  const namespaces = new Map<string, Record<string, Mock>>();
  const recorded = new Map<string, Map<string, Mock>>();

  const validator = new Proxy({} as RouterValidator, {
    get(_target, nsName) {
      if (typeof nsName !== "string") {
        return;
      }

      let ns = namespaces.get(nsName);

      if (!ns) {
        const fns = new Map<string, Mock>();

        recorded.set(nsName, fns);

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

  RECORDED.set(validator, recorded);

  return validator;
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
