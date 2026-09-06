// Решающая рука семейства: ФЛИП ВЕРДИКТА ядра через каждую дверь.
// Дискриминирующий вход — ключ, который ядро обязано КЛАССИФИЦИРОВАТЬ:
// объявленный `?tab` (должен попасть в state.search) и необъявленный `nope`
// (должен быть отброшен mode-гейтом). Каждая рука имеет контроль.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
const out: AnyRec = {};
const t = (fn: () => unknown): unknown => {
  try {
    return fn();
  } catch (e) {
    return `throw:${(e as Error).name}:${(e as Error).message.slice(0, 80)}`;
  }
};

type Int = {
  getQueryParams: (n: string) => readonly string[];
  matchPath: (p: string) => AnyRec | undefined;
  port: () => {
    queryNames: (n: string) => readonly string[];
    pathNames: (n: string) => readonly string[] | undefined;
  };
  routeGetStore: () => AnyRec & {
    matcher: {
      getDeclaredQueryParams: (n: string) => readonly string[] | undefined;
    };
    urlParamsCache: Map<string, string[]>;
    queryParamsCache: Map<string, string[]>;
  };
};
type R = {
  buildPath: (n: string, p?: AnyRec, s?: AnyRec) => string;
};

const mk = (mode = "default") => {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "q", path: "/q/:id?tab" },
    ] as never,
    { defaultRoute: "home", queryParamsMode: mode } as never,
  );
  const int = getInternals(router) as unknown as Int;
  return { router, int, store: int.routeGetStore() };
};

// Наблюдатели, чей вердикт РЕШАЕТСЯ реестром.
const verdicts = (router: unknown, int: Int): AnyRec => {
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  return {
    registry: [...int.getQueryParams("q")],
    // объявленный ключ обязан выжить в state.search
    makeState_declared: t(() => ({
      ...(api.makeState("q", { id: "1" }, { tab: "x" }).search as AnyRec),
    })),
    // необъявленный ключ обязан быть отброшен
    makeState_undeclared: t(() => ({
      ...(api.makeState("q", { id: "1" }, { nope: "z" }).search as AnyRec),
    })),
    // тот же вопрос на печати
    buildDeclared: t(() =>
      (router as R).buildPath("q", { id: "1" }, { tab: "x" }),
    ),
    buildUndeclared: t(() =>
      (router as R).buildPath("q", { id: "1" }, { nope: "z" }),
    ),
    // канальный гвард: объявленный ?-ключ в PATH-мешке
    buildMisChanneled: t(() =>
      (router as R).buildPath("q", { id: "1", tab: "x" }),
    ),
    matchPath: t(() => {
      const s = int.matchPath("/q/1?tab=z&nope=w");
      return s && { params: { ...(s.params as AnyRec) }, search: { ...(s.search as AnyRec) } };
    }),
  };
};

for (const mode of ["default", "strict"]) {
  const arm: AnyRec = {};
  // --- контроль
  {
    const { router, int } = mk(mode);
    arm.CONTROL = verdicts(router, int);
  }
  // --- D1/D2: push в getQueryParams·return (== port().queryNames·return)
  {
    const { router, int } = mk(mode);
    verdicts(router, int); // прогрев кэша
    (int.getQueryParams("q") as string[]).push("nope");
    arm.pushIntoRegistry = verdicts(router, int);
  }
  // --- то же ЧЕРЕЗ ПОРТ (второй вход к тому же объекту)
  {
    const { router, int } = mk(mode);
    verdicts(router, int);
    (int.port().queryNames("q") as string[]).push("nope");
    arm.pushViaPortQueryNames = verdicts(router, int);
  }
  // --- D3: push в port().pathNames·return (крадёт объявленный ?tab в path-реестр)
  {
    const { router, int } = mk(mode);
    // кэш path ХОЛОДНЫЙ, реестр запроса ещё не выведен
    (int.port().pathNames("q") as string[]).push("tab");
    arm.pushIntoPathNames = verdicts(router, int);
  }
  // --- D4: push в matcher.getDeclaredQueryParams·return
  {
    const { router, int, store } = mk(mode);
    (store.matcher.getDeclaredQueryParams("q") as string[]).push("nope");
    arm.pushIntoMatcherDeclared = verdicts(router, int);
  }
  // --- D4': УДАЛЕНИЕ объявленного имени из матчерного массива
  {
    const { router, int, store } = mk(mode);
    (store.matcher.getDeclaredQueryParams("q") as string[]).length = 0;
    arm.emptyMatcherDeclared = verdicts(router, int);
  }
  // --- D4'': Symbol.species-перехват `declared.filter(...)` в queryParamsFor
  {
    const { router, int, store } = mk(mode);
    const declared = store.matcher.getDeclaredQueryParams("q") as string[];
    class Hijack {
      constructor(_len?: number) {
        // filter пишет через [[DefineOwnProperty]] — Proxy лжёт и глотает записи
        return new Proxy([] as unknown[], {
          defineProperty: () => true,
        }) as unknown as Hijack;
      }
      static get [Symbol.species](): unknown {
        return Hijack;
      }
    }
    (declared as unknown as AnyRec).constructor = Hijack;
    arm.speciesHijack = verdicts(router, int);
  }
  // --- РУКА (а): копирующий кэш — то же отравление не доходит
  {
    const { router, int, store } = mk(mode);
    (store as AnyRec).urlParamsCache = new (class extends Map<string, string[]> {
      override get(k: string): string[] | undefined {
        const v = super.get(k);
        return v === undefined ? undefined : [...v];
      }
    })();
    (store as AnyRec).queryParamsCache = new (class extends Map<
      string,
      string[]
    > {
      override get(k: string): string[] | undefined {
        const v = super.get(k);
        return v === undefined ? undefined : [...v];
      }
    })();
    verdicts(router, int);
    (int.getQueryParams("q") as string[]).push("nope");
    (int.port().pathNames("q") as string[]).push("tab");
    arm.COPY_ARM_poisoned = verdicts(router, int);
  }
  out[mode] = arm;
}

console.log(JSON.stringify(out, null, 1));
