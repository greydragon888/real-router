// Door: Router.canNavigateTo · params. Question: how many times is a declared-query key in the
// caller's PATH bag read (facade findMisChanneledKey → seam assertChannelCorrect →
// normalizeChannel), and what does the guard-facing toState carry after the copy?
// Compared with navigate on the SAME drifting bag.
import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

const answeringOnRead = (
  nth: number,
): { bag: object; reads: Record<string, number> } => {
  const reads: Record<string, number> = {};
  const bag = {};

  Object.defineProperty(bag, "id", { enumerable: true, get: () => "7" });
  Object.defineProperty(bag, "tab", {
    enumerable: true,
    get(): unknown {
      reads.tab = (reads.tab ?? 0) + 1;

      return reads.tab >= nth ? "SHIPPED" : undefined;
    },
  });

  return { bag, reads };
};

let seenByGuard: State["params"] | undefined;

const mk = () =>
  createRouter([
    { name: "home", path: "/home" },
    {
      name: "u",
      path: "/u/:id?tab",
      canActivate: () => (toState: State) => {
        seenByGuard = toState.params;

        return true;
      },
    },
  ] as never);

async function canNavigateToArmed(
  nth: number,
): Promise<Record<string, unknown>> {
  const router = mk();

  await router.start("/home");
  seenByGuard = undefined;

  const probe = answeringOnRead(nth);
  const answer = router.canNavigateTo("u", probe.bag as never);
  const out = {
    nth,
    answer,
    reads: { ...probe.reads },
    guardSawParams: seenByGuard,
  };

  router.dispose();

  return out;
}

async function navigateArmed(nth: number): Promise<Record<string, unknown>> {
  const router = mk();

  await router.start("/home");

  const probe = answeringOnRead(nth);
  let refused = false;

  try {
    await router.navigate("u", probe.bag as never);
  } catch {
    refused = true;
  }

  const out = {
    nth,
    refused,
    reads: { ...probe.reads },
    committedPath: router.getState()?.path,
  };

  router.dispose();

  return out;
}

async function positiveControl(): Promise<Record<string, unknown>> {
  const router = mk();

  await router.start("/home");

  const plain = router.canNavigateTo("u", { id: "7" });
  const misChannelled = router.canNavigateTo("u", {
    id: "7",
    tab: "x",
  } as never);

  router.dispose();

  return { plainBag: plain, declaredQueryKeyInParams: misChannelled };
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify(
      {
        canNavigateTo_1: await canNavigateToArmed(1),
        canNavigateTo_3: await canNavigateToArmed(3),
        navigate_3: await navigateArmed(3),
        positiveControl: await positiveControl(),
      },
      null,
      2,
    ),
  );
}

void main();
