// Family matrix: "validator · channel bags on plugin and internal State builders".
// Rows = 7 doors (validator callbacks that receive the CALLER's container by
// identity on PluginApi.makeState / forwardState / buildNavigationState and on
// wireNamespaces · buildNavigateState).
// Columns = experiment (a) [pre-copied container vs original], P1, P2, P3, P4.
//
// No src is edited. Everything is observed from outside: a recording validator
// installed in the same slot validation-plugin writes, the REAL validation-plugin
// for read counts, hostile bags for drift/lying/inherited-accessor.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { validationPlugin } from "@real-router/validation-plugin";

import { countingBag, driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const out = (tag: string, row: unknown): void => {
  console.log(`${tag} ${JSON.stringify(row)}`);
};

// ---------------------------------------------------------------------------
// Recording validator: proves WHICH object each callback receives (identity).
// ---------------------------------------------------------------------------
type Call = { m: string; args: unknown[] };

function recorderFor(calls: Call[]): unknown {
  const group = (g: string): unknown =>
    new Proxy(
      {},
      {
        get:
          (_t, m) =>
          (...args: unknown[]) => {
            calls.push({ m: `${g}.${String(m)}`, args });
          },
      },
    );

  return new Proxy({}, { get: (_t, g) => group(String(g)) });
}

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES as never, {} as never);

const mkValidated = (): ReturnType<typeof createRouter> => {
  const r = createRouter(ROUTES as never, {} as never);

  r.usePlugin(validationPlugin() as never);

  return r;
};

// ===========================================================================
// SECTION 0 — controls + identity (does the caller's object reach the branch?)
// ===========================================================================
async function section0(): Promise<void> {
  const router = mk();
  const api = getPluginApi(router);
  const ctx = getInternals(router);
  const calls: Call[] = [];

  await router.start("/home");

  // NEGATIVE CONTROL: no validator installed -> nothing recorded.
  api.makeState("u", { id: "1" }, { tab: "a" }, "/u/1");
  api.forwardState("u", { id: "1" }, { tab: "a" });
  api.buildNavigationState("u", { id: "1" }, { tab: "a" });
  await router.navigate("u", { id: "1" } as never, { tab: "a" } as never);
  out("S0-negative-control", { recordedWithoutValidator: calls.length });

  ctx.validator = recorderFor(calls) as never;

  const hits = (m: string, obj: unknown): number =>
    calls.filter((c) => c.m === m && c.args.includes(obj)).length;

  const P1b = { id: "1" };
  const S1b = { tab: "a" };

  calls.length = 0;
  api.makeState("u", P1b, S1b, "/u/1");
  out("S0-D1", {
    door: "validateMakeStateArgs·params@PluginApi.makeState",
    same: hits("state.validateMakeStateArgs", P1b) > 0,
    count: hits("state.validateMakeStateArgs", P1b),
  });
  out("S0-D2", {
    door: "validateSearch·search@PluginApi.makeState",
    same: hits("navigation.validateSearch", S1b) > 0,
    count: hits("navigation.validateSearch", S1b),
  });

  const P3b = { id: "2" };
  const S3b = { tab: "b" };

  calls.length = 0;
  api.forwardState("u", P3b, S3b);
  out("S0-D3", {
    door: "validateStateBuilderArgs·routeParams@PluginApi.forwardState",
    same: hits("routes.validateStateBuilderArgs", P3b) > 0,
    count: hits("routes.validateStateBuilderArgs", P3b),
  });
  out("S0-D4", {
    door: "validateSearch·routeSearch@PluginApi.forwardState",
    same: hits("navigation.validateSearch", S3b) > 0,
    count: hits("navigation.validateSearch", S3b),
  });

  const P5b = { id: "3" };
  const S5b = { tab: "c" };

  calls.length = 0;
  api.buildNavigationState("u", P5b, S5b);
  out("S0-D5", {
    door: "validateSearch·search@PluginApi.buildNavigationState",
    same: hits("navigation.validateSearch", S5b) > 0,
    count: hits("navigation.validateSearch", S5b),
  });
  out("S0-D6", {
    door: "validateStateBuilderArgs·params@PluginApi.buildNavigationState",
    same: hits("routes.validateStateBuilderArgs", P5b) > 0,
    count: hits("routes.validateStateBuilderArgs", P5b),
  });

  const P7b = { id: "4" };
  const S7b = { tab: "d" };

  calls.length = 0;
  await router.navigate("u", P7b as never, S7b as never);
  out("S0-D7", {
    door: "validateStateBuilderArgs·routeParams@buildNavigateState",
    sameAtBuilder: hits("routes.validateStateBuilderArgs", P7b) > 0,
    countAtBuilder: hits("routes.validateStateBuilderArgs", P7b),
    // the DOUBLE-COUNT claim of this family: the facade already handed the very
    // same object to the validator one frame up.
    countAtFacade_validateParams: hits("navigation.validateParams", P7b),
    countAtFacade_validateSearch: hits("navigation.validateSearch", S7b),
    methodsSeen: [...new Set(calls.map((c) => c.m))],
  });
}

