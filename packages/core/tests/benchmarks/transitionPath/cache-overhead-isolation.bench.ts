/**
 * Cache overhead isolation benchmark
 *
 * Compares three caching strategies on identical data to isolate
 * whether regressions come from CacheManager implementation overhead
 * or from the fundamental cost of multi-entry caching vs single-entry.
 *
 * Strategies:
 * 1. single-entry — original: 2× reference `===`, 3 variable writes
 * 2. raw-map      — bare Map<string, T>, no LRU, no stats, no abstraction
 * 3. KeyIndexCache — full CacheManager with LRU, stats, hasMetaParams
 *
 * Each strategy wraps the SAME computeTransitionPath call.
 */

import { bench, boxplot, run, summary } from "mitata";

import { KeyIndexCache } from "../../../../cache-manager/src/KeyIndexCache";

import type { State } from "@real-router/types";

interface TransitionPath {
  intersection: string;
  toActivate: string[];
  toDeactivate: string[];
}

// ============================================================================
// Minimal computeTransitionPath (same logic as real one, inlined)
// ============================================================================

const EMPTY_INTERSECTION = "";

function nameToIDs(name: string): string[] {
  const ids: string[] = [];
  let idx = 0;
  let dot: number;

  while ((dot = name.indexOf(".", idx)) !== -1) {
    ids.push(name.slice(0, dot));
    idx = dot + 1;
  }

  ids.push(name);

  return ids;
}

function computeTransitionPath(
  toState: State,
  fromState?: State,
): TransitionPath {
  if (!fromState) {
    return {
      intersection: EMPTY_INTERSECTION,
      toActivate: nameToIDs(toState.name),
      toDeactivate: [],
    };
  }

  const toStateIds = nameToIDs(toState.name);
  const fromStateIds = nameToIDs(fromState.name);
  const maxI = Math.min(fromStateIds.length, toStateIds.length);

  let i = 0;

  while (i < maxI && fromStateIds[i] === toStateIds[i]) {
    i++;
  }

  const toDeactivate: string[] = [];

  for (let j = fromStateIds.length - 1; j >= i; j--) {
    toDeactivate.push(fromStateIds[j]);
  }

  return {
    intersection: i > 0 ? fromStateIds[i - 1] : EMPTY_INTERSECTION,
    toDeactivate,
    toActivate: toStateIds.slice(i),
  };
}

// ============================================================================
// Strategy 1: Single-entry cache (original — reference equality)
// ============================================================================

let cachedFromState: State | undefined;
let cachedToState: State | undefined;
let cachedResult: TransitionPath | null = null;

function getTransitionPath_singleEntry(
  toState: State,
  fromState?: State,
): TransitionPath {
  if (
    cachedResult !== null &&
    toState === cachedToState &&
    fromState === cachedFromState
  ) {
    return cachedResult;
  }

  const result = computeTransitionPath(toState, fromState);

  cachedToState = toState;
  cachedFromState = fromState;
  cachedResult = result;

  return result;
}

// ============================================================================
// Strategy 2: Raw Map (multi-entry, no LRU, no stats, no abstraction)
// ============================================================================

const rawMap = new Map<string, TransitionPath>();

function getTransitionPath_rawMap(
  toState: State,
  fromState?: State,
): TransitionPath {
  if (!fromState) {
    return computeTransitionPath(toState, fromState);
  }

  const key = `${fromState.name}\u2192${toState.name}`;
  let result = rawMap.get(key);

  if (result !== undefined) {
    return result;
  }

  result = computeTransitionPath(toState, fromState);
  rawMap.set(key, result);

  return result;
}

// ============================================================================
// Strategy 3: KeyIndexCache (full CacheManager abstraction)
// ============================================================================

const lruCache = new KeyIndexCache<TransitionPath>(500);

function hasMetaParams(state: State): boolean {
  const params = state.meta?.params;

  if (params === undefined) {
    return false;
  }

  for (const segmentName of Object.keys(params)) {
    const segmentParams = params[segmentName];

    if (
      segmentParams !== null &&
      segmentParams !== undefined &&
      typeof segmentParams === "object" &&
      !Array.isArray(segmentParams) &&
      Object.keys(segmentParams).length > 0
    ) {
      return true;
    }
  }

  return false;
}

function getTransitionPath_keyIndexCache(
  toState: State,
  fromState?: State,
): TransitionPath {
  if (
    !fromState ||
    toState.meta?.options.reload ||
    hasMetaParams(toState) ||
    hasMetaParams(fromState)
  ) {
    return computeTransitionPath(toState, fromState);
  }

  const key = `${fromState.name}\u2192${toState.name}`;

  return lruCache.get(key, () => computeTransitionPath(toState, fromState));
}

// ============================================================================
// Test data
// ============================================================================

function makeState(
  name: string,
  params: Record<string, unknown> = {},
  metaParams: Record<string, Record<string, unknown>> = {},
): State {
  return {
    name,
    params,
    path: `/${name.replaceAll(".", "/")}`,
    meta: {
      id: 1,
      params: metaParams,
      options: {},
      redirected: false,
    },
  } as State;
}

// Scenario 1: single-pair repeated (shouldUpdateNode pattern)
const stateA = makeState("users", {}, { users: {} });
const stateB = makeState(
  "users.profile",
  {},
  { users: {}, "users.profile": {} },
);

