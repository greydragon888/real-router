// Разделение двух сайтов [[Set]], которые addendum-p3-p4 поймал ОДНИМ прогоном:
//  (1) shared: `opts.hash = …` / `opts.force = true` / `opts.hashChange = true`
//      в link-utils.ts · navigateWithHash — это дверь D4 семейства;
//  (2) ядро: `meta.replace = nav.replace` в completeTransition — СОСЕДНИЙ сайт,
//      к дверям этого семейства не относится (знаменатель не расширяется).
import { createRouter } from "@real-router/core";

import { navigateWithHash } from "../../../../shared/dom-utils/link-utils";

import type { NavigationOptions } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id?tab" },
];

function install(name: string, hits: string[]): void {
  Object.defineProperty(Object.prototype, name, {
    configurable: true,
    get: (): unknown => undefined,
    set(v: unknown): void {
      hits.push(`${name}=${String(v)}`);
    },
  });
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // (1) только "hash" — сайт shared/dom-utils.
  {
    const r = createRouter(routes as never, {} as never);

    await r.start("/u/7?tab=x");

    let hookOpts: NavigationOptions | undefined;

    r.usePlugin(() => ({
      onTransitionSuccess: (_t: unknown, _f: unknown, o: unknown) => {
        hookOpts = o as NavigationOptions;
      },
    }));

    const hits: string[] = [];

    install("hash", hits);

    let p: Promise<unknown>;

    try {
      p = navigateWithHash(r, "u", { id: "7" }, { tab: "x" }, "frag", undefined);
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).hash;
    }

    await p;

    out.sharedHashSite = {
      setterHits: hits,
      hookOptsHash: (hookOpts as Record<string, unknown> | undefined)?.hash,
      hookOptsOwnKeys: Object.keys(hookOpts ?? {}),
      // Контроль: без ловушки тот же вызов кладёт hash в opts.
    };

    const hookBefore = hookOpts;

    await navigateWithHash(r, "u", { id: "7" }, { tab: "x" }, "other", undefined);

    (out.sharedHashSite as Record<string, unknown>).controlWithoutTrapHash = (
      hookOpts as Record<string, unknown> | undefined
    )?.hash;
    (out.sharedHashSite as Record<string, unknown>).hookChanged = hookOpts !== hookBefore;
  }

  // (2) только "replace" — сайт ядра completeTransition · meta.replace,
  //     БЕЗ участия shared (прямой router.navigate).
  {
    const r = createRouter(routes as never, {} as never);

    await r.start("/home");

    const hits: string[] = [];

    install("replace", hits);

    let p: Promise<unknown>;

    try {
      p = r.navigate("u", { id: "7" }, undefined, { replace: true });
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).replace;
    }

    const st = (await p) as { transition?: Record<string, unknown>; path?: string };

    out.coreMetaReplaceSite = {
      setterHits: hits,
      transitionKeys: Object.keys(st.transition ?? {}),
      transitionReplace: st.transition?.replace,
      path: st.path,
    };

    // Контроль без ловушки.
    const st2 = (await r.navigate("home", {}, undefined, { replace: true })) as {
      transition?: Record<string, unknown>;
    };

    (out.coreMetaReplaceSite as Record<string, unknown>).controlWithoutTrapReplace =
      st2.transition?.replace;
  }

  console.log(JSON.stringify(out, null, 1));
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
