// Family "channel-defaults · HELD handle (route + options)" — one matrix.
// Rows: the 12 doors. Columns: identity/back-visibility, experiment (a), P1..P4.
// Every section carries a positive control and prints the decisive line.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const out = (tag: string, v: unknown): void => {
  console.log(`${tag} :: ${JSON.stringify(v)}`);
};

const R = (name: string, path: string, extra: Record<string, unknown> = {}) =>
  ({ name, path, ...extra }) as never;

// ---------------------------------------------------------------- SECTION 0
// POSITIVE CONTROL of the whole rig: a legal, untouched defaults bag prints.
{
  const r = createRouter(
    [
      R("u", "/u/:id?tab", {
        defaultParams: { id: "1" },
        defaultSearch: { tab: "x" },
      }),
    ],
    {} as never,
  );
  out(
    "0 · control · buildPath with legal defaults",
    r.buildPath("u", {} as never),
  );
}

// ---------------------------------------------------------------- SECTION A
// IDENTITY + BACK-VISIBILITY per entry path (D1..D8) and through the port.
type PathName = "createRouter" | "add" | "replace" | "update";

function registerVia(kind: PathName, pBag: object, sBag: object) {
  const events: unknown[] = [];
  let router;

  if (kind === "createRouter") {
    router = createRouter(
      [R("u", "/u/:id?tab", { defaultParams: pBag, defaultSearch: sBag })],
      {} as never,
    );
    getRoutesApi(router).subscribeChanges((e) => events.push(e));
  } else {
    router = createRouter([R("z", "/z")], {} as never);
    const api = getRoutesApi(router);
    api.subscribeChanges((e) => events.push(e));

    if (kind === "add") {
      api.add([
        R("u", "/u/:id?tab", { defaultParams: pBag, defaultSearch: sBag }),
      ]);
    } else if (kind === "replace") {
      api.replace([
        R("u", "/u/:id?tab", { defaultParams: pBag, defaultSearch: sBag }),
      ]);
    } else {
      api.add([R("u", "/u/:id?tab")]);
      api.update("u", { defaultParams: pBag, defaultSearch: sBag } as never);
    }
  }

  return { events, router };
}

for (const kind of [
  "createRouter",
  "add",
  "replace",
  "update",
] as const) {
  const pBag: Record<string, unknown> = { id: "1" };
  const sBag: Record<string, unknown> = { tab: "x" };
  const { events, router } = registerVia(kind, pBag, sBag);
  const api = getRoutesApi(router);
  const store = getInternals(router).routeGetStore();
  const shell = api.get("u") as unknown as Record<string, unknown>;
  const ev = events.at(-1) as {
    op?: string;
    added?: readonly { name?: string; defaultParams?: unknown; defaultSearch?: unknown }[];
    patch?: { defaultParams?: unknown; defaultSearch?: unknown };
  };
  const lastAdded =
    ev?.patch ?? ev?.added?.find((r) => r.name === "u");

  const before = router.buildPath("u", {} as never);
  pBag.id = "MUT";
  sBag.tab = "MUTATED";
  const after = router.buildPath("u", {} as never);

  out(`A · ${kind}`, {
    lastEventOp: ev?.op,
    storeParamsIsCallerBag: store.config.defaultParams.u === pBag,
    storeSearchIsCallerBag: store.config.defaultSearch.u === sBag,
    getShellParamsIsCallerBag: shell.defaultParams === pBag,
    getShellSearchIsCallerBag: shell.defaultSearch === sBag,
    treeChangedParamsIsCallerBag: lastAdded
      ? lastAdded.defaultParams === pBag
      : "no-added-payload",
    treeChangedSearchIsCallerBag: lastAdded
      ? lastAdded.defaultSearch === sBag
      : "no-added-payload",
    frozenParams: Object.isFrozen(pBag),
    frozenSearch: Object.isFrozen(sBag),
    buildPathBeforeAfterCallerMutation: [before, after],
  });
}

