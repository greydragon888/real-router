// The same handle at OTHER entry points: `PluginFactory·router`, `GuardFnFactory·router`,
// `SsrLoaderFnFactory·router` are HAND-OUTS (core → app code) — core passes `ns.router`,
// which is the constructor's `this`. An app may still invoke a plugin factory directly with
// any object (`validationPlugin()(thing, getDep)`), so the question is whether such a handle
// re-enters core anywhere except through getInternals — i.e. whether the family has a second
// door. Measured: reads on a pass-through Proxy before the decision, and the outcome.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";
import { lifecyclePluginFactory } from "@real-router/lifecycle-plugin";

import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

function countingProxy<T extends object>(target: T): {
  proxy: T;
  reads: Record<string, number>;
} {
  const reads: Record<string, number> = {};
  const proxy = new Proxy(target, {
    get(t, key, receiver): unknown {
      reads[String(key)] = (reads[String(key)] ?? 0) + 1;

      return Reflect.get(t, key, receiver);
    },
  });

  return { proxy, reads };
}

function outcome(fn: () => unknown): string {
  try {
    const v = fn();

    return `ok:${typeof v}`;
  } catch (error) {
    const e = error as { name?: string; code?: string; message?: string };

    return `threw:${e.name ?? "?"}${e.code ? `[${e.code}]` : ""}:${(e.message ?? "").slice(0, 60)}`;
  }
}

async function main(): Promise<void> {
  const routes = [{ name: "home", path: "/home" }] as never;
  const router = createRouter(routes);
  const getDep = (() => undefined) as never;

  // What core hands a plugin factory / a guard factory: the SAME identity as createRouter
  // returned (hand-out by reference — a leaf, the app never constructs it).
  let handedToPlugin: unknown;
  let handedToGuard: unknown;

  router.usePlugin((r) => {
    handedToPlugin = r;

    return {};
  });
  const routerWithGuard = createRouter([
    {
      name: "g",
      path: "/g",
      canActivate: (r: unknown) => {
        handedToGuard = r;

        return () => true;
      },
    },
  ] as never);

  const handOuts = {
    "PluginFactory receives the createRouter() identity": handedToPlugin === router,
    "GuardFnFactory receives the createRouter() identity":
      handedToGuard === routerWithGuard,
  };

  // Direct invocation of first-party factories with a foreign handle: which member of the
  // family decides, and after how many reads.
  const factories: Record<string, (r: unknown) => unknown> = {
    "validationPlugin()(proxy, getDep)": (r) =>
      validationPlugin()(r as never, getDep),
    "ssrDataPluginFactory({...})(proxy, getDep)": (r) =>
      ssrDataPluginFactory({ home: () => () => 1 })(r as never, getDep),
    "lifecyclePluginFactory()(proxy, getDep)": (r) =>
      lifecyclePluginFactory()(r as never, getDep),
  };
  const direct: Record<string, { outcome: string; readsBeforeDecision: Record<string, number> }> =
    {};

  for (const [name, call] of Object.entries(factories)) {
    const { proxy, reads } = countingProxy(router);

    direct[name] = { outcome: outcome(() => call(proxy)), readsBeforeDecision: reads };
  }

  // Positive control: the same factories on the REAL handle install.
  const positive = {
    "router.usePlugin(validationPlugin())": outcome(() =>
      router.usePlugin(validationPlugin() as never),
    ),
    "validator installed on internals": getInternals(router).validator !== null,
    "router.usePlugin(ssrDataPluginFactory(...))": outcome(() =>
      router.usePlugin(ssrDataPluginFactory({ home: () => () => 1 }) as never),
    ),
    "router.usePlugin(lifecyclePluginFactory())": outcome(() =>
      router.usePlugin(lifecyclePluginFactory() as never),
    ),
    "getPluginApi(router) after installs": outcome(() => getPluginApi(router)),
  };

  console.log(JSON.stringify({ handOuts, direct, positive }, null, 2));
  router.dispose();
  routerWithGuard.dispose();
}

void main();
