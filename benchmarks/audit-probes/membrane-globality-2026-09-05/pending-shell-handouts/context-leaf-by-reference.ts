// Seed-1 calibration for this family: what the FIRST-PARTY writers of the
// pending shell actually depend on.
//
//  - `navigation-plugin` writes `claim.write(toState, meta)` from
//    `onTransitionStart` and reads `getState().context.navigation` later;
//  - `shared/ssr/createSsrLoaderPlugin` writes `claim.write(nextRoute, data)`
//    from `subscribeLeave`.
//
// Question: is it the SHELL's identity they need, or the `context` LEAF?
// Measured by doing the same write on (1) the handed-out shell and (2) a
// shallow copy of it that shares `context` — if (2) reaches `getState()` too,
// strategy (а) with `context` as a by-reference leaf breaks neither writer.
// Also measured: the same write on a copy with its OWN context (what a deep
// copy would do) — the negative control that shows the leaf must be shared.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/pending-shell-handouts/context-leaf-by-reference.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { State } from "@real-router/core/types";

type Mode = "shell" | "shallowCopySharingContext" | "copyWithOwnContext";

async function runOne(
  mode: Mode,
  where: "onTransitionStart" | "subscribeLeave",
): Promise<Record<string, unknown>> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "g", path: "/g/:id" },
    ] as never,
    {} as never,
  );
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace(`probe_${where}`);
  const meta = { via: where, mode };

  const write = (toState: State): void => {
    const target: State =
      mode === "shell"
        ? toState
        : mode === "shallowCopySharingContext"
          ? ({ ...toState } as State)
          : ({ ...toState, context: { ...toState.context } } as State);

    claim.write(target, meta);
  };

  if (where === "onTransitionStart") {
    router.usePlugin(() => ({
      onTransitionStart: (toState: State) => {
        write(toState);
      },
    }));
  } else {
    router.subscribeLeave(({ nextRoute }) => {
      write(nextRoute);
    });
  }

  await router.start("/home");
  await router.navigate("g", { id: "1" } as never);
  const ctx = router.getState()!.context as Record<string, unknown>;
  const result = {
    committedContextCarriesTheWrite: ctx[`probe_${where}`] === meta,
    committedContextKeys: Object.keys(ctx),
  };

  router.dispose();

  return result;
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  for (const where of ["onTransitionStart", "subscribeLeave"] as const) {
    for (const mode of ["shell", "shallowCopySharingContext", "copyWithOwnContext"] as const) {
      out[`${where} · ${mode}`] = await runOne(mode, where);
    }
  }

  // Identity of the shell across the two first-party hooks and the commit is
  // NOT what either writer reads back: they read `getState().context.<ns>`.
  // Control: `claim.write` defines (putField), so a namespace named
  // `__proto__` lands as an own key and does not re-point the prototype.
  {
    const router = createRouter([{ name: "home", path: "/home" }] as never, {} as never);
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("__proto__");
    const value = { own: true };

    await router.start("/home");
    claim.write(router.getState()!, value);
    const ctx = router.getState()!.context as Record<string, unknown>;

    out["control · claim.write under '__proto__' defines an own key"] = {
      ownProtoKey: Object.hasOwn(ctx, "__proto__"),
      valueLanded: Object.getOwnPropertyDescriptor(ctx, "__proto__")?.value === value,
      prototypeUntouched: Object.getPrototypeOf(ctx) === Object.prototype,
    };
    router.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