// D9/D10 — the SAME object handed back through the internal port.
{
  const pBag = { id: "1" };
  const sBag = { tab: "x" };
  const router = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: pBag, defaultSearch: sBag })],
    {} as never,
  );
  const store = getInternals(router).routeGetStore();
  out("A · port objects", {
    storeParamsIsCallerBag: store.config.defaultParams.u === pBag,
    storeSearchIsCallerBag: store.config.defaultSearch.u === sBag,
    twoLookupsSameObject:
      store.config.defaultParams.u ===
      getInternals(router).routeGetStore().config.defaultParams.u,
  });
}

// ---------------------------------------------------------------- SECTION B
// EXPERIMENT (a): feed a PRE-COPIED container at the boundary and diff every
// observable against feeding the original.
async function observe(useCopy: boolean) {
  const pOrig: Record<string, unknown> = { id: "1" };
  const sOrig: Record<string, unknown> = { tab: "x" };
  const pIn = useCopy ? { ...pOrig } : pOrig;
  const sIn = useCopy ? { ...sOrig } : sOrig;

  const events: unknown[] = [];
  const router = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: pIn, defaultSearch: sIn })],
    {} as never,
  );
  getRoutesApi(router).subscribeChanges((e) => events.push(e));
  await router.start("/u/9");

  const st = router.getState()!;
  const shell = getRoutesApi(router).get("u") as unknown as Record<
    string,
    unknown
  >;

  const snapshot = {
    href: router.buildPath("u", {} as never),
    statePath: st.path,
    stateParams: { ...st.params },
    stateSearch: { ...st.search },
    shellParams: { ...(shell.defaultParams as object) },
    shellSearch: { ...(shell.defaultSearch as object) },
    shellIsAppLiteral: shell.defaultParams === pOrig,
    isActive: router.isActiveRoute("u", {} as never),
    canNavigate: router.canNavigateTo("u", {} as never),
    makeState: getPluginApi(router).makeState("u", {} as never).path,
    eventCount: events.length,
  };

  // BACK-VISIBILITY, both directions.
  pOrig.id = "APPMUT";
  const hrefAfterAppMutatesItsLiteral = router.buildPath("u", {} as never);
  (shell.defaultParams as Record<string, unknown>).id = "VIAHANDOUT";
  const hrefAfterWriteThroughHandout = router.buildPath("u", {} as never);
  const appLiteralSeesHandoutWrite = pOrig.id;

  return {
    ...snapshot,
    hrefAfterAppMutatesItsLiteral,
    hrefAfterWriteThroughHandout,
    appLiteralSeesHandoutWrite,
  };
}

{
  const orig = await observe(false);
  const copy = await observe(true);
  const diff: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(orig)) {
    const a = JSON.stringify((orig as Record<string, unknown>)[k]);
    const b = JSON.stringify((copy as Record<string, unknown>)[k]);
    if (a !== b)
      diff[k] = [
        (orig as Record<string, unknown>)[k],
        (copy as Record<string, unknown>)[k],
      ];
  }
  out("B · (a) original", orig);
  out("B · (a) pre-copied", copy);
  out("B · (a) DIFFERING OBSERVABLES", diff);
}

// ---------------------------------------------------------------- SECTION C
// P1 — read count per key of the HELD defaults bag on ONE hot-path frame.
async function counts(
  label: string,
  run: (r: ReturnType<typeof createRouter>) => Promise<void> | void,
) {
  const p = countingProxy<Record<string, unknown>>({ id: "1" });
  const s = countingProxy<Record<string, unknown>>({ tab: "x" });
  const router = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: p.bag, defaultSearch: s.bag })],
    {} as never,
  );
  // WARM-UP so the measured frame is the one under test, not `start`'s.
  await router.start("/u/1?tab=x");
  const atRegistration = {
    params: { ...p.reads },
    search: { ...s.reads },
  } as { params: Record<string, number>; search: Record<string, number> };
  await run(router);
  const after: Record<string, number> = {};
  for (const k of Object.keys(p.reads))
    after[`params.${k}`] = p.reads[k]! - (atRegistration.params[k] ?? 0);
  for (const k of Object.keys(s.reads))
    after[`search.${k}`] = s.reads[k]! - (atRegistration.search[k] ?? 0);
  out(`C · P1 · ${label}`, { atRegistration, deltaOnFrame: after });
}

