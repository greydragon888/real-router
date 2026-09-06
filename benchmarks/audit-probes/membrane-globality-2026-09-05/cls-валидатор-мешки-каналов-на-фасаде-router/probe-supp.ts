/**
 * ДОПОЛНЕНИЕ к матрице семейства «валидатор·мешки-каналов-на-фасаде-Router».
 *
 * S1 — позитивный контроль ДОСТИЖИМОСТИ хопа validateSearch на КАЖДОЙ из четырёх
 *      дверей (без него вердикт P1 «держится» на search-дверях был бы вакуумным):
 *      массив в канал search должен отвергаться ИМЕННО плагином и проходить без него.
 * S2 — атрибуция чтений мешка params по КАДРАМ (кто именно читает ключ) на двери
 *      navigate, где матрица намерила 4 чтения при плагине против 1 без него.
 */
import { createRouter } from "@real-router/core";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
];

type R = ReturnType<typeof createRouter>;

async function mk(withPlugin: boolean): Promise<R> {
  const r = createRouter(routes as never, {} as never);

  if (withPlugin) {
    r.usePlugin(validationPlugin() as never);
  }
  await r.start("/b/1?q=x");

  return r as R;
}

const out = (row: string, data: unknown): void => {
  console.log(JSON.stringify({ row, ...(data as object) }));
};

const attempt = <T>(f: () => T): { ok: boolean; value?: T; err?: string } => {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
};

async function s1(): Promise<void> {
  const bad = ["not", "a", "bag"] as unknown;

  for (const withPlugin of [true, false]) {
    const r = await mk(withPlugin);
    const tag = withPlugin ? "withPlugin" : "noPlugin";

    out("S1·validateSearch-reached·isActiveRoute·" + tag, {
      res: attempt(() => r.isActiveRoute("b", { id: "1" }, bad as never)),
    });
    out("S1·validateSearch-reached·buildPath·" + tag, {
      res: attempt(() => r.buildPath("b", { id: "1" }, bad as never)),
    });
    out("S1·validateSearch-reached·canNavigateTo·" + tag, {
      res: attempt(() => r.canNavigateTo("b", { id: "1" }, bad as never)),
    });

    const nav = attempt(() => r.navigate("b", { id: "1" }, bad as never));
    let navResolved: unknown = nav.ok ? "pending" : nav.err;

    if (nav.ok) {
      try {
        await (nav.value as never as Promise<unknown>);
        navResolved = "resolved:" + String(r.getState()?.path);
      } catch (e) {
        navResolved = "rejected:" + (e as Error).message;
      }
    }
    out("S1·validateSearch-reached·navigate·" + tag, { res: navResolved });
  }
}

/** Мешок, записывающий КАДР каждого чтения ключа `id`. */
function tracingBag(): {
  bag: Record<string, string>;
  frames: string[];
} {
  const frames: string[] = [];
  const target = { id: "2" };
  const bag = new Proxy(target, {
    get(t, k, rec) {
      if (k === "id") {
        const st = (new Error("read").stack ?? "").split("\n");
        const frame =
          st
            .slice(2)
            .map((l) => l.trim())
            .find((l) => !l.includes("probe-supp"))
            ?.replace(/^at\s+/, "") ?? "?";

        frames.push(frame.replace(/\(.*[/\\]/, "(").replace(/:\d+:\d+\)$/, ")"));
      }

      return Reflect.get(t, k, rec);
    },
  }) as Record<string, string>;

  return { bag, frames };
}

async function s2(): Promise<void> {
  for (const withPlugin of [true, false]) {
    const r = await mk(withPlugin);
    const { bag, frames } = tracingBag();

    await r.navigate("b", bag as never, { q: "x" });
    out(
      "S2·navigate·params·read-frames·" + (withPlugin ? "withPlugin" : "noPlugin"),
      {
        reads: frames.length,
        frames,
        statePath: r.getState()?.path,
      },
    );
  }
}

/**
 * S3 — P3 на КАНАЛЕ SEARCH отдельно (не по аналогии с params): унаследованный
 * аксессор под именем ключа `q` и собственный "__proto__" из JSON.parse.
 */
async function s3(): Promise<void> {
  const proto = Object.prototype as unknown as Record<string, unknown>;
  let setterCalls = 0;
  let getterCalls = 0;

  try {
    Object.defineProperty(proto, "q", {
      configurable: true,
      get(): unknown {
        getterCalls += 1;

        return "FROM_PROTO";
      },
      set(): void {
        setterCalls += 1;
      },
    });

    const ctl: Record<string, unknown> = {};

    (ctl as { q?: unknown }).q = "x";
    const controlSetterCalls = setterCalls;

    const r = await mk(true);
    const st = await r.navigate("b", { id: "7" }, { q: "y" });

    out("S3·P3·search·inherited-accessor", {
      controlSetterCalls,
      setterCallsAfterNavigate: setterCalls - controlSetterCalls,
      getterCalls,
      statePath: st.path,
      stateSearchQ: (st.search as Record<string, unknown>).q,
      stateSearchProtoIsNull: Object.getPrototypeOf(st.search) === null,
      buildPath: attempt(() => r.buildPath("b", { id: "7" }, { q: "z" })),
      isActiveRoute: attempt(() =>
        r.isActiveRoute("b", { id: "7" }, { q: "y" }, true, false),
      ),
      canNavigateTo: attempt(() => r.canNavigateTo("b", { id: "7" }, { q: "z" })),
    });
  } finally {
    delete proto.q;
  }

  const polluting = JSON.parse('{"__proto__":{"polluted2":1},"q":"z"}') as Record<
    string,
    unknown
  >;
  const r2 = await mk(true);
  const st2 = await r2.navigate("b", { id: "8" }, polluting as never);

  out("S3·P3·search·own-__proto__", {
    inputHasOwnProto: Object.hasOwn(polluting, "__proto__"),
    statePath: st2.path,
    stateSearchOwnKeys: Object.getOwnPropertyNames(st2.search),
    buildPath: attempt(() => r2.buildPath("b", { id: "8" }, polluting as never)),
    isActiveRoute: attempt(() =>
      r2.isActiveRoute("b", { id: "8" }, polluting as never, false, false),
    ),
    canNavigateTo: attempt(() =>
      r2.canNavigateTo("b", { id: "8" }, polluting as never),
    ),
    prototypePolluted: ({} as Record<string, unknown>).polluted2 !== undefined,
  });
}

void (async (): Promise<void> => {
  await s1();
  await s2();
  await s3();
})();
