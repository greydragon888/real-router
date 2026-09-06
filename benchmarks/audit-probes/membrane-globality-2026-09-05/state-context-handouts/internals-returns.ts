// Остаток семейства возвратов закоммиченного State: Router.navigateToDefault,
// Router.navigate (дескрипторная форма), RouterInternals.start /
// navigateToState / navigateToNotFound / revalidateToNotFound — каждый
// возврат === router.getState() по идентичности, context мутабелен, прямая
// запись доходит до закоммиченного состояния. Контроль: cloneRouter — клон не
// несёт закоммиченного State базы (getState() === undefined до start()).
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = { name: string; context: Ctx };

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a/:id" },
  { name: "d", path: "/d" },
];

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const router = createRouter(ROUTES as never, { defaultRoute: "d" } as never);
  const api = getPluginApi(router);
  const internals = getInternals(router);
  const mark = { app: "mark" };

  // ⚠ `internals.start` called directly (outside `Router.#runStart`'s
  // `sendStart()`) rejects CANCELLED — measured: it is the seam INNER that the
  // start interceptor's `next` wraps, not a standalone door. Its return object
  // is `InterceptorFn<"start">·next·return`, probed in handout-identity.ts.
  let internalsStartDirect = "not-run";
  try {
    await internals.start("/h");
    internalsStartDirect = "resolved";
  } catch (e) {
    internalsStartDirect = `reject:${(e as { code?: string }).code}`;
  }
  const startRet = (await router.start("/h")) as unknown as St;
  out["RouterInternals.start·return"] = {
    "direct call outside #runStart": internalsStartDirect,
    "Router.start·return === getState()": startRet === router.getState(),
    "context writable, reaches committed": (() => {
      startRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  const ntdRet = (await router.navigateToDefault()) as unknown as St;
  out["Router.navigateToDefault·return"] = {
    name: ntdRet.name,
    "=== getState()": ntdRet === router.getState(),
    "context writable, reaches committed": (() => {
      ntdRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  const descRet = (await router.navigate({
    name: "a",
    params: { id: "1" },
  } as never)) as unknown as St;
  out["Router.navigate(target)·return"] = {
    "=== getState()": descRet === router.getState(),
    "context writable, reaches committed": (() => {
      descRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  const nsRet = (await internals.navigateToState(
    api.matchPath("/a/2") as never,
  )) as unknown as St;
  out["RouterInternals.navigateToState·return"] = {
    "=== getState()": nsRet === router.getState(),
    "context writable, reaches committed": (() => {
      nsRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  const nfRet = internals.navigateToNotFound("/zzz") as unknown as St;
  out["RouterInternals.navigateToNotFound·return"] = {
    "=== getState()": nfRet === router.getState(),
    "context writable, reaches committed": (() => {
      nfRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  const rvRet = internals.revalidateToNotFound("/yyy") as unknown as St;
  out["RouterInternals.revalidateToNotFound·return"] = {
    "=== getState()": rvRet === router.getState(),
    "!== previous return": rvRet !== nfRet,
    "context writable, reaches committed": (() => {
      rvRet.context.__k__ = mark;
      return (router.getState() as unknown as St).context.__k__ === mark;
    })(),
  };

  // control: a clone carries no committed state of its base
  const clone = cloneRouter(router as never);
  out["cloneRouter·control"] = {
    "clone.getState() before start": clone.getState(),
    "clone.getPreviousState() before start": clone.getPreviousState(),
    "base still committed": router.getState()?.name,
  };
  clone.dispose();
  router.dispose();

  console.log(JSON.stringify(out, null, 2));
}

void main();
