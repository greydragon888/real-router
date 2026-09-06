// ОДНА арма на процесс — протокол чередующихся процессов
// (`feedback_two_copies_one_process_ab_invalid`: вторая копия в одном процессе
// платит ×2.7, поэтому одно-процессный A/B для sub-ms невалиден).
//
// Нагрузка воспроизводит cost.ts семейства «pending-шелл» один-в-один.
// Run: NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx _reverify/pending-shell-arm.ts <A|B|C> <iters>
import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

const freeze = Object.freeze;

function copyShell(s: State): State {
  return freeze({
    name: s.name,
    params: s.params,
    search: s.search,
    path: s.path,
    context: s.context,
    transition: s.transition,
  }) as State;
}

let sink: unknown;

async function main(): Promise<void> {
  const arm = process.argv[2] ?? "A";
  const iters = Number(process.argv[3] ?? 20000);

  const router = createRouter(
    [
      { name: "a", path: "/a/:id?tab" },
      { name: "b", path: "/b/:id?tab" },
    ] as never,
    {} as never,
  );

  await router.start("/a/1?tab=x");

  let flip = false;
  const next = (): [string, { id: string }] => {
    flip = !flip;

    return [flip ? "b" : "a", { id: flip ? "2" : "1" }];
  };

  const step = (): void => {
    const [n, p] = next();

    void router.navigate(n, p as never, { tab: "x" } as never);

    const s = router.getState()!;

    // A и A' — идентичны по построению: пол шума
    sink = arm === "B" ? copyShell(s) : arm === "C" ? { ...(s.context as object) } : s;
  };

  // прогрев — та же работа, вне замера
  for (let i = 0; i < Math.min(5000, iters); i++) step();

  const t0 = process.hrtime.bigint();

  for (let i = 0; i < iters; i++) step();

  const t1 = process.hrtime.bigint();

  void sink;
  process.stdout.write(String(Number(t1 - t0) / iters) + "\n");
}

void main();
