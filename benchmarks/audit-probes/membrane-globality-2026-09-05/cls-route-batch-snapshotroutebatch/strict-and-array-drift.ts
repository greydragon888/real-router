// Два добора:
// (D) режим строгости среды пробы — чтобы вердикт про «унаследованный геттер
//     без сеттера не бросил» не был артефактом транспиляции;
// (E) дрейф ИНДЕКСА массива-контейнера: гвард обходит `for…of`, снапшот — `map`,
//     значит индекс читается дважды. Расходятся ли валидированное и записанное.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

type AnyRoute = Record<string, unknown>;
type Arc = "createRouter" | "add" | "replace";

function run(arc: Arc, batch: unknown[]): ReturnType<typeof createRouter> {
  if (arc === "createRouter") {
    return createRouter(batch as never);
  }

  const router = createRouter([{ name: "seed", path: "/seed" }] as never);

  if (arc === "add") {
    getRoutesApi(router).add(batch as never);
  } else {
    getRoutesApi(router).replace(batch as never);
  }

  return router;
}

function main(): void {
  // ═══ (D) строгость: присваивание по унаследованному геттеру без сеттера ═══
  {
    let threw: string | null = null;

    Object.defineProperty(Object.prototype, "probeSlot", {
      configurable: true,
      get: () => 1,
    });

    try {
      const o: AnyRoute = {};

      o.probeSlot = 2;
    } catch (error) {
      threw = String(error).slice(0, 120);
    } finally {
      delete (Object.prototype as AnyRoute).probeSlot;
    }

    out["D probe module strict mode (throw on setter-less inherited write)"] =
      threw;
    out["D typeof this in a bare function (undefined ⇒ strict)"] = (function (
      this: unknown,
    ) {
      return this === undefined ? "undefined (strict)" : "global (sloppy)";
    })();
  }

  // ═══ (E) дрейф индекса массива-контейнера ════════════════════════════════
  for (const arc of ["createRouter", "add", "replace"] as const) {
    const legal: AnyRoute = { name: "kid", path: "/kid" };
    const banned: AnyRoute = {
      get name(): string {
        return "evil";
      },
      path: "/evil",
    };
    const arr = [legal];
    const reads: Record<string, number> = {};
    const proxy = new Proxy(arr, {
      get(target, key, receiver): unknown {
        if (key === "0") {
          reads["0"] = (reads["0"] ?? 0) + 1;

          return reads["0"] === 1 ? legal : banned;
        }

        return Reflect.get(target, key, receiver);
      },
    });
    let threw: string | null = null;
    let router: ReturnType<typeof createRouter> | null = null;

    try {
      router = run(arc, proxy as unknown[]);
    } catch (error) {
      threw = String(error).slice(0, 200);
    }

    out[`${arc} · E batch index drift`] = {
      indexReads: reads["0"],
      threw,
      hasEvil: router ? getRoutesApi(router).has("evil") : null,
      hasKid: router ? getRoutesApi(router).has("kid") : null,
    };
    router?.dispose();

    // ПОЗИТИВНЫЙ КОНТРОЛЬ: тот же объект БЕЗ дрейфа — отвергнут гвардом.
    let directThrew: string | null = null;

    try {
      const r = run(arc, [banned]);

      r.dispose();
    } catch (error) {
      directThrew = String(error).slice(0, 200);
    }

    out[`${arc} · E positive control: same element WITHOUT drift is refused`] =
      directThrew;
  }

  console.log(JSON.stringify(out, null, 1));
}

main();
