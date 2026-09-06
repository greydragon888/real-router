// Триаж батча: cloneRouter·opts, RoutesApi.add·options, RouterInternals.matchPath·options,
// Router.navigate·target, resolveForwardChain·forwardMap, createRouter·options.defaultParams|
// defaultSearch, Options.default{Params,Search}·callbackReturn, createRouter·dependencies,
// cloneRouter·dependencies, DependenciesApi.setAll·deps.
// Инструмент — Proxy-счётчик ловушек; у КАЖДОЙ двери позитивный контроль:
// значение ДОШЛО (href/state/getDependency), иначе счёт ничего не доказывает.
import { createRouter, resolveForwardChain } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getRoutesApi,
} from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Counts = Record<string, number>;

function trap<T extends object>(source: T): { bag: T; counts: Counts } {
  const counts: Counts = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const bag = new Proxy(source as Record<string, unknown>, {
    ownKeys: (t) => (bump("ownKeys"), Reflect.ownKeys(t)),
    getOwnPropertyDescriptor: (t, k) => (
      bump(`gopd:${String(k)}`), Reflect.getOwnPropertyDescriptor(t, k)
    ),
    get: (t, k, r) => (bump(`get:${String(k)}`), Reflect.get(t, k, r)),
    has: (t, k) => (bump(`has:${String(k)}`), Reflect.has(t, k)),
    getPrototypeOf: (t) => (bump("proto"), Reflect.getPrototypeOf(t)),
  });
  return { bag: bag as T, counts };
}

const out: Record<string, unknown> = {};
const ROUTES = [{ name: "u", path: "/u/:id?tab" }] as never;

// --- A. createRouter·dependencies -------------------------------------------
{
  const leaf = { db: 1 };
  const { bag, counts } = trap({ svc: leaf });
  const r = createRouter(ROUTES, {} as never, bag as never);
  const api = getDependenciesApi(r);
  const posControl = api.get("svc" as never) === (leaf as never);
  (bag as Record<string, unknown>).svc = { db: 2 };
  out.A_createRouter_dependencies = {
    counts,
    posControl_leafByIdentity: posControl,
    afterSourceMutation_stillOldLeaf:
      api.get("svc" as never) === (leaf as never),
    countsAfterMutation: { ...counts },
  };
}

// --- B. DependenciesApi.setAll·deps ------------------------------------------
{
  const leaf = { x: 1 };
  const r = createRouter(ROUTES, {} as never, {} as never);
  const api = getDependenciesApi(r);
  const { bag, counts } = trap({ a: leaf });
  api.setAll(bag as never);
  out.B_setAll_deps = {
    counts,
    posControl_leafByIdentity: api.get("a" as never) === (leaf as never),
  };
}

// --- C. cloneRouter·dependencies и cloneRouter·opts --------------------------
{
  const base = createRouter(ROUTES, {} as never, { shared: { s: 1 } } as never);
  const leaf = { u: 1 };
  const deps = trap({ user: leaf });
  const cb = (): void => {};
  const opts = trap({ logger: { level: "warn-error", callback: cb } });
  const clone = cloneRouter(base, deps.bag as never, opts.bag as never);
  const capi = getDependenciesApi(clone);
  const before = { ...opts.counts };
  clone.buildPath("u", { id: "1" } as never);
  out.C_clone = {
    deps_counts: deps.counts,
    posControl_depLeaf: capi.get("user" as never) === (leaf as never),
    posControl_sharedInherited:
      (capi.get("shared" as never) as unknown as { s: number }).s === 1,
    opts_counts_atClone: before,
    opts_counts_after_use: { ...opts.counts },
  };
}

// --- D. Router.navigate·target ------------------------------------------------
const routerD = createRouter(
  ROUTES,
  { defaultRoute: "u" } as never,
  {} as never,
);

routerD.start("/u/1");

