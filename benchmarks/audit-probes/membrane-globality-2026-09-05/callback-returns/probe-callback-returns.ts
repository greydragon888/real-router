// L6-callback-returns — the objects an APPLICATION returns from a callback and
// core then CONSUMES. One family probe, one section per door. Every section
// carries (a) a proof the callback RAN (a call counter), (b) a positive control
// on a legal input through the same code, and (c) the mechanism question:
// is the returned CONTAINER copied (identity differs from what lands in core
// state) or held by reference, and how many times is each key read.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/callback-returns/probe-callback-returns.ts
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import {
  countingBag,
  countingProxy,
  driftingBag,
} from "../../../../packages/core/tests/helpers/hostileBags";

type AnyRouter = ReturnType<typeof createRouter>;

const out = (section: string, data: unknown): void => {
  console.log(`${section} ${JSON.stringify(data)}`);
};

const errText = (e: unknown): string =>
  e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);

const attempt = async <T>(run: () => T | Promise<T>): Promise<T | string> => {
  try {
    return await run();
  } catch (e) {
    return `THREW ${errText(e)}`;
  }
};

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
];

// ─────────────────────────────────────────────────────────────────────────────
// A. DefaultParamsCallback / DefaultSearchCallback → Params / SearchParams
//    (Options.defaultParams / Options.defaultSearch, consumed by navigateToDefault)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionA(): Promise<void> {
  // A1 — plain: the returned containers are copied before landing in state.
  {
    const P = countingBag({ id: "7" });
    const S = countingBag({ tab: "x" });
    const calls = { params: 0, search: 0 };
    const router = createRouter(ROUTES as never, {
      defaultRoute: "u",
      defaultParams: () => {
        calls.params += 1;

        return P.bag;
      },
      defaultSearch: () => {
        calls.search += 1;

        return S.bag;
      },
    } as never);

    await router.start("/home");

    const state = await router.navigateToDefault();

    out("A1 defaultParams/defaultSearch callback returns (no interceptor)", {
      callbacksRan: calls,
      readsPerKey: { params: P.reads, search: S.reads },
      landed: { params: state.params, search: state.search, path: state.path },
      identity: {
        "state.params === returnedParams": state.params === P.bag,
        "state.search === returnedSearch": state.search === S.bag,
      },
      frozen: {
        params: Object.isFrozen(state.params),
        search: Object.isFrozen(state.search),
        returnedParamsBag: Object.isFrozen(P.bag),
        returnedSearchBag: Object.isFrozen(S.bag),
      },
    });
    router.dispose();
  }

  // A2 — same door WITH a pass-through forwardState interceptor on the seam
  // (#1849 snapshot): the returned bag must still be read once per key.
  {
    const P = countingBag({ id: "7" });
    const S = countingBag({ tab: "x" });
    const router = createRouter(ROUTES as never, {
      defaultRoute: "u",
      defaultParams: () => P.bag,
      defaultSearch: () => S.bag,
    } as never);
    let interceptorSawCallersObject = { params: false, search: false };

    getPluginApi(router).addInterceptor("forwardState", (next, name, p, s) => {
      interceptorSawCallersObject = { params: p === P.bag, search: s === S.bag };
      void (p as Record<string, unknown>).id;
      void (s as Record<string, unknown> | undefined)?.tab;

      return next(name, p, s);
    });

    await router.start("/home");

    const state = await router.navigateToDefault();

    out("A2 same, interceptor on the seam (reads and forwards)", {
      readsPerKey: { params: P.reads, search: S.reads },
      interceptorSawCallersObject,
      landed: { params: state.params, search: state.search, path: state.path },
    });
    router.dispose();
  }

  // A3 — a DECLARED query key (`tab`) riding in the returned PARAMS bag, stable
  // value: where is it refused, and how many reads did it take.
  {
    const P = countingBag({ id: "7", tab: "y" });
    const router = createRouter(ROUTES as never, {
      defaultRoute: "u",
      defaultParams: () => P.bag,
    } as never);

    await router.start("/home");

    const outcome = await attempt(() => router.navigateToDefault());

    out("A3 declared query key in returned params (stable)", {
      outcome: typeof outcome === "string" ? outcome : "COMMITTED",
      readsPerKey: P.reads,
      stateAfter: router.getState()?.name,
    });
    router.dispose();
  }

  // A4 — the same key DRIFTING: `undefined` on read 1, "SHIPPED" from read 2.
  // The count tells how many independent readers the returned bag has before it
  // is copied; the outcome tells who catches the drift.
  {
    const P = driftingBag<{ id: string; tab: string | undefined }>(
      { id: "7", tab: undefined },
      { tab: "SHIPPED" },
    );
    const router = createRouter(ROUTES as never, {
      defaultRoute: "u",
      defaultParams: () => P.bag,
    } as never);

    await router.start("/home");

    const outcome = await attempt(() => router.navigateToDefault());

    out("A4 declared query key in returned params (drifting undefined→SHIPPED)", {
      outcome: typeof outcome === "string" ? outcome : "COMMITTED",
      readsPerKey: P.reads,
      stateAfter: {
        name: router.getState()?.name,
        params: router.getState()?.params,
      },
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B. Route.encodeParams → ParamsSearch (consumed by RoutesNamespace.buildPath
//    on the href arc, and by RoutesNamespace.matchPath on the rewrite arc)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionB(): Promise<void> {
  // B1 — href arc: the returned wrapper and its bags are read by NAME, never
  // copied; nothing lands in state (the product is a string).
  {
    const RP = countingBag({ id: "9" });
    const RS = countingBag({ tab: "z" });
    const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
    let ran = 0;
    let inputIdentity = { params: false, search: false };
    const callerParams = { id: "1" };
    const callerSearch = { tab: "a" };
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        {
          name: "e",
          path: "/e/:id?tab",
          encodeParams: (ch: { params: object; search: object }) => {
            ran += 1;
            inputIdentity = {
              params: ch.params === callerParams,
              search: ch.search === callerSearch,
            };

            return wrapper.bag;
          },
        },
      ] as never,
    );

    const href = router.buildPath("e", callerParams, callerSearch);

    out("B1 encodeParams return on buildPath (href arc)", {
      encoderRan: ran,
      encoderInputIsCallersObject: inputIdentity,
      wrapperReads: wrapper.reads,
      returnedBagReads: { params: RP.reads, search: RS.reads },
      href,
    });
    router.dispose();
  }

  // B2 — INVARIANTS "Supported input shapes" row 2: an inherited key on the
  // codec's RETURN is not supported input (throws on the path channel, absent
  // on the query channel). Control: own-keyed return prints both.
  {
    const mk = (
      ret: () => { params: object; search: object },
    ): AnyRouter =>
      createRouter(
        [
          {
            name: "e",
            path: "/e/:id?tab",
            encodeParams: () => ret(),
          },
        ] as never,
      );

    const inheritedPath = mk(() => ({
      params: Object.create({ id: "9" }) as object,
      search: { tab: "z" },
    }));
    const inheritedQuery = mk(() => ({
      params: { id: "9" },
      search: Object.create({ tab: "z" }) as object,
    }));
    const control = mk(() => ({ params: { id: "9" }, search: { tab: "z" } }));

    out("B2 encodeParams return with INHERITED keys (seed: INVARIANTS row 2)", {
      inheritedPathKey: await attempt(() => inheritedPath.buildPath("e", { id: "1" })),
      inheritedQueryKey: await attempt(() => inheritedQuery.buildPath("e", { id: "1" })),
      CONTROL_ownKeys: await attempt(() => control.buildPath("e", { id: "1" })),
    });
    inheritedPath.dispose();
    inheritedQuery.dispose();
    control.dispose();
  }

  // B3 — rewrite arc (matchPath): what the encoder is HANDED is core's live
  // `canonical.path`, and the same object becomes `state.params` — a hand-out
  // that core reads back. A write into it lands in the committed channel.
  {
    let handed: object | undefined;
    let ran = 0;
    const router = createRouter(
      [
        {
          name: "e",
          path: "/e/:id?tab",
          encodeParams: (ch: { params: Record<string, unknown>; search: object }) => {
            ran += 1;
            handed = ch.params;
            ch.params.injected = "X";

            return ch;
          },
        },
      ] as never,
    );
    const state = getPluginApi(router).matchPath("/e/5");

    out("B3 encodeParams INPUT on matchPath — hand-out read back (round-trip)", {
      encoderRan: ran,
      "state.params === object handed to encoder": state?.params === handed,
      handedFrozenAfter: handed === undefined ? null : Object.isFrozen(handed),
      landed: { params: state?.params, search: state?.search, path: state?.path },
    });
    router.dispose();
  }

  // B4 — the same hand-out, writing a DECLARED query key into the path channel
  // AFTER the shipped-channel check already ran on that object.
  {
    const router = createRouter(
      [
        {
          name: "e",
          path: "/e/:id?tab",
          encodeParams: (ch: { params: Record<string, unknown>; search: object }) => {
            ch.params.tab = "LATE";

            return ch;
          },
        },
      ] as never,
    );
    const state = getPluginApi(router).matchPath("/e/5");

    out("B4 encodeParams on matchPath writes declared query key into params", {
      landed: { params: state?.params, search: state?.search, path: state?.path },
      pathShowsTab: state?.path.includes("tab=") ?? null,
    });
    router.dispose();
  }

  // B5 — CONTROL for B3/B4: on the href arc the encoder input is a SPREAD, so
  // the same in-place write reaches neither the caller's bag nor anything else.
  {
    const callerParams: Record<string, unknown> = { id: "5" };
    const router = createRouter(
      [
        {
          name: "e",
          path: "/e/:id?tab",
          encodeParams: (ch: { params: Record<string, unknown>; search: object }) => {
            ch.params.injected = "X";

            return ch;
          },
        },
      ] as never,
    );
    const href = router.buildPath("e", callerParams);

    out("B5 CONTROL — same write on the href arc", {
      href,
      callerBagAfter: callerParams,
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C. Route.decodeParams → ParamsSearch (consumed by RoutesNamespace.matchPath)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionC(): Promise<void> {
  // C1 — the returned wrapper's `.params`/`.search` reads, the returned bags'
  // per-key reads, and whether the container is copied before `state.params`.
  {
    const RP = countingBag({ id: "42" });
    const RS = countingBag({ tab: "q" });
    const wrapper = countingProxy({ params: RP.bag, search: RS.bag });
    let ran = 0;
    let handedFrozen: { params: boolean; search: boolean } | undefined;
    const router = createRouter(
      [
        {
          name: "d",
          path: "/d/:id?tab",
          decodeParams: (ch: { params: object; search: object }) => {
            ran += 1;
            handedFrozen = {
              params: Object.isFrozen(ch.params),
              search: Object.isFrozen(ch.search),
            };

            return wrapper.bag;
          },
        },
      ] as never,
    );
    const state = getPluginApi(router).matchPath("/d/1?tab=w");

    out("C1 decodeParams return on matchPath", {
      decoderRan: ran,
      decoderInputFrozen: handedFrozen,
      wrapperReads: wrapper.reads,
      returnedBagReads: { params: RP.reads, search: RS.reads },
      identity: {
        "state.params === returnedParams": state?.params === RP.bag,
        "state.search === returnedSearch": state?.search === RS.bag,
      },
      landed: { params: state?.params, search: state?.search, path: state?.path },
    });
    router.dispose();
  }

  // C2 — inherited keys on the decoder's RETURN are dropped (copied by
  // normalizeChannel); control: own keys land.
  {
    const mk = (ret: () => { params: object; search: object }): AnyRouter =>
      createRouter(
        [{ name: "d", path: "/d/:id?tab", decodeParams: () => ret() }] as never,
      );
    const inherited = mk(() => ({
      params: Object.create({ id: "42" }) as object,
      search: Object.create({ tab: "q" }) as object,
    }));
    const control = mk(() => ({ params: { id: "42" }, search: { tab: "q" } }));
    const s1 = getPluginApi(inherited).matchPath("/d/1?tab=w");
    const s2 = getPluginApi(control).matchPath("/d/1?tab=w");

    out("C2 decodeParams return with INHERITED keys vs CONTROL", {
      inherited: s1 === undefined ? "undefined" : { params: s1.params, search: s1.search, path: s1.path },
      CONTROL_ownKeys: s2 === undefined ? "undefined" : { params: s2.params, search: s2.search, path: s2.path },
    });
    inherited.dispose();
    control.dispose();
  }

  // C3 — a declared query key riding in the decoder's returned PARAMS, drifting:
  // how many readers before the copy, and who catches it.
  {
    const RP = driftingBag<{ id: string; tab: string | undefined }>(
      { id: "42", tab: undefined },
      { tab: "SHIPPED" },
    );
    const router = createRouter(
      [
        {
          name: "d",
          path: "/d/:id?tab",
          decodeParams: () => ({ params: RP.bag, search: {} }),
        },
      ] as never,
    );
    const outcome = await attempt(() => getPluginApi(router).matchPath("/d/1"));

    out("C3 decodeParams returned params carrying declared query key (drifting)", {
      outcome:
        typeof outcome === "string"
          ? outcome
          : outcome === undefined
            ? "undefined"
            : { params: outcome.params, path: outcome.path },
      readsPerKey: RP.reads,
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D. InterceptorFn<"forwardState"> → SimpleState (navigate seam + buildPath seam)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionD(): Promise<void> {
  // D1 — navigate seam: the interceptor's own object replaces the chain result.
  {
    const RP = countingBag({ id: "7" });
    const RS = countingBag({ tab: "x" });
    const wrapper = countingProxy({ name: "u", params: RP.bag, search: RS.bag });
    const router = createRouter(ROUTES as never);
    let ran = 0;
    let nextResult: { params: unknown; search: unknown } | undefined;
    const callerParams = { id: "1" };
    const callerSearch = { tab: "a" };
    let argIdentity = { params: false, search: false };

    // Installed AFTER start(): the seam also runs on start()'s matchPath, and a
    // replacing interceptor would otherwise rewrite the boot state itself.
    await router.start("/home");

    getPluginApi(router).addInterceptor("forwardState", (next, name, p, s) => {
      ran += 1;
      argIdentity = { params: p === callerParams, search: s === callerSearch };
      nextResult = next(name, p, s) as { params: unknown; search: unknown };

      return wrapper.bag as never;
    });

    const state = await router.navigate("u", callerParams, callerSearch);

    out("D1 forwardState interceptor return on navigate", {
      interceptorRan: ran,
      interceptorArgIsCallersObject: argIdentity,
      "next() result bags === interceptor args (pass-through, #1986)": {
        params: nextResult?.params === undefined ? null : "see D3",
      },
      wrapperReads: wrapper.reads,
      returnedBagReads: { params: RP.reads, search: RS.reads },
      identity: {
        "state.params === returnedParams": state.params === RP.bag,
        "state.search === returnedSearch": state.search === RS.bag,
      },
      landed: { params: state.params, search: state.search, path: state.path },
    });
    router.dispose();
  }

  // D2 — buildPath seam (literal, no channel assert, no exit sanitiser).
  {
    const RP = countingBag({ id: "7" });
    const RS = countingBag({ tab: "x" });
    const wrapper = countingProxy({ name: "u", params: RP.bag, search: RS.bag });
    const router = createRouter(ROUTES as never);
    let ran = 0;

    getPluginApi(router).addInterceptor("forwardState", () => {
      ran += 1;

      return wrapper.bag as never;
    });

    const href = router.buildPath("u", { id: "1" }, { tab: "a" });

    out("D2 forwardState interceptor return on buildPath", {
      interceptorRan: ran,
      wrapperReads: wrapper.reads,
      returnedBagReads: { params: RP.reads, search: RS.reads },
      href,
    });
    router.dispose();
  }

  // D3 — what `next()` hands the interceptor on the no-forward path: the bags
  // it was given, by identity (pass-through), not the caller's own (snapshot).
  {
    const router = createRouter(ROUTES as never);
    const callerParams = { id: "1" };
    const callerSearch = { tab: "a" };
    let report: Record<string, boolean> = {};

    await router.start("/home");
    getPluginApi(router).addInterceptor("forwardState", (next, name, p, s) => {
      const r = next(name, p, s) as { params: unknown; search: unknown };

      report = {
        "next().params === arg params": r.params === p,
        "next().search === arg search": r.search === s,
        "arg params === caller's bag": p === callerParams,
        "arg search === caller's bag": s === callerSearch,
      };

      return r as never;
    });
    await router.navigate("u", callerParams, callerSearch);
    out("D3 next() pass-through identity on the no-forward path", report);
    router.dispose();
  }

  // D4 — a declared query key in the interceptor's returned PARAMS, stable and
  // drifting: readers before the copy, and who refuses.
  {
    const stable = countingBag({ id: "7", tab: "y" });
    const router = createRouter(ROUTES as never);

    await router.start("/home");
    getPluginApi(router).addInterceptor(
      "forwardState",
      () => ({ name: "u", params: stable.bag, search: {} }) as never,
    );

    const outcome = await attempt(() => router.navigate("u", { id: "1" }));

    out("D4a interceptor returns declared query key in params (stable)", {
      outcome: typeof outcome === "string" ? outcome : "COMMITTED",
      readsPerKey: stable.reads,
    });
    router.dispose();

    const drifting = driftingBag<{ id: string; tab: string | undefined }>(
      { id: "7", tab: undefined },
      { tab: "SHIPPED" },
    );
    const router2 = createRouter(ROUTES as never);

    await router2.start("/home");
    getPluginApi(router2).addInterceptor(
      "forwardState",
      () => ({ name: "u", params: drifting.bag, search: {} }) as never,
    );

    const outcome2 = await attempt(() => router2.navigate("u", { id: "1" }));

    out("D4b interceptor returns declared query key in params (drifting)", {
      outcome: typeof outcome2 === "string" ? outcome2 : "COMMITTED",
      readsPerKey: drifting.reads,
      stateAfter: { name: router2.getState()?.name, params: router2.getState()?.params },
    });
    router2.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// E. PluginFactory → Plugin (consumed by PluginsNamespace.#startPlugin)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionE(): Promise<void> {
  // E1 — reads per hook key on the RETURNED object, at registration and at
  // unsubscribe; and whether core freezes the object it did not create.
  {
    const target = {
      onTransitionSuccess: (): void => {},
      teardown: (): void => {},
    };
    const plugin = countingProxy(target);
    const router = createRouter(ROUTES as never);
    let factoryRan = 0;
    const unsub = router.usePlugin(() => {
      factoryRan += 1;

      return plugin.bag as never;
    });
    const readsAfterUse = { ...plugin.reads };
    const frozenAfterUse = Object.isFrozen(target);

    unsub();

    out("E1 PluginFactory return — reads per key and freeze", {
      factoryRan,
      readsAfterUsePlugin: readsAfterUse,
      readsAfterUnsubscribe: plugin.reads,
      "core froze the application's object": frozenAfterUse,
    });
    router.dispose();
  }

  // E2 — a plain object returned by the factory is frozen by core (P4 level).
  {
    const plugin = { onTransitionSuccess: (): void => {} };
    const router = createRouter(ROUTES as never);
    const before = Object.isFrozen(plugin);

    router.usePlugin(() => plugin as never);
    out("E2 plain plugin object frozen by core", {
      frozenBefore: before,
      frozenAfter: Object.isFrozen(plugin),
    });
    router.dispose();
  }

  // E3 — an INHERITED hook (prototype-carried) is registered: `in` walks the
  // chain. Control: own hook.
  {
    let inheritedCalls = 0;
    let ownCalls = 0;
    const inheritedPlugin = Object.create({
      onTransitionSuccess: (): void => {
        inheritedCalls += 1;
      },
    }) as object;
    const router = createRouter(ROUTES as never);

    router.usePlugin(() => inheritedPlugin as never);
    router.usePlugin(
      () =>
        ({
          onTransitionSuccess: (): void => {
            ownCalls += 1;
          },
        }) as never,
    );
    await router.start("/home");
    await router.navigate("u", { id: "1" });
    out("E3 inherited hook on the returned plugin object", {
      inheritedHookCalls: inheritedCalls,
      CONTROL_ownHookCalls: ownCalls,
      ownKeysOfInheritedPlugin: Object.keys(inheritedPlugin),
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// F. GuardFn → boolean | Promise<boolean> (thenable consumed by guardPhase)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionF(): Promise<void> {
  // F1 — a NON-Promise thenable resolving to false: is it awaited or treated as
  // a truthy sync verdict? Control: a native Promise<false> refuses.
  {
    const router = createRouter(ROUTES as never);
    let thenCalls = 0;

    getLifecycleApi(router).addActivateGuard("u", () => () => {
      return {
        then(resolve: (v: boolean) => void): void {
          thenCalls += 1;
          resolve(false);
        },
      } as never;
    });
    await router.start("/home");

    const outcome = await attempt(() => router.navigate("u", { id: "1" }));

    out("F1 guard returns a non-Promise thenable resolving to false", {
      outcome: typeof outcome === "string" ? outcome : `COMMITTED ${outcome.name}`,
      thenCalls,
      stateAfter: router.getState()?.name,
    });
    router.dispose();

    const control = createRouter(ROUTES as never);

    getLifecycleApi(control).addActivateGuard("u", () => () => Promise.resolve(false));
    await control.start("/home");

    const ctrl = await attempt(() => control.navigate("u", { id: "1" }));

    out("F1 CONTROL native Promise<false>", {
      outcome: typeof ctrl === "string" ? ctrl : `COMMITTED ${ctrl.name}`,
      stateAfter: control.getState()?.name,
    });
    control.dispose();
  }

  // F2 — a Promise SUBCLASS with an instrumented `then`: how many times core
  // calls into it while awaiting the verdict.
  {
    let thenCalls = 0;

    class Spy<T> extends Promise<T> {
      override then<A = T, B = never>(
        onF?: ((v: T) => A | PromiseLike<A>) | null,
        onR?: ((r: unknown) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        thenCalls += 1;

        return super.then(onF, onR);
      }
    }
    const router = createRouter(ROUTES as never);

    getLifecycleApi(router).addActivateGuard(
      "u",
      () => () => Spy.resolve(true) as never,
    );
    await router.start("/home");

    const outcome = await attempt(() => router.navigate("u", { id: "1" }));

    out("F2 guard returns a Promise subclass — then() calls during await", {
      outcome: typeof outcome === "string" ? outcome : `COMMITTED ${outcome.name}`,
      thenCalls,
    });
    router.dispose();
  }

  // F3 — CONTROL: the sync predicate refuses a promise-returning guard.
  {
    const router = createRouter(ROUTES as never);

    getLifecycleApi(router).addActivateGuard("u", () => () => Promise.resolve(true));
    await router.start("/home");
    out("F3 CONTROL canNavigateTo with a Promise-returning guard", {
      canNavigateTo: router.canNavigateTo("u", { id: "1" }),
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// G. LeaveFn → void | Promise<void> (thenable consumed by awaitLeaveListeners)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionG(): Promise<void> {
  const router = createRouter(ROUTES as never);
  let thenCalls = 0;
  let listenerRan = 0;

  router.subscribeLeave(() => {
    listenerRan += 1;

    return {
      then(resolve: () => void): void {
        thenCalls += 1;
        setTimeout(resolve, 0);
      },
    } as never;
  });
  await router.start("/home");

  const outcome = await attempt(() => router.navigate("u", { id: "1" }));

  out("G1 subscribeLeave listener returns a non-Promise thenable", {
    listenerRan,
    thenCalls,
    outcome: typeof outcome === "string" ? outcome : `COMMITTED ${outcome.name}`,
  });
  router.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// H. InterceptorFn<"start"> → Promise<State> (consumed by Router.#runStart)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionH(): Promise<void> {
  // H1 — the resolved value is handed to the caller untouched; core commits
  // through navigateToState inside next(), never from the interceptor's promise.
  {
    const router = createRouter(ROUTES as never);
    let ran = 0;
    const foreign = { foreign: true };

    getPluginApi(router).addInterceptor("start", async (next, path) => {
      ran += 1;
      await next(path);

      return foreign as never;
    });

    const resolved = (await router.start("/home")) as unknown;

    out("H1 start interceptor resolves a foreign object", {
      interceptorRan: ran,
      "start() resolved with the interceptor's object": resolved === foreign,
      committed: router.getState()?.name,
      "committed === resolved": router.getState() === resolved,
    });
    router.dispose();
  }

  // H2 — a non-thenable return is refused (start rejects, router recoverable).
  {
    const router = createRouter(ROUTES as never);

    getPluginApi(router).addInterceptor("start", () => undefined as never);

    const outcome = await attempt(() => router.start("/home"));

    out("H2 start interceptor returns a non-thenable", {
      outcome: typeof outcome === "string" ? outcome : "RESOLVED",
      isActive: router.isActive(),
    });
    router.dispose();
  }

  // H3 — a non-Promise thenable is accepted (duck-typed), and its `then` is
  // called by core's `.catch` chaining.
  {
    const router = createRouter(ROUTES as never);
    let thenCalls = 0;

    getPluginApi(router).addInterceptor("start", (next, path) => {
      const inner = next(path);

      return {
        then(onF: (v: unknown) => unknown, onR: (r: unknown) => unknown): unknown {
          thenCalls += 1;

          return inner.then(onF, onR);
        },
      } as never;
    });

    // `Router.#runStart` duck-types on `.then` and then calls `.catch()` on the
    // value OUTSIDE its try — so a thenable without `catch` is the input to
    // measure, and the FSM phase afterwards is the outcome that matters.
    const outcome = await attempt(() => router.start("/home"));
    const second = await attempt(() => router.start("/home"));

    out("H3 start interceptor returns a duck-typed thenable (then, no catch)", {
      thenCalls,
      outcome:
        typeof outcome === "string"
          ? outcome
          : `RESOLVED ${(outcome as { name?: string } | undefined)?.name ?? "?"}`,
      committed: router.getState()?.name,
      isActiveAfter: router.isActive(),
      secondStart:
        typeof second === "string"
          ? second
          : `RESOLVED ${(second as { name?: string } | undefined)?.name ?? "?"}`,
    });
    router.dispose();
  }

  // H4 — CONTROL: pass-through interceptor; start resolves with the committed
  // state object itself.
  {
    const router = createRouter(ROUTES as never);

    getPluginApi(router).addInterceptor("start", (next, path) => next(path));

    const resolved = await router.start("/home");

    out("H4 CONTROL pass-through start interceptor", {
      "resolved === getState()": resolved === router.getState(),
    });
    router.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// I. void-typed callbacks whose RUNTIME return is a rejecting thenable: which
//    doors isolate it (emitter sink) and which let it escape as an unhandled
//    rejection. A nonDoor observation — nothing lands in state — recorded
//    because the surface lists "any thenable core consumes".
// ─────────────────────────────────────────────────────────────────────────────
async function sectionI(): Promise<void> {
  const unhandled: string[] = [];
  const onUnhandled = (reason: unknown): void => {
    unhandled.push(errText(reason));
  };

  process.on("unhandledRejection", onUnhandled);

  const settle = async (): Promise<void> => {
    await new Promise((r) => setTimeout(r, 20));
  };

  // I1 — subscribe(): async listener rejection routed to the emitter sink.
  {
    const logged: string[] = [];
    const router = createRouter(ROUTES as never, {
      logger: {
        level: "all",
        callback: (_l: string, _c: string, m: string) => {
          logged.push(m);
        },
      },
    } as never);

    router.subscribe(async () => {
      throw new Error("subscribe-async-boom");
    });
    await router.start("/home");
    await settle();
    out("I1 subscribe async listener rejection", {
      unhandled: [...unhandled],
      loggedErrorInListener: logged.some((m) => m.includes("Error in listener")),
    });
    unhandled.length = 0;
    router.dispose();
  }

  // I2 — getRoutesApi().subscribeChanges(): async handler rejection.
  {
    const logged: string[] = [];
    const router = createRouter(ROUTES as never, {
      logger: {
        level: "all",
        callback: (_l: string, _c: string, m: string) => {
          logged.push(m);
        },
      },
    } as never);
    const { getRoutesApi } = await import("@real-router/core/api");

    getRoutesApi(router).subscribeChanges(async () => {
      throw new Error("subscribeChanges-async-boom");
    });
    getRoutesApi(router).add({ name: "z", path: "/z" } as never);
    await settle();
    out("I2 subscribeChanges async handler rejection", {
      unhandled: [...unhandled],
      loggedErrorInListener: logged.some((m) => m.includes("Error in listener")),
    });
    unhandled.length = 0;
    router.dispose();
  }

  // I3 — plugin hook (typed void) returning a rejecting promise.
  {
    const logged: string[] = [];
    const router = createRouter(ROUTES as never, {
      logger: {
        level: "all",
        callback: (_l: string, _c: string, m: string) => {
          logged.push(m);
        },
      },
    } as never);

    router.usePlugin(
      () =>
        ({
          onTransitionSuccess: async () => {
            throw new Error("hook-async-boom");
          },
        }) as never,
    );
    await router.start("/home");
    await settle();
    out("I3 plugin hook async rejection", {
      unhandled: [...unhandled],
      loggedErrorInListener: logged.some((m) => m.includes("Error in listener")),
    });
    unhandled.length = 0;
    router.dispose();
  }

  process.off("unhandledRejection", onUnhandled);
}

async function main(): Promise<void> {
  await sectionA();
  await sectionB();
  await sectionC();
  await sectionD();
  await sectionE();
  await sectionF();
  await sectionG();
  await sectionH();
  await sectionI();
}

void main().then(
  () => {
    console.log("PROBE DONE");
  },
  (e: unknown) => {
    console.log(`PROBE FAILED ${errText(e)}`);
    process.exitCode = 1;
  },
);
