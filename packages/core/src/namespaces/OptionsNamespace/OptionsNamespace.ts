// packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts

import { defaultOptions } from "./constants";
import { deepFreeze } from "./helpers";
import { validateOptionsIsObject } from "./validators";

import type { Options } from "@real-router/types";

export class OptionsNamespace {
  readonly #options: Readonly<Options>;

  constructor(initialOptions: Partial<Options> = {}) {
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

  get(): Readonly<Options> {
    return this.#options;
  }
}
