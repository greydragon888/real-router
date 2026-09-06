// Sibling parameters of the same signature as hydrateRouter·router:
//   hydrateRouter·source            — an app-constructed `{ path, … }` object;
//   hydrateRouter·options           — `{ deserialize }` bag;
//   HydrateRouterOptions.deserialize·return — the object an app deserializer returns.
// Where they land: `RouterInternals.hydrationState` (the slot itself is a censused id);
// the question here is the MECHANISM at the entry: copied, or the caller's object held
// by reference for the duration of start()? And how many reads per key, per frame —
// with and without the ssr-data plugin that consumes the slot.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";
import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

import { hydrateRouter } from "../../../../packages/ssr-utils/src/hydrateRouter";

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

function accessorBag<T extends object>(source: T): {
  bag: T;
  reads: Record<string, number>;
} {
  const reads: Record<string, number> = {};
  const bag = {};

  for (const key of Object.keys(source)) {
    Object.defineProperty(bag, key, {
      enumerable: true,
      configurable: true,
      get(): unknown {
        reads[key] = (reads[key] ?? 0) + 1;

        return (source as Record<string, unknown>)[key];
      },
    });
  }

  return { bag: bag as T, reads };
}

const routes = [{ name: "home", path: "/home" }] as never;

async function run(label: string, withPlugin: boolean): Promise<unknown> {
  const router = createRouter(routes);

  if (withPlugin) {
    router.usePlugin(
      ssrDataPluginFactory({
        home: () => () => ({ fromLoader: true }),
      }) as never,
    );
  }

  let capturedDuringStart: unknown = "never-captured";

  getPluginApi(router).addInterceptor("start", (next, path) => {
    capturedDuringStart = getInternals(router).hydrationState;

    return next(path);
  });

  const payload = {
    name: "home",
    path: "/home",
    params: {},
    search: {},
    context: { data: { fromServer: true } },
  };
  const { proxy: source, reads } = countingProxy(payload);
  const { proxy: ctxProxy, reads: ctxReads } = countingProxy(payload.context);

  (payload as { context: unknown }).context = ctxProxy;

  const before = getInternals(router).hydrationState;
  const state = await hydrateRouter(router as never, source as never);
  const after = getInternals(router).hydrationState;

  const result = {
    label,
    "hydrationState during start() === caller's source (identity held)":
      capturedDuringStart === source,
    "hydrationState before": before,
    "hydrationState after (restored)": after,
    "reads per key on source during hydrateRouter+start": reads,
    "reads per key on source.context": ctxReads,
    "committed state.context.data": state.context.data,
    "state.context.data === caller's context.data (leaf by reference)":
      state.context.data === payload.context.data,
    "positive control: started at": state.name,
  };

  router.dispose();

  return result;
}

async function deserializeReturn(): Promise<unknown> {
  const router = createRouter(routes);
  let captured: unknown = "never-captured";

  getPluginApi(router).addInterceptor("start", (next, path) => {
    captured = getInternals(router).hydrationState;

    return next(path);
  });

  const returned = { path: "/home", name: "home", params: {}, search: {}, context: {} };
  const { proxy: returnedProxy, reads } = countingProxy(returned);
  const { bag: options, reads: optionReads } = accessorBag({
    deserialize: (_json: string) => returnedProxy,
  });

  await hydrateRouter(router as never, '{"path":"/ignored"}', options as never);

  const result = {
    "hydrationState === deserialize()'s returned object (identity held)":
      captured === returnedProxy,
    "reads on options bag": optionReads,
    "reads on the returned object": reads,
    "default deserialize is JSON.parse (string branch, no options)": await (async () => {
      const r = createRouter(routes);
      let c: unknown;

      getPluginApi(r).addInterceptor("start", (next, path) => {
        c = getInternals(r).hydrationState;

        return next(path);
      });
      await hydrateRouter(r as never, '{"path":"/home","name":"home"}');
      r.dispose();

      return c !== null && typeof c === "object" && (c as { name?: string }).name === "home";
    })(),
  };

  router.dispose();

  return result;
}

async function main(): Promise<void> {
  const noPlugin = await run("object source, no ssr plugin", false);
  const withPlugin = await run("object source, ssr-data plugin installed", true);
  const viaDeserialize = await deserializeReturn();

  console.log(JSON.stringify({ noPlugin, withPlugin, viaDeserialize }, null, 2));
}

void main();