await counts("start (URL → state)", () => undefined);
await counts("buildPath (literal form)", (r) => {
  out("C · control · buildPath href", r.buildPath("u", {} as never));
});
await counts("navigate (resolving form)", async (r) => {
  const st = await r.navigate("u", { id: "3" } as never).catch((e: unknown) => e);
  out(
    "C · control · navigate path",
    (st as { path?: string })?.path ?? String(st),
  );
});
// ⚠ isActiveRoute exits EARLY off-route, so the frame must run ON the route.
await counts("isActiveRoute (on-route)", (r) => {
  out("C · control · isActiveRoute (must be true)", r.isActiveRoute("u", { id: "1" } as never));
});

// C2 — WHERE the second read on `navigate` comes from.
{
  const stacks: string[] = [];
  const target: Record<string, unknown> = { id: "1" };
  const traced = new Proxy(target, {
    get(t, k, rec) {
      if (k === "id") {
        stacks.push(
          (new Error("read").stack ?? "")
            .split("\n")
            .slice(1, 7)
            .map((l) => l.trim().replace(/.*swarm-membrane-globality\//, ""))
            .join(" | "),
        );
      }
      return Reflect.get(t, k, rec);
    },
  });
  const r = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: traced })],
    {} as never,
  );
  await r.start("/u/2");
  stacks.length = 0;
  const st = await r.navigate("u", { id: "3" } as never);
  out("C2 · navigate read sites", { path: st.path, count: stacks.length });
  for (const [i, s] of stacks.entries()) out(`C2 · read #${i + 1}`, s);
}

// ---------------------------------------------------------------- SECTION D
// P1 with a DRIFTING container: withholdFilledSlots' pass-through arm exposes
// the caller's defaultSearch to a SECOND ownKeys enumeration inside one call.
{
  let ownKeysCalls = 0;
  const target: Record<string, unknown> = { tab: "FIRST" };
  const drifting = new Proxy(target, {
    ownKeys(t) {
      ownKeysCalls += 1;
      return ownKeysCalls === 1 ? [] : Reflect.ownKeys(t);
    },
  });
  const router = createRouter(
    [R("u", "/u/:id?tab", { defaultSearch: drifting })],
    {} as never,
  );
  const atRegistration = ownKeysCalls;
  const href = router.buildPath("u", { id: "1" } as never);
  out("D · P1-drift · buildPath (literal, declaredQuery=[tab])", {
    atRegistration,
    ownKeysCallsTotal: ownKeysCalls,
    onFrame: ownKeysCalls - atRegistration,
    href,
    verdict:
      ownKeysCalls - atRegistration > 1
        ? "container enumerated MORE THAN ONCE in one frame"
        : "single enumeration on the frame",
  });

  // Positive control: a route WITHOUT a declared query name early-returns in
  // withholdFilledSlots, so only ONE enumeration is expected there.
  let ownKeysCalls2 = 0;
  const t2: Record<string, unknown> = { tab: "FIRST" };
  const drifting2 = new Proxy(t2, {
    ownKeys(t) {
      ownKeysCalls2 += 1;
      return ownKeysCalls2 === 1 ? [] : Reflect.ownKeys(t);
    },
  });
  const r2 = createRouter(
    [R("v", "/v/:id", { defaultSearch: drifting2 })],
    {} as never,
  );
  const atReg2 = ownKeysCalls2;
  const href2 = r2.buildPath("v", { id: "1" } as never);
  out("D · P1-drift · control (no declared query)", {
    atRegistration: atReg2,
    onFrame: ownKeysCalls2 - atReg2,
    href: href2,
  });
}

