import { fc } from "@fast-check/vitest";

import type { Router, State } from "@real-router/core";

export const NUM_RUNS = {
  standard: 100,
} as const;

export const arbMouseEventProps: fc.Arbitrary<MouseEventInit> = fc.record({
  button: fc.integer({ min: 0, max: 5 }),
  metaKey: fc.boolean(),
  altKey: fc.boolean(),
  ctrlKey: fc.boolean(),
  shiftKey: fc.boolean(),
});

export const arbClassName: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

export const arbOptionalClassName: fc.Arbitrary<string | undefined> = fc.option(
  arbClassName,
  { nil: undefined },
);

export const arbNonEmptyPrefix: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 50,
});

export const arbRouteName: fc.Arbitrary<string> =
  fc.stringMatching(/^[a-z]{2,5}$/);

export const arbGenericTagName: fc.Arbitrary<string> = fc.constantFrom(
  "div",
  "span",
  "p",
  "section",
  "article",
);

export const arbRepeatCount: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: 10,
});

export const arbInstanceCount: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: 5,
});

export function createMockRouter(): {
  router: Router;
  trigger: (routeName: string) => void;
} {
  type Callback = (data: { route: State }) => void;
  const callbacks: Callback[] = [];

  const mockRouter = {
    subscribe(cb: Callback): () => void {
      callbacks.push(cb);

      return () => {
        const idx = callbacks.indexOf(cb);

        if (idx !== -1) {
          callbacks.splice(idx, 1);
        }
      };
    },
  };

  return {
    router: mockRouter as unknown as Router,
    trigger(routeName: string): void {
      const route = {
        name: routeName,
        params: {},
        path: `/${routeName}`,
        context: {},
      } as State;

      for (const cb of callbacks) {
        cb({ route });
      }
    },
  };
}
