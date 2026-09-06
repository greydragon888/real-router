// Эксперимент (а), ИЗОЛИРОВАННО по дверям.
// В matrix.ts все шесть дверей были заряжены на одном роутере, и отказ
// leave-слушателя маскировал гард на "c" и $$success-арки навигаций.
// Здесь каждая дверь получает свой роутер: сравниваем «ручка вызывающего»
// против «контейнер, усыновлённый на границе одним примитивом
// (Promise.resolve)», по ВСЕМ наблюдаемым следствиям.
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

type Bag = Record<string, unknown>;
const out: Record<string, unknown> = {};
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const ROUTES = (): Bag[] => [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];
const mk = (): any => createRouter(ROUTES() as never, {} as never);
const wrapper = (copy: boolean) => (v: unknown) =>
  copy ? Promise.resolve(v) : v;

// ── D1. GuardFn·return — Promise<false> и Promise<true> ──────────────────────
async function guardArm(copy: boolean): Promise<Bag> {
  const w = wrapper(copy);
  const seen: Bag = {};
  const r = mk();

  getLifecycleApi(r).addActivateGuard(
    "b",
    ((): (() => any) => () => w(Promise.resolve(false))) as never,
  );
  await r.start("/a");
  try {
    await r.navigate("b");
    seen.navFalseGuard = "resolved";
  } catch (e) {
    seen.navFalseGuard = String((e as { code?: string }).code ?? e);
  }
  seen.after = r.getState().name;
  seen.canNavigateTo = r.canNavigateTo("b", {});
  r.dispose();

  const r2 = mk();

  getLifecycleApi(r2).addActivateGuard(
    "b",
    ((): (() => any) => () => w(Promise.resolve(true))) as never,
  );
  await r2.start("/a");
  await r2.navigate("b");
  seen.afterTrueGuard = r2.getState().name;
  seen.path = r2.getState().path;
  r2.dispose();

  // отказ гарда (reject) — классифицируется как TRANSITION_ERROR
  const r3 = mk();

  getLifecycleApi(r3).addActivateGuard(
    "b",
    ((): (() => any) => () =>
      w(Promise.reject(new Error("guard-boom")))) as never,
  );
  await r3.start("/a");
  try {
    await r3.navigate("b");
    seen.rejectingGuard = "resolved";
  } catch (e) {
    seen.rejectingGuard = String((e as { code?: string }).code ?? e);
  }
  seen.afterRejectingGuard = r3.getState().name;
  r3.dispose();

  return seen;
}

// ── D2. LeaveFn·return ───────────────────────────────────────────────────────
async function leaveArm(copy: boolean): Promise<Bag> {
  const w = wrapper(copy);
  const seen: Bag = {};
  const r = mk();
  let ran = 0;

  r.subscribeLeave(() => {
    ran++;

    return w(Promise.resolve(undefined));
  });
  await r.start("/a");
  await r.navigate("b");
  seen.resolvingLeave = r.getState().name;
  seen.listenerRuns = ran;
  r.dispose();

  const r2 = mk();

  r2.subscribeLeave(() => w(Promise.reject(new Error("leave-boom"))));
  await r2.start("/a");
  try {
    await r2.navigate("b");
    seen.rejectingLeave = "resolved";
  } catch (e) {
    seen.rejectingLeave = String((e as { code?: string }).code ?? e);
  }
  seen.afterRejectingLeave = r2.getState().name;
  r2.dispose();

  return seen;
}

// ── D3/D4/D5. Три двери EventEmitter · #invokeIsolated ───────────────────────
async function emitterArm(copy: boolean): Promise<Bag> {
  const w = wrapper(copy);
  const seen: Bag = {};
  const r = mk();
  const errs: string[] = [];

  getPluginApi(r).addEventListener("$$error", ((e: unknown) => {
    errs.push(String(e));
  }) as never);
  r.subscribe(() => w(Promise.reject(new Error("sub-boom"))));
  getPluginApi(r).addEventListener("$$success", (() =>
    w(Promise.reject(new Error("plugin-boom")))) as never);
  getInternals(r).addEventListener("$$success", (() =>
    w(Promise.reject(new Error("internals-boom")))) as never);

  await r.start("/a");
  await r.navigate("b");
  await sleep(30);
  seen.committed = r.getState().name;
  seen.errorSinkCount = errs.length;
  r.dispose();

  // resolving-возвраты: ничего не должно отклонять навигацию
  const r2 = mk();
  let hits = 0;

  r2.subscribe(() => {
    hits++;

    return w(Promise.resolve(undefined));
  });
  await r2.start("/a");
  await r2.navigate("b");
  await sleep(20);
  seen.resolvingCommitted = r2.getState().name;
  seen.subscribeHits = hits;
  r2.dispose();

  return seen;
}

// ── D6. InterceptorFn<"start">·return ────────────────────────────────────────
const SENTINEL = { iAm: "resolved-by-interceptor" };
async function startArm(copy: boolean): Promise<Bag> {
  const w = wrapper(copy);
  const seen: Bag = {};
  const r = mk();

  getPluginApi(r).addInterceptor("start", ((next: any, p: string) =>
    w((next(p) as Promise<unknown>).then(() => SENTINEL))) as never);
  const res = await r.start("/a");

  seen.startResolvedIsSentinelByIdentity = (res as unknown) === SENTINEL;
  seen.committed = r.getState().name;
  seen.committedPath = r.getState().path;
  r.dispose();

  // интерцептор, чей внутренний промис отклоняется — recovery-путь
  const r2 = mk();

  getPluginApi(r2).addInterceptor("start", ((next: any, p: string) =>
    w(
      (next(p) as Promise<unknown>).then(() => {
        throw new Error("start-boom");
      }),
    )) as never);
  try {
    await r2.start("/a");
    seen.rejectingStart = "resolved";
  } catch (e) {
    seen.rejectingStart = String(e);
  }
  seen.isActiveAfterFailedStart = r2.isActive?.("a") ?? "<no isActive>";
  r2.dispose();

  return seen;
}

async function main(): Promise<void> {
  for (const [name, fn] of [
    ["GuardFn·return", guardArm],
    ["Router.subscribeLeave·LeaveFn·return", leaveArm],
    ["emitter (subscribe / PluginApi / RouterInternals)", emitterArm],
    ['InterceptorFn<"start">·return', startArm],
  ] as const) {
    const original = await fn(false);
    const copied = await fn(true);

    out[`${name} · original`] = original;
    out[`${name} · withBoundaryCopy`] = copied;
    out[`${name} · IDENTICAL`] =
      JSON.stringify(original) === JSON.stringify(copied);
  }
  console.log(JSON.stringify(out, null, 1));
}

void main();
