import { inject } from "@angular/core";

import type { InjectionToken } from "@angular/core";

export function injectOrThrow<T>(token: InjectionToken<T>, fnName: string): T {
  const value = inject(token, { optional: true });

  if (!value) {
    throw new Error(
      `${fnName} must be used within a provideRealRouter context`,
    );
  }

  return value;
}
