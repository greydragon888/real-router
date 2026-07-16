/**
 * Svelte adapter-bench app entry — mirrors apps/react.tsx.
 * Commit mechanics: `flushSync` from 'svelte' drains the pending effect
 * queue synchronously after each navigation (same call the adapter's own
 * tests rely on).
 */
import { createRouter } from "@real-router/core";
import { memoryPluginFactory } from "@real-router/memory-plugin";
import { flushSync, mount, unmount } from "svelte";

import Host from "./Host.svelte";

import type { MountedApp } from "../../shared/bench-utils.mjs";
import type { Route } from "@real-router/core";

const routes: Route[] = [
  { name: "home", path: "/" },
  {
    name: "items",
    path: "/items/:id",
    children: [{ name: "details", path: "/details" }],
  },
  { name: "about", path: "/about" },
];

export async function mountTestApp(
  container: HTMLElement,
  startPath: string,
): Promise<MountedApp> {
  const router = createRouter(routes);

  router.usePlugin(memoryPluginFactory());
  await router.start(startPath);

  const app = mount(Host, { target: container, props: { router } });

  flushSync();

  return {
    commitNavigate: (name, params) => {
      void router.navigate(name, params);
      flushSync();
    },
    commitHistory: (dir) => {
      if (dir === "back") {
        router.back();
      } else {
        router.forward();
      }
      flushSync();
    },
    unmount: () => {
      void unmount(app);
    },
  };
}
