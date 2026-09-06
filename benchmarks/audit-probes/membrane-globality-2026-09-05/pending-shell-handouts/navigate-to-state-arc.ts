// The SECOND producer of the writable shell: `NavigationNamespace.#copyChannels`
// (the `navigateToState` arc — URL plugins' popstate, and `start()`'s boot).
// Same doors, same landing? One cell per handout, own-key write, plus the boot
// arc through `router.start(path)`.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/pending-shell-handouts/navigate-to-state-arc.ts
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { State } from "@real-router/core/types";

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  for (const arc of ["navigateToState", "start"] as const) {
    const seen: Record<string, unknown> = {};
    const markers: Record<string, unknown> = {};
    let armed = false;
    const fire = (label: string, s: unknown): void => {
      if (!armed) {
        return;
      }

      seen[label] ??= s;
      const marker = { label };

      markers[label] = marker;
      (s as Record<string, unknown>)[`__${label.replaceAll(/[^a-zA-Z]/g, "_")}`] = marker;
    };
    const router = createRouter(
      [
        {
          name: "home",
          path: "/home",
          canDeactivate: () => (toState: unknown) => {
            fire("route.canDeactivate·toState", toState);

            return true;
          },
        },
        {
          name: "g",
          path: "/g/:id",
          canActivate: () => (toState: unknown) => {
            fire("route.canActivate·toState", toState);

            return true;
          },
        },
      ] as never,
      {} as never,
    );
    const api = getPluginApi(router);

    router.usePlugin(() => ({
      onTransitionStart: (s: unknown) => {
        fire("plugin.onTransitionStart·toState", s);
      },
      onTransitionLeaveApprove: (s: unknown) => {
        fire("plugin.onTransitionLeaveApprove·toState", s);
      },
    }));
    api.addEventListener(events.TRANSITION_START, (s) => {
      fire("event.$$start·toState", s);
    });
    api.addEventListener(events.TRANSITION_LEAVE_APPROVE, (s) => {
      fire("event.$$leaveApprove·toState", s);
    });
    router.subscribeLeave(({ nextRoute }) => {
      fire("subscribeLeave·nextRoute", nextRoute);
    });

    let matched: State | undefined;

    if (arc === "navigateToState") {
      await router.start("/home");
      matched = api.matchPath("/g/9") ?? undefined;
      armed = true;
      await api.navigateToState(matched!);
    } else {
      armed = true;
      await router.start("/g/9");
    }

    const st = router.getState() as unknown as Record<string, unknown>;
    const rows: Record<string, string> = {};

    for (const label of Object.keys(markers)) {
      const key = `__${label.replaceAll(/[^a-zA-Z]/g, "_")}`;

      rows[label] = `sameObjectAsCommitted=${seen[label] === st} landed=${st[key] === markers[label]}`;
    }

    out[arc] = {
      committedName: st.name,
      committedFrozen: Object.isFrozen(st),
      matchedIsCommitted: matched === undefined ? "n/a (start arc)" : matched === router.getState(),
      matchedFrozen: matched === undefined ? "n/a" : Object.isFrozen(matched),
      handoutsFired: Object.keys(seen),
      ...rows,
    };
    router.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
