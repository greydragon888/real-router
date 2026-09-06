// Census gap: RouteConfigUpdate.encodeParams·return / RouteConfigUpdate.decodeParams·return
// — the `{ params, search }` object an APPLICATION returns from a codec that was
// installed through `getRoutesApi().update(name, { encodeParams / decodeParams })`
// (wrapper: `routesStore.ts · commitScalarConfig`, the twin of
// `registerSingleRouteHandlers`). Consumers are the same two entry points as for
// a registration codec: `RoutesNamespace.buildPath` (href arc, via the port) and
// `RoutesNamespace.matchPath` (decoder, and the rewrite-arc encoder).
//
// Every section carries: proof the codec RAN (a counter), a positive control on a
// legal input through the same code, and the mechanism question — how many times
// each slot of the returned CONTAINER and each key of the returned LEAF bags is
// read, whether the container is copied before anything lands in core state, and
// whether core freezes what it did not build.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/codec-returns-update/probe-update-codec-returns.ts
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";

import {
  countingBag,
  countingProxy,
} from "../../../../packages/core/tests/helpers/hostileBags";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

type Bag = Record<string, unknown>;
type Channels = { params: Bag; search: Bag };
type AnyRouter = ReturnType<typeof createRouter>;

const out = (section: string, data: unknown): void => {
  console.log(`${section} ${JSON.stringify(data)}`);
};

const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);

