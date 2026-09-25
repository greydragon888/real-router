import { fc, test } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import { NUM_RUNS } from "./helpers";

import type { Params, Route, Router } from "@real-router/core";

/**
 * The plugin's verdict on a route table, held to bare core's runtime (#2577).
 *
 * A case builds a table, runs one operation at one of five doors, and runs it
 * twice: on a router with the plugin and on one without. Bare core's resulting
 * table is healthy when every route builds through `buildNavigationState` with
 * its own URL params, and the path it builds matches back to the same route with
 * the same URL params. The plugin owes a refusal exactly when that table is not
 * healthy.
 *
 * ⚑ `KNOWN_DIVERGENCES` lists the ways the plugin still answers otherwise, each
 * with the issue that removes it. A divergence of any other kind fails the
 * property. A row that nothing in the anchor's sample reaches fails the anchor,
 * so a fix deletes its row and the list only shrinks.
 */
const KNOWN_DIVERGENCES: Readonly<Record<string, `#${number}`>> = {
  "refuses: the forward's target is itself a forward": "#2577",
  "refuses: defaultParams fill the param": "#2572",
  "accepts: a `~` route loses an ancestor's param": "#2570",
  "accepts: a path param is forwarded into a name the target declares as query":
    "#2577",
};

// =============================================================================
// Generator
// =============================================================================

const PARAMS = ["id", "user-id", "ид", "1d"] as const;

type Param = (typeof PARAMS)[number];

type PathKind =
  "static" | "param" | "query" | "markedQuery" | "absolute" | "absoluteParam";

interface Shape {
  readonly kind: PathKind;
  readonly param: Param;
  readonly defaults: {
    readonly key: Param;
    readonly value: string | undefined;
  } | null;
  readonly children: readonly Shape[];
}

interface ForwardPick {
  readonly target: number;
  readonly short: boolean;
}

const DOORS = [
  "createRouter",
  "add",
  "addUnderParent",
  "replace",
  "update",
] as const;

type Door = (typeof DOORS)[number];

interface CaseInput {
  readonly door: Door;
  readonly table: readonly Shape[];
  readonly batch: readonly Shape[];
  readonly forwards: readonly (ForwardPick | null)[];
  readonly parentPick: number;
  readonly updatePick: readonly [number, number];
  readonly patchDefaults: Param | null;
}

const paramArbitrary = fc.constantFrom(...PARAMS);

const defaultsArbitrary = fc.oneof(
  { arbitrary: fc.constant(null), weight: 3 },
  {
    arbitrary: fc.record({
      key: paramArbitrary,
      value: fc.constantFrom("7", "7", "7", "7", "7", "7", undefined),
    }),
    weight: 1,
  },
);

const shapeArbitrary = (
  kinds: readonly PathKind[],
  children: fc.Arbitrary<readonly Shape[]>,
): fc.Arbitrary<Shape> =>
  fc.record({
    kind: fc.constantFrom(...kinds),
    param: paramArbitrary,
    defaults: defaultsArbitrary,
    children,
  });

// A parameterised path twice as often as any other kind: the mechanisms under
// test all need a param on one end of a forward or above a `~` route.
const TOP_KINDS: readonly PathKind[] = [
  "static",
  "param",
  "param",
  "query",
  "markedQuery",
];
const CHILD_KINDS: readonly PathKind[] = [
  ...TOP_KINDS,
  "absolute",
  "absoluteParam",
];

const topShapeArbitrary = shapeArbitrary(
  TOP_KINDS,
  fc.oneof(
    { arbitrary: fc.constant([]), weight: 3 },
    {
      arbitrary: fc.array(shapeArbitrary(CHILD_KINDS, fc.constant([])), {
        minLength: 1,
        maxLength: 2,
      }),
      weight: 2,
    },
  ),
);

const caseArbitrary: fc.Arbitrary<CaseInput> = fc.record({
  door: fc.constantFrom(...DOORS),
  table: fc.array(topShapeArbitrary, { minLength: 2, maxLength: 3 }),
  batch: fc.array(topShapeArbitrary, { minLength: 1, maxLength: 2 }),
  forwards: fc.array(
    fc.oneof(
      { arbitrary: fc.constant(null), weight: 2 },
      {
        arbitrary: fc.record({
          target: fc.nat({ max: 30 }),
          short: fc.constantFrom(false, false, false, true),
        }),
        weight: 1,
      },
    ),
    { minLength: 16, maxLength: 16 },
  ),
  parentPick: fc.nat({ max: 30 }),
  updatePick: fc.tuple(fc.nat({ max: 30 }), fc.nat({ max: 30 })),
  patchDefaults: fc.option(paramArbitrary, { nil: null }),
});