// ---------------------------------------------------------------- SECTION E
// P2 — a Proxy whose ownKeys hides the key while getOwnPropertyDescriptor
// vouches for it as own+enumerable. The key must NOT reach state/URL.
{
  const lyingBag = () => {
    const target: Record<string, unknown> = { hidden: "LEAK" };
    return new Proxy(target, {
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => ({
        configurable: true,
        enumerable: true,
        value: "LEAK",
        writable: true,
      }),
      get: () => "LEAK",
      has: () => true,
    });
  };
  const mk = (slot: "defaultParams" | "defaultSearch", path: string) => {
    try {
      const router = createRouter(
        [R("u", path, { [slot]: lyingBag() })],
        {} as never,
      );
      return {
        href: router.buildPath("u", { id: "1" } as never),
        makeStateSearch: {
          ...getPluginApi(router).makeState("u", { id: "1" } as never).search,
        },
        makeStateParams: {
          ...getPluginApi(router).makeState("u", { id: "1" } as never).params,
        },
      };
    } catch (error) {
      return { threwAtRegistration: String(error).slice(0, 120) };
    }
  };
  // The key is NOT declared as a query name → the registration channel guard
  // has an empty `queryNames` and cannot consult the bag at all.
  out("E · P2 · lying proxy in defaultParams (undeclared key)", mk("defaultParams", "/u/:id"));
  out("E · P2 · lying proxy in defaultSearch (undeclared key)", mk("defaultSearch", "/u/:id"));
  // Same bag, key DECLARED as a query name: the registration guard asks
  // `hasOwn` about a key its own `queryNames` chose — the #1854 trap shape.
  out("E · P2 · lying proxy in defaultParams (DECLARED ?hidden)", mk("defaultParams", "/u/:id?hidden"));
  out("E · P2 · lying proxy in defaultSearch (DECLARED ?hidden)", mk("defaultSearch", "/u/:id?hidden"));
  // Control for the guard: an HONEST bag with no such key registers fine.
  out("E · P2 · control (honest bag, no such key, DECLARED ?hidden)", mk("defaultSearch", "/u/:id?hidden") && (() => {
    const r = createRouter([R("u", "/u/:id?hidden", { defaultParams: { id: "2" } })], {} as never);
    return r.buildPath("u", {} as never);
  })());

  // Positive control: an HONEST bag with the same key DOES land.
  const honest = createRouter(
    [R("u", "/u/:id?hidden", { defaultSearch: { hidden: "LEAK" } })],
    {} as never,
  );
  out(
    "E · P2 · control (honest bag)",
    honest.buildPath("u", { id: "1" } as never),
  );
}

// ---------------------------------------------------------------- SECTION F
// P3 — inherited accessor under the default's key name, and an own "__proto__".
{
  const seen: string[] = [];
  Object.defineProperty(Object.prototype, "theme", {
    configurable: true,
    get(): unknown {
      return "INHERITED";
    },
    set(v: unknown) {
      seen.push(String(v));
    },
  });
  try {
    const r = createRouter(
      [R("u", "/u/:id?theme", { defaultSearch: { theme: "own" } })],
      {} as never,
    );
    out("F · P3 · inherited setter under key name", {
      href: r.buildPath("u", { id: "1" } as never),
      setterInvocations: seen,
      stateSearch: {
        ...getPluginApi(r).makeState("u", { id: "1" } as never).search,
      },
    });
  } catch (error) {
    out("F · P3 · THREW", String(error));
  } finally {
    delete (Object.prototype as Record<string, unknown>).theme;
  }

  const evil = JSON.parse('{"__proto__": {"pwned": 1}, "tab": "ok"}') as Record<
    string,
    unknown
  >;
  const r2 = createRouter(
    [R("u", "/u/:id?tab", { defaultSearch: evil })],
    {} as never,
  );
  const st = getPluginApi(r2).makeState("u", { id: "1" } as never);
  out("F · P3 · own __proto__ in defaultSearch", {
    ownProtoOnCallerBag: Object.hasOwn(evil, "__proto__"),
    href: r2.buildPath("u", { id: "1" } as never),
    stateSearchKeys: Object.keys(st.search),
    statePrototypePolluted: Object.getPrototypeOf(st.search) !== Object.prototype,
    globalPolluted: ({} as Record<string, unknown>).pwned,
  });

  const evilP = JSON.parse('{"__proto__": {"pwned": 2}, "id": "7"}') as Record<
    string,
    unknown
  >;
  const r3 = createRouter(
    [R("u", "/u/:id", { defaultParams: evilP })],
    {} as never,
  );
  const st3 = getPluginApi(r3).makeState("u", {} as never);
  out("F · P3 · own __proto__ in defaultParams", {
    href: r3.buildPath("u", {} as never),
    stateParamsKeys: Object.keys(st3.params),
    paramsPrototypePolluted:
      Object.getPrototypeOf(st3.params) !== Object.prototype,
    globalPolluted: ({} as Record<string, unknown>).pwned,
  });
}

