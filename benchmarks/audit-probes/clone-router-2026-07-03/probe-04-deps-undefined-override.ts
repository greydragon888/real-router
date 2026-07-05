// probe-04: cloneRouter(base, { key: undefined }) — does an explicit
// `undefined` override DELETE the base dependency on the clone?
//
// mergedDeps = { ...sourceDeps, ...dependencies } keeps the key with value
// undefined (cloneRouter.ts:111-114); the clone's constructor then runs
// createDependenciesStore, which SKIPS undefined values
// (dependenciesStore.ts:20-24) — so the key vanishes from the clone's store.
//
// Consistency question: is this the same behaviour as createRouter(routes,
// opts, {key: undefined}) and getDependenciesApi(base).add? (If consistent —
// by-design; if not — surprise.) jsdoc cloneRouter.ts:20-22 says overrides are
// "merged on top of the base router's dependencies" — silent on undefined.
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

const base = createRouter(
  [{ name: "home", path: "/" }],
  {},
  { db: "base-db", logger: "base-logger" },
);

// Explicit undefined override
const clone1 = cloneRouter(base, { db: undefined } as never);
const deps1 = getDependenciesApi(clone1);

console.log(
  `clone1 = cloneRouter(base, {db: undefined}): get("db")=${JSON.stringify(deps1.get("db" as never))} has-key=${Object.keys(deps1.getAll()).includes("db")} logger=${JSON.stringify(deps1.get("logger" as never))}`,
);

// Control: no override keeps base value
const clone2 = cloneRouter(base);

console.log(
  `clone2 = cloneRouter(base): get("db")=${JSON.stringify(getDependenciesApi(clone2).get("db" as never))}`,
);

// Reference behaviour 1: createRouter with an undefined dep value
const fresh = createRouter([{ name: "home", path: "/" }], {}, {
  db: undefined,
  logger: "x",
} as never);

console.log(
  `createRouter(..., {db: undefined}): has-key=${Object.keys(getDependenciesApi(fresh).getAll()).includes("db")}`,
);

// Reference behaviour 2: does the runtime setter allow storing undefined?
const setterProbe = createRouter([{ name: "home", path: "/" }], {}, {
  db: "x",
} as never);

try {
  getDependenciesApi(setterProbe).add("db" as never, undefined as never);
  console.log(
    `deps.add("db", undefined): now get("db")=${JSON.stringify(getDependenciesApi(setterProbe).get("db" as never))} has-key=${Object.keys(getDependenciesApi(setterProbe).getAll()).includes("db")}`,
  );
} catch (e) {
  console.log(`deps.add("db", undefined) threw: ${(e as Error).message}`);
}

console.log(
  "verdict: undefined-override removes the key from the clone (constructor filters undefined). Compare rows above for cross-API consistency.",
);
