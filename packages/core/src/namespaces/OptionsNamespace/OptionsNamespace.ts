// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { defaultOptions } from "./constants";
import { validateOptionsIsObject } from "./validators";
import { dropUnsafeKey } from "../../helpers";

import type { DefaultDependencies, Options } from "../../types";

/**
 * Captured at module load: `freeze`.
 *
 * ⚑ A guard is only as strong as the intrinsic it reads WHEN IT RUNS, and an
 * application can re-point `Object.freeze` after boot — a freeze that reads the
 * re-pointed one silently does nothing.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module, the ordinary
 * polyfill order.
 */
const freeze = Object.freeze;

export class OptionsNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #options: Readonly<Options<Dependencies>>;

  constructor(initialOptions: Partial<Options<Dependencies>> = {}) {
    // ⚑ `dropUnsafeKey` on the spread, before the freeze (#1957). The caller's
    // bag reaches this literal by a spread, which `[[Define]]`s — so an own
    // `"__proto__"` from `JSON.parse` or
    // `Object.fromEntries(new URLSearchParams(…))` lands as an own key on the
    // object core is about to hand to every plugin through
    // `getPluginApi(router).getOptions()` and to every clone through
    // `getCloneState().options`. There it is a prototype-swap primitive for any
    // consumer that merges it.
    //
    // Nothing is lost: `Options` has a closed shape and `"__proto__"` names none
    // of it, so unlike the dependency store one door over there is no value
    // here to withhold from — only an unknown key that would have been dead
    // config.
    //
    // ⚠ A THROW would be the wrong shape. `validateOptionsIsObject` accepts any
    // object and unknown option keys are tolerated everywhere else, so refusing
    // this one name while ignoring its eleven `Object.prototype` siblings would
    // be a rule with no reason a caller could infer. (`options.logger` throws on
    // it, but that is an allow-listed SUB-bag with a closed key set — a
    // different contract, not a precedent for the parent.)
    // ⚑ The freeze reaches THIS level and no further (#1832). The literal is
    // core's own — the spread minted it — while everything one level down is
    // the caller's object under the one-level copy model (#1958), and core
    // writes to none of it.
    //
    // ⚠ A DEEP freeze here would be illusory: deciding depth by asking each
    // nested bag for its `constructor` leaves an array inside a FROZEN bag
    // writable, and moving it moves what the router navigates to.
    // `options-ownership-1832.test.ts` owns the shape list.
    this.#options = freeze(
      dropUnsafeKey({
        ...defaultOptions,
        ...initialOptions,
      }),
    );
  }

  static validateOptionsIsObject(
    options: unknown,
  ): asserts options is Record<string, unknown> {
    validateOptionsIsObject(options);
  }

  get(): Readonly<Options<Dependencies>> {
    return this.#options;
  }
}