// ---------------------------------------------------------------- SECTION G
// P4 — which level ends up frozen.
{
  const pBag = { id: "1", nested: { deep: 1 } };
  const sBag = { tab: "x", nested: { deep: 1 } };
  const r = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: pBag, defaultSearch: sBag })],
    {} as never,
  );
  await r.start("/u/9");
  const st = r.getState()!;
  out("G · P4", {
    callerDefaultParamsFrozen: Object.isFrozen(pBag),
    callerDefaultSearchFrozen: Object.isFrozen(sBag),
    callerNestedFrozen: Object.isFrozen(pBag.nested),
    coreStateParamsFrozen: Object.isFrozen(st.params),
    coreStateSearchFrozen: Object.isFrozen(st.search),
    statePath: st.path,
  });
}

// ---------------------------------------------------------------- SECTION H
// D11/D12 — options.defaultParams / options.defaultSearch.
{
  const dp: Record<string, unknown> = { id: "9" };
  const ds: Record<string, unknown> = { tab: "q" };
  const router = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: dp,
    defaultSearch: ds,
  } as never);
  const opts = getPluginApi(router).getOptions() as unknown as Record<
    string,
    unknown
  >;
  await router.start("/nope").catch(() => undefined);
  const first = router.getState()?.path;
  dp.id = "MUT";
  ds.tab = "MUTATED";
  await router.navigateToDefault();
  const second = router.getState()?.path;
  out("H · options defaults", {
    getOptionsParamsIsCallerBag: opts.defaultParams === dp,
    getOptionsSearchIsCallerBag: opts.defaultSearch === ds,
    optionsShellFrozen: Object.isFrozen(opts),
    callerParamsFrozen: Object.isFrozen(dp),
    callerSearchFrozen: Object.isFrozen(ds),
    pathAfterStartFallback: first,
    pathAfterCallerMutation: second,
  });

  // P1 on the options bags across TWO navigateToDefault frames.
  const p = countingProxy<Record<string, unknown>>({ id: "9" });
  const s = countingProxy<Record<string, unknown>>({ tab: "q" });
  const r2 = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: p.bag,
    defaultSearch: s.bag,
  } as never);
  await r2.start("/nope").catch(() => undefined);
  const afterBoot = { params: { ...p.reads }, search: { ...s.reads } };
  await r2.navigateToDefault().catch(() => undefined);
  const afterOne = { params: { ...p.reads }, search: { ...s.reads } };
  await r2.navigateToDefault().catch(() => undefined);
  out("H · P1 options", {
    controlPath: r2.getState()?.path,
    afterBoot,
    afterOne,
    afterTwo: { params: { ...p.reads }, search: { ...s.reads } },
  });

  // Experiment (a) on the options door: pre-copied vs original.
  const mk = async (useCopy: boolean) => {
    const o: Record<string, unknown> = { id: "9" };
    const q: Record<string, unknown> = { tab: "q" };
    const r3 = createRouter([R("u", "/u/:id?tab")], {
      defaultRoute: "u",
      defaultParams: useCopy ? { ...o } : o,
      defaultSearch: useCopy ? { ...q } : q,
    } as never);
    await r3.start("/nope").catch(() => undefined);
    const path = r3.getState()?.path;
    const handedBack =
      (getPluginApi(r3).getOptions() as unknown as Record<string, unknown>)
        .defaultParams === o;
    o.id = "AFTER";
    await r3.navigateToDefault().catch(() => undefined);
    return { path, handedBack, pathAfterAppMutation: r3.getState()?.path };
  };
  out("H · (a) options original", await mk(false));
  out("H · (a) options pre-copied", await mk(true));
}