const attempt = <T>(run: () => T): T | string => {
  try {
    return run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
];

const mkRouter = (options?: Bag): AnyRouter =>
  createRouter(ROUTES as never, (options ?? {}) as never);

// ─────────────────────────────────────────────────────────────────────────────
// §0 TOOL CONTROL — the update-installed wrapper is the one consulted.
// ─────────────────────────────────────────────────────────────────────────────
function section0(): void {
  // 0a — installed via update: runs; removed via `null`: stops running.
  {
    const router = mkRouter();
    let ran = 0;
    const hrefBefore = router.buildPath("u", { id: "1" }, { tab: "a" });

    getRoutesApi(router).update("u", {
      encodeParams: (ch: Channels): Channels => {
        ran += 1;

        return ch;
      },
    } as never);

    const hrefAfter = router.buildPath("u", { id: "1" }, { tab: "a" });
    const ranAfterInstall = ran;

    getRoutesApi(router).update("u", { encodeParams: null } as never);
    router.buildPath("u", { id: "1" }, { tab: "a" });

    out("§0a update-installed encoder runs / null removes it", {
      ranAfterInstall,
      ranAfterNull: ran - ranAfterInstall,
      hrefBefore,
      hrefAfter,
    });
    router.dispose();
  }

  // 0b — an update codec REPLACES a registration codec (one slot per route).
  {
    let regRan = 0;
    let updRan = 0;
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id?tab",
        encodeParams: (ch: Channels): Channels => {
          regRan += 1;

          return ch;
        },
      },
    ] as never);

    router.buildPath("u", { id: "1" });
    getRoutesApi(router).update("u", {
      encodeParams: (ch: Channels): Channels => {
        updRan += 1;

        return ch;
      },
    } as never);
    router.buildPath("u", { id: "1" });
    router.buildPath("u", { id: "1" });

    out("§0b update encoder replaces the registration encoder", {
      registrationEncoderRan: regRan,
      updateEncoderRan: updRan,
    });
    router.dispose();
  }

  // 0c — same for the decoder, on matchPath.
  {
    let regRan = 0;
    let updRan = 0;
    const router = createRouter([
      {
        name: "u",
        path: "/u/:id?tab",
        decodeParams: (ch: Channels): Channels => {
          regRan += 1;

          return ch;
        },
      },
    ] as never);

    getPluginApi(router).matchPath("/u/1");
    getRoutesApi(router).update("u", {
      decodeParams: (ch: Channels): Channels => {
        updRan += 1;

        return ch;
      },
    } as never);
    getPluginApi(router).matchPath("/u/1");
    getRoutesApi(router).update("u", { decodeParams: null } as never);
    getPluginApi(router).matchPath("/u/1");

    out("§0c update decoder replaces the registration decoder / null removes", {
      registrationDecoderRan: regRan,
      updateDecoderRan: updRan,
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 RouteConfigUpdate.encodeParams·return — href arc (router.buildPath)
// ─────────────────────────────────────────────────────────────────────────────
function encoderHrefArc(options: Bag | undefined, label: string): void {
  const RP = countingBag({ id: "9" });
  const RS = countingBag({ tab: "z", extra: "e" });
  const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
  let ran = 0;
  let input: Bag | undefined;
  const router = mkRouter(options);

  getRoutesApi(router).update("u", {
    encodeParams: (ch: Channels): Channels => {
      ran += 1;
      input = {
        paramsFrozen: Object.isFrozen(ch.params),
        searchFrozen: Object.isFrozen(ch.search),
        paramsKeys: Object.keys(ch.params),
        searchKeys: Object.keys(ch.search),
      };

      return wrapper.bag;
    },
  } as never);

  const callerParams = { id: "1" };
  const callerSearch = { tab: "a" };
  const href = router.buildPath("u", callerParams, callerSearch);

  out(label, {
    encoderRan: ran,
    encoderInput: input,
    href,
    wrapperReads: wrapper.reads,
    leafReads: { params: RP.reads, search: RS.reads },
    returnedFrozenAfter: {
      params: Object.isFrozen(RP.bag),
      search: Object.isFrozen(RS.bag),
    },
    callerBagsUntouched: {
      params: JSON.stringify(callerParams) === '{"id":"1"}',
      search: JSON.stringify(callerSearch) === '{"tab":"a"}',
    },
    "nothing landed (no state)": router.getState() === undefined,
  });
  router.dispose();
}

function section1(): void {
  // ⚠ The router's DEFAULT `queryParamsMode` is "loose" (OptionsNamespace
  // constants), so the no-options arm below IS the loose arm; the explicit
  // "default" arm is the one where the walk is driven by the route's declared
  // list and an undeclared key on the returned bag must never be read.
  encoderHrefArc(undefined, "§1a encodeParams·return via update — href arc, router default (= loose)");
  encoderHrefArc(
    { queryParamsMode: "loose" },
    "§1b encodeParams·return via update — href arc, loose mode (explicit)",
  );
  encoderHrefArc(
    { queryParamsMode: "default" },
    "§1f encodeParams·return via update — href arc, queryParamsMode \"default\" (declared-list walk)",
  );
  encoderHrefArc(
    { queryParamsMode: "strict" },
    "§1g encodeParams·return via update — href arc, queryParamsMode \"strict\"",
  );

  // 1c — P2 on the returned SEARCH bag in loose mode: enumeration is ownKeys, so
  // a Proxy that LIES on getOwnPropertyDescriptor for a key ownKeys never
  // vouched for is never asked. Control: a plain bag carrying the key prints it.
  {
    const target: Bag = { tab: "z" };
    const lying = new Proxy(target, {
      ownKeys: () => ["tab"],
      getOwnPropertyDescriptor: (t, k) =>
        k === "ghost"
          ? { value: "G", enumerable: true, configurable: true, writable: true }
          : Reflect.getOwnPropertyDescriptor(t, k),
      get: (t, k, r) => (k === "ghost" ? "G" : Reflect.get(t, k, r)),
    });
    const mk = (search: Bag): AnyRouter => {
      const router = mkRouter({ queryParamsMode: "loose" });

      getRoutesApi(router).update("u", {
        encodeParams: (ch: Channels): Channels => ({ params: ch.params, search }),
      } as never);

      return router;
    };
    const lyingRouter = mk(lying);
    const controlRouter = mk({ tab: "z", ghost: "G" });

    out("§1c P2 — lying descriptor Proxy on the returned search bag (loose)", {
      "hasOwn(lying, ghost) (fixture control)": Object.hasOwn(lying, "ghost"),
      hrefFromLyingProxy: attempt(() => lyingRouter.buildPath("u", { id: "1" })),
      CONTROL_hrefFromPlainBag: attempt(() =>
        controlRouter.buildPath("u", { id: "1" }),
      ),
    });
    lyingRouter.dispose();
    controlRouter.dispose();
  }

  // 1d — P3 on the WRITE the returned search bag drives: an own `__proto__` key
  // (as JSON.parse yields) is DEFINED into the query object, not assigned into
  // the inherited setter — observable as the key surviving into the href.
  {
    const router = mkRouter({ queryParamsMode: "loose" });
    const search = JSON.parse('{"__proto__":"x","tab":"z"}') as Bag;

    getRoutesApi(router).update("u", {
      encodeParams: (ch: Channels): Channels => ({ params: ch.params, search }),
    } as never);
    out("§1d P3 — own __proto__ key on the returned search bag (loose)", {
      "fixture has own __proto__": Object.hasOwn(search, "__proto__"),
      href: attempt(() => router.buildPath("u", { id: "1" })),
    });
    router.dispose();
  }

  // 1e — inherited keys on the returned bags are NOT supported input (owner
  // rule, own enumerable only): path slot throws, query key absent. Control
  // prints both.
  {
    const mk = (ret: () => Channels): AnyRouter => {
      const router = mkRouter();

      getRoutesApi(router).update("u", {
        encodeParams: (): Channels => ret(),
      } as never);

      return router;
    };
    const inhPath = mk(() => ({
      params: Object.create({ id: "9" }) as Bag,
      search: { tab: "z" },
    }));
    const inhQuery = mk(() => ({
      params: { id: "9" },
      search: Object.create({ tab: "z" }) as Bag,
    }));
    const control = mk(() => ({ params: { id: "9" }, search: { tab: "z" } }));

    out("§1e inherited keys on the returned bags vs CONTROL", {
      inheritedPathSlot: attempt(() => inhPath.buildPath("u", { id: "1" })),
      inheritedQueryKey: attempt(() => inhQuery.buildPath("u", { id: "1" })),
      CONTROL_own: attempt(() => control.buildPath("u", { id: "1" })),
    });
    inhPath.dispose();
    inhQuery.dispose();
    control.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 RouteConfigUpdate.encodeParams·return — matchPath rewrite arc
// ─────────────────────────────────────────────────────────────────────────────
function section2(): void {
  const RP = countingBag({ id: "77" });
  const RS = countingBag({ tab: "zz" });
  const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
  let ran = 0;
  let handedParams: object | undefined;
  let handedSearch: object | undefined;
  let handedFrozen: Bag | undefined;
  const router = mkRouter();

  getRoutesApi(router).update("u", {
    encodeParams: (ch: Channels): Channels => {
      ran += 1;
      handedParams = ch.params;
      handedSearch = ch.search;
      handedFrozen = {
        params: Object.isFrozen(ch.params),
        search: Object.isFrozen(ch.search),
      };

      return wrapper.bag;
    },
  } as never);

  const state = getPluginApi(router).matchPath("/u/1?tab=a");

  out("§2 encodeParams·return via update — matchPath rewrite arc", {
    encoderRan: ran,
    handedChannelsFrozen: handedFrozen,
    wrapperReads: wrapper.reads,
    leafReads: { params: RP.reads, search: RS.reads },
    landed:
      state === undefined
        ? "undefined"
        : {
            name: state.name,
            params: state.params,
            search: state.search,
            path: state.path,
          },
    identity: {
      "state.params === returned.params": state?.params === RP.bag,
      "state.search === returned.search": state?.search === RS.bag,
      "state.params === channels.params handed to the encoder (known door)":
        state?.params === handedParams,
      "state.search === channels.search handed to the encoder":
        state?.search === handedSearch,
    },
    returnedFrozenAfter: {
      params: Object.isFrozen(RP.bag),
      search: Object.isFrozen(RS.bag),
    },
  });
  router.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 RouteConfigUpdate.decodeParams·return — matchPath
// ─────────────────────────────────────────────────────────────────────────────
function decoderReturn(
  withValidator: boolean,
  returnedParams: Bag,
  label: string,
): void {
  const RP = countingBag(returnedParams);
  const RS = countingBag({ tab: "q" });
  const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
  let ran = 0;
  let input: Bag | undefined;
  const router = mkRouter();

  if (withValidator) {
    router.usePlugin(validationPlugin());
  }

  getRoutesApi(router).update("u", {
    decodeParams: (ch: Channels): Channels => {
      ran += 1;
      input = {
        paramsFrozen: Object.isFrozen(ch.params),
        searchFrozen: Object.isFrozen(ch.search),
        paramsKeys: Object.keys(ch.params),
        searchKeys: Object.keys(ch.search),
      };

      return wrapper.bag;
    },
  } as never);

  const state = attempt(() => getPluginApi(router).matchPath("/u/1?tab=w"));
  const landed =
    typeof state === "string" || state === undefined
      ? String(state)
      : {
          name: state.name,
          params: state.params,
          search: state.search,
          path: state.path,
        };
  const st = typeof state === "string" ? undefined : state;

  out(label, {
    decoderRan: ran,
    decoderInput: input,
    wrapperReads: wrapper.reads,
    leafReads: { params: RP.reads, search: RS.reads },
    landed,
    identity: {
      "state.params === returned.params": st?.params === RP.bag,
      "state.search === returned.search": st?.search === RS.bag,
    },
    frozen: {
      stateParams: st === undefined ? null : Object.isFrozen(st.params),
      stateSearch: st === undefined ? null : Object.isFrozen(st.search),
      returnedParamsAfter: Object.isFrozen(RP.bag),
      returnedSearchAfter: Object.isFrozen(RS.bag),
    },
  });
  router.dispose();
}

function section3(): void {
  decoderReturn(
    false,
    { id: "42" },
    "§3a decodeParams·return via update — bare core, plain return",
  );
  decoderReturn(
    false,
    { id: "42", tab: undefined },
    "§3b decodeParams·return via update — bare core, declared-query twin answering undefined",
  );
  decoderReturn(
    true,
    { id: "42", tab: undefined },
    "§3c decodeParams·return via update — validation-plugin, declared-query twin",
  );

  // 3d — P3 on the returned params: an own `__proto__` key (JSON.parse) is
  // dropped by normalizeChannel; the committed bag's prototype is intact.
  {
    const router = mkRouter();
    const params = JSON.parse('{"__proto__":{"x":1},"id":"5"}') as Bag;

    getRoutesApi(router).update("u", {
      decodeParams: (ch: Channels): Channels => ({ params, search: ch.search }),
    } as never);

    const state = getPluginApi(router).matchPath("/u/1");

    out("§3d P3 — own __proto__ key on the returned params bag", {
      "fixture has own __proto__": Object.hasOwn(params, "__proto__"),
      committedOwnKeys: state === undefined ? "undefined" : Object.keys(state.params),
      committedProtoIsObjectPrototype:
        state === undefined
          ? "undefined"
          : Object.getPrototypeOf(state.params) === Object.prototype,
      committedHasOwnProto:
        state === undefined ? "undefined" : Object.hasOwn(state.params, "__proto__"),
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 P1 by MUTATION — the read-index sweep on the decoder's return (bare core).
//    (a) the returned PARAMS bag: `tab` (declared ?query, riding in params)
//        answers `undefined` before read N and "SHIPPED" from read N on.
//    (b) the returned CONTAINER: `.params` answers a clean bag before read N
//        and a mis-channelled bag from read N on.
// ─────────────────────────────────────────────────────────────────────────────
function section4(): void {
  const describe = (result: unknown): unknown =>
    typeof result === "string"
      ? result
      : result === undefined
        ? "undefined"
        : {
            name: (result as { name: string }).name,
            params: (result as { params: Bag }).params,
            path: (result as { path: string }).path,
          };

  // 4a — leaf-level drift, flip at read N (1..4).
  for (const flipAt of [1, 2, 3, 4]) {
    const bag = countingProxy({ id: "42", tab: undefined } as Bag, (key, nth) =>
      key === "tab" ? (nth >= flipAt ? "SHIPPED" : undefined) : "42",
    );
    const router = mkRouter();

    getRoutesApi(router).update("u", {
      decodeParams: (ch: Channels): Channels => ({ params: bag.bag, search: ch.search }),
    } as never);

    const result = attempt(() => getPluginApi(router).matchPath("/u/1"));

    out(`§4a returned params · tab flips undefined→SHIPPED at read ${String(flipAt)}`, {
      readsOfTab: bag.reads.tab ?? 0,
      outcome: describe(result),
    });
    router.dispose();
  }

  // 4b — container-level drift, flip at read N (1..3).
  for (const flipAt of [1, 2, 3]) {
    const clean: Bag = { id: "42" };
    const dirty: Bag = { id: "42", tab: "LATE" };
    const wrapper = countingProxy({ params: clean, search: {} } as Bag, (key, nth) =>
      key === "params" ? (nth >= flipAt ? dirty : clean) : {},
    );
    const router = mkRouter();

    getRoutesApi(router).update("u", {
      decodeParams: (): Channels => wrapper.bag as Channels,
    } as never);

    const result = attempt(() => getPluginApi(router).matchPath("/u/1"));

    out(`§4b returned container · .params flips clean→mis-channelled at read ${String(flipAt)}`, {
      readsOfParamsSlot: wrapper.reads.params ?? 0,
      outcome: describe(result),
    });
    router.dispose();
  }

  // 4c — CONTROL: a stable mis-channelled return is refused at the decoder's own
  // check, naming the decoder; a stable clean one commits.
  {
    const mk = (params: Bag): AnyRouter => {
      const router = mkRouter();

      getRoutesApi(router).update("u", {
        decodeParams: (ch: Channels): Channels => ({ params, search: ch.search }),
      } as never);

      return router;
    };
    const bad = mk({ id: "42", tab: "STABLE" });
    const good = mk({ id: "42" });

    out("§4c CONTROL — stable mis-channelled vs clean decoder return", {
      stableMisChannelled: describe(attempt(() => getPluginApi(bad).matchPath("/u/1"))),
      CONTROL_clean: describe(attempt(() => getPluginApi(good).matchPath("/u/1"))),
    });
    bad.dispose();
    good.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §5 SAME FAMILY — identical codecs installed at REGISTRATION give identical
//    counts (the door has two entry symbols and one mechanism).
// ─────────────────────────────────────────────────────────────────────────────
function section5(): void {
  // encoder, href arc
  {
    const RP = countingBag({ id: "9" });
    const RS = countingBag({ tab: "z", extra: "e" });
    const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "u",
          path: "/u/:id?tab",
          encodeParams: (): Channels => wrapper.bag,
        },
      ] as never,
    );
    const href = router.buildPath("u", { id: "1" }, { tab: "a" });

    out("§5a CONTROL registration encoder — href arc, default mode", {
      href,
      wrapperReads: wrapper.reads,
      leafReads: { params: RP.reads, search: RS.reads },
    });
    router.dispose();
  }

  // decoder, twin answering undefined
  {
    const RP = countingBag({ id: "42", tab: undefined });
    const RS = countingBag({ tab: "q" });
    const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "u",
          path: "/u/:id?tab",
          decodeParams: (): Channels => wrapper.bag,
        },
      ] as never,
    );
    const state = getPluginApi(router).matchPath("/u/1?tab=w");

    out("§5b CONTROL registration decoder — declared-query twin", {
      wrapperReads: wrapper.reads,
      leafReads: { params: RP.reads, search: RS.reads },
      "state.params === returned.params": state?.params === RP.bag,
      landed: state === undefined ? "undefined" : { params: state.params, search: state.search, path: state.path },
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §6 THIRD ENTRY — cloneRouter carries the update-installed WRAPPER by
//    reference (assignConfigEntries), so the clone reaches the same door.
// ─────────────────────────────────────────────────────────────────────────────
function section6(): void {
  const base = mkRouter();
  let ran = 0;
  const appEncoder = (ch: Channels): Channels => {
    ran += 1;

    return ch;
  };

  getRoutesApi(base).update("u", { encodeParams: appEncoder } as never);

  const clone = attempt(() => cloneRouter(base));

  if (typeof clone === "string") {
    out("§6 cloneRouter", { cloneFailed: clone });
    base.dispose();

    return;
  }

  const ranBefore = ran;
  const cloneHref = attempt(() => clone.buildPath("u", { id: "3" }, { tab: "c" }));
  const ranByClone = ran - ranBefore;
  const baseWrapper = getRoutesApi(base).get("u")?.encodeParams;
  const cloneWrapper = getRoutesApi(clone).get("u")?.encodeParams;

  getRoutesApi(base).update("u", { encodeParams: null } as never);

  const ranBeforeAfterNull = ran;

  clone.buildPath("u", { id: "3" }, { tab: "c" });

  out("§6 cloneRouter carries the update-installed wrapper", {
    cloneHref,
    encoderRanOnCloneBuildPath: ranByClone,
    "clone.get().encodeParams === base.get().encodeParams (same wrapper)":
      cloneWrapper !== undefined && cloneWrapper === baseWrapper,
    "wrapper is not the application's function": baseWrapper !== appEncoder,
    "clone still runs encoder after base update(null)": ran - ranBeforeAfterNull,
  });
  clone.dispose();
  base.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// §7 HAND-OUTS of the codec slot (leaf, not container): RoutesApi.get hands the
//    WRAPPER; the TREE_CHANGED "update" patch hands the application's own
//    function; the wrapper's `?? channels` fallback hands the INPUT back.
// ─────────────────────────────────────────────────────────────────────────────
function section7(): void {
  const router = mkRouter();
  const appEncoder = (): null => null;
  let patchSeen: Bag | undefined;

  getRoutesApi(router).subscribeChanges((event) => {
    if (event.op === "update") {
      patchSeen = event.patch as Bag;
    }
  });
  getRoutesApi(router).update("u", { encodeParams: appEncoder } as never);

  const handed = getRoutesApi(router).get("u")?.encodeParams as
    | ((ch: Channels) => Channels)
    | undefined;
  const input: Channels = { params: { id: "1" }, search: {} };
  const viaWrapper = handed === undefined ? undefined : handed(input);

  out("§7 codec slot hand-outs", {
    "get().encodeParams === app function": handed === appEncoder,
    "get().encodeParams is a function (wrapper)": typeof handed,
    "TREE_CHANGED patch.encodeParams === app function": patchSeen?.encodeParams === appEncoder,
    "patch frozen": patchSeen === undefined ? "no event" : Object.isFrozen(patchSeen),
    "wrapper(input) === input when app returns null (?? channels)": viaWrapper === input,
  });
  router.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// §8 SIBLING — RoutesApi.update·updates.<customField>: container copied
//    (putField into a fresh record), leaf by reference, patch read once per key.
// ─────────────────────────────────────────────────────────────────────────────
function section8(withValidator: boolean, label: string): void {
  const router = createRouter(
    [{ name: "u", path: "/u/:id?tab", seed: { s: 0 } }] as never,
  );

  if (withValidator) {
    router.usePlugin(validationPlugin());
  }

  const leaf = { a: 1 };
  const patch = countingBag({ zz: leaf, yy: 2 } as Bag);

  getRoutesApi(router).update("u", patch.bag as never);

  const record = getPluginApi(router).getRouteConfig("u") as Bag;

  (patch.bag as Bag).late = "L";

  const proto = JSON.parse('{"__proto__":{"x":1},"keep":1}') as Bag;

  getRoutesApi(router).update("u", proto as never);

  const record2 = getPluginApi(router).getRouteConfig("u") as Bag;

  out(label, {
    patchReadsPerKey: patch.reads,
    "record !== patch (container copied)": record !== (patch.bag as unknown),
    "record.zz === leaf (leaf by reference)": record.zz === leaf,
    "seed custom field from registration kept": JSON.stringify(record.seed),
    "late key on the patch invisible": !("late" in record),
    recordFrozen: Object.isFrozen(record),
    patchFrozenAfter: Object.isFrozen(patch.bag),
    "record replaced on next update (clone-on-write)": record2 !== record,
    "__proto__ own key from JSON.parse survives as own key": Object.hasOwn(record2, "__proto__"),
    "record2 prototype intact": Object.getPrototypeOf(record2) === Object.prototype,
    record2OwnKeys: Object.keys(record2),
  });
  router.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// §9 NON-CONTAINER returns (degrade shapes, bare core) — recorded because the
//    wrapper's `??` catches only null/undefined.
// ─────────────────────────────────────────────────────────────────────────────
function section9(): void {
  const mkEnc = (ret: unknown): AnyRouter => {
    const router = mkRouter();

    getRoutesApi(router).update("u", { encodeParams: () => ret } as never);

    return router;
  };
  const mkDec = (ret: unknown): AnyRouter => {
    const router = mkRouter();

    getRoutesApi(router).update("u", { decodeParams: () => ret } as never);

    return router;
  };
  const encStr = mkEnc("str");
  const encNull = mkEnc(null);
  const decStr = mkDec("str");
  const decArr = mkDec({ params: ["a"], search: {} });
  const decNull = mkDec(null);
  const st = (r: unknown): unknown =>
    typeof r === "string" || r === undefined
      ? String(r)
      : { params: (r as { params: Bag }).params, path: (r as { path: string }).path };

  out("§9 non-container codec returns (bare core)", {
    "encoder returns 'str'": attempt(() => encStr.buildPath("u", { id: "1" })),
    "encoder returns null (fallback = input)": attempt(() => encNull.buildPath("u", { id: "1" }, { tab: "t" })),
    "decoder returns 'str'": st(attempt(() => getPluginApi(decStr).matchPath("/u/1"))),
    "decoder returns params ARRAY": st(attempt(() => getPluginApi(decArr).matchPath("/u/1"))),
    "decoder returns null (fallback = input)": st(attempt(() => getPluginApi(decNull).matchPath("/u/1?tab=w"))),
  });
  for (const r of [encStr, encNull, decStr, decArr, decNull]) {
    r.dispose();
  }
}

function main(): void {
  section0();
  section1();
  section2();
  section3();
  section4();
  section5();
  section6();
  section7();
  section8(false, "§8a update·updates.<customField> — bare core");
  section8(true, "§8b update·updates.<customField> — validation-plugin");
  section9();
  console.log("PROBE DONE");
}

try {
  main();
} catch (e) {
  console.log(`PROBE FAILED ${errText(e)}`);
  process.exitCode = 1;
}