// ===========================================================================
// SECTION A — experiment (a): pre-copied container vs original.
// ===========================================================================
async function sectionA(): Promise<void> {
  const leaf = { service: "SAME-LEAF" };

  const runDoor = async (
    door: string,
    make: () => { params: Record<string, unknown>; search: Record<string, unknown> },
    call: (
      router: ReturnType<typeof createRouter>,
      params: Record<string, unknown>,
      search: Record<string, unknown>,
    ) => Promise<unknown> | unknown,
  ): Promise<void> => {
    const observe = async (copyAtBoundary: boolean): Promise<unknown> => {
      const router = mkValidated();
      const calls: Call[] = [];

      await router.start("/home");
      getInternals(router).validator = recorderFor(calls) as never;

      const { params, search } = make();
      const passedParams = copyAtBoundary ? { ...params } : params;
      const passedSearch = copyAtBoundary ? { ...search } : search;
      const result = (await call(router, passedParams, passedSearch)) as
        | Record<string, unknown>
        | undefined;

      const state = router.getState() as Record<string, unknown> | undefined;
      const resultParams = result?.params as Record<string, unknown> | undefined;

      // back-visibility 1: mutate the caller's ORIGINAL after the call.
      params.injectedAfter = "AFTER";
      search.injectedAfter = "AFTER";

      return {
        result: result
          ? {
              name: result.name,
              params: result.params,
              search: result.search,
              path: result.path,
            }
          : undefined,
        state: state
          ? { name: state.name, params: state.params, search: state.search, path: state.path }
          : undefined,
        resultBagIsCallerBag: resultParams === passedParams,
        leafIdentityKept: resultParams ? resultParams.leaf === leaf : undefined,
        coreSawLaterMutation: resultParams ? "injectedAfter" in resultParams : undefined,
        resultParamsFrozen: resultParams ? Object.isFrozen(resultParams) : undefined,
        validatorMethods: [...new Set(calls.map((c) => c.m))],
      };
    };

    const withOriginal = await observe(false);
    const withCopy = await observe(true);
    const same = JSON.stringify(withOriginal) === JSON.stringify(withCopy);

    out("A", { door, identicalObservables: same, withOriginal, withCopy });
  };

  const bags = (): { params: Record<string, unknown>; search: Record<string, unknown> } => ({
    params: { id: "1", leaf },
    search: { tab: "a" },
  });

  await runDoor("D1/D2 PluginApi.makeState", bags, (router, p, s) =>
    getPluginApi(router).makeState("u", p as never, s as never, "/u/1"),
  );
  await runDoor("D3/D4 PluginApi.forwardState", bags, (router, p, s) =>
    getPluginApi(router).forwardState("u", p as never, s as never),
  );
  await runDoor("D5/D6 PluginApi.buildNavigationState", bags, (router, p, s) =>
    getPluginApi(router).buildNavigationState("u", p as never, s as never),
  );
  await runDoor("D7 buildNavigateState (router.navigate)", bags, (router, p, s) =>
    router.navigate("u", p as never, s as never),
  );
}

