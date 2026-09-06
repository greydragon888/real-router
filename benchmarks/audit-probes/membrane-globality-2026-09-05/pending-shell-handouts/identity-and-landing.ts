// The pending-shell handout family: which application-facing surfaces receive
// the SAME writable object that `completeTransition` later freezes and the
// table commits — and what a write through each handle does to `getState()`.
//
// Sections:
//   A. identity — one navigation, every handout records the object it got;
//      compared by `===` against the committed `getState()`.
//   B. landing matrix — for each pre-commit handout × write kind, a fresh
//      router; after the commit, did the write land in `getState()`?
//      (own key / params slot / context slot / path field / transition slot)
//   C. the non-committing arcs (cancel, error, canNavigateTo) — same handle
//      class, nothing lands.
//   D. hostile shapes installed on core's own record through the handle:
//      an accessor on `name` (P1 class), a prototype setter under a deleted
//      `transition` (P3 class, #1852 shape), a `__proto__` write on `context`.
//   E. `name` mutation outcomes (the wiki's `leave.md` claim).
//   F. positive controls: a write AFTER the commit is refused; a committed
//      shell is frozen; the detection distinguishes pending from committed.
//
// Run: cd W/benchmarks && NODE_OPTIONS='--conditions=@real-router/internal-source' \
//   npx tsx audit-probes/membrane-globality-2026-09-05/pending-shell-handouts/identity-and-landing.ts
import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router, State } from "@real-router/core/types";

type Shell = Record<string, unknown> & State;
type Hook = (shell: Shell) => void;

const HANDOUTS = [
  "plugin.onTransitionStart·toState",
  "event.$$start·toState",
  "plugin.onTransitionLeaveApprove·toState",
  "event.$$leaveApprove·toState",
  "subscribeLeave·nextRoute",
  "route.canDeactivate·toState",
  "route.canActivate·toState",
] as const;

type Handout = (typeof HANDOUTS)[number];

const POST_COMMIT = [
  "plugin.onTransitionSuccess·toState",
  "event.$$success·toState",
  "subscribe·route",
] as const;

const tryWrite = (fn: () => void): string => {
  try {
    fn();

    return "no-throw";
  } catch (error) {
    return `throw:${(error as Error).constructor.name}`;
  }
};

interface Rig {
  router: Router;
  seen: Record<string, unknown>;
  arm: () => void;
}

/**
 * A router whose every State-receiving surface calls `fire(label, state)`.
 * `hooks[label]` runs the write under test at that surface; `seen[label]`
 * keeps the first object that surface received while armed.
 */
