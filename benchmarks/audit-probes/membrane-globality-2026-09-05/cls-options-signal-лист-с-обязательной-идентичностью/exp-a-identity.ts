// EXPERIMENT (a) for the family `options.signal · leaf-with-mandatory-identity`.
//
// Four doors, one core object: Router.navigate / Router.navigateToDefault /
// PluginApi.navigateToState / RouterInternals.navigateToState all converge on
// executeNavigation.ts · executeNavigation, whose ONLY read of the caller's key
// is `const externalSignal = opts.signal` (the sole `opts.signal` expression in
// packages/core/src — every other hit is a comment or `controller.signal`,
// core's own object).
//
// Matrix per door:
//   ORIG      — the caller's real AbortSignal is handed in, aborted mid-flight.
//               POSITIVE CONTROL: navigation must end CANCELLED and NOT commit.
//   COPY_SPR  — strategy (a) applied to the leaf as a shallow container copy
//               `{ ...signal }`. Shows what such a copy carries at all.
//   COPY_SNAP — the most GENEROUS structural copy: a fresh object carrying the
//               boundary values of `aborted` / `reason` plus inert
//               add/removeEventListener. Value-preserving for every read core
//               makes — EXCEPT the live link.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/cls-options-signal-лист-с-обязательной-идентичностью/exp-a-identity.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Arm = "ORIG" | "COPY_SPR" | "COPY_SNAP";
type Door =
  | "navigate"
  | "navigateToDefault"
  | "PluginApi.navigateToState"
  | "RouterInternals.navigateToState";

/** Strategy (a) on the leaf: a new container, "leaves" by reference. */
function copySpread(sig: AbortSignal): unknown {
  return { ...(sig as unknown as Record<string, unknown>) };
}

/** The most generous structural copy a boundary could build. */
function copySnapshot(sig: AbortSignal): unknown {
  return {
    aborted: sig.aborted,
    reason: sig.reason,
    addEventListener() {
      /* a structural copy has no live link */
    },
    removeEventListener() {
      /* ditto */
    },
  };
}

function handedIn(sig: AbortSignal, arm: Arm): unknown {
  if (arm === "ORIG") return sig;
  if (arm === "COPY_SPR") return copySpread(sig);

  return copySnapshot(sig);
}

function makeRig() {
  let release: (v: boolean) => void = () => {};
  let arrive: () => void = () => {};
  const parked = new Promise<void>((res) => {
    arrive = res;
  });
  const routes = [
    { name: "a", path: "/a" },
    {
      name: "g",
      path: "/g",
      canActivate: () => () => {
        arrive();

        return new Promise<boolean>((res) => {
          release = res;
        });
      },
    },
  ];
  const router = createRouter(routes as never, { defaultRoute: "g" } as never);
  router.subscribeLeave(() => {});

  return { router, release: (v: boolean) => release(v), parked };
}

async function runDoor(door: Door, arm: Arm): Promise<Record<string, unknown>> {
  const rig = makeRig();
  await rig.router.start("/a");

  const ctl = new AbortController();
  const opts = { signal: handedIn(ctl.signal, arm) } as never;
  const st = { name: "g", params: {}, search: {}, path: "/g" } as never;

  let p: Promise<unknown>;

  try {
    switch (door) {
      case "navigate":
        p = rig.router.navigate("g", {}, undefined, opts);
        break;
      case "navigateToDefault":
        p = rig.router.navigateToDefault(opts);
        break;
      case "PluginApi.navigateToState":
        p = getPluginApi(rig.router).navigateToState(st, opts);
        break;
      default:
        p = (
          getInternals(rig.router) as unknown as {
            navigateToState: (s: never, o: never) => Promise<unknown>;
          }
        ).navigateToState(st, opts);
    }
  } catch (e) {
    return { door, arm, launchThrew: String((e as Error).message).slice(0, 90) };
  }

  const settled = p.then(
    () => "COMMITTED",
    (e: { code?: string; message?: string }) =>
      e.code ?? e.message ?? "REJECTED",
  );

  // The guard parks the navigation, so the abort below lands genuinely
  // in-flight. An arm that never reaches the guard is reported, not hung.
  const reachedGuard = await Promise.race([
    rig.parked.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), 150)),
  ]);

  ctl.abort(new Error("app-abort"));
  // Give the abort a turn to reach core, THEN let the parked guard resolve
  // `true`: an arm whose bridge heard the abort is already cancelled here, and
  // an arm that did not hear it goes on to commit. Both settle.
  await new Promise((r) => setTimeout(r, 10));
  rig.release(true);
  const outcome = await Promise.race([
    settled,
    new Promise<string>((r) => setTimeout(() => r("HUNG"), 200)),
  ]);
  await new Promise((r) => setTimeout(r, 0));

  return {
    door,
    arm,
    reachedGuard,
    outcome,
    committedTo: rig.router.getState()?.name,
    callerSignalFrozen: Object.isFrozen(ctl.signal),
  };
}

async function main(): Promise<void> {
  const doors: Door[] = [
    "navigate",
    "navigateToDefault",
    "PluginApi.navigateToState",
    "RouterInternals.navigateToState",
  ];
  const arms: Arm[] = ["ORIG", "COPY_SPR", "COPY_SNAP"];
  const rows: Record<string, unknown>[] = [];

  for (const d of doors) {
    for (const a of arms) {
      rows.push(await runDoor(d, a));
    }
  }

  console.log(
    "spreadCopyOwnKeys=" +
      JSON.stringify(Object.keys(new AbortController().signal)),
  );
  for (const r of rows) console.log(JSON.stringify(r));
}

void main();
