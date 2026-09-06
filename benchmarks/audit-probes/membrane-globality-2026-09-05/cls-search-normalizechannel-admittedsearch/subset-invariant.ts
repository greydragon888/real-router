// ОБЩИЙ ВОПРОС СЕМЕЙСТВА: печатает ли режимный гейт ключ, которого активный
// queryParamsMode не допускает — то есть держится ли keys(state.search) ⊆
// keys(URL-query), — при ЛГУЩЕМ/ДРЕЙФУЮЩЕМ мешке.
//
// Наблюдаемое сравнение — БЕЗ разбора ядром: ключи state.search против ключей,
// вычитанных из строки state.path собственным URLSearchParams пробы. Так вердикт
// не зависит от того же кода, который его порождает.
//
// Позитивный контроль инструмента: под "loose" необъявленный ключ ДОЛЖЕН быть
// и в state.search, и в URL (подмножество держится по другой причине); под
// "default" его не должно быть НИ ТАМ, НИ ТАМ. Оба режима печатаются.
import { createRouter } from "@real-router/core";

import { driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

type Bag = Record<string, unknown>;
type Obs = Record<string, unknown>;

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "plain", path: "/plain/:id" },
] as never;

const queryKeysOfPath = (path: string): string[] => {
  const q = path.indexOf("?");
  return q === -1
    ? []
    : [...new Set([...new URLSearchParams(path.slice(q + 1)).keys()])];
};

const subset = (a: string[], b: string[]): boolean =>
  a.every((k) => b.includes(k));

async function navArm(mode: string, bag: Bag): Promise<Obs> {
  const r = createRouter(ROUTES, { queryParamsMode: mode } as never);
  r.start("/plain/1");
  let outcome = "OK";
  try {
    await r.navigate("u", { id: "7" } as never, bag as never);
  } catch (e) {
    outcome = `REJECT ${String((e as Error).message).slice(0, 70)}`;
  }
  const s = r.getState() as Obs | null;
  const searchKeys = Object.keys((s?.search ?? {}) as object);
  const pathKeys = queryKeysOfPath(String(s?.path ?? ""));
  return {
    outcome,
    path: s?.path,
    searchKeys,
    pathKeys,
    subsetHolds: subset(searchKeys, pathKeys),
  };
}

// ЛГУЩИЙ Proxy: ownKeys НЕ называет ключ, gOPD утверждает, что он собственный.
const lying = (key: string): Bag =>
  new Proxy({} as Bag, {
    ownKeys: (t) => Reflect.ownKeys(t),
    getOwnPropertyDescriptor: (t, k) =>
      k === key
        ? { value: "LIE", enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(t, k),
    get: (t, k, rec) => (k === key ? "LIE" : Reflect.get(t, k, rec)),
    has: (t, k) => k === key || Reflect.has(t, k),
  });

const SHAPES: readonly (readonly [string, () => Bag])[] = [
  ["control·declared", () => ({ tab: "x" })],
  ["control·undeclared", () => ({ zzz: "u" })],
  ["lying·declaredKeyHidden", () => lying("tab")],
  ["lying·undeclaredKeyHidden", () => lying("zzz")],
  ["drifting·declared", () => driftingBag({ tab: "A" }, { tab: "B" }).bag],
  [
    "drifting·undeclared",
    () => driftingBag({ zzz: "A" }, { zzz: "B" }).bag as Bag,
  ],
  ["declaredUndefined", () => ({ tab: undefined })],
  ["ownProto", () => JSON.parse('{"tab":"x","__proto__":{"p":1}}') as Bag],
  ["emptyStringValue", () => ({ tab: "" })],
  ["arrayValue", () => ({ tab: ["a", "b"] })],
];

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  let violations = 0;
  let cells = 0;
  for (const mode of ["default", "strict", "loose"]) {
    const per: Record<string, unknown> = {};
    for (const [label, make] of SHAPES) {
      const res = await navArm(mode, make());
      per[label] = res;
      cells += 1;
      if (res.subsetHolds === false) violations += 1;
    }
    out[mode] = per;
  }
  out["SUMMARY"] = {
    cells,
    subsetViolations: violations,
    denominator: `${SHAPES.length} форм × 3 режима`,
  };
  console.log(JSON.stringify(out, null, 1));
}

void main();