function mk(hooks: Partial<Record<string, Hook>>): Rig {
  const seen: Record<string, unknown> = {};
  let armed = false;

  const fire = (label: string, state: unknown): void => {
    if (!armed) {
      return;
    }

    seen[label] ??= state;
    hooks[label]?.(state as Shell);
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
        path: "/g/:id?tab",
        canActivate: () => (toState: unknown) => {
          fire("route.canActivate·toState", toState);

          return true;
        },
      },
      {
        name: "refused",
        path: "/refused",
        canActivate: () => (toState: unknown) => {
          fire("route.canActivate(rejecting)·toState", toState);

          return false;
        },
      },
      { name: "other", path: "/other" },
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
    onTransitionCancel: (s: unknown) => {
      fire("plugin.onTransitionCancel·toState", s);
    },
    onTransitionError: (s: unknown) => {
      fire("plugin.onTransitionError·toState", s);
    },
    onTransitionSuccess: (s: unknown) => {
      fire("plugin.onTransitionSuccess·toState", s);
    },
  }));
  api.addEventListener(events.TRANSITION_START, (s) => {
    fire("event.$$start·toState", s);
  });
  api.addEventListener(events.TRANSITION_LEAVE_APPROVE, (s) => {
    fire("event.$$leaveApprove·toState", s);
  });
  api.addEventListener(events.TRANSITION_SUCCESS, (s) => {
    fire("event.$$success·toState", s);
  });
  router.subscribeLeave(({ nextRoute, route }) => {
    fire("subscribeLeave·nextRoute", nextRoute);
    fire("subscribeLeave·route", route);
  });
  router.subscribe(({ route }) => {
    fire("subscribe·route", route);
  });

  return {
    router,
    seen,
    arm: () => {
      armed = true;
    },
  };
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // ------------------------------------------------------------------ A
  {
    const rig = mk({});

    await rig.router.start("/home");
    rig.arm();
    await rig.router.navigate("g", { id: "2" } as never);
    const committed = rig.router.getState();
    const identity: Record<string, unknown> = {};

    for (const label of [...HANDOUTS, ...POST_COMMIT, "subscribeLeave·route"]) {
      const obj = rig.seen[label];

      identity[label] =
        obj === undefined
          ? "NOT FIRED"
          : `${obj === committed ? "=== getState()" : "!== getState()"} · frozenWhenHanded=n/a`;
    }

    // frozenness at the moment of the handout needs a probe INSIDE the hook —
    // section B records it per surface; here only identity.
    out.A_identity = {
      committedName: committed?.name,
      committedFrozen: Object.isFrozen(committed),
      ...identity,
      "control: getState() === getState()": rig.router.getState() === committed,
    };
    rig.router.dispose();
  }

  // ------------------------------------------------------------------ B
  type WriteKind = "ownKey" | "paramsSlot" | "contextSlot" | "pathField" | "transitionSlot";
  const WRITES: WriteKind[] = ["ownKey", "paramsSlot", "contextSlot", "pathField", "transitionSlot"];
  const matrix: Record<string, Record<string, string>> = {};

  for (const handout of HANDOUTS) {
    matrix[handout] = {};

    for (const kind of WRITES) {
      const marker: Record<string, unknown> = { id: "2", marker: `${handout}/${kind}` };
      let frozenWhenHanded: boolean | undefined;
      let writeOutcome = "hook never ran";

      const rig = mk({
        [handout]: (s) => {
          frozenWhenHanded = Object.isFrozen(s);
          writeOutcome = tryWrite(() => {
            switch (kind) {
              case "ownKey": {
                s.__probe = marker;
                break;
              }
              case "paramsSlot": {
                s.params = marker as never;
                break;
              }
              case "contextSlot": {
                s.context = marker as never;
                break;
              }
              case "pathField": {
                s.path = "/hijacked";
                break;
              }
              case "transitionSlot": {
                s.transition = marker as never;
                break;
              }
            }
          });
        },
      });

      await rig.router.start("/home");
      rig.arm();

      let navOutcome: string;

      try {
        await rig.router.navigate("g", { id: "2" } as never);
        navOutcome = "resolved";
      } catch (error) {
        navOutcome = `rejected:${(error as { code?: string }).code ?? (error as Error).name}`;
      }

      const st = rig.router.getState() as unknown as Shell;
      let landed: boolean;
      let extra = "";

      switch (kind) {
        case "ownKey": {
          landed = Object.hasOwn(st, "__probe") && st.__probe === marker;
          extra = ` keys=${Object.keys(st).length}`;
          break;
        }
        case "paramsSlot": {
          landed = st.params === marker;
          extra = ` committedParamsFrozen=${Object.isFrozen(st.params)}`;
          break;
        }
        case "contextSlot": {
          landed = st.context === marker;
          break;
        }
        case "pathField": {
          landed = st.path === "/hijacked";
          extra = ` committedName=${st.name}`;
          break;
        }
        case "transitionSlot": {
          landed = st.transition === marker;
          extra = ` committedTransitionPhase=${(st.transition as { phase?: string } | undefined)?.phase}`;
          break;
        }
      }

      matrix[handout][kind] =
        `frozenWhenHanded=${frozenWhenHanded} write=${writeOutcome} nav=${navOutcome} LANDED=${landed}${extra}`;
      rig.router.dispose();
    }
  }

  out.B_landing_matrix = matrix;

  // ------------------------------------------------------------------ C
  {
    // C1 cancel arc: an external signal aborted from inside the announce.
    const ac = new AbortController();
    const marker = { c: 1 };
    const rig = mk({
      "plugin.onTransitionStart·toState": () => {
        ac.abort(new Error("from the announce"));
      },
      "plugin.onTransitionCancel·toState": (s) => {
        s.__cancelProbe = marker;
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never, {} as never, { signal: ac.signal } as never);
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const cancelled = rig.seen["plugin.onTransitionCancel·toState"] as Shell | undefined;

    out.C1_cancel_arc = {
      navOutcome,
      cancelHookFired: cancelled !== undefined,
      cancelToStateIsTheStartShell: cancelled === rig.seen["plugin.onTransitionStart·toState"],
      cancelToStateFrozen: cancelled === undefined ? undefined : Object.isFrozen(cancelled),
      committedName: rig.router.getState()?.name,
      committedIsCancelShell: rig.router.getState() === cancelled,
      landed: Object.hasOwn(rig.router.getState() ?? {}, "__cancelProbe"),
    };
    rig.router.dispose();
  }
  {
    // C2 error arc: a rejecting activation guard.
    const marker = { e: 1 };
    const rig = mk({
      "plugin.onTransitionError·toState": (s) => {
        s.__errorProbe = marker;
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("refused");
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const errored = rig.seen["plugin.onTransitionError·toState"] as Shell | undefined;

    out.C2_error_arc_guard_rejects = {
      navOutcome,
      errorHookFired: errored !== undefined,
      errorToStateIsTheStartShell: errored === rig.seen["plugin.onTransitionStart·toState"],
      errorToStateIsTheGuardShell: errored === rig.seen["route.canActivate(rejecting)·toState"],
      errorToStateFrozen: errored === undefined ? undefined : Object.isFrozen(errored),
      committedName: rig.router.getState()?.name,
      landed: Object.hasOwn(rig.router.getState() ?? {}, "__errorProbe"),
    };
    rig.router.dispose();
  }
  {
    // C3 error arc: SAME_STATES — `emitTransitionError(toState, …)` before any announce.
    const marker = { s: 1 };
    const rig = mk({
      "plugin.onTransitionError·toState": (s) => {
        s.__sameProbe = marker;
      },
    });

    await rig.router.start("/home");
    await rig.router.navigate("g", { id: "2" } as never);
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never);
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const errored = rig.seen["plugin.onTransitionError·toState"] as Shell | undefined;

    out.C3_error_arc_same_states = {
      navOutcome,
      errorHookFired: errored !== undefined,
      startHookFired: rig.seen["plugin.onTransitionStart·toState"] !== undefined,
      errorToStateFrozen: errored === undefined ? undefined : Object.isFrozen(errored),
      errorToStateIsCommitted: errored === rig.router.getState(),
      landed: Object.hasOwn(rig.router.getState() ?? {}, "__sameProbe"),
    };
    rig.router.dispose();
  }
  {
    // C4 canNavigateTo — guards run on a pending shell that never commits.
    const marker = { p: 1 };
    let frozen: boolean | undefined;
    const rig = mk({
      "route.canActivate·toState": (s) => {
        frozen = Object.isFrozen(s);
        s.__predicateProbe = marker;
      },
    });

    await rig.router.start("/home");
    rig.arm();
    const answer = rig.router.canNavigateTo("g", { id: "2" } as never);
    const guardShell = rig.seen["route.canActivate·toState"] as Shell | undefined;

    out.C4_canNavigateTo = {
      answer,
      guardFired: guardShell !== undefined,
      frozenWhenHanded: frozen,
      committedName: rig.router.getState()?.name,
      guardShellIsCommitted: guardShell === rig.router.getState(),
      landed: Object.hasOwn(rig.router.getState() ?? {}, "__predicateProbe"),
      "control: a second call hands a DIFFERENT shell": (() => {
        const first = guardShell;

        delete rig.seen["route.canActivate·toState"];
        rig.router.canNavigateTo("g", { id: "2" } as never);

        return rig.seen["route.canActivate·toState"] !== first;
      })(),
    };
    rig.router.dispose();
  }

  // ------------------------------------------------------------------ D
  {
    // D1 accessor on `name` installed through onTransitionStart.
    let getterCalls = 0;
    const rig = mk({
      "plugin.onTransitionStart·toState": (s) => {
        Object.defineProperty(s, "name", {
          configurable: true,
          enumerable: true,
          get(): string {
            getterCalls++;

            return "g";
          },
        });
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never);
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const st = rig.router.getState()!;
    const before = getterCalls;

    void st.name;
    void st.name;
    const desc = Object.getOwnPropertyDescriptor(st, "name");

    out.D1_accessor_on_name = {
      navOutcome,
      committedFrozen: Object.isFrozen(st),
      committedNameIsAccessor: desc !== undefined && typeof desc.get === "function",
      getterCallsDuringNavigation: before,
      getterCallsForTwoReadsAfterCommit: getterCalls - before,
      isActiveRouteStillAnswers: rig.router.isActiveRoute("g", { id: "2" } as never),
    };
    rig.router.dispose();
  }
  {
    // D2 prototype setter under a deleted `transition` (#1852 shape, on core's shell).
    let captured: unknown;
    const fake = { phase: "fake", reason: "fake", segments: { deactivated: [], activated: [], intersection: "" } };
    const rig = mk({
      "plugin.onTransitionStart·toState": (s) => {
        delete (s as Record<string, unknown>).transition;
        Object.setPrototypeOf(s, {
          set transition(v: unknown) {
            captured = v;
          },
          get transition(): unknown {
            return fake;
          },
        });
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never);
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const st = rig.router.getState()!;

    out.D2_proto_setter_under_deleted_transition = {
      navOutcome,
      committedHasOwnTransition: Object.hasOwn(st, "transition"),
      committedTransitionIsTheFake: st.transition === fake,
      setterCapturedCoresRealMeta:
        captured !== undefined && (captured as { phase?: string }).phase === "activating" && captured !== fake,
      capturedIsFrozen: captured === undefined ? undefined : Object.isFrozen(captured),
      committedProtoIsObjectPrototype: Object.getPrototypeOf(st) === Object.prototype,
    };
    rig.router.dispose();
  }
  {
    // D3 `__proto__` [[Set]] on core's own `context` container through the handle.
    const hostile = { planted: true };
    const rig = mk({
      "plugin.onTransitionStart·toState": (s) => {
        (s.context as Record<string, unknown>).__proto__ = hostile;
      },
    });

    await rig.router.start("/home");
    rig.arm();
    await rig.router.navigate("g", { id: "2" } as never);
    const ctx = rig.router.getState()!.context as Record<string, unknown>;

    out.D3_proto_set_on_context = {
      contextProtoIsHostile: Object.getPrototypeOf(ctx) === hostile,
      "'planted' in getState().context": "planted" in ctx,
      ownKeys: Object.keys(ctx),
    };
    rig.router.dispose();
  }

  // ------------------------------------------------------------------ E
  for (const [label, handout, target] of [
    ["E1_name_to_existing_route_from_onTransitionStart", "plugin.onTransitionStart·toState", "other"],
    ["E2_name_to_unknown_route_from_onTransitionStart", "plugin.onTransitionStart·toState", "nope"],
    ["E3_name_to_existing_route_from_subscribeLeave", "subscribeLeave·nextRoute", "other"],
  ] as const) {
    const rig = mk({
      [handout]: (s) => {
        s.name = target;
      },
    });

    await rig.router.start("/home");
    rig.arm();

    let navOutcome: string;

    try {
      await rig.router.navigate("g", { id: "2" } as never);
      navOutcome = "resolved";
    } catch (error) {
      navOutcome = `rejected:${(error as { code?: string }).code}`;
    }

    const st = rig.router.getState()!;

    out[label] = {
      navOutcome,
      committedName: st.name,
      committedPath: st.path,
      committedParams: st.params,
      committedIsTheShell: st === rig.seen[handout],
    };
    rig.router.dispose();
  }

  // ------------------------------------------------------------------ F
  {
    const rig = mk({
      "plugin.onTransitionSuccess·toState": (s) => {
        rig.seen.lateWrite = tryWrite(() => {
          s.__late = 1;
        });
      },
    });

    await rig.router.start("/home");
    rig.arm();
    await rig.router.navigate("g", { id: "2" } as never);
    const st = rig.router.getState()!;

    out.F_controls = {
      "post-commit write through onTransitionSuccess": rig.seen.lateWrite,
      "post-commit write landed": Object.hasOwn(st, "__late"),
      committedShellFrozen: Object.isFrozen(st),
      committedParamsFrozen: Object.isFrozen(st.params),
      committedContextFrozen: Object.isFrozen(st.context),
      "control: an untouched literal is not frozen": Object.isFrozen({}),
      "control: accessor on a literal counts reads": (() => {
        let n = 0;
        const o = {};

        Object.defineProperty(o, "k", {
          get() {
            n++;

            return 1;
          },
        });
        Object.freeze(o);
        void (o as { k: number }).k;

        return n === 1 && Object.isFrozen(o);
      })(),
    };
    rig.router.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
