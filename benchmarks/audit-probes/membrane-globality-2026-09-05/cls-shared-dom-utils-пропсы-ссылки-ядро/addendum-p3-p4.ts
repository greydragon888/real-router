// Добор матрицы: P3 на shared-половине (литерал resolveLinkTarget и spread
// в navigateWithHash — обе «копии на границе» ДО ядра) и P4 на buildHref.
import { createRouter } from "@real-router/core";

import {
  buildHref,
  navigateWithHash,
  resolveLinkTarget,
} from "../../../../shared/dom-utils/link-utils";

import type { NavigationOptions } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "u", path: "/u/:id?tab" },
];

const out: Record<string, unknown> = {};

function withInheritedAccessors<T>(names: string[], body: () => T): [T, string[]] {
  const proto = Object.prototype as unknown as Record<string, unknown>;
  const hits: string[] = [];

  for (const n of names) {
    Object.defineProperty(proto, n, {
      configurable: true,
      get: (): unknown => `INHERITED:${n}`,
      set(v: unknown): void {
        hits.push(`${n}=${String(v)}`);
      },
    });
  }

  try {
    return [body(), hits];
  } finally {
    for (const n of names) {
      delete proto[n];
    }
  }
}

async function main(): Promise<void> {
  // A1 — P3 на D1: литерал { name, params, search } строится define-семантикой,
  //      унаследованный сеттер под теми же именами не должен перехватить запись.
  const appTo = { name: "u", params: { id: "7" }, search: { tab: "x" } };
  const [r1, hits1] = withInheritedAccessors(["name", "params", "search"], () => {
    // Позитивный контроль ловушки: объект БЕЗ собственных ключей видит геттер,
    // а присваивание уходит в сеттер.
    const control: Record<string, unknown> = {};
    const seen = control.name;

    control.name = "TRAP";

    const resolved = resolveLinkTarget(appTo as never, "", undefined, undefined);

    return {
      controlInheritedGetterSeen: seen,
      resolvedName: resolved.name,
      resolvedParamsIsAppBag: resolved.params === appTo.params,
      resolvedSearchIsAppBag: resolved.search === appTo.search,
      resolvedOwnKeys: Object.keys(resolved),
      // Собственные ли ключи у результата (а не унаследованные аксессоры)?
      resolvedHasOwnName: Object.hasOwn(resolved, "name"),
      resolvedNameDescriptorIsData:
        Object.getOwnPropertyDescriptor(resolved, "name")?.value === "u",
    };
  });

  out.A1_D1_p3 = { ...r1, setterHits: hits1, trapControlFired: hits1.includes("name=TRAP") };

  // A2 — P3 на D4: `const opts = { ...extraOptions }` в shared + запись
  //      opts.hash / opts.force / opts.hashChange. Spread — define; но
  //      `opts.hash = …` это [[Set]] по цели с Object.prototype в цепочке.
  const r2 = createRouter(routes as never, {} as never);

  await r2.start("/u/7?tab=x");

  let hookOpts: NavigationOptions | undefined;

  r2.usePlugin(() => ({
    onTransitionSuccess: (_t: unknown, _f: unknown, o: unknown) => {
      hookOpts = o as NavigationOptions;
    },
  }));

  const [r2res, hits2] = await new Promise<[Record<string, unknown>, string[]]>(
    (resolve) => {
      const [p, hits] = withInheritedAccessors(
        ["replace", "hash", "hashChange", "force"],
        () => {
          const control: Record<string, unknown> = {};

          control.hash = "TRAP";

          return navigateWithHash(
            r2,
            "u",
            { id: "7" },
            { tab: "x" },
            "frag",
            { replace: true } as NavigationOptions,
          ).then((st) => ({
            committedPath: st.path,
            transitionReplace: st.transition?.replace,
            hookOptsHash: (hookOpts as Record<string, unknown> | undefined)?.hash,
            hookOptsReplace: (hookOpts as Record<string, unknown> | undefined)?.replace,
            hookOptsOwnKeys: Object.keys(hookOpts ?? {}),
          }));
        },
      );

      void p.then((v) => {
        resolve([v, hits]);
      });
    },
  );

  out.A2_D4_p3 = {
    ...r2res,
    setterHits: hits2,
    trapControlFired: hits2.includes("hash=TRAP"),
    note: "ловушка снимается в finally ДО резолва промиса — сеттер-хиты собраны за синхронный участок shared",
  };

  // A3 — P4 на D2: buildHref не морозит ничего (ни мешки вызывающего, ни листья).
  const r3 = createRouter(routes as never, {} as never);

  await r3.start("/home");

  const leaf = ["a", "b"];
  const p3 = { id: "7" };
  const s3 = { tab: leaf } as unknown as Record<string, unknown>;
  const href = buildHref(r3, "u", p3, s3 as never, "frag");

  out.A3_D2_p4 = {
    href,
    callerParamsFrozen: Object.isFrozen(p3),
    callerSearchFrozen: Object.isFrozen(s3),
    callerLeafFrozen: Object.isFrozen(leaf),
    coreStateUnchanged: r3.getState()?.path,
  };

  // A4 — собственный "__proto__" в extraOptions и в дескрипторе `to`.
  const r4 = createRouter(routes as never, {} as never);

  await r4.start("/home");

  let hookOpts4: NavigationOptions | undefined;

  r4.usePlugin(() => ({
    onTransitionSuccess: (_t: unknown, _f: unknown, o: unknown) => {
      hookOpts4 = o as NavigationOptions;
    },
  }));

  const pollutedOpts = JSON.parse('{"replace":true,"__proto__":{"pwned":true}}') as NavigationOptions;
  const st4 = await navigateWithHash(r4, "u", { id: "7" }, undefined, undefined, pollutedOpts);
  const pollutedTo = JSON.parse('{"name":"u","params":{"id":"3"},"__proto__":{"pwned":true}}') as Record<string, unknown>;
  const resolved4 = resolveLinkTarget(pollutedTo as never, "", undefined, undefined);

  out.A4_protoKey = {
    committedPath: st4.path,
    transitionReplace: st4.transition?.replace,
    hookOptsHasPwned: "pwned" in (hookOpts4 ?? {}),
    hookOptsProtoIsObjectPrototype:
      Object.getPrototypeOf(hookOpts4 as object) === Object.prototype,
    hookOptsProtoIsNull: Object.getPrototypeOf(hookOpts4 as object) === null,
    resolvedName: resolved4.name,
    resolvedShellHasPwned: "pwned" in (resolved4 as object),
    globalPwned: ({} as Record<string, unknown>).pwned,
  };

  console.log(JSON.stringify(out, null, 1));
}

main().catch((error: unknown) => {
  console.error("PROBE FAILED", error);
  process.exitCode = 1;
});
