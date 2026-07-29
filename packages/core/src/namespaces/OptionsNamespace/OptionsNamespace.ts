// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { defaultOptions } from "./constants";
import { deepFreeze } from "./helpers";
import { validateOptionsIsObject } from "./validators";

import type { DefaultDependencies, Options } from "../../types";

export class OptionsNamespace<
  Dependencies extends DefaultDependencies = DefaultDependencies,
> {
  readonly #options: Readonly<Options<Dependencies>>;

  constructor(initialOptions: Partial<Options<Dependencies>> = {}) {
    this.#options = deepFreeze({
      ...defaultOptions,
      ...initialOptions,
    });
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
