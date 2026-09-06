// L8, вторая проба: RouterInternals-двери и хэндауты с round-trip.
import { createRouter, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const out = (block: string, data: unknown): void => {
  console.log(`[${block}] ${JSON.stringify(data)}`);
};

function blockP_forwardStateIdentity(): void {
  const router = createRouter(ROUTES as never);
  const ctx = getInternals(router);
  const params = { id: "7" };
  const search = { tab: "x" };
  const r1 = ctx.forwardState("u", params, search);
  const poisoned = JSON.parse('{"__proto__": "wire", "id": "7"}') as Record<string, unknown>;
  const r2 = ctx.forwardState("u", poisoned as never, search);

  out("P internals.forwardState", {
    control_name: r1.name,
    paramsReturnedByIdentity: r1.params === params,
    searchReturnedByIdentity: r1.search === search,
    poisonedParamsCopied: r2.params !== (poisoned as unknown),
    poisonedKeyDropped: !Object.hasOwn(r2.params, "__proto__"),
  });
  router.dispose();
}

function blockQ_portBuildPathReads(): void {
  const router = createRouter(ROUTES as never);
  const port = getInternals(router).port();
  const params = countingProxy({ id: "7" });
  const search = countingProxy({ tab: "x" });
  const href = port.buildPath("u", params.bag, search.bag);

  out("Q internals.port().buildPath", {
    control_href: href,
    readsByName: { params: params.reads, search: search.reads },
  });
  router.dispose();
}

function blockR_getRouteConfigRoundTrip(): void {
  const router = createRouter([
    { name: "x", path: "/x", myField: { a: 1 } },
    { name: "home", path: "/home" },
  ] as never);
  const api = getPluginApi(router);
  const cfg = api.getRouteConfig("x") as Record<string, unknown>;
  const original = { a: 1 };

  cfg.compiled = 42;

  const clone = cloneRouter(router);
  const cloneCfg = getPluginApi(clone).getRouteConfig("x") as Record<string, unknown>;

  out("R getRouteConfig round-trip", {
    control_customFieldPresent: (cfg.myField as { a: number }).a === original.a,
    liveRecordIdentity: api.getRouteConfig("x") === cfg,
    pluginWriteReachesClone: cloneCfg.compiled,
    cloneSharesRecord: cloneCfg === cfg,
  });
  clone.dispose();
  router.dispose();
}

function blockS_treeChangedEmitTransit(): void {
  const router = createRouter(ROUTES as never);
  const ctx = getInternals(router);
  let received: unknown;

  ctx.treeChanged.subscribe((event) => {
    received = event;
  });

  const fabricated = { op: "clear", removed: [] };

  ctx.treeChanged.emit(fabricated as never);

  out("S internals.treeChanged.emit", {
    handlerReceivesSameObject: received === fabricated,
    frozenByCore: Object.isFrozen(fabricated),
  });
  router.dispose();
}

async function blockT_emitTransitionErrorTransit(): Promise<void> {
  const router = createRouter(ROUTES as never);
  let received: unknown;

  router.usePlugin(() => ({
    onTransitionError(_to, _from, err) {
      received = err;
    },
  }));
  await router.start("/home");

  const err = new RouterError("PLUGIN_RAISED", { detail: { k: 1 } });

  getPluginApi(router).emitTransitionError(err);

  out("T emitTransitionError", {
    hookReceivesSameObject: received === err,
    frozenByCore: Object.isFrozen(err),
  });
  router.dispose();
}

function blockV_buildStateResolved(): void {
  const router = createRouter(ROUTES as never);
  const params = { id: "7" };
  const res = getInternals(router).buildStateResolved("u", params);

  out("V internals.buildStateResolved", {
    control_name: res?.name,
    paramsReturnedByIdentity: res?.params === params,
  });
  router.dispose();
}

function blockW_pluginObjectFrozen(): void {
  const router = createRouter(ROUTES as never);
  const plugin = { onStart() {} };

  router.usePlugin(() => plugin);

  out("W usePlugin·plugin-object", {
    callerObjectFrozenByCore: Object.isFrozen(plugin),
  });
  router.dispose();
}

async function blockX_getStateHandoutRoundTrip(): Promise<void> {
  // getState() → хэндаут; ядро читает его обратно (fromState следующей навигации,
  // claim.write, areStatesEqual) — но это ЕГО объект, не вызывающего.
  const router = createRouter(ROUTES as never);

  await router.start("/home");

  const st = router.getState();
  const next = await router.navigate("u", { id: "1" });

  out("X getState handout", {
    committedIsFrozen: Object.isFrozen(st),
    contextWritable: !Object.isFrozen(st?.context),
    previousIsSameObject: router.getPreviousState() === st,
    nextIsFresh: next !== st,
  });
  router.dispose();
}

const blocks: [string, () => unknown][] = [
  ["P", blockP_forwardStateIdentity],
  ["Q", blockQ_portBuildPathReads],
  ["R", blockR_getRouteConfigRoundTrip],
  ["S", blockS_treeChangedEmitTransit],
  ["T", blockT_emitTransitionErrorTransit],
  ["V", blockV_buildStateResolved],
  ["W", blockW_pluginObjectFrozen],
  ["X", blockX_getStateHandoutRoundTrip],
];

async function main(): Promise<void> {
  for (const [name, run] of blocks) {
    try {
      await run();
    } catch (error) {
      out(`${name} THREW`, String(error));
    }
  }
}

void main();