const targetD = trap({
  name: "u",
  params: { id: "5" },
  search: { tab: "z" },
});

void routerD.navigate(targetD.bag as never).then((s) => {
  out.D_navigate_target = {
    counts_afterSettle: { ...targetD.counts },
    posControl_path: s.path,
  };
  stage2();
});

function stage2(): void {
  // --- E. createRouter·options.defaultParams / .defaultSearch ----------------
  const dp = trap({ id: "9" });
  const ds = trap({ tab: "q" });
  const r = createRouter(
    ROUTES,
    {
      defaultRoute: "u",
      defaultParams: dp.bag,
      defaultSearch: ds.bag,
    } as never,
    {} as never,
  );

  r.start("/u/1");

  void r.navigateToDefault().then((s1) => {
    const afterFirst = {
      dp: { ...dp.counts },
      ds: { ...ds.counts },
      path: s1.path,
    };

    void r.navigate("u", { id: "1" } as never).then(() => {
      void r.navigateToDefault().then((s2) => {
        out.E_options_defaults = {
          afterFirstNavigateToDefault: afterFirst,
          afterSecond: {
            dp: { ...dp.counts },
            ds: { ...ds.counts },
            path: s2.path,
          },
          posControl_identityHandedOut:
            (getInternals(r).getOptions() as unknown as Record<string, unknown>)
              .defaultParams === (dp.bag as unknown),
        };
        stage3();
      });
    });
  });
}

function stage3(): void {
  // --- F. Options.default{Params,Search}·callbackReturn ----------------------
  let calls = 0;
  const made: { p: Counts; s: Counts }[] = [];
  const r = createRouter(
    ROUTES,
    {
      defaultRoute: "u",
      defaultParams: () => {
        calls += 1;
        const t = trap({ id: "3" });
        made.push({ p: t.counts, s: {} });
        return t.bag;
      },
      defaultSearch: () => {
        const t = trap({ tab: "w" });
        made[made.length - 1].s = t.counts;
        return t.bag;
      },
    } as never,
    {} as never,
  );

  r.start("/u/1");

  void r.navigateToDefault().then((s) => {
    out.F_callbackReturns = {
      callbackInvocations: calls,
      countsPerInvocation: made,
      posControl_path: s.path,
    };
    stage4();
  });
}

function stage4(): void {
  // --- G. RouterInternals.matchPath·options ---------------------------------
  {
    const r = createRouter(ROUTES, {} as never, {} as never);
    const ctx = getInternals(r);
    const o1 = trap({
      ...(ctx.getOptions() as unknown as Record<string, unknown>),
      rewritePathOnMatch: true,
    });
    const m1 = ctx.matchPath("/u/2?tab=a", o1.bag as never);
    const first = { ...o1.counts };
    const m2 = ctx.matchPath("/u/3?tab=b", o1.bag as never);

    out.G_matchPath_options = {
      counts_afterFirstCall: first,
      counts_afterSecondCall: { ...o1.counts },
      posControl_matched: [m1?.path, m2?.path],
      posControl_buildPathUnaffected: r.buildPath("u", { id: "4" } as never),
    };
  }

  // --- H. resolveForwardChain·forwardMap ------------------------------------
  {
    const { bag, counts } = trap({ a: "b", b: "c" });
    const res = resolveForwardChain("a", bag as never);

    out.H_resolveForwardChain = { counts, posControl_result: res };
  }

  // --- I. RoutesApi.add·options ---------------------------------------------
  {
    const r = createRouter(ROUTES, {} as never, {} as never);
    const rapi = getRoutesApi(r);
    const { bag, counts } = trap({ parent: "u" });

    rapi.add([{ name: "kid", path: "/kid" }] as never, bag as never);

    out.I_add_options = {
      counts,
      posControl_registeredUnderParent: r.buildPath("u.kid" as never, {
        id: "1",
      } as never),
    };
  }

  console.log(JSON.stringify(out, null, 1));
}
