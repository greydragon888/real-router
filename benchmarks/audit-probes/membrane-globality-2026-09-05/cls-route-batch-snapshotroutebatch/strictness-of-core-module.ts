// Почему присваивание `snapshot.children = …` НЕ бросило при унаследованном
// геттере без сеттера: реплика той же формы в пробе + прямое наблюдение за
// значением слота после прохода через ядро.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

type AnyRoute = Record<string, unknown>;
const out: Record<string, unknown> = {};

// ── (1) реплика формы в пробе (строгий модуль) ───────────────────────────────
{
  const injected = [{ name: "evil", path: "/evil" }];
  let threw: string | null = null;

  Object.defineProperty(Object.prototype, "children", {
    configurable: true,
    get(this: unknown): unknown {
      return this !== null &&
        typeof this === "object" &&
        (this as AnyRoute).name === "u"
        ? injected
        : undefined;
    },
  });

  try {
    const snapshot: AnyRoute = { name: "u", path: "/u" };

    if (Array.isArray(snapshot.children)) {
      snapshot.children = [{ name: "copy", path: "/copy" }];
    }
  } catch (error) {
    threw = String(error).slice(0, 140);
  } finally {
    delete (Object.prototype as AnyRoute).children;
  }

  out["1 · replica in probe module throws?"] = threw;
}

// ── (2) то же через ядро; смотрим, ЧЕЙ массив осел в дереве ─────────────────
for (const withSetter of [true, false]) {
  const injected: AnyRoute[] = [{ name: "evil", path: "/evil" }];
  let threw: string | null = null;
  let treeHasEvil: boolean | null = null;
  let childNodeIsCallerObject: boolean | null = null;

  const d: PropertyDescriptor = {
    configurable: true,
    get(this: unknown): unknown {
      return this !== null &&
        typeof this === "object" &&
        (this as AnyRoute).name === "u"
        ? injected
        : undefined;
    },
  };

  if (withSetter) {
    d.set = function (): void {
      /* swallow */
    };
  }

  Object.defineProperty(Object.prototype, "children", d);

  let router: ReturnType<typeof createRouter> | null = null;

  try {
    router = createRouter([{ name: "u", path: "/u" }] as never);
    treeHasEvil = getRoutesApi(router).has("u.evil");
  } catch (error) {
    threw = String(error).slice(0, 200);
  } finally {
    delete (Object.prototype as AnyRoute).children;
  }

  if (router) {
    const evil = getRoutesApi(router).get("u.evil") as AnyRoute | undefined;

    childNodeIsCallerObject = evil === injected[0];
    out[`2 · path built for injected child (${withSetter ? "get+set" : "get"})`] =
      (() => {
        try {
          return router.buildPath("u.evil", {});
        } catch (error) {
          return String(error).slice(0, 120);
        }
      })();
    out[`2 · getRouteConfig("u.evil") (${withSetter ? "get+set" : "get"})`] =
      getPluginApi(router).getRouteConfig("u.evil");
    router.dispose();
  }

  out[`2 · via core (${withSetter ? "get+set" : "get only"})`] = {
    threw,
    treeHasEvil,
    childNodeIsCallerObject,
  };
}

console.log(JSON.stringify(out, null, 1));
