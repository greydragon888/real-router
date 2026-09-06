// Диагностика: тот ли ОБЪЕКТ (и тот ли context) у pending-toState хука
// onTransitionStart и у закоммиченного состояния.
import { createRouter } from "@real-router/core";

type Ctx = Record<string, unknown>;
type St = { name: string; context: Ctx };

const ids = new WeakMap<object, string>();
let n = 0;
const id = (o: unknown): string => {
  if (typeof o !== "object" || o === null) {
    return String(o);
  }
  let v = ids.get(o);
  if (v === undefined) {
    v = `#${n++}`;
    ids.set(o, v);
  }
  return v;
};

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a" },
];

async function main(): Promise<void> {
  const log: unknown[] = [];
  const router = createRouter(ROUTES as never, {} as never);
  router.usePlugin(() => ({
    onTransitionStart: (to: unknown) => {
      log.push({
        ev: "start",
        name: (to as St).name,
        state: id(to),
        ctx: id((to as St).context),
      });
    },
    onTransitionLeaveApprove: (to: unknown) => {
      log.push({
        ev: "leaveApprove",
        name: (to as St).name,
        state: id(to),
        ctx: id((to as St).context),
      });
    },
    onTransitionSuccess: (to: unknown) => {
      log.push({
        ev: "success",
        name: (to as St).name,
        state: id(to),
        ctx: id((to as St).context),
      });
    },
  }));
  await router.start("/h");
  log.push({
    mark: "after start",
    state: id(router.getState()),
    ctx: id((router.getState() as unknown as St).context),
  });
  await router.navigate("a");
  log.push({
    mark: "after navigate a",
    state: id(router.getState()),
    ctx: id((router.getState() as unknown as St).context),
  });
  console.log(JSON.stringify(log, null, 1));
}

void main();
