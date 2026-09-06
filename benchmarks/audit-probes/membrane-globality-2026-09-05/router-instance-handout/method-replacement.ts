// НЕ-дверь (лист-функция), но соседний член семейства: тип Router разрешает
// присвоить объявленный метод (`router.getState = fn`). Кто в ядре читает
// фасадные методы по имени с инстанса — и что делает dispose с подменой.
import { createRouter, getNavigator } from "@real-router/core";

const routes = [{ name: "home", path: "/" }] as never;

async function main(): Promise<void> {
  const router = createRouter(routes, {} as never);
  await router.start("/");
  const fake = (): undefined => undefined;
  const appNavigate = async (): Promise<never> => {
    throw new Error("app navigate");
  };
  (router as Record<string, unknown>).getState = fake;
  (router as Record<string, unknown>).navigate = appNavigate;
  const nav = getNavigator(router);
  const captured = {
    navigatorGetStateIsAppFn: nav.getState === fake,
    navigatorNavigateIsAppFn: nav.navigate === (appNavigate as unknown),
    ownDescriptorWritable: Object.getOwnPropertyDescriptor(router, "getState")
      ?.writable,
  };
  router.dispose();
  const afterDispose = {
    navigateStillAppFn:
      (router as Record<string, unknown>).navigate === appNavigate,
    getStateStillAppFn: (router as Record<string, unknown>).getState === fake,
    navigatorStillHoldsAppNavigate: nav.navigate === (appNavigate as unknown),
  };
  console.log(JSON.stringify({ captured, afterDispose }, null, 1));
}

void main();