// =============================================================================
// A case, made concrete
// =============================================================================

interface RouteDef {
  name: string;
  path: string;
  forwardTo?: string;
  defaultParams?: Params;
  children?: RouteDef[];
}

type Operation =
  | { readonly door: "createRouter" }
  | { readonly door: "add" | "replace"; readonly batch: RouteDef[] }
  | {
      readonly door: "addUnderParent";
      readonly batch: RouteDef[];
      readonly parent: string;
    }
  | {
      readonly door: "update";
      readonly name: string;
      readonly patch: { forwardTo: string; defaultParams?: Params };
    };

interface Case {
  readonly table: RouteDef[];
  readonly operation: Operation;
}

const HOME: RouteDef = { name: "home", path: "/" };
const TABLE_NAMES = ["a", "b", "c"] as const;
const BATCH_NAMES = ["m", "n"] as const;
// Under a parent, a batch route may share its short name with a top-level one.
const BATCH_NAMES_UNDER_PARENT = ["m", "a"] as const;
const CHILD_NAMES = ["x", "y"] as const;

function pathOf(name: string, shape: Shape): string {
  switch (shape.kind) {
    case "static": {
      return `/${name}`;
    }
    case "param": {
      return `/${name}/:${shape.param}`;
    }
    case "query": {
      return `/${name}?${shape.param}`;
    }
    case "markedQuery": {
      return `/${name}?:${shape.param}`;
    }
    case "absolute": {
      return `~/${name}`;
    }
    case "absoluteParam": {
      return `~/${name}/:${shape.param}`;
    }
  }
}

function routeOf(name: string, shape: Shape): RouteDef {
  const route: RouteDef = { name, path: pathOf(name, shape) };

  if (shape.defaults !== null) {
    route.defaultParams = { [shape.defaults.key]: shape.defaults.value };
  }

  if (shape.children.length > 0) {
    route.children = shape.children.map((child, i) =>
      routeOf(CHILD_NAMES[i], child),
    );
  }

  return route;
}

const routesOf = (
  shapes: readonly Shape[],
  names: readonly string[],
): RouteDef[] => shapes.map((shape, i) => routeOf(names[i], shape));

function walk(
  routes: readonly RouteDef[],
  prefix: string,
  visit: (route: RouteDef, fullName: string) => void,
): void {
  for (const route of routes) {
    const fullName = prefix === "" ? route.name : `${prefix}.${route.name}`;

    visit(route, fullName);
    walk(route.children ?? [], fullName, visit);
  }
}

function fullNamesOf(routes: readonly RouteDef[], prefix = ""): string[] {
  const names: string[] = [];

  walk(routes, prefix, (_route, fullName) => {
    names.push(fullName);
  });

  return names;
}

interface Forwards {
  readonly picks: CaseInput["forwards"];
  /** Whether a pick may name its target by the short name. */
  readonly shortNames: boolean;
}

/**
 * Gives the routes static forwards, one pick per route in walk order, starting
 * at pick `from`. Returns the next pick.
 */
function assignForwards(
  routes: readonly RouteDef[],
  prefix: string,
  targets: readonly string[],
  { picks, shortNames }: Forwards,
  from: number,
): number {
  let next = from;

  walk(routes, prefix, (route, fullName) => {
    const pick = picks[next % picks.length];

    next++;

    if (pick === null) {
      return;
    }

    const target = targets[pick.target % targets.length];

    if (target !== fullName) {
      route.forwardTo =
        shortNames && pick.short
          ? target.slice(target.lastIndexOf(".") + 1)
          : target;
    }
  });

  return next;
}

