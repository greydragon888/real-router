// Door: Router.navigateToDefault · Options.defaultParams / defaultSearch — the VALUE form
// (a bag core holds by reference inside the frozen options) and the CALLBACK-RETURN form
// (a bag the application builds per call). Question: how often is the caller's bag read per
// navigateToDefault, does the committed channel alias it, and does this door run the facade
// P1 guard (navigate reads a declared query key in `params` THREE times; the seam + copy is two)?
import { createRouter } from "@real-router/core";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id?tab" },
];

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

async function callbackReturn(): Promise<Record<string, unknown>> {
  const params = countingBag({ id: "7" });
  const search = countingBag({ tab: "x" });
  const router = createRouter(routes as never, {
    defaultRoute: "u",
    defaultParams: () => params.bag,
    defaultSearch: () => search.bag,
  } as never);

  await router.start("/home");

  const state = await router.navigateToDefault();
  const out = {
    path: state.path,
    paramsReads: { ...params.reads },
    searchReads: { ...search.reads },
    committedParamsIsReturnedBag: state.params === params.bag,
    committedSearchIsReturnedBag: state.search === search.bag,
  };

  router.dispose();

  return out;
}

async function staticValueHeldByReference(): Promise<Record<string, unknown>> {
  const params = countingBag({ id: "7" });
  const router = createRouter(routes as never, {
    defaultRoute: "u",
    defaultParams: params.bag,
  } as never);

  await router.start("/home");
  await router.navigateToDefault();

  const afterFirst = { ...params.reads };

  await router.navigateToDefault({ reload: true });

  const afterSecond = { ...params.reads };

  router.dispose();

  return { afterFirst, afterSecond };
}

async function armed(nth: number): Promise<Record<string, unknown>> {
  const probe = answeringOnRead(nth);
  const router = createRouter(routes as never, {
    defaultRoute: "u",
    defaultParams: () => probe.bag,
  } as never);

  await router.start("/home");

  let refused = false;
  let message = "";

  try {
    await router.navigateToDefault();
  } catch (error) {
    refused = true;
    message = String((error as Error).message).slice(0, 90);
  }

  const out = {
    nth,
    reads: { ...probe.reads },
    refused,
    message,
    committedParams: router.getState()?.params,
    committedPath: router.getState()?.path,
  };

  router.dispose();

  return out;
}

async function positiveControl(): Promise<Record<string, unknown>> {
  const router = createRouter(routes as never, {
    defaultRoute: "u",
    defaultParams: { id: "7" },
    defaultSearch: { tab: "x" },
  } as never);

  await router.start("/home");

  const state = await router.navigateToDefault();
  const out = { path: state.path, params: state.params, search: state.search };

  router.dispose();

  return out;
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify(
      {
        callbackReturn: await callbackReturn(),
        staticValueHeldByReference: await staticValueHeldByReference(),
        armed_1: await armed(1),
        armed_2: await armed(2),
        armed_3: await armed(3),
        positiveControl: await positiveControl(),
      },
      null,
      2,
    ),
  );
}

void main();
