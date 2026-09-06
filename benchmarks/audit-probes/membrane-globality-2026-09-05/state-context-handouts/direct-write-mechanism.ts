// Механизм записи в закоммиченный context: прямая `[[Set]]` через хэндаут
// (getState().context[k] = v) против claim.write → putField (define).
// P3-ось: контейнер ядра `context` имеет Object.prototype в цепочке
// (materialize · buildState: `context: {}`), поэтому:
//   • прямая запись ключа "__proto__" ПОДМЕНЯЕТ прототип контейнера ядра;
//   • прямая запись под именем унаследованного аксессора уходит в сеттер.
// claim.write (putField) оба случая закрывает define-записью.
// Плюс: что переживает spread-копию контейнера при replace()-ревалидации
// (собственные ключи — да, подменённый прототип — нет).
// Контроль: обычный ключ через ОБА пути попадает как own enumerable data.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

type Ctx = Record<string, unknown>;
type St = { name: string; context: Ctx };

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a/:id" },
];

const mk = async (): Promise<ReturnType<typeof createRouter>> => {
  const r = createRouter(ROUTES as never, {} as never);
  await r.start("/h");
  return r;
};
const ctxOf = (r: ReturnType<typeof createRouter>): Ctx =>
  (r.getState() as unknown as St).context;
const tryWrite = (fn: () => void): string => {
  try {
    fn();
    return "no-throw";
  } catch (e) {
    return `throw:${(e as Error).constructor.name}`;
  }
};
const describe = (o: object, key: string): string => {
  const d = Object.getOwnPropertyDescriptor(o, key);
  if (!d) {
    return "no-own";
  }
  return `own:${"value" in d ? "data" : "accessor"}:enum=${d.enumerable}`;
};

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const evil = { injected: "from-app" };

  // ── 0. Контроль: обычный ключ через оба пути ──────────────────────────────
  {
    const r = await mk();
    const c = ctxOf(r);
    c.plain = { v: 1 };
    getPluginApi(r)
      .claimContextNamespace("claimed")
      .write(r.getState() as never, { v: 2 });
    out.control_plainKey = {
      direct: describe(c, "plain"),
      claim: describe(c, "claimed"),
      proto:
        Object.getPrototypeOf(c) === Object.prototype
          ? "Object.prototype"
          : "other",
    };
    r.dispose();
  }

  // ── 1. "__proto__" напрямую vs через claim.write ─────────────────────────
  {
    const r = await mk();
    const c = ctxOf(r);
    const w = tryWrite(() => {
      c["__proto__"] = evil;
    });
    getRoutesApi(r).replace(ROUTES as never);
    const c2 = ctxOf(r);
    out.protoKey_direct = {
      write: w,
      "prototype swapped to app object": Object.getPrototypeOf(c) === evil,
      ownProtoKey: describe(c, "__proto__"),
      "'injected' in context (inherited now)": "injected" in c,
      "Object.keys": Object.keys(c),
      afterReplace: {
        "context is a new object": c2 !== c,
        "prototype reset to Object.prototype":
          Object.getPrototypeOf(c2) === Object.prototype,
        "'injected' in new context": "injected" in c2,
      },
    };
    r.dispose();
  }
  {
    const r = await mk();
    const c = ctxOf(r);
    const claim = getPluginApi(r).claimContextNamespace("__proto__");
    const w = tryWrite(() => {
      claim.write(r.getState() as never, evil);
    });
    getRoutesApi(r).replace(ROUTES as never);
    const c2 = ctxOf(r);
    out.protoKey_claimWrite = {
      write: w,
      "prototype intact": Object.getPrototypeOf(c) === Object.prototype,
      ownProtoKey: describe(c, "__proto__"),
      "value by reference":
        Object.getOwnPropertyDescriptor(c, "__proto__")?.value === evil,
      afterReplace: {
        "own __proto__ survives the spread copy": describe(c2, "__proto__"),
        "still by reference":
          Object.getOwnPropertyDescriptor(c2, "__proto__")?.value === evil,
        "prototype intact": Object.getPrototypeOf(c2) === Object.prototype,
      },
    };
    r.dispose();
  }

  // ── 2. Унаследованный аксессор на Object.prototype под именем неймспейса ──
  {
    let captured: unknown = "never";
    Object.defineProperty(Object.prototype, "ambientNs", {
      configurable: true,
      enumerable: false,
      get() {
        return "AMBIENT";
      },
      set(v: unknown) {
        captured = v;
      },
    });
    try {
      const r = await mk();
      const c = ctxOf(r);
      const v = { app: "value" };
      const w = tryWrite(() => {
        c.ambientNs = v;
      });
      out.ambientAccessor_direct = {
        write: w,
        "setter captured the app value (write diverted)": captured === v,
        own: describe(c, "ambientNs"),
        "read back": c.ambientNs,
      };
      captured = "never";
      const claim = getPluginApi(r).claimContextNamespace("ambientNs");
      const w2 = tryWrite(() => {
        claim.write(r.getState() as never, v);
      });
      out.ambientAccessor_claimWrite = {
        write: w2,
        "setter captured?": captured === v,
        own: describe(c, "ambientNs"),
        "read back is the app value": c.ambientNs === v,
      };
      r.dispose();
    } finally {
      delete (Object.prototype as Ctx).ambientNs;
    }
  }

  // ── 3. Оболочка — не дверь: frozen shell в strict-модуле бросает ─────────
  {
    const r = await mk();
    const s = r.getState() as unknown as Ctx;
    const d = Object.getOwnPropertyDescriptor(s, "context");
    out.shell = {
      "getState().x = 1": tryWrite(() => {
        s.x = 1;
      }),
      "getState().context = {}": tryWrite(() => {
        s.context = {};
      }),
      "getState().params.k = 1": tryWrite(() => {
        (s.params as Ctx).k = 1;
      }),
      "getState().transition.phase = 'x'": tryWrite(() => {
        (s.transition as Ctx).phase = "x";
      }),
      "context is a data property on the frozen shell":
        d !== undefined && "value" in d && d.writable === false,
    };
    r.dispose();
  }

  // ── 4. P4: ядро не морозит ничего ВНУТРИ context ─────────────────────────
  {
    const r = await mk();
    const v = { nested: { deep: 1 } };
    getPluginApi(r).claimContextNamespace("p4").write(r.getState() as never, v);
    ctxOf(r).direct = { nested: { deep: 2 } };
    await r.navigate("a", { id: "1" } as never);
    const prev = (r.getPreviousState() as unknown as St).context;
    out.p4_noDeepFreeze = {
      "claim value frozen by core": Object.isFrozen(prev.p4),
      "claim value.nested frozen by core": Object.isFrozen(
        (prev.p4 as Ctx).nested,
      ),
      "direct value frozen by core": Object.isFrozen(prev.direct),
      "context container frozen": Object.isFrozen(prev),
    };
    r.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