// ---------------------------------------------------------------- SECTION D2
// The SEMANTIC consequence of D: the caller filled the declared query slot in
// the params bag, so #1570's withholding rule must drop the default. The
// drifting container makes the withhold pass see an EMPTY bag, and the default
// wins over the caller's own value.
{
  const target: Record<string, unknown> = { tab: "DEFAULT" };
  let n = 0;
  const drifting = new Proxy(target, {
    ownKeys(t) {
      n += 1;
      return n === 1 ? [] : Reflect.ownKeys(t);
    },
  });
  const r = createRouter(
    [R("u", "/u/:id?tab", { defaultSearch: drifting })],
    {} as never,
  );
  // POSITIVE CONTROL: honest bag, same intent — the caller's params-bag twin
  // withholds the default (#1570), so nothing is printed from it.
  const honest = createRouter(
    [R("v", "/v/:id?tab", { defaultSearch: { tab: "DEFAULT" } })],
    {} as never,
  );
  out("D2 · withhold rule", {
    control_honest: honest.buildPath("v", { id: "1", tab: "MINE" } as never),
    drifting: r.buildPath("u", { id: "1", tab: "MINE" } as never),
    ownKeysCalls: n,
  });
}

// ---------------------------------------------------------------- SECTION H2
// P2 / P3 on the OPTIONS defaults door.
{
  const lying = new Proxy({ id: "9" } as Record<string, unknown>, {
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({
      configurable: true,
      enumerable: true,
      value: "LEAK",
      writable: true,
    }),
    get: () => "LEAK",
    has: () => true,
  });
  const r = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: lying,
  } as never);
  await r.start("/nope").catch(() => undefined);
  const res = await r.navigateToDefault().catch((e: unknown) => String(e));
  out("H2 · P2 options.defaultParams (lying proxy)", {
    outcome:
      typeof res === "string"
        ? res.slice(0, 90)
        : (res as { path?: string }).path,
  });

  const seen: string[] = [];
  Object.defineProperty(Object.prototype, "id", {
    configurable: true,
    get: (): unknown => "INHERITED",
    set(v: unknown) {
      seen.push(String(v));
    },
  });
  try {
    const r2 = createRouter([R("u", "/u/:id?tab")], {
      defaultRoute: "u",
      defaultParams: { id: "9" },
    } as never);
    await r2.start("/nope").catch(() => undefined);
    await r2.navigateToDefault().catch(() => undefined);
    out("H2 · P3 options.defaultParams (inherited setter under `id`)", {
      path: r2.getState()?.path,
      setterInvocations: seen,
    });
  } catch (error) {
    out("H2 · P3 THREW", String(error).slice(0, 120));
  } finally {
    delete (Object.prototype as Record<string, unknown>).id;
  }

  const evil = JSON.parse('{"__proto__": {"pwned": 3}, "id": "9"}') as Record<
    string,
    unknown
  >;
  const r3 = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: evil,
  } as never);
  await r3.start("/nope").catch(() => undefined);
  await r3.navigateToDefault().catch(() => undefined);
  out("H2 · P3 options.defaultParams (own __proto__)", {
    path: r3.getState()?.path,
    paramsKeys: Object.keys(r3.getState()?.params ?? {}),
    globalPolluted: ({} as Record<string, unknown>).pwned,
  });
}

