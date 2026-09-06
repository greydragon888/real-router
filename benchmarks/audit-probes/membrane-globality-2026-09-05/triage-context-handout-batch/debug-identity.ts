// Диагностика расхождения: почему onTransitionSuccess·toState.context пойман как
// «текущий» в момент хука, но не равен getState().context после фазы B.
// Печатаем ПОСЛЕДОВАТЕЛЬНОСТЬ идентичностей context по меткам объектов.
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

let releaseSlow: () => void = () => undefined;
const parked = new Promise<void>((r) => {
  releaseSlow = r;
});

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a" },
  {
    name: "slow",
    path: "/slow",
    canActivate: () => async () => {
      await parked;
      return true;
    },
  },
  { name: "refused", path: "/refused", canActivate: () => () => false },
];

async function main(): Promise<void> {
  const log: unknown[] = [];
  const router = createRouter(ROUTES as never, {} as never);
  router.usePlugin(() => ({
    onTransitionSuccess: (to: unknown) => {
      log.push({
        ev: "success",
        toCtx: id((to as St).context),
        name: (to as St).name,
        curCtx: id((router.getState() as unknown as St).context),
      });
    },
  }));
  await router.start("/h");
  log.push({ mark: "after start", cur: id((router.getState() as unknown as St).context) });
  await router.navigate("a");
  const A = (router.getState() as unknown as St).context;
  log.push({ mark: "after navigate a", A: id(A) });
  const slow = router.navigate("slow").catch(() => undefined);
  const refused = router.navigate("refused").catch(() => undefined);
  releaseSlow();
  await Promise.all([slow, refused]);
  log.push({
    mark: "after phase B",
    cur: id((router.getState() as unknown as St).context),
    curName: (router.getState() as unknown as St).name,
    prev: id((router.getPreviousState() as unknown as St | undefined)?.context),
    A: id(A),
  });
  console.log(JSON.stringify(log, null, 1));
}

void main();
