// Единственный кандидат MUST-(б) семейства: на ФОРВАРДЯЩЕМ маршруте мешок
// вызывающего приходит в `forwardTo(getDependency, params)` ПО ИДЕНТИЧНОСТИ
// (transient-handouts.ts: isCallerBag=true для isActiveRoute и navigate).
//
// Вопрос ровно один: СЛОМАЕТ ли копия контейнера на границе наблюдаемое
// поведение? Строим три случая и показываем исход ИСПОЛНЕНИЕМ:
//   A. колбэк сравнивает `params === retainedRef` (идентичность как контракт);
//   B. колбэк МУТИРУЕТ params — видит ли ядро мутацию ниже по потоку;
//   C. колбэк кладёт params ключом в WeakMap и ждёт попадания на след. кадре.
// Копия эмулируется обёрткой ВОКРУГ двери (src не правится): дверь зовётся с
// `{...bag}`; retainedRef во всех случаях — ОРИГИНАЛ, который держит приложение.
//
// Позитивный контроль: без обёртки (арм `original`) A даёт true — значит тест
// вообще способен различить идентичность.
import { createRouter } from "@real-router/core";

type Bag = Record<string, unknown>;

const out: Record<string, unknown> = {};
const seenByWeakMap = new WeakMap<object, string>();

const build = (
  record: (row: Record<string, unknown>) => void,
  retained: () => Bag,
  mutate: boolean,
) =>
  [
    {
      name: "src",
      path: "/src/:id",
      forwardTo: (_dep: unknown, params: Params0) => {
        const p = params as unknown as Bag;
        record({
          identityWithRetained: (p as unknown) === (retained() as unknown),
          weakMapHit: seenByWeakMap.get(p as object) ?? null,
          keysAtCallback: Object.keys(p),
          frozenAtCallback: Object.isFrozen(p),
        });
        seenByWeakMap.set(p as object, "stamped");
        if (mutate) {
          try {
            (p as Bag).injectedByCallback = "YES";
            (p as Bag).id = "MUTATED";
          } catch {
            /* frozen */
          }
        }
        return "dst";
      },
    },
    { name: "dst", path: "/dst/:id" },
    { name: "plain", path: "/plain/:id" },
  ] as never;

type Params0 = Record<string, unknown>;

const scenario = async (
  label: string,
  copyAtBoundary: boolean,
  mutate: boolean,
) => {
  const rows: Record<string, unknown>[] = [];
  const original: Bag = { id: "7" };
  const r = createRouter(
    build(
      (row) => rows.push(row),
      () => original,
      mutate,
    ),
    {} as never,
  );
  r.start("/plain/1");

  // Эмуляция стратегии (а): дверь получает КОПИЮ контейнера, листья — те же.
  const handed: Bag = copyAtBoundary ? { ...original } : original;

  const st = (await r.navigate("src", handed as never)) as {
    path: string;
    params: Bag;
  };

  out[label] = {
    calls: rows.length,
    rows,
    committedPath: st.path,
    committedParams: st.params,
    originalAfter: { ...original },
    originalMutatedByCallback: "injectedByCallback" in original,
  };
};

async function main(): Promise<void> {
  // A + C: идентичность и WeakMap-ключ, БЕЗ мутации.
  await scenario("A/C · original (позитивный контроль идентичности)", false, false);
  await scenario("A/C · copyAtBoundary", true, false);
  // B: мутация внутри колбэка.
  await scenario("B · original + мутация в колбэке", false, true);
  await scenario("B · copyAtBoundary + мутация в колбэке", true, true);

  console.log(JSON.stringify(out, null, 1));
}

void main();
