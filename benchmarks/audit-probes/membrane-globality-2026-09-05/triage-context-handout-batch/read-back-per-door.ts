// Триаж 12 строк переписи семейств «state.context·закоммиченный» / «state.context·PENDING».
// Вопрос ровно один: ЧИТАЕТ ЛИ ядро обратно тот САМЫЙ объект context, который
// оно отдало приложению в этом колбэке, после того как приложение могло его
// изменить.  Единственный найденный read-back-сайт в ядре (git ls-files +
// grep по `.context`): getRoutesApi · replace → commitRevalidated →
// EventBusNamespace · systemCommit → `context: { ...toState.context }`,
// где toState.context === router.getState().context ПО ССЫЛКЕ
// (getRoutesApi: `context: currentState.context`, currentState = router.getState()).
// Инструмент: приложение ставит СЧИТАЮЩИЙ аксессор (defineProperty, enumerable)
// на пойманный объект context, затем вызывается routes.replace().
//   reads ≥ 1 → round-trip;  reads === 0 → чистый хэндаут.
// Позитивный контроль инструмента: ручное чтение ключа поднимает счётчик 0→1.
// Негативный контроль дискриминации: тот же инструмент на context ПРЕДЫДУЩЕГО
// состояния — 0 (значит ноль означает «не читают», а не «аксессор не работает»).
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

type Ctx = Record<string, unknown>;
type St = { name: string; context: Ctx };

type Capture = {
  ctx: Ctx;
  isCurrentAtHook: boolean;
  isPreviousAtHook: boolean;
  reads: () => number;
};

const caps = new Map<string, Capture>();
let router: ReturnType<typeof createRouter>;
// ⚠ Ловушка, стоившая первого прогона: `routes.replace()` САМ эмитит
// TRANSITION_SUCCESS, и колбэки перезаписывали свои же строки НОВЫМ
// (закоммиченным ревалидацией) объектом context со счётчиком, сброшенным в 0.
// Захват выключается до вооружения аксессоров.
let capturing = true;

const cap = (label: string, state: unknown): void => {
  if (!capturing || state === undefined || state === null) {
    return;
  }
  const ctx = (state as St).context;
  if (ctx === undefined) {
    return;
  }
  const cur = (router.getState() as unknown as St | undefined)?.context;
  const prev = (router.getPreviousState() as unknown as St | undefined)
    ?.context;
  caps.set(label, {
    ctx,
    isCurrentAtHook: ctx === cur,
    isPreviousAtHook: ctx === prev,
    reads: () => 0,
  });
};

let releaseSlow: () => void = () => undefined;
const parked = new Promise<void>((r) => {
  releaseSlow = r;
});

const ROUTES = [
  { name: "h", path: "/h" },
  {
    name: "a",
    path: "/a",
    canDeactivate: () => (_to: St, from: St | undefined) => {
      cap("GuardFn·fromState.context", from);
      return true;
    },
  },
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
  const out: Record<string, unknown> = {};
  router = createRouter(ROUTES as never, {} as never);
  const api = getPluginApi(router);

  router.usePlugin(() => ({
    onTransitionStart: (to: unknown) => {
      cap("Plugin.onTransitionStart·toState.context", to);
    },
    onTransitionLeaveApprove: (to: unknown, from: unknown) => {
      cap("Plugin.onTransitionLeaveApprove·toState.context", to);
      cap("Plugin.onTransitionLeaveApprove·fromState.context", from);
    },
    onTransitionSuccess: (to: unknown, from: unknown) => {
      cap("Plugin.onTransitionSuccess·toState.context", to);
      cap("Plugin.onTransitionSuccess·fromState.context", from);
    },
    onTransitionCancel: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionCancel·fromState.context", from);
    },
    onTransitionError: (_to: unknown, from: unknown) => {
      cap("Plugin.onTransitionError·fromState.context", from);
    },
  }));
  for (const evt of [
    "$$start",
    "$$leaveApprove",
    "$$cancel",
    "$$error",
    "$$success",
  ]) {
    api.addEventListener(evt as never, ((_to: unknown, from: unknown) => {
      cap(`PluginApi.addEventListener·cb·fromState.context@${evt}`, from);
    }) as never);
  }
  router.subscribe((p: { route: unknown; previousRoute?: unknown }) => {
    cap("Router.subscribe·SubscribeFn·state.route.context", p.route);
    cap(
      "Router.subscribe·SubscribeFn·state.previousRoute.context",
      p.previousRoute,
    );
  });
  router.subscribeLeave((p: { route: unknown }) => {
    cap("Router.subscribeLeave·LeaveFn·leaveState.route.context", p.route);
  });

  // ── Фаза A: start /h → navigate a (коммит) ───────────────────────────────
  await router.start("/h");
  await router.navigate("a");
  const A = (router.getState() as unknown as St).context;

  // ── Фаза B: из 'a' — отменённая (slow) и провалившаяся (refused) навигации.
  // Ни одна не коммитит, поэтому 'a' остаётся ТЕКУЩИМ, а её context — живым.
  const slow = router.navigate("slow").catch(() => undefined);
  const refused = router.navigate("refused").catch(() => undefined);
  releaseSlow();
  await Promise.all([slow, refused]);

  out.phaseB = {
    "state stayed 'a'": (router.getState() as unknown as St).name === "a",
    "getState().context === A":
      (router.getState() as unknown as St).context === A,
  };

  // ── Инструмент: считающий аксессор на КАЖДЫЙ пойманный объект context ─────
  let ctrl = 0;
  const probeCtl: Ctx = {};
  Object.defineProperty(probeCtl, "__ctl__", {
    enumerable: true,
    configurable: true,
    get() {
      ctrl++;
      return 1;
    },
  });
  const before = ctrl;
  void probeCtl.__ctl__;
  out.control_instrument = { before, afterOneRead: ctrl };

  capturing = false;

  let i = 0;
  for (const [label, c] of caps) {
    const key = `__probe${i++}__`;
    let n = 0;
    Object.defineProperty(c.ctx, key, {
      enumerable: true,
      configurable: true,
      get() {
        n++;
        return { fromApp: label };
      },
    });
    c.reads = () => n;
  }

  // ── Read-back: routes.replace() → ревалидация активного состояния ─────────
  getRoutesApi(router).replace(ROUTES as never);

  out.doors = Object.fromEntries(
    [...caps].map(([label, c]) => [
      label,
      {
        isCurrentAtHook: c.isCurrentAtHook,
        isPreviousAtHook: c.isPreviousAtHook,
        isCurrentAtReplace: c.ctx === A,
        readsDuringReplace: c.reads(),
      },
    ]),
  );
  out.afterReplace = {
    "committed context is a NEW object":
      (router.getState() as unknown as St).context !== A,
    "value produced by the app's accessor landed in the new context":
      JSON.stringify((router.getState() as unknown as St).context).includes(
        "fromApp",
      ),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