function caseOf(input: CaseInput): Case {
  const table = routesOf(input.table, TABLE_NAMES);
  const tableNames = fullNamesOf(table);
  const fullNamed: Forwards = { picks: input.forwards, shortNames: false };

  switch (input.door) {
    case "createRouter": {
      assignForwards(table, "", tableNames, fullNamed, 0);

      return { table, operation: { door: "createRouter" } };
    }
    case "update": {
      assignForwards(table, "", tableNames, fullNamed, 0);

      const name = tableNames[input.updatePick[0] % tableNames.length];
      const others = tableNames.filter((other) => other !== name);
      const forwardTo = others[input.updatePick[1] % others.length];
      const patch: { forwardTo: string; defaultParams?: Params } = {
        forwardTo,
      };

      if (input.patchDefaults !== null) {
        patch.defaultParams = { [input.patchDefaults]: "7" };
      }

      return { table, operation: { door: "update", name, patch } };
    }
    case "replace": {
      const batch = routesOf(input.batch, BATCH_NAMES);

      assignForwards(batch, "", fullNamesOf(batch), fullNamed, 0);

      return { table, operation: { door: "replace", batch } };
    }
    case "add": {
      const batch = routesOf(input.batch, BATCH_NAMES);
      const targets = [...tableNames, ...fullNamesOf(batch)];
      const next = assignForwards(table, "", tableNames, fullNamed, 0);

      assignForwards(batch, "", targets, fullNamed, next);

      return { table, operation: { door: "add", batch } };
    }
    case "addUnderParent": {
      const parent = tableNames[input.parentPick % tableNames.length];
      const batch = routesOf(input.batch, BATCH_NAMES_UNDER_PARENT);
      const targets = [...tableNames, ...fullNamesOf(batch, parent)];
      const next = assignForwards(table, "", tableNames, fullNamed, 0);

      assignForwards(
        batch,
        parent,
        targets,
        { picks: input.forwards, shortNames: true },
        next,
      );

      return { table, operation: { door: "addUnderParent", batch, parent } };
    }
  }
}

// =============================================================================
// The two routers
// =============================================================================

// Each router is handed its own copy, so the two never share an object.
const copied = (routes: readonly RouteDef[]): Route[] =>
  structuredClone(routes) as Route[];

const withHome = (routes: readonly RouteDef[]): Route[] =>
  copied([HOME, ...routes]);

function operate(router: Router, operation: Operation): void {
  const routes = getRoutesApi(router);

  switch (operation.door) {
    case "createRouter": {
      return;
    }
    case "add": {
      routes.add(copied(operation.batch));

      return;
    }
    case "addUnderParent": {
      routes.add(copied(operation.batch), { parent: operation.parent });

      return;
    }
    case "replace": {
      routes.replace(withHome(operation.batch));

      return;
    }
    case "update": {
      routes.update(operation.name, structuredClone(operation.patch));
    }
  }
}

/** The error an operation throws, or `null` when it completes. */
function thrownBy(run: () => void): Error | null {
  try {
    run();

    return null;
  } catch (error) {
    return error as Error;
  }
}

interface TreeNode {
  readonly children: ReadonlyMap<string, TreeNode>;
}

function routeNamesOf(router: Router): string[] {
  const names: string[] = [];
  const visit = (node: TreeNode, prefix: string): void => {
    for (const [name, child] of node.children) {
      const fullName = prefix === "" ? name : `${prefix}.${name}`;

      names.push(fullName);
      visit(child, fullName);
    }
  };

  visit(getPluginApi(router).getTree(), "");

  return names;
}

interface Breakage {
  readonly route: string;
  readonly how: "build" | "unknown" | "match" | "roundtrip";
  readonly message: string;
}

/** Why `name` does not survive a build and a match, or `null` when it does. */
function breakageOf(router: Router, name: string): Breakage | null {
  const api = getPluginApi(router);
  const params: Params = Object.fromEntries(
    api.getUrlParams(name).map((key, i) => [key, `v${i}`]),
  );
  let state: ReturnType<typeof api.buildNavigationState>;

  try {
    state = api.buildNavigationState(name, params);
  } catch (error) {
    return { route: name, how: "build", message: (error as Error).message };
  }

  if (state === undefined) {
    return { route: name, how: "unknown", message: "" };
  }

  const matched = api.matchPath(state.path);

  if (matched?.name !== state.name) {
    return { route: name, how: "match", message: state.path };
  }

  const lost = api
    .getUrlParams(state.name)
    .filter((key) => matched.params[key] !== state.params[key]);

  return lost.length > 0
    ? { route: name, how: "roundtrip", message: lost.join(", ") }
    : null;
}

const breakagesOf = (router: Router): Breakage[] =>
  routeNamesOf(router)
    .map((name) => breakageOf(router, name))
    .filter((breakage) => breakage !== null);

// =============================================================================
// The verdict, and what a divergence is
// =============================================================================

