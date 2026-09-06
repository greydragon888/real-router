// L7-shared · семейство ssr: результат loader-а / defer-payload / hydration-payload
// → claim.write → putField(state.context, ns, value). Контейнер — state.context ядра,
// значение — лист по ссылке.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";
import { defer } from "../../../../shared/ssr/defer";
import { markStale } from "../../../../shared/ssr/staleRegistry";
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [{ name: "u", path: "/u/:id?tab" }] as never;
const cfg = {
  namespace: "data",
  modeNamespace: "ssrDataMode",
  deferredNamespace: "ssrDataDeferred",
  deferredKeysNamespace: "ssrDataDeferredKeys",
  errorPrefix: "[probe]",
};

async function main(): Promise<void> {
  // A. ПОЗИТИВНЫЙ КОНТРОЛЬ + механизм: результат loader-а ложится в state.context.data ПО ССЫЛКЕ.
  const current = { value: { user: { id: 1 } } as Record<string, unknown> };
  const r1 = createRouter(routes, {} as never);

  r1.usePlugin(createSsrLoaderPlugin({ u: () => () => current.value }, cfg));

  const st1 = await r1.start("/u/1?tab=x");

  console.log(
    "A",
    JSON.stringify({
      landedByReference: st1.context.data === current.value,
      contextFrozen: Object.isFrozen(st1.context),
      shellFrozen: Object.isFrozen(st1),
      mode: st1.context.ssrDataMode,
      isGetState: r1.getState() === st1,
    }),
  );

  // A2. subscribeLeave-рукав (invalidate → markStale): свежий результат ложится в nextRoute.context по ссылке.
  const fresh = { v: 2 };

  current.value = fresh;
  markStale(r1, "data");

  const st1b = await r1.navigate("u", { id: "2" });

  console.log(
    "A2",
    JSON.stringify({
      landedByReference: st1b.context.data === fresh,
      isGetState: r1.getState() === st1b,
    }),
  );

  // B. defer-payload: critical — по ссылке; deferred — ЗАМОРОЖЕННЫЙ СНАПШОТ (не мешок приложения),
  //    промисы внутри — по ссылке; keys — массив, построенный shared.
  const critical = { c: 1 };
  const userDeferred = { p: Promise.resolve(1) };
  const r2 = createRouter(routes, {} as never);

  r2.usePlugin(
    createSsrLoaderPlugin(
      { u: () => () => defer({ critical, deferred: userDeferred }) },
      cfg,
    ),
  );

  const st2 = await r2.start("/u/1");
  const deferredOut = st2.context.ssrDataDeferred as Record<string, unknown>;

  console.log(
    "B",
    JSON.stringify({
      criticalByReference: st2.context.data === critical,
      deferredIsUserMap: deferredOut === userDeferred,
      deferredFrozen: Object.isFrozen(deferredOut),
      promiseByReference: deferredOut.p === userDeferred.p,
      keys: st2.context.ssrDataDeferredKeys,
    }),
  );

  // C. hydration: значение payload-а ложится по ссылке; loader НЕ вызывается; массив ключей копируется (filter).
  const loaderCalls = { n: 0 };
  const r3 = createRouter(routes, {} as never);

  r3.usePlugin(
    createSsrLoaderPlugin(
      {
        u: () => () => {
          loaderCalls.n += 1;

          return { fromLoader: true };
        },
      },
      cfg,
    ),
  );

  const payloadValue = { fromServer: true };
  const keysArr = ["p", "__proto__", 42];
  const hydrated = {
    name: "u",
    params: { id: "1" },
    search: {},
    path: "/u/1",
    context: { data: payloadValue, ssrDataDeferredKeys: keysArr },
  };

  getInternals(r3).hydrationState = hydrated as never;

  const st3 = await r3.start("/u/1");

  getInternals(r3).hydrationState = null;

  const reconstructed = st3.context.ssrDataDeferred as Record<string, unknown>;

  console.log(
    "C",
    JSON.stringify({
      payloadValueByReference: st3.context.data === payloadValue,
      loaderCalls: loaderCalls.n,
      keysIsPayloadArray: st3.context.ssrDataDeferredKeys === keysArr,
      keysLanded: st3.context.ssrDataDeferredKeys,
      reconstructedNullProto: Object.getPrototypeOf(reconstructed) === null,
      reconstructedHasP:
        typeof (reconstructed.p as { then?: unknown } | undefined)?.then,
    }),
  );

  // D. Счёт чтений на defer(): options читается по имени (по разу), deferred-мешок — один проход (spread).
  const deferredBag = countingBag({
    p: Promise.resolve(1),
    q: Promise.resolve(2),
  });
  const options = countingBag({ critical: 1, deferred: deferredBag.bag });

  defer(options.bag as never);

  console.log(
    "D",
    JSON.stringify({
      optionsReads: options.reads,
      deferredReads: deferredBag.reads,
    }),
  );

  // E. Счёт чтений на loaders-карте и entry-объекте при создании плагина (только compile;
  //    validator живёт в плагинах-потребителях и здесь не вызывается).
  const entry = countingBag({ loader: () => () => ({ x: 1 }), ssr: "full" });
  const loaders = countingBag({ u: entry.bag });
  const r4 = createRouter(routes, {} as never);

  r4.usePlugin(createSsrLoaderPlugin(loaders.bag as never, cfg));

  console.log(
    "E",
    JSON.stringify({ loadersReads: loaders.reads, entryReads: entry.reads }),
  );
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