// ===========================================================================
// SECTION B — P1: reads per key, bare core vs validation-plugin, then DRIFT.
// ===========================================================================
async function sectionB(): Promise<void> {
  const peak = (reads: Record<string, number>): number =>
    Math.max(0, ...Object.values(reads));

  const count = async (
    label: string,
    validated: boolean,
    call: (
      router: ReturnType<typeof createRouter>,
      params: object,
      search: object,
    ) => Promise<unknown> | unknown,
  ): Promise<void> => {
    const router = validated ? mkValidated() : mk();

    await router.start("/home");

    const params = countingBag({ id: "7" });
    const search = countingBag({ tab: "a" });

    await call(router, params.bag, search.bag);

    out("B-count", {
      door: label,
      validator: validated,
      paramsReadsPerKey: { ...params.reads },
      searchReadsPerKey: { ...search.reads },
      peakParams: peak(params.reads),
      peakSearch: peak(search.reads),
    });
  };

  const doors: [
    string,
    (r: ReturnType<typeof createRouter>, p: object, s: object) => Promise<unknown> | unknown,
  ][] = [
    ["D1/D2 makeState", (r, p, s) => getPluginApi(r).makeState("u", p as never, s as never, "/u/7")],
    ["D3/D4 forwardState", (r, p, s) => getPluginApi(r).forwardState("u", p as never, s as never)],
    [
      "D5/D6 buildNavigationState",
      (r, p, s) => getPluginApi(r).buildNavigationState("u", p as never, s as never),
    ],
    ["D7 navigate→buildNavigateState", (r, p, s) => r.navigate("u", p as never, s as never)],
  ];

  for (const [label, call] of doors) {
    await count(label, false, call);
    await count(label, true, call);
  }

  // DRIFT: the validator inspects read #1, core ships read #2+.
  // First read = a legal string; every later read = a FUNCTION, which `isParams`
  // exists to refuse. If the function reaches `state.params`, the validator's
  // verdict does not bind what core ships.
  const poison = (): void => {
    /* poison */
  };

  const drift = async (
    label: string,
    call: (
      router: ReturnType<typeof createRouter>,
      params: object,
      search: object,
    ) => Promise<unknown> | unknown,
  ): Promise<void> => {
    const router = mkValidated();

    await router.start("/home");

    const params = driftingBag({ id: "LEGAL-STRING" }, { id: poison as never });
    const search = { tab: "a" };
    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, params.bag, search);
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const shipped =
      (result as { params?: Record<string, unknown> } | undefined)?.params ??
      (router.getState() as { params?: Record<string, unknown> } | undefined)?.params;

    out("B-drift", {
      door: label,
      readsPerKey: { ...params.reads },
      threw,
      shippedIdIsPoisonFunction: shipped?.id === poison,
      shippedId: typeof shipped?.id === "function" ? "[Function poison]" : shipped?.id,
    });
  };

  for (const [label, call] of doors) {
    await drift(label, call);
  }
}

// ===========================================================================
// SECTION C — P2: a lying Proxy (ownKeys hides the key, gOPD claims it is own).
// ===========================================================================
async function sectionC(): Promise<void> {
  const lying = (): object => {
    const target: Record<string, unknown> = { id: "7" };

    return new Proxy(target, {
      ownKeys: () => ["id"], // "evil" is NEVER named
      getOwnPropertyDescriptor(t, key) {
        if (key === "evil") {
          return { value: "LEAKED", writable: true, enumerable: true, configurable: true };
        }

        return Reflect.getOwnPropertyDescriptor(t, key);
      },
      get(t, key, receiver) {
        if (key === "evil") {
          return "LEAKED";
        }

        return Reflect.get(t, key, receiver);
      },
      has: (t, key) => key === "evil" || Reflect.has(t, key),
    });
  };

  const doors: [
    string,
    (r: ReturnType<typeof createRouter>, p: object) => Promise<unknown> | unknown,
  ][] = [
    ["D1 makeState", (r, p) => getPluginApi(r).makeState("u", p as never, {} as never, "/u/7")],
    ["D3 forwardState", (r, p) => getPluginApi(r).forwardState("u", p as never)],
    ["D6 buildNavigationState", (r, p) => getPluginApi(r).buildNavigationState("u", p as never)],
    ["D7 navigate", (r, p) => r.navigate("u", p as never)],
  ];

  for (const [label, call] of doors) {
    const router = mkValidated();

    await router.start("/home");

    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, lying());
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const shipped =
      (result as { params?: Record<string, unknown> } | undefined)?.params ??
      (router.getState() as { params?: Record<string, unknown> } | undefined)?.params;

    out("C-P2", {
      door: label,
      threw,
      shippedKeys: shipped ? Object.keys(shipped) : undefined,
      evilLanded: shipped ? "evil" in shipped : undefined,
      // POSITIVE CONTROL: the honest key must still land.
      honestIdLanded: shipped?.id,
    });
  }
}