type Verdict =
  | { readonly kind: "skipped" }
  | { readonly kind: "agree" | "bothRefuse" | "correctRefusal" }
  | { readonly kind: "divergent"; readonly mechanisms: readonly string[] };

const FORWARD_PARAMS =
  /forwardTo target "([^"]+)" requires params \[([^\]]*)\].* source route "([^"]+)"/u;

function holdsAny(bag: Params | undefined, keys: readonly string[]): boolean {
  return bag !== undefined && keys.some((key) => bag[key] !== undefined);
}

/** Which registered way, if any, a false refusal of `message` is. */
function refusalMechanisms(router: Router, message: string): string[] {
  const match = FORWARD_PARAMS.exec(message);

  if (match === null) {
    return [`refuses: ${message}`];
  }

  const [, target, list, source] = match;
  const routes = getRoutesApi(router);
  const keys = list.split(", ");
  const mechanisms: string[] = [];

  if (typeof routes.get(target)?.forwardTo === "string") {
    mechanisms.push("refuses: the forward's target is itself a forward");
  }

  if (
    holdsAny(routes.get(source)?.defaultParams, keys) ||
    holdsAny(routes.get(target)?.defaultParams, keys)
  ) {
    mechanisms.push("refuses: defaultParams fill the param");
  }

  return mechanisms.length > 0 ? mechanisms : [`refuses: ${message}`];
}

/** Whether a route on `name`'s static forward chain, or an ancestor of one, is `~`. */
function reachesAbsolute(router: Router, name: string): boolean {
  const routes = getRoutesApi(router);
  const chainHasAbsolute = (fullName: string): boolean => {
    const segments = fullName.split(".");

    return segments.some(
      (_segment, i) =>
        routes.get(segments.slice(0, i + 1).join("."))?.path.startsWith("~") ===
        true,
    );
  };
  const seen = new Set<string>();
  let at: string | undefined = name;

  while (at !== undefined && !seen.has(at)) {
    if (chainHasAbsolute(at)) {
      return true;
    }

    seen.add(at);

    const forwardTo: unknown = routes.get(at)?.forwardTo;

    at = typeof forwardTo === "string" ? forwardTo : undefined;
  }

  return false;
}

/** Which registered way, if any, a breakage the plugin accepted is. */
function breakageMechanism(router: Router, breakage: Breakage): string {
  if (
    breakage.how === "build" &&
    breakage.message.includes("as a query param")
  ) {
    return "accepts: a path param is forwarded into a name the target declares as query";
  }

  if (breakage.how === "roundtrip" && reachesAbsolute(router, breakage.route)) {
    return "accepts: a `~` route loses an ancestor's param";
  }

  return `accepts: ${breakage.how} of "${breakage.route}": ${breakage.message}`;
}

// A refusal carries a bracketed head (`[router.addRoute] …`); an internal error
// does not.
const isRefusal = (error: Error): boolean => error.message.startsWith("[");

/** A router over `table`, or `null` when bare core refuses the table itself. */
function routerOver(table: readonly RouteDef[]): Router | null {
  try {
    return createRouter(withHome(table));
  } catch {
    return null;
  }
}

function judge({ table, operation }: Case): Verdict {
  const bareRouter = routerOver(table);

  if (bareRouter === null) {
    return { kind: "skipped" };
  }

  const bareError = thrownBy(() => {
    operate(bareRouter, operation);
  });
  const plugged = createRouter(withHome(table));
  const installError = thrownBy(() => plugged.usePlugin(validationPlugin()));

  if (installError !== null && operation.door !== "createRouter") {
    return { kind: "skipped" };
  }

  const pluginError =
    installError ??
    thrownBy(() => {
      operate(plugged, operation);
    });

  if (pluginError !== null && !isRefusal(pluginError)) {
    return {
      kind: "divergent",
      mechanisms: [`throws: ${pluginError.message}`],
    };
  }

  if (bareError !== null) {
    return pluginError === null
      ? {
          kind: "divergent",
          mechanisms: [`accepts what bare core refuses: ${bareError.message}`],
        }
      : { kind: "bothRefuse" };
  }

  const breakages = breakagesOf(bareRouter);

  if (pluginError !== null) {
    return breakages.length > 0
      ? { kind: "correctRefusal" }
      : {
          kind: "divergent",
          mechanisms: refusalMechanisms(bareRouter, pluginError.message),
        };
  }

  return breakages.length > 0
    ? {
        kind: "divergent",
        mechanisms: breakages.map((breakage) =>
          breakageMechanism(bareRouter, breakage),
        ),
      }
    : { kind: "agree" };
}

const NON_WORD_PARAM = /:(?:user-id|ид|1d)/u;

/**
 * The shapes the fixed members of #2577 failed on: a forward inside a batch
 * under a parent (#2566), and a forward with a param name that is not a word at
 * either end (#2569). Counted so that their return stays in reach.
 */
function witnessesOf({ table, operation }: Case): string[] {
  const paths = new Map<string, string>();
  const forwards: [string, string][] = [];
  const collect = (routes: readonly RouteDef[], prefix: string): void => {
    walk(routes, prefix, (route, fullName) => {
      paths.set(fullName, route.path);

      if (route.forwardTo !== undefined) {
        forwards.push([fullName, route.forwardTo]);
      }
    });
  };

  collect(table, "");

  if (operation.door === "add" || operation.door === "replace") {
    collect(operation.batch, "");
  } else if (operation.door === "addUnderParent") {
    collect(operation.batch, operation.parent);
  }

  const found: string[] = [];
  const parent = operation.door === "addUnderParent" ? operation.parent : "";

  if (
    parent !== "" &&
    forwards.some(
      ([source, target]) =>
        source.startsWith(`${parent}.`) && target.startsWith(`${parent}.`),
    )
  ) {
    found.push("a forward inside a batch under a parent (#2566)");
  }

  if (
    forwards.some(([source, target]) =>
      [paths.get(source), paths.get(target)].some(
        (path) => path !== undefined && NON_WORD_PARAM.test(path),
      ),
    )
  ) {
    found.push("a forward with a param name that is not a word (#2569)");
  }

  return found;
}

const printed = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item === undefined ? "<undefined>" : item,
  );

// =============================================================================
// Properties
// =============================================================================

describe("the plugin's verdict on a route table, against bare core's runtime (#2577)", () => {
  test.prop([caseArbitrary], { numRuns: NUM_RUNS.thorough * 5 })(
    "every divergence is a registered way",
    (input) => {
      const concrete = caseOf(input);
      const verdict = judge(concrete);
      const unregistered =
        verdict.kind === "divergent"
          ? verdict.mechanisms
              .filter(
                (mechanism) => !Object.hasOwn(KNOWN_DIVERGENCES, mechanism),
              )
              .map((mechanism) => `${mechanism} — in ${printed(concrete)}`)
          : [];

      expect(unregistered).toStrictEqual([]);
    },
  );

  it("the oracle answers both ways, every door is run, and every row is still reached", () => {
    const SAMPLES = 2000;
    const seen = new Map<string, number>();
    const doors = new Map<string, number>();
    const count = (tally: Map<string, number>, key: string): void => {
      tally.set(key, (tally.get(key) ?? 0) + 1);
    };

    for (const input of fc.sample(caseArbitrary, {
      numRuns: SAMPLES,
      seed: 2577,
    })) {
      const concrete = caseOf(input);
      const verdict = judge(concrete);

      if (verdict.kind === "skipped") {
        continue;
      }

      count(doors, input.door);

      for (const witness of witnessesOf(concrete)) {
        count(seen, witness);
      }

      if (verdict.kind === "divergent") {
        for (const mechanism of verdict.mechanisms) {
          count(seen, mechanism);
        }
      } else {
        count(seen, verdict.kind);
      }
    }

    // The oracle says yes and says no: most tables are healthy and both routers
    // accept them, and the plugin refuses tables bare core leaves broken.
    expect(seen.get("agree")).toBeGreaterThanOrEqual(SAMPLES / 8);
    expect(seen.get("correctRefusal")).toBeGreaterThanOrEqual(SAMPLES / 25);
    expect(seen.get("bothRefuse")).toBeGreaterThanOrEqual(SAMPLES / 60);

    const below = (
      tally: Map<string, number>,
      floors: readonly (readonly [string, number])[],
    ): string[] =>
      floors
        .filter(([key, floor]) => (tally.get(key) ?? 0) < floor)
        .map(([key]) => key);

    expect(
      below(
        doors,
        DOORS.map((door) => [door, SAMPLES / 30]),
      ),
    ).toStrictEqual([]);
    expect(
      below(seen, [
        ["a forward inside a batch under a parent (#2566)", SAMPLES / 200],
        [
          "a forward with a param name that is not a word (#2569)",
          SAMPLES / 20,
        ],
      ]),
    ).toStrictEqual([]);
    expect(
      below(
        seen,
        Object.keys(KNOWN_DIVERGENCES).map((mechanism) => [mechanism, 1]),
      ).map(
        (mechanism) =>
          `nothing reaches "${mechanism}" any more: if ${KNOWN_DIVERGENCES[mechanism]} fixed it, delete the row`,
      ),
    ).toStrictEqual([]);
  });
});

// =============================================================================
// Controls: the instrument, not the plugin
// =============================================================================

describe("the oracle and the classifier (#2577)", () => {
  const bareRouterOf = (routes: RouteDef[]): Router =>
    createRouter(withHome(routes));

  it("finds no breakage in a table whose forwards and paths work", () => {
    expect(
      breakagesOf(
        bareRouterOf([
          { name: "d", path: "/d/:id" },
          { name: "c", path: "/c/:id", forwardTo: "d" },
          { name: "p", path: "/p", children: [{ name: "k", path: "~/k" }] },
        ]),
      ),
    ).toStrictEqual([]);
  });

  it("names a `~` route below a parameterised parent, reached directly or through a forward", () => {
    const router = bareRouterOf([
      { name: "p", path: "/p/:pid", children: [{ name: "c", path: "~/c" }] },
      { name: "f", path: "/f/:pid", forwardTo: "p.c" },
    ]);

    expect(
      breakagesOf(router).map((breakage) =>
        breakageMechanism(router, breakage),
      ),
    ).toStrictEqual([
      "accepts: a `~` route loses an ancestor's param",
      "accepts: a `~` route loses an ancestor's param",
    ]);
  });

  it("names a path param forwarded into a name the target declares as query", () => {
    const router = bareRouterOf([
      { name: "a", path: "/a?id" },
      { name: "b", path: "/b/:id", forwardTo: "a" },
    ]);

    expect(
      breakagesOf(router).map((breakage) =>
        breakageMechanism(router, breakage),
      ),
    ).toStrictEqual([
      "accepts: a path param is forwarded into a name the target declares as query",
    ]);
  });

  it("leaves a breakage of another kind unregistered", () => {
    const router = bareRouterOf([
      { name: "d", path: "/d/:id" },
      { name: "c", path: "/c", forwardTo: "d" },
    ]);
    const [breakage] = breakagesOf(router);

    expect(
      Object.hasOwn(KNOWN_DIVERGENCES, breakageMechanism(router, breakage)),
    ).toBe(false);
    // A lost param with no `~` route on the way is another kind too.
    expect(
      Object.hasOwn(
        KNOWN_DIVERGENCES,
        breakageMechanism(router, {
          route: "c",
          how: "roundtrip",
          message: "id",
        }),
      ),
    ).toBe(false);
  });

  it("names the refusals by the table bare core holds", () => {
    const router = bareRouterOf([
      { name: "b", path: "/b" },
      { name: "a", path: "/a/:id", forwardTo: "b" },
      { name: "f", path: "/f", forwardTo: "a" },
      { name: "d", path: "/d/:id", defaultParams: { id: "7" } },
      { name: "c", path: "/c", forwardTo: "d" },
      { name: "q", path: "/q/:id" },
      { name: "s", path: "/s", forwardTo: "q" },
    ]);
    const refusal = (target: string, source: string): string =>
      `[router.addRoute] forwardTo target "${target}" requires params [id] that are not available in source route "${source}"`;

    expect(refusalMechanisms(router, refusal("a", "f"))).toStrictEqual([
      "refuses: the forward's target is itself a forward",
    ]);
    expect(refusalMechanisms(router, refusal("d", "c"))).toStrictEqual([
      "refuses: defaultParams fill the param",
    ]);
    expect(refusalMechanisms(router, refusal("q", "s"))).toStrictEqual([
      `refuses: ${refusal("q", "s")}`,
    ]);
  });

  it("runs the plugin on the plugged router: it refuses a forward bare core leaves unbuildable", () => {
    expect(
      judge({
        table: [{ name: "d", path: "/d/:id" }],
        operation: {
          door: "add",
          batch: [{ name: "c", path: "/c", forwardTo: "d" }],
        },
      }),
    ).toStrictEqual({ kind: "correctRefusal" });
  });
});