// Scenario 2: 3-route cycling
const routes3 = [
  [makeState("home", {}, { home: {} }), makeState("users", {}, { users: {} })],
  [
    makeState("users", {}, { users: {} }),
    makeState("admin", {}, { admin: {} }),
  ],
  [makeState("admin", {}, { admin: {} }), makeState("home", {}, { home: {} })],
] as const;

// Scenario 3: 10-route SPA
const routeNames = [
  "home",
  "users",
  "users.profile",
  "admin",
  "admin.settings",
  "docs",
  "docs.getting-started",
  "blog",
  "blog.post",
  "about",
];
const spaStates = routeNames.map((n) => {
  const parts = n.split(".");
  const mp: Record<string, Record<string, unknown>> = {};
  let acc = "";

  for (const p of parts) {
    acc = acc ? `${acc}.${p}` : p;
    mp[acc] = {};
  }

  return makeState(n, {}, mp);
});

// ============================================================================
// Benchmarks
// ============================================================================

// --- SCENARIO 1: Single pair repeated ×10 (shouldUpdateNode hot path) ---
boxplot(() => {
  summary(() => {
    bench("single-pair ×10: single-entry", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath_singleEntry(stateB, stateA);
      }
    });

    bench("single-pair ×10: raw Map", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath_rawMap(stateB, stateA);
      }
    });

    bench("single-pair ×10: KeyIndexCache", () => {
      for (let i = 0; i < 10; i++) {
        getTransitionPath_keyIndexCache(stateB, stateA);
      }
    });
  });
});

// --- SCENARIO 2: 3-route cycling ×30 ---
boxplot(() => {
  summary(() => {
    bench("3-route cycling ×30: single-entry", () => {
      for (let i = 0; i < 30; i++) {
        const [from, to] = routes3[i % 3];

        getTransitionPath_singleEntry(to, from);
      }
    });

    bench("3-route cycling ×30: raw Map", () => {
      for (let i = 0; i < 30; i++) {
        const [from, to] = routes3[i % 3];

        getTransitionPath_rawMap(to, from);
      }
    });

    bench("3-route cycling ×30: KeyIndexCache", () => {
      for (let i = 0; i < 30; i++) {
        const [from, to] = routes3[i % 3];

        getTransitionPath_keyIndexCache(to, from);
      }
    });
  });
});

// --- SCENARIO 3: 10-route SPA cycling ×100 ---
boxplot(() => {
  summary(() => {
    bench("10-route SPA ×100: single-entry", () => {
      for (let i = 0; i < 100; i++) {
        const from = spaStates[i % 10];
        const to = spaStates[(i + 1) % 10];

        getTransitionPath_singleEntry(to, from);
      }
    });

    bench("10-route SPA ×100: raw Map", () => {
      for (let i = 0; i < 100; i++) {
        const from = spaStates[i % 10];
        const to = spaStates[(i + 1) % 10];

        getTransitionPath_rawMap(to, from);
      }
    });

    bench("10-route SPA ×100: KeyIndexCache", () => {
      for (let i = 0; i < 100; i++) {
        const from = spaStates[i % 10];
        const to = spaStates[(i + 1) % 10];

        getTransitionPath_keyIndexCache(to, from);
      }
    });
  });
});

// --- SCENARIO 4: shouldUpdateNode — 5 components, 1 navigation ---
boxplot(() => {
  summary(() => {
    bench("shouldUpdateNode 5×1: single-entry", () => {
      // 1 navigation
      getTransitionPath_singleEntry(stateB, stateA);
      // 5 shouldUpdateNode checks (same pair)
      for (let i = 0; i < 5; i++) {
        getTransitionPath_singleEntry(stateB, stateA);
      }
    });

    bench("shouldUpdateNode 5×1: raw Map", () => {
      getTransitionPath_rawMap(stateB, stateA);
      for (let i = 0; i < 5; i++) {
        getTransitionPath_rawMap(stateB, stateA);
      }
    });

    bench("shouldUpdateNode 5×1: KeyIndexCache", () => {
      getTransitionPath_keyIndexCache(stateB, stateA);
      for (let i = 0; i < 5; i++) {
        getTransitionPath_keyIndexCache(stateB, stateA);
      }
    });
  });
});

// --- SCENARIO 5: shouldUpdateNode — 5 components, 3 navigations cycling ---
boxplot(() => {
  summary(() => {
    bench("shouldUpdateNode 5×3 cycling: single-entry", () => {
      for (let n = 0; n < 3; n++) {
        const [from, to] = routes3[n % 3];

        getTransitionPath_singleEntry(to, from);
        for (let c = 0; c < 5; c++) {
          getTransitionPath_singleEntry(to, from);
        }
      }
    });

    bench("shouldUpdateNode 5×3 cycling: raw Map", () => {
      for (let n = 0; n < 3; n++) {
        const [from, to] = routes3[n % 3];

        getTransitionPath_rawMap(to, from);
        for (let c = 0; c < 5; c++) {
          getTransitionPath_rawMap(to, from);
        }
      }
    });

    bench("shouldUpdateNode 5×3 cycling: KeyIndexCache", () => {
      for (let n = 0; n < 3; n++) {
        const [from, to] = routes3[n % 3];

        getTransitionPath_keyIndexCache(to, from);
        for (let c = 0; c < 5; c++) {
          getTransitionPath_keyIndexCache(to, from);
        }
      }
    });
  });
});

void run();
