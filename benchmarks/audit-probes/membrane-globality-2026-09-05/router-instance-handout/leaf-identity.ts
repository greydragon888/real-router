// Что сломала бы стратегия (а) «скопировать контейнер на границе» для
// Router·[key: string]: контейнера-мешка у этой двери нет — значение и есть
// «контейнер», а его идентичность нужна и писателю, и читателям по имени
// (адаптеры читают `router.buildUrl`, preload-plugin читает `router.matchUrl`).
// Сегодня: идентичность и двусторонняя видимость мутаций держатся.
// Смоделированная (а): аксессор, хранящий поверхностную копию.
import { createRouter } from "@real-router/core";

type Bag = Record<string, unknown>;
const routes = [{ name: "home", path: "/" }] as never;

interface Store {
  count: number;
  inc: () => void;
}
function makeStore(): Store {
  const s: Store = {
    count: 0,
    inc() {
      s.count += 1;
    },
  };
  return s;
}

// СЕГОДНЯ
const today = createRouter(routes, {} as never);
const s1 = makeStore();
(today as Bag).store = s1;
s1.inc();
((today as Bag).store as Store).inc();
const todayResult = {
  identity: (today as Bag).store === s1,
  writerSeesReaderMutation: s1.count,
  readerSeesWriterMutation: ((today as Bag).store as Store).count,
};

// СМОДЕЛИРОВАННАЯ (а)
const copying = createRouter(routes, {} as never);
let held: unknown;
Object.defineProperty(copying, "store", {
  enumerable: true,
  configurable: true,
  set(v: object): void {
    held = { ...v };
  },
  get(): unknown {
    return held;
  },
});
const s2 = makeStore();
(copying as Bag).store = s2;
s2.inc();
((copying as Bag).store as Store).inc();
const copyResult = {
  identity: (copying as Bag).store === s2,
  writerSeesReaderMutation: s2.count,
  readerSeesWriterMutation: ((copying as Bag).store as Store).count,
};

console.log(
  JSON.stringify({ today: todayResult, simulatedCopy: copyResult }, null, 1),
);
