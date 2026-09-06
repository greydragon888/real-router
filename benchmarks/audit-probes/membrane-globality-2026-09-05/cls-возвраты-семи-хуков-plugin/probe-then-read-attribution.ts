// Атрибуция чтений `.then`: сколько раз читает ЯДРО (EventEmitter · #invokeIsolated)
// и сколько — спецификация промисов, при СТАБИЛЬНОМ и при ДРЕЙФУЮЩЕМ геттере.
// Реплика ровно той ветки, что в EventEmitter.ts · #invokeIsolated, вне ядра.

const log: string[] = [];

function coreBranch(result: unknown, tag: string): void {
  // Дословная форма ветки ядра.
  if (
    result !== null &&
    result !== undefined &&
    typeof (result as PromiseLike<unknown>).then === "function"
  ) {
    log.push(`${tag}: core decided ADOPT`);
    Promise.resolve(result as PromiseLike<unknown>).catch((e: unknown) => {
      log.push(`${tag}: sink got ${String((e as Error).message)}`);
    });
  } else {
    log.push(`${tag}: core decided IGNORE`);
  }
}

function drifting(tag: string, plan: (n: number) => unknown): unknown {
  let n = 0;

  return {
    get then() {
      n += 1;
      log.push(`${tag}: read#${n}`);

      return plan(n);
    },
  };
}

async function main(): Promise<void> {
  // A. Стабильный отвергающий thenable — позитивный контроль.
  coreBranch(
    drifting("stable", () => (_r: unknown, rej: (e: unknown) => void) => {
      rej(new Error("BOOM"));
    }),
    "stable",
  );

  await new Promise((r) => setTimeout(r, 20));

  // B. Дрейфующий: read#1 — отвергающая функция (по ней ядро ПРИНИМАЕТ решение),
  //    read#2 — не функция.
  coreBranch(
    drifting("drift", (n) =>
      n === 1
        ? (_r: unknown, rej: (e: unknown) => void) => {
            rej(new Error("BOOM"));
          }
        : 42,
    ),
    "drift",
  );

  await new Promise((r) => setTimeout(r, 20));

  // C. Обратный дрейф: read#1 — не функция (ядро игнорирует), read#2 — функция.
  coreBranch(
    drifting("reverse", (n) =>
      n === 1
        ? 42
        : (_r: unknown, rej: (e: unknown) => void) => {
            rej(new Error("BOOM"));
          },
    ),
    "reverse",
  );

  await new Promise((r) => setTimeout(r, 20));


  // D. МЕХАНИЗМ поломки копии: `then` реального Promise — УНАСЛЕДОВАННЫЙ метод,
  //    собственных ключей у промиса нет, поэтому мелкая копия контейнера теряет
  //    протокол целиком. У враждебного thenable с СОБСТВЕННЫМ геттером копия его
  //    сохраняет (геттер срабатывает в момент копирования).
  const realPromise = Promise.reject(new Error("BOOM"));

  realPromise.catch(() => undefined);

  const ownKeysOfPromise = Reflect.ownKeys(realPromise).length;
  const copyOfPromise = { ...realPromise } as Record<string, unknown>;
  const hostile = {
    get then() {
      return (_r: unknown, rej: (e: unknown) => void) => {
        rej(new Error("BOOM"));
      };
    },
  };
  const copyOfHostile = { ...hostile } as Record<string, unknown>;

  log.push(
    `mechanism: ownKeys(realPromise)=${ownKeysOfPromise} ` +
      `typeof copyOfPromise.then=${typeof copyOfPromise.then} ` +
      `typeof copyOfHostile.then=${typeof copyOfHostile.then}`,
  );

  console.log(JSON.stringify(log, null, 1));
}

void main().catch((e: unknown) => {
  console.log("THROWN", e);
});
