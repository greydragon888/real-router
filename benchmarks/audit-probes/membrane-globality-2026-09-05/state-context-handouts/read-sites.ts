// P1/P2 по контейнеру context: сколько раз и КАК ядро читает ключ закоммиченного
// context (объект ядра, куда приложение могло положить аксессор через хэндаут),
// и ключ context ЧУЖОГО State на двух копирующих дверях.
//   • на закоммиченном context: аксессор-счётчик (app-side defineProperty),
//     затем replace()-ревалидация / navigate / navigateToNotFound / stop+start;
//   • на context чужого State: Proxy-счётчик трапов (ownKeys/gOPD/get/has)
//     для navigateToState (#copyChannels) и systemCommit.
// Позитивный контроль: сама проба читает ключ один раз (count 0 → 1).
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = {
  name: string;
  path: string;
  params: Ctx;
  search: Ctx;
  context: Ctx;
};

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a/:id" },
];

function armCounter(
  target: Ctx,
  key: string,
  leaf: unknown,
): { reads: () => number } {
  let n = 0;
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: true,
    get() {
      n++;
      return leaf;
    },
  });
  return { reads: () => n };
}

function trapCounter(source: Ctx): {
  proxy: Ctx;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {
    ownKeys: 0,
    getOwnPropertyDescriptor: 0,
    get: 0,
    has: 0,
  };
  const proxy = new Proxy(source, {
    ownKeys(t) {
      counts.ownKeys++;
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      counts.getOwnPropertyDescriptor++;
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
    get(t, k, rcv) {
      if (typeof k === "string") {
        counts.get++;
      }
      return Reflect.get(t, k, rcv);
    },
    has(t, k) {
      counts.has++;
      return Reflect.has(t, k);
    },
  });
  return { proxy, counts };
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const leaf = { app: "leaf" };

  // ── control: the counter itself ───────────────────────────────────────────
  {
    const c: Ctx = {};
    const k = armCounter(c, "ns", leaf);
    const before = k.reads();
    void c.ns;
    out.control_counter = { before, afterOneRead: k.reads() };
  }

  // ── committed context, core's own object ──────────────────────────────────
  const router = createRouter(ROUTES as never, {} as never);
  const api = getPluginApi(router);
  const internals = getInternals(router);
  await router.start("/h");
  const c1 = (router.getState() as unknown as St).context;
  const k1 = armCounter(c1, "ns", leaf);

  getRoutesApi(router).replace(ROUTES as never); // revalidation → commitRevalidated → systemCommit spread
  const c2 = (router.getState() as unknown as St).context;
  const d2 = Object.getOwnPropertyDescriptor(c2, "ns");
  out.replaceRevalidation = {
    "reads of committed context key during replace()": k1.reads(),
    "new context is a different object": c2 !== c1,
    "copied as data (accessor not carried)":
      d2 !== undefined && "value" in d2 && d2.value === leaf,
  };

  const k2 = armCounter(c2, "ns2", leaf);
  await router.navigate("a", { id: "1" } as never);
  out.navigate = {
    "reads of previous committed context key during navigate()": k2.reads(),
    "fresh context": (router.getState() as unknown as St).context !== c2,
  };

  const c3 = (router.getState() as unknown as St).context;
  const k3 = armCounter(c3, "ns3", leaf);
  router.navigateToNotFound("/zzz");
  out.navigateToNotFound = {
    "reads of previous committed context key": k3.reads(),
    "fresh context": (router.getState() as unknown as St).context !== c3,
  };

  const c4 = (router.getState() as unknown as St).context;
  const k4 = armCounter(c4, "ns4", leaf);
  router.stop();
  await router.start("/h");
  out.stopStart = {
    "reads of stopped-from context key across stop()+start()": k4.reads(),
  };

  // ── foreign State's context on the two copying doors ──────────────────────
  {
    const passed = api.matchPath("/a/2") as unknown as St;
    const { proxy, counts } = trapCounter({ ns: leaf, other: 1 });
    // matchPath's shell is frozen — build a writable twin carrying the Proxy as context
    const twin: St = {
      name: passed.name,
      params: passed.params,
      search: passed.search,
      path: passed.path,
      context: proxy,
    };
    (twin as unknown as Ctx).transition = (passed as unknown as Ctx).transition;
    await api.navigateToState(twin as never);
    const committed = (router.getState() as unknown as St).context;
    out.navigateToState_foreignContext = {
      traps: counts,
      "committed.ns === leaf (by reference)": committed.ns === leaf,
      "committed.context is not the proxy": committed !== proxy,
    };
  }
  {
    const { proxy, counts } = trapCounter({ ns: leaf, other: 1 });
    const foreign: St = {
      name: "a",
      params: { id: "3" },
      search: {},
      path: "/a/3",
      context: proxy,
    };
    const ret = internals.systemCommit(
      foreign as never,
      router.getState() as never,
      {} as never,
    ) as unknown as St;
    out.systemCommit_foreignContext = {
      traps: counts,
      "committed.ns === leaf (by reference)": ret.context.ns === leaf,
      "committed.context is not the proxy": ret.context !== proxy,
    };
  }

  // ── claim.write onto a context: how many reads of the container/key ─
  {
    const c = (router.getState() as unknown as St).context;
    const { proxy, counts } = trapCounter({});
    // cannot swap core's context (frozen shell, data property) — measure putField on a foreign State
    const foreignState = { context: proxy } as unknown as St;
    api.claimContextNamespace("cw").write(foreignState as never, leaf);
    out.claimWrite_putField_onForeignContext = {
      traps: counts,
      "wrote own key":
        Object.getOwnPropertyDescriptor(proxy, "cw")?.value === leaf,
      "control: committed context untouched": c.cw === undefined,
    };
  }

  router.dispose();
  console.log(JSON.stringify(out, null, 2));
}

void main();