// ---------------------------------------------------------------- SECTION I
// The lying proxy through the `update` door (PREPARE channel guard).
{
  const lying = new Proxy({ hidden: "LEAK" } as Record<string, unknown>, {
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({
      configurable: true,
      enumerable: true,
      value: "LEAK",
      writable: true,
    }),
    get: () => "LEAK",
    has: () => true,
  });
  const r = createRouter([R("u", "/u/:id?hidden")], {} as never);
  let outcome = "accepted";
  try {
    getRoutesApi(r).update("u", { defaultParams: lying } as never);
  } catch (error) {
    outcome = String(error).slice(0, 110);
  }
  out("I · update door · lying proxy in defaultParams", {
    outcome,
    href: r.buildPath("u", { id: "1" } as never),
  });
  // Control: an honest bag with a legally-channelled key is accepted.
  getRoutesApi(r).update("u", { defaultSearch: { hidden: "ok" } } as never);
  out(
    "I · control (honest defaultSearch)",
    r.buildPath("u", { id: "1" } as never),
  );
}

// ---------------------------------------------------------------- SECTION J
// Siblings, probed individually rather than by analogy.
// J1 — options.defaultSearch with the same lying Proxy (the params twin threw).
{
  const lying = new Proxy({ tab: "q" } as Record<string, unknown>, {
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => ({
      configurable: true,
      enumerable: true,
      value: "LEAK",
      writable: true,
    }),
    get: () => "LEAK",
    has: () => true,
  });
  const r = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: { id: "9" },
    defaultSearch: lying,
  } as never);
  await r.start("/nope").catch(() => undefined);
  const res = await r.navigateToDefault().catch((e: unknown) => String(e));
  out("J1 · P2 options.defaultSearch (lying proxy)", {
    outcome:
      typeof res === "string"
        ? res.slice(0, 90)
        : (res as { path?: string }).path,
    stateSearchKeys: Object.keys(r.getState()?.search ?? {}),
  });
}

// J2 — route defaultParams with a DRIFTING ownKeys (the defaultSearch twin was
// enumerated twice; is the path channel too?).
{
  let n = 0;
  const target: Record<string, unknown> = { id: "DRIFTED" };
  const drifting = new Proxy(target, {
    ownKeys(t) {
      n += 1;
      return n === 1 ? [] : Reflect.ownKeys(t);
    },
  });
  const r = createRouter(
    [R("u", "/u/:id?tab", { defaultParams: drifting })],
    {} as never,
  );
  const atReg = n;
  let href: string;
  try {
    href = r.buildPath("u", {} as never);
  } catch (error) {
    href = `THREW: ${String(error).slice(0, 60)}`;
  }
  out("J2 · P1-drift · route defaultParams", {
    atRegistration: atReg,
    onFrame: n - atReg,
    href,
  });
  // Control: honest bag, same intent.
  const honest = createRouter(
    [R("v", "/v/:id?tab", { defaultParams: { id: "DRIFTED" } })],
    {} as never,
  );
  out("J2 · control (honest)", honest.buildPath("v", {} as never));
}

// J3 — options.defaultParams / defaultSearch with a DRIFTING ownKeys.
{
  let n = 0;
  const drifting = new Proxy({ tab: "DRIFTED" } as Record<string, unknown>, {
    ownKeys(t) {
      n += 1;
      return n === 1 ? [] : Reflect.ownKeys(t);
    },
  });
  const r = createRouter([R("u", "/u/:id?tab")], {
    defaultRoute: "u",
    defaultParams: { id: "9" },
    defaultSearch: drifting,
  } as never);
  await r.start("/nope").catch(() => undefined);
  const atBoot = n;
  await r.navigateToDefault().catch(() => undefined);
  out("J3 · P1-drift · options.defaultSearch", {
    atBoot,
    onFrame: n - atBoot,
    path: r.getState()?.path,
  });
}
