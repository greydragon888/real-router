import { inject } from "@angular/core";

import type { InjectionToken } from "@angular/core";

export function injectOrThrow<T>(token: InjectionToken<T>, fnName: string): T {
  const value = inject(token, { optional: true });

  // Explicit null / undefined check — falsy guard would misfire on
  // legitimately falsy values (`0`, `""`, `false`) if the token were ever
  // typed for primitives. Today all our tokens hold object instances, but
  // pinning the check keeps the function safe for future typing changes.
  if (value === null || value === undefined) {
    throw new Error(
      `${fnName} must be used within a provideRealRouter context`,
    );
  }

  return value;
}
