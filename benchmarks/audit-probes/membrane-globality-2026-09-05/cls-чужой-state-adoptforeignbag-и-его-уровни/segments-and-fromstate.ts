// Дополнение матрицы: ЭМУЛЯЦИЯ КОПИИ НА ГРАНИЦЕ для двух дверей, где ядро
// сегодня держит ручку — `systemCommit·toState.transition.segments` и
// `systemCommit·fromState`. Вызывающий отдаёт мелкую копию контейнера и
// УДЕРЖИВАЕТ оригинал; сравниваем со случаем, когда отдан оригинал.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/cls-чужой-state-adoptforeignbag-и-его-уровни/segments-and-fromstate.ts
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import type { State } from "@real-router/core/types";

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "u", path: "/u/:id?tab" },
] as never;

const out = (section: string, facts: Record<string, unknown>): void => {
  console.log(`\n## ${section}`);
  for (const [k, v] of Object.entries(facts)) {
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
};

const mk = (): ReturnType<typeof createRouter> =>
  createRouter(ROUTES, { defaultRoute: "a" });

async function segmentsArm(coreCopies: boolean): Promise<Record<string, unknown>> {
  const r = mk();
  await r.start("/a");

  // Оригинал, который вызывающий УДЕРЖИВАЕТ и мутирует после коммита.
  const activated = ["u"];
  const segments: Record<string, unknown> = {
    activated,
    deactivated: [],
    intersection: "",
  };
  const transition: Record<string, unknown> = {
    phase: "activating",
    reason: "success",
    // Эмуляция «ядро скопировало контейнер segments на границе»:
    // мелкая копия, массивы (листья) — те же ссылки.
    segments: coreCopies ? { ...segments } : segments,
  };
  const toState = {
    name: "u",
    params: { id: "5" },
    search: { tab: "s" },
    path: "/u/5?tab=s",
    context: {},
    transition,
  } as unknown as State;

  const committed = getInternals(r).systemCommit(toState, r.getState(), {
    replace: true,
  } as never);
  const live = r.getState()!;

  // Вызывающий пишет в УДЕРЖАННЫЙ оригинал ПОСЛЕ коммита.
  activated.push("injected-after-commit");
  segments.intersection = "rewritten";

  const res: Record<string, unknown> = {
    committedIsGetState: committed === live,
    name: live.name,
    path: live.path,
    params: { ...live.params },
    search: { ...live.search },
    transitionKeys: Object.keys(live.transition).sort(),
    transitionPhase: live.transition.phase,
    transitionFrozen: Object.isFrozen(live.transition),
    segmentsIsCallerOriginal: (live.transition.segments as unknown) === segments,
    segmentsFrozen: Object.isFrozen(live.transition.segments),
    // ГЛАВНОЕ следствие: видит ли ядро запись приложения после коммита.
    segmentsSeenThroughGetState: JSON.stringify(live.transition.segments),
    // Листья (массив activated) в эмуляции копии — та же ссылка, значит
    // push виден и там: копия КОНТЕЙНЕРА, не листьев.
    activatedIsCallerArray:
      (live.transition.segments as { activated: unknown }).activated ===
      (activated as unknown),
    callerSegmentsFrozenByCore: Object.isFrozen(segments),
  };
  r.stop();
  return res;
}

async function fromStateArm(coreCopies: boolean): Promise<Record<string, unknown>> {
  const r = mk();
  await r.start("/a");
  const hookSeen: Record<string, unknown>[] = [];

  const fromCtx: Record<string, unknown> = { marker: "caller-from" };
  const fromOriginal = {
    name: "a",
    params: {},
    search: {},
    path: "/a",
    context: fromCtx,
    transition: { phase: "idle", reason: "success", segments: {} },
  } as unknown as State;
  // Эмуляция «ядро скопировало fromState на границе».
  const handed = coreCopies
    ? ({ ...(fromOriginal as unknown as Record<string, unknown>) } as unknown as State)
    : fromOriginal;

  r.usePlugin(
    (() => ({
      onTransitionSuccess(toState: State, fromState: State | undefined): void {
        hookSeen.push({
          fromIsHandedObject: (fromState as unknown) === (handed as unknown),
          fromIsCallerOriginal: (fromState as unknown) === (fromOriginal as unknown),
          fromContextIsCallerContext:
            (fromState?.context as unknown) === (fromCtx as unknown),
          fromName: fromState?.name,
          fromPath: fromState?.path,
        });
      },
    })) as never,
  );

  const toState = {
    name: "u",
    params: { id: "5" },
    search: {},
    path: "/u/5",
    context: {},
    transition: { phase: "activating", reason: "success", segments: {} },
  } as unknown as State;

  const committed = getInternals(r).systemCommit(toState, handed, {
    replace: true,
  } as never);
  const live = r.getState()!;

  const res: Record<string, unknown> = {
    committedIsGetState: committed === live,
    committedName: live.name,
    previousStateName: r.getPreviousState()?.name,
    previousStateIsHandedFrom: (r.getPreviousState() as unknown) === (handed as unknown),
    previousStateIsCommittedByStart: r.getPreviousState()?.path,
    callerFromFrozenByCore: Object.isFrozen(fromOriginal),
    hookSeen,
  };
  r.stop();
  return res;
}

async function main(): Promise<void> {
  const segOrig = await segmentsArm(false);
  const segCopy = await segmentsArm(true);
  out("S1 · segments — ОРИГИНАЛ (ядро держит ручку, как сегодня)", segOrig);
  out("S1 · segments — ЭМУЛЯЦИЯ КОПИИ КОНТЕЙНЕРА НА ГРАНИЦЕ", segCopy);
  out("S1 · РАЗНИЦА", {
    differing: Object.keys(segOrig).filter(
      (k) => JSON.stringify(segOrig[k]) !== JSON.stringify(segCopy[k]),
    ),
  });

  const fromOrig = await fromStateArm(false);
  const fromCopy = await fromStateArm(true);
  out("S2 · fromState — ОРИГИНАЛ (транзит по ссылке, как сегодня)", fromOrig);
  out("S2 · fromState — ЭМУЛЯЦИЯ КОПИИ НА ГРАНИЦЕ", fromCopy);
  out("S2 · РАЗНИЦА", {
    differing: Object.keys(fromOrig).filter(
      (k) => JSON.stringify(fromOrig[k]) !== JSON.stringify(fromCopy[k]),
    ),
  });
}

void main();
