// ОДНА арма на процесс: сайт `browser.getState()` внутри
// canSkipPopstateHistoryWrite остаётся мономорфным.
//   A — живая запись браузера
//   B — ГЛУБОКАЯ копия (то, что пошло в заголовок отчёта)
//   S — копия только КОНТЕЙНЕРА, листья по ссылке: каноничная форма (а)
import { createRouter } from "@real-router/core";
import { canSkipPopstateHistoryWrite } from "../../../../shared/browser-env/popstate-utils";

import type { State } from "@real-router/core/types";

let sink: unknown;

const arm = process.argv[2] ?? "A";
const iters = Number(process.argv[3] ?? 2_000_000);

async function main(): Promise<void> {
  const router = createRouter([{ name: "u", path: "/u/:id" }] as never, {} as never);
  await router.start("/u/1");

  const toState = router.getState() as State;
  const live = { name: "u", params: { id: "1" }, search: {}, path: toState.path };

  const getState =
    arm === "B"
      ? () => ({ ...live, params: { ...live.params }, search: { ...live.search } })
      : arm === "S"
        ? () => ({ ...live })
        : () => live;

  const browser = { getState } as never;

  // позитивный контроль: гейт вообще срабатывает и возвращает булев
  const probe = canSkipPopstateHistoryWrite(toState, browser, router.areStatesEqual as never);
  if (typeof probe !== "boolean") {
    process.stderr.write("КОНТРОЛЬ ПРОВАЛЕН: гейт не вернул булев\n");
    process.exit(2);
  }

  const step = (): void => {
    sink = canSkipPopstateHistoryWrite(toState, browser, router.areStatesEqual as never);
  };

  for (let i = 0; i < 200_000; i++) step();

  const t0 = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) step();
  const t1 = process.hrtime.bigint();

  void sink;
  router.dispose();
  process.stdout.write(String(Number(t1 - t0) / iters) + "\n");

}

void main();
