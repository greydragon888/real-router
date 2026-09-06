/**
 * ОПРОВЕРГАТЕЛЬ · P1 на горле ingestDependencies.
 *
 * Горло судит ключ по getOwnPropertyDescriptor(bag,key)?.get, а ЗНАЧЕНИЕ берёт
 * отдельным bag[key] в той же итерации. Два ОБРАЩЕНИЯ к одному ключу: предикат
 * оценивается на первом, значение — на втором. Форма #1899 «спросить, потом
 * взять». Проверяем ИСПОЛНЕНИЕМ, расходятся ли оценки на лгущем Proxy.
 */
import { createRouter } from "@real-router/core";
import { getDependenciesApi, cloneRouter } from "@real-router/core/api";

const ROUTES = [{ name: "home", path: "/" }] as const;
const out: Record<string, unknown> = {};

// ---------- ПОЗИТИВНЫЙ КОНТРОЛЬ 1: честный геттер отвергается ----------
let honestGetterRuns = 0;
const honestBag = {
  get svc() {
    honestGetterRuns++;
    return { real: true };
  },
};
let honestVerdict = "no-throw";
try {
  createRouter(ROUTES as never, {}, honestBag as never);
} catch (e) {
  honestVerdict = `throw:${(e as Error).message}`;
}
out["posControl1_honestGetter"] = { honestVerdict, honestGetterRuns };

// ---------- ИНСТРУМЕНТ: Proxy, который ЛЖЁТ дескриптором ----------
let sideEffects = 0;
const FIRST = { tag: "FIRST" };
const LATER = { tag: "LATER" };
function lyingBag() {
  const target: Record<string, unknown> = { svc: FIRST };
  return new Proxy(target, {
    ownKeys: () => ["svc"],
    getOwnPropertyDescriptor: () => ({
      value: FIRST, // дескриптор говорит: обычное поле, геттера НЕТ
      writable: true,
      enumerable: true,
      configurable: true,
    }),
    get: (_t, k) => {
      if (k === "svc") {
        sideEffects++; // ЧУЖОЙ КОД ИСПОЛНЯЕТСЯ на [[Get]]
        return LATER; // и отдаёт НЕ то, что показал дескриптор
      }
      return undefined;
    },
  });
}

// контроль лживости инструмента (до чтения любого нуля)
const inst = lyingBag();
const instBefore = sideEffects;
const instDesc = Object.getOwnPropertyDescriptor(inst, "svc");
const instAfterGopd = sideEffects;
const instValue = (inst as Record<string, unknown>)["svc"];
out["CONTROL_instrumentLies"] = {
  gopdSaysNoGetter: instDesc?.get === undefined,
  gopdRanNoCode: instAfterGopd === instBefore,
  getExecutedCode: sideEffects === instBefore + 1,
  gopdValueIsFIRST: instDesc?.value === FIRST,
  getValueIsLATER: instValue === LATER,
};

// ---------- АТАКА на каждую арку горла ----------
function arm(label: string, run: (bag: unknown) => unknown) {
  const before = sideEffects;
  let verdict = "no-throw";
  let landed: unknown = undefined;
  try {
    landed = run(lyingBag());
  } catch (e) {
    verdict = `throw:${(e as Error).message}`;
  }
  out[label] = {
    verdict,
    callerCodeExecutedDuringIngest: sideEffects - before,
    landedIsLATER_notTheJudgedFIRST: landed === LATER,
    landedIsFIRST: landed === FIRST,
  };
}

arm("A_createRouter", (bag) => {
  const r = createRouter(ROUTES as never, {}, bag as never);
  return getDependenciesApi(r as never).get("svc" as never);
});

arm("B_setAll", (bag) => {
  const r = createRouter(ROUTES as never, {}, {} as never);
  const api = getDependenciesApi(r as never);
  api.setAll(bag as never);
  return api.get("svc" as never);
});

arm("C_cloneRouter", (bag) => {
  const base = createRouter(ROUTES as never, {}, {} as never);
  const c = cloneRouter(base as never, bag as never);
  return getDependenciesApi(c as never).get("svc" as never);
});

// ---------- ПОЗИТИВНЫЙ КОНТРОЛЬ 2: честный мешок доходит ----------
const okRouter = createRouter(ROUTES as never, {}, { svc: FIRST } as never);
out["posControl2_plainBagLands"] =
  getDependenciesApi(okRouter as never).get("svc" as never) === FIRST;

console.log(JSON.stringify(out, null, 1));
