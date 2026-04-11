// packages/browser-env/tests/property/helpers.ts

import { fc } from "@fast-check/vitest";

import type { Browser } from "../../src";
import type { NavigationOptions, Params, State } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

export const NUM_RUNS = {
  fast: 100,
  standard: 500,
  thorough: 1000,
} as const;

export function makeMinimalState(name: string, path: string): State {
  return {
    name,
    params: {},
    path,
    context: {},
  };
}

const arbPathSegment: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z0-9][a-z0-9_-]{0,9}$/,
);

export const arbUrlPath: fc.Arbitrary<string> = fc
  .array(arbPathSegment, { minLength: 1, maxLength: 3 })
  .map((segments) => `/${segments.join("/")}`);

export const arbSearchString: fc.Arbitrary<string> = fc.option(
  fc
    .tuple(
      fc.stringMatching(/^[a-z]{1,8}$/),
      fc.stringMatching(/^[a-z0-9]{1,8}$/),
    )
    .map(([k, v]) => `?${k}=${v}`),
  { nil: "" },
);

export const arbHashString: fc.Arbitrary<string> = fc.option(
  fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/).map((s) => `#${s}`),
  { nil: "" },
);

export const arbBasePath: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  arbPathSegment.map((s) => s),
  arbPathSegment.map((s) => `/${s}`),
  arbPathSegment.map((s) => `${s}/`),
  arbPathSegment.map((s) => `/${s}/`),
  fc.tuple(arbPathSegment, arbPathSegment).map(([a, b]) => `/${a}/${b}`),
  fc.tuple(arbPathSegment, arbPathSegment).map(([a, b]) => `/${a}/${b}/`),
);

// --- B7: non-HTTP protocol URLs ---

export const arbNonHttpProtocol: fc.Arbitrary<string> = fc.oneof(
  fc.constant("ftp://example.com/file"),
  fc.constant("data:text/html,<h1>hi</h1>"),
  fc.constant("file:///etc/passwd"),
  fc.constant("blob:https://example.com/uuid"),
  fc.constant("ws://example.com/socket"),
);

// --- B14/B15: ASCII-only paths ---

const arbAsciiSegment: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z0-9._~!$&'()*+,;=:@-]{1,10}$/,
);

export const arbAsciiPath: fc.Arbitrary<string> = fc
  .array(arbAsciiSegment, { minLength: 1, maxLength: 4 })
  .map((segments) => `/${segments.join("/")}`);

// --- B8-B10: shouldReplaceHistory ---

export const arbNavigationOptions: fc.Arbitrary<NavigationOptions> = fc.record({
  replace: fc.option(fc.boolean(), { nil: undefined }),
  reload: fc.option(fc.boolean(), { nil: undefined }),
});

const arbRouteName: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-z]{1,5}(\.[a-z]{1,5}){0,2}$/,
);

export const arbState: fc.Arbitrary<State> = fc
  .tuple(arbRouteName, arbUrlPath)
  .map(([name, path]) => makeMinimalState(name, path));

// --- B11-B13: createOptionsValidator ---

export interface TestDefaults {
  base: string;
  forceDeactivate: boolean;
  count: number;
}

export const testDefaults: Required<TestDefaults> = {
  base: "",
  forceDeactivate: true,
  count: 0,
};

export const arbValidPartialOpts: fc.Arbitrary<
  Partial<{ [K in keyof TestDefaults]: TestDefaults[K] | undefined }>
> = fc.record(
  {
    base: fc.option(fc.string({ minLength: 0, maxLength: 10 }), {
      nil: undefined,
    }),
    forceDeactivate: fc.option(fc.boolean(), { nil: undefined }),
    count: fc.option(fc.integer({ min: -100, max: 100 }), {
      nil: undefined,
    }),
  },
  { requiredKeys: [] },
);

export const arbInvalidPartialOpts: fc.Arbitrary<
  Partial<Record<string, unknown>>
> = fc
  .record({
    key: fc.constantFrom("base", "forceDeactivate", "count"),
    value: fc.oneof(fc.constant(Symbol("bad")), fc.constant(null)),
  })
  .map(({ key, value }) => ({ [key]: value }));

// --- updateBrowserState: spy browser ---

interface SpyCall {
  method: "pushState" | "replaceState";
  state: unknown;
  url: string;
}

export interface SpyBrowser extends Browser {
  getCalls: () => readonly SpyCall[];
}

export function createSpyBrowser(): SpyBrowser {
  const calls: SpyCall[] = [];

  return {
    pushState(state: State, url: string) {
      calls.push({ method: "pushState", state, url });
    },
    replaceState(state: State, url: string) {
      calls.push({ method: "replaceState", state, url });
    },
    addPopstateListener: () => () => {},
    getHash: () => "",
    getLocation: () => "/",
    getCalls: () => calls,
  };
}

// --- getRouteFromEvent: mock PluginApi & PopStateEvent ---

export function createMockPluginApi(
  matchResult: { name: string; params: Params } | undefined,
): PluginApi {
  return { matchPath: () => matchResult } as unknown as PluginApi;
}

export function createMockPopStateEvent(state: unknown): PopStateEvent {
  return { state } as PopStateEvent;
}

// --- Full router State with all fields ---

export const arbFullState: fc.Arbitrary<State> = fc
  .tuple(
    arbRouteName,
    arbUrlPath,
    fc.dictionary(
      fc.stringMatching(/^[a-z]{1,5}$/),
      fc.stringMatching(/^[a-z0-9]{1,8}$/),
      { minKeys: 0, maxKeys: 3 },
    ),
  )
  .map(([name, path, params]) => ({
    name,
    params,
    path,
    context: {},
  }));
