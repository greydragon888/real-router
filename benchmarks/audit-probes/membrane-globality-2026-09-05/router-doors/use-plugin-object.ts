// Door: Router.usePlugin · factories[].return (the Plugin OBJECT the factory hands back).
// Question: what does core do with that object — copy it, hold it, freeze it, read it by name?
// (a) counting getters: how many reads per hook name, and WHEN (usePlugin vs unsubscribe);
// (b) a Proxy: does the `in` check reach the `has` trap (a prototype-chain walk)?
// (c) a hook INHERITED through the prototype: is it registered?
// (d) POSITIVE CONTROL: a plain own hook fires on navigate.
import { createRouter } from "@real-router/core";

import type { Plugin } from "@real-router/core/types";

const routes = [
  { name: "home", path: "/home" },
  { name: "u", path: "/u/:id" },
];

async function countingGetters(): Promise<Record<string, unknown>> {
  const router = createRouter(routes as never);
  const reads: Record<string, number> = {};
  const fired: string[] = [];
  const plugin = {};

  for (const key of ["onTransitionSuccess", "onStart", "teardown"]) {
    Object.defineProperty(plugin, key, {
      enumerable: true,
      configurable: true,
      get(): unknown {
        reads[key] = (reads[key] ?? 0) + 1;

        return () => {
          fired.push(key);
        };
      },
    });
  }

  const frozenBefore = Object.isFrozen(plugin);
  const unsub = router.usePlugin(() => plugin as Plugin);
  const afterUse = { ...reads };
  const frozenAfterUse = Object.isFrozen(plugin);

  await router.start("/home");
  await router.navigate("u", { id: "1" });

  const afterNav = { ...reads };

  unsub();

  const afterUnsub = { ...reads };

  router.dispose();

  return {
    frozenBefore,
    frozenAfterUse,
    afterUse,
    afterNav,
    afterUnsub,
    fired,
  };
}

function proxyHasTrap(): Record<string, unknown> {
  const router = createRouter(routes as never);
  const target: Record<string, unknown> = { onTransitionSuccess: () => {} };
  const hasAsked: string[] = [];
  const gotAsked: string[] = [];
  const proxy = new Proxy(target, {
    has(t, key): boolean {
      hasAsked.push(String(key));

      return Reflect.has(t, key);
    },
    get(t, key, receiver): unknown {
      gotAsked.push(String(key));

      return Reflect.get(t, key, receiver);
    },
  });

  router.usePlugin(() => proxy as unknown as Plugin);

  const out = {
    hasAsked,
    gotAsked,
    targetFrozenAfterUse: Object.isFrozen(target),
  };

  router.dispose();

  return out;
}

async function inheritedHook(): Promise<Record<string, unknown>> {
  const router = createRouter(routes as never);
  const fired: string[] = [];
  const proto = {
    onTransitionSuccess: () => {
      fired.push("inherited onTransitionSuccess");
    },
  };
  const plugin = Object.create(proto) as Plugin;

  router.usePlugin(() => plugin);
  await router.start("/home");
  await router.navigate("u", { id: "1" });

  const out = {
    ownKeysOfPlugin: Object.keys(plugin),
    fired,
    childFrozen: Object.isFrozen(plugin),
    protoFrozen: Object.isFrozen(proto),
  };

  router.dispose();

  return out;
}

async function positiveControl(): Promise<Record<string, unknown>> {
  const router = createRouter(routes as never);
  const fired: string[] = [];

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      fired.push(`own onTransitionSuccess → ${toState.name}`);
    },
  }));
  await router.start("/home");
  await router.navigate("u", { id: "1" });
  router.dispose();

  return { fired };
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify(
      {
        countingGetters: await countingGetters(),
        proxyHasTrap: proxyHasTrap(),
        inheritedHook: await inheritedHook(),
        positiveControl: await positiveControl(),
      },
      null,
      2,
    ),
  );
}

void main();
