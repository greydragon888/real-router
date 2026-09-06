// Две PENDING-строки батча: Plugin.onTransitionStart·toState.context и
// Plugin.onTransitionLeaveApprove·toState.context.
// Вопрос: объект context, отданный ДО коммита, — читает ли его ядро обратно?
// Механизм: completeTransition морозит ТОТ ЖЕ объект (`freeze(toState)`),
// context не морожен (freeze поверхностный) → pending-хэндаут становится
// ЗАКОММИЧЕННЫМ context, а его читает `routes.replace()`-ревалидация
// (getRoutesApi `context: currentState.context` → systemCommit `{ ...toState.context }`).
// Захват — ТОЛЬКО на коммитящей навигации (h → a); дальше выключается.
// Позитивный контроль: ручное чтение поднимает счётчик. Негативный контроль:
// pending-объект НЕсостоявшейся навигации (guard=false) — 0 чтений.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type Ctx = Record<string, unknown>;
type St = { name: string; context: Ctx };

let capturing = true;
const caught = new Map<string, Ctx>();

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a" },
  { name: "refused", path: "/refused", canActivate: () => () => false },
];

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const router = createRouter(ROUTES as never, {} as never);

  router.usePlugin(() => ({
    onTransitionStart: (to: unknown) => {
      if (capturing) {
        caught.set("Plugin.onTransitionStart·toState.context", (to as St).context);
      }
    },
    onTransitionLeaveApprove: (to: unknown) => {
      if (capturing) {
        caught.set(
          "Plugin.onTransitionLeaveApprove·toState.context",
          (to as St).context,
        );
      }
    },
  }));

  await router.start("/h");
  caught.clear(); // интересует коммитящая навигация h → a, у неё есть leaveApprove
  await router.navigate("a");
  out.debug_caughtSize = caught.size;
  out.debug_names = [...caught.keys()];
  out.debug_identityAtCaptureTime = [...caught.values()].map(
    (c) => c === (router.getState() as unknown as St).context,
  );
  capturing = false;
  const committed = (router.getState() as unknown as St).context;

  // Негативный контроль: pending НЕсостоявшейся навигации.
  // ⚠ `capturing` НЕ включается обратно: первый плагин перезаписал бы свои же
  // строки pending-объектом отказанной навигации (ловушка первого прогона).
  const refusedPending = new Map<string, Ctx>();
  router.usePlugin(() => ({
    onTransitionStart: (to: unknown) => {
      refusedPending.set("refused-pending", (to as St).context);
    },
  }));
  await router.navigate("refused").catch(() => undefined);

  const counters = new Map<string, () => number>();
  let i = 0;
  for (const [label, ctx] of [...caught, ...refusedPending]) {
    let n = 0;
    Object.defineProperty(ctx, `__p${i++}__`, {
      enumerable: true,
      configurable: true,
      get() {
        n++;
        return { fromApp: label };
      },
    });
    counters.set(label, () => n);
  }

  // Позитивный контроль инструмента.
  let ctl = 0;
  const t: Ctx = {};
  Object.defineProperty(t, "c", {
    enumerable: true,
    configurable: true,
    get() {
      ctl++;
      return 1;
    },
  });
  void t.c;
  out.control_instrument = { readsAfterOneManualRead: ctl };

  out.identity = Object.fromEntries(
    [...caught].map(([label, ctx]) => [
      label,
      { "=== getState().context (committed by identity)": ctx === committed },
    ]),
  );

  getRoutesApi(router).replace(ROUTES as never);

  out.readsDuringReplace = Object.fromEntries(
    [...counters].map(([label, f]) => [label, f()]),
  );
  out.afterReplace = {
    "app value from the pending handout landed in the NEW committed context":
      JSON.stringify((router.getState() as unknown as St).context).includes(
        "onTransitionStart",
      ),
  };

  console.log(JSON.stringify(out, null, 2));
}

void main();
