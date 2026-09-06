// L7-shared · семейства link-utils (buildHref / navigateWithHash / resolveLinkTarget),
// plugin-utils (createReplaceHistoryState) и validation (createOptionsValidator).
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  buildHref,
  navigateWithHash,
  resolveLinkTarget,
} from "../../../../shared/dom-utils/link-utils";
import { createReplaceHistoryState } from "../../../../shared/browser-env/plugin-utils";
import { createOptionsValidator } from "../../../../shared/browser-env/validation";
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

import type { NavigationOptions } from "@real-router/core";

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );

  await router.start("/");

  // A. buildHref без URL-плагина → router.buildPath: одно чтение на ключ, ничего не ложится.
  const pA = countingBag({ id: "7" });
  const sA = countingBag({ tab: "x" });
  const hrefA = buildHref(router, "u", pA.bag, sA.bag, "frag");

  console.log(
    "A",
    JSON.stringify({ href: hrefA, paramsReads: pA.reads, searchReads: sA.reads }),
  );

  // B. navigateWithHash с ДРУГОГО маршрута: isActiveRoute отсекает по имени, navigate копирует (1 чтение/ключ);
  //    extraOptions читается spread-ом один раз; закоммиченные мешки — копии, заморожены.
  const pB = countingBag({ id: "7" });
  const sB = countingBag({ tab: "x" });
  const extraB = countingBag({ replace: true, custom: { k: 1 } });
  const stB = await navigateWithHash(
    router,
    "u",
    pB.bag,
    sB.bag,
    "frag",
    extraB.bag as NavigationOptions,
  );

  console.log(
    "B",
    JSON.stringify({
      paramsReads: pB.reads,
      searchReads: sB.reads,
      extraReads: extraB.reads,
      identityParams: stB.params === pB.bag,
      identitySearch: stB.search === sB.bag,
      frozenParams: Object.isFrozen(stB.params),
      committed: { params: stB.params, search: stB.search },
    }),
  );

  // B2. navigateWithHash на ТОМ ЖЕ месте (hash-only): isActiveRoute читает мешок (normalizeChannel),
  //     затем navigate читает его ещё раз — два чтения одного объекта приложения через две двери ядра.
  const pB2 = countingBag({ id: "7" });
  const sB2 = countingBag({ tab: "x" });

  await navigateWithHash(router, "u", pB2.bag, sB2.bag, "other", undefined);

  console.log(
    "B2",
    JSON.stringify({ paramsReads: pB2.reads, searchReads: sB2.reads }),
  );

  // C. Не-объявленный ключ в extraOptions доходит до хука плагина ПО ССЫЛКЕ (лист в копии adoptNavigationOptions).
  let seenOpts: NavigationOptions | undefined;

  router.usePlugin(() => ({
    onTransitionSuccess: (_to, _from, opts) => {
      seenOpts = opts;
    },
  }));

  const customObj = { k: 1 };

  await navigateWithHash(router, "home", {}, undefined, undefined, {
    custom: customObj,
  } as NavigationOptions);

  console.log(
    "C",
    JSON.stringify({
      customByReference:
        (seenOpts as Record<string, unknown> | undefined)?.custom === customObj,
      optsFrozen: Object.isFrozen(seenOpts),
    }),
  );

  // D. createReplaceHistoryState: чтения на ключ; в браузер уходит мешок ядра (копия, заморожен), не мешок вызывающего;
  //    состояние ядра не меняется.
  let captured: { params: unknown; search: unknown; url: string } | undefined;
  const browser = {
    replaceState: (state: unknown, url: string) => {
      const s = state as { params: unknown; search: unknown };

      captured = { params: s.params, search: s.search, url };
    },
    getHash: () => "",
  };
  const replaceHistoryState = createReplaceHistoryState(
    getPluginApi(router),
    browser,
    (path) => path,
  );
  const pD = countingBag({ id: "9" });
  const sD = countingBag({ tab: "y" });

  replaceHistoryState("u", pD.bag, sD.bag);

  console.log(
    "D",
    JSON.stringify({
      paramsReads: pD.reads,
      searchReads: sD.reads,
      url: captured?.url,
      identityParams: captured?.params === pD.bag,
      frozenParams: Object.isFrozen(captured?.params),
      coreStateName: router.getState()?.name,
    }),
  );

  // E. createOptionsValidator: читается по имени, только известные ключи, по разу; ничего не удерживается.
  const oE = countingBag({ base: "/app", forceDeactivate: true, unknownKey: {} });

  createOptionsValidator({ base: "", forceDeactivate: false }, "probe")(
    oE.bag as never,
  );

  console.log("E", JSON.stringify({ optsReads: oE.reads }));

  // F. resolveLinkTarget: `to` читается по имени по разу; вложенные мешки — по ссылке дальше.
  const toParams = { id: "1" };
  const to = countingBag({ name: "u", params: toParams, search: undefined });
  const resolved = resolveLinkTarget(to.bag as never, "", undefined, undefined);

  console.log(
    "F",
    JSON.stringify({
      toReads: to.reads,
      paramsPassedByReference: resolved.params === toParams,
    }),
  );
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