// ===========================================================================
// SECTION D — P3: inherited accessor under the key name + own "__proto__".
// ===========================================================================
async function sectionD(): Promise<void> {
  const doors: [
    string,
    (r: ReturnType<typeof createRouter>, p: object) => Promise<unknown> | unknown,
  ][] = [
    ["D1 makeState", (r, p) => getPluginApi(r).makeState("u", p as never, {} as never, "/u/7")],
    ["D3 forwardState", (r, p) => getPluginApi(r).forwardState("u", p as never)],
    ["D6 buildNavigationState", (r, p) => getPluginApi(r).buildNavigationState("u", p as never)],
    ["D7 navigate", (r, p) => r.navigate("u", p as never)],
  ];

  for (const [label, call] of doors) {
    const router = mkValidated();

    await router.start("/home");

    let setterHits = 0;
    let threw: string | undefined;
    let result: unknown;

    try {
      Object.defineProperty(Object.prototype, "id", {
        configurable: true,
        get: (): unknown => "AMBIENT",
        set: (): void => {
          setterHits += 1;
        },
      });

      try {
        result = await call(router, { id: "7" });
      } catch (error) {
        threw = String(error).slice(0, 90);
      }
    } finally {
      delete (Object.prototype as Record<string, unknown>).id;
    }

    const shipped =
      (result as { params?: Record<string, unknown> } | undefined)?.params ??
      (router.getState() as { params?: Record<string, unknown> } | undefined)?.params;

    out("D-P3-accessor", {
      door: label,
      threw,
      setterHits,
      shippedIsOwnId: shipped ? Object.hasOwn(shipped, "id") : undefined,
      shippedId: shipped?.id,
      shippedProto:
        shipped === undefined ? undefined : Object.getPrototypeOf(shipped) === null ? "null" : "Object.prototype",
    });
  }

  // own "__proto__" carried by a bag parsed from JSON.
  for (const [label, call] of doors) {
    const router = mkValidated();

    await router.start("/home");

    const bag = JSON.parse('{"id":"7","__proto__":{"polluted":true}}') as object;
    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, bag);
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const shipped =
      (result as { params?: Record<string, unknown> } | undefined)?.params ??
      (router.getState() as { params?: Record<string, unknown> } | undefined)?.params;

    out("D-P3-proto", {
      door: label,
      threw,
      globalPolluted: ({} as Record<string, unknown>).polluted !== undefined,
      shippedKeys: shipped ? Object.keys(shipped) : undefined,
      shippedHasOwnProtoKey: shipped ? Object.hasOwn(shipped, "__proto__") : undefined,
      shippedProtoIsPolluted:
        shipped === undefined
          ? undefined
          : (Object.getPrototypeOf(shipped) as Record<string, unknown> | null)?.polluted !== undefined,
    });
  }
}

// ===========================================================================
// SECTION E — P4: which level is frozen after the bag passes the door.
// ===========================================================================
async function sectionE(): Promise<void> {
  const doors: [
    string,
    (
      r: ReturnType<typeof createRouter>,
      p: object,
      s: object,
    ) => Promise<unknown> | unknown,
  ][] = [
    ["D1/D2 makeState", (r, p, s) => getPluginApi(r).makeState("u", p as never, s as never, "/u/7")],
    ["D3/D4 forwardState", (r, p, s) => getPluginApi(r).forwardState("u", p as never, s as never)],
    [
      "D5/D6 buildNavigationState",
      (r, p, s) => getPluginApi(r).buildNavigationState("u", p as never, s as never),
    ],
    ["D7 navigate", (r, p, s) => r.navigate("u", p as never, s as never)],
  ];

  for (const [label, call] of doors) {
    const router = mkValidated();

    await router.start("/home");

    const nested = { deep: 1 };
    const params: Record<string, unknown> = { id: "7", nested };
    const search: Record<string, unknown> = { tab: "a" };
    let threw: string | undefined;
    let result: unknown;

    try {
      result = await call(router, params, search);
    } catch (error) {
      threw = String(error).slice(0, 90);
    }

    const res = result as
      | { params?: Record<string, unknown>; search?: Record<string, unknown> }
      | undefined;
    const state = router.getState() as
      | { params?: Record<string, unknown>; search?: Record<string, unknown> }
      | undefined;
    const shippedParams = res?.params ?? state?.params;
    const shippedSearch = res?.search ?? state?.search;

    out("E-P4", {
      door: label,
      threw,
      callerBagFrozen: Object.isFrozen(params),
      callerNestedFrozen: Object.isFrozen(nested),
      callerSearchFrozen: Object.isFrozen(search),
      coreParamsFrozen: shippedParams ? Object.isFrozen(shippedParams) : undefined,
      coreSearchFrozen: shippedSearch ? Object.isFrozen(shippedSearch) : undefined,
      coreNestedIsCallerNested: shippedParams ? shippedParams.nested === nested : undefined,
    });
  }
}

async function main(): Promise<void> {
  await section0();
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
}

void main();
