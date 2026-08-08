// TEMPORARY probe for /wiki-sync navigate — delete after the run.
import { appendFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validationPlugin } from "../../../validation-plugin/src/validationPlugin";

import { createRouter } from "../../src/createRouter";

const OUT =
  "/private/tmp/claude-501/-Users-olegivanov-WebstormProjects-real-router/27cf2a42-470d-46cb-99b5-269003613b61/scratchpad/probe-navigate.txt";
const say = (m: string) => appendFileSync(OUT, m + "\n");

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "list", path: "/list?page" },
  { name: "user", path: "/user/:id" },
];

const outcome = async (label: string, fn: () => unknown) => {
  try {
    const r = await fn();
    say(`${label}: RESOLVED ${JSON.stringify(r && (r as { name?: string }).name)}`);
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string };
    say(`${label}: ${err.name ?? "?"} code=${err.code ?? "-"} msg=${(err.message ?? "").slice(0, 90)}`);
  }
};

const sync = (label: string, fn: () => unknown) => {
  try {
    void fn();
    say(`${label}: no sync throw`);
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string };
    say(`${label}: SYNC THROW ${err.name ?? "?"} code=${err.code ?? "-"} msg=${(err.message ?? "").slice(0, 90)}`);
  }
};

describe("probe: navigate.md", () => {
  it("bare core — invalid name, mis-channeled key, arg slots", async () => {
    const router = createRouter(ROUTES);
    await router.start("/home");

    // страница утверждает: null/undefined/number -> TypeError через reject
    await outcome("P1 navigate(null)", () => router.navigate(null as never));
    await outcome("P2 navigate(undefined)", () => router.navigate(undefined as never));
    await outcome("P3 navigate(42)", () => router.navigate(42 as never));
    await outcome("P4 navigate('')", () => router.navigate(""));

    // страница утверждает: invalid opts -> TypeError через reject
    await outcome("P5 bad opts (string)", () =>
      router.navigate("user", { id: "1" }, undefined, "nope" as never),
    );

    // query-ключ в params-бэге
    sync("P6 query key in params bag", () => router.navigate("list", { page: "2" }));

    // третий слот — search, не opts
    await outcome("P7 four-slot call", () =>
      router.navigate("list", {}, { page: "3" }, { replace: true }),
    );
    say(`P7 state.path after: ${router.getState()?.path} | search=${JSON.stringify(router.getState()?.search)}`);

    // форма-дескриптор
    await outcome("P8 target form", () =>
      router.navigate({ name: "user", params: { id: "7" } }, { replace: true }),
    );
    say(`P8 state.path after: ${router.getState()?.path}`);

    expect(true).toBe(true);
  });

  it("v1 three-arg form: what the wiki tells readers to write", async () => {
    const router = createRouter(ROUTES);
    await router.start("/home");
    // страница показывает navigate(name, params, opts) — opts в слоте search
    await outcome("P9 navigate('user',{id},{replace:true})", () =>
      router.navigate("user", { id: "9" }, { replace: true } as never),
    );
    say(`P9 state.path after: ${router.getState()?.path} | search=${JSON.stringify(router.getState()?.search)}`);
    expect(true).toBe(true);
  });

  it("under validation-plugin — same five cases", async () => {
    const router = createRouter(ROUTES);
    router.usePlugin(validationPlugin());
    await router.start("/home");
    say("--- with @real-router/validation-plugin ---");
    await outcome("V1 navigate(null)", () => router.navigate(null as never));
    await outcome("V3 navigate(42)", () => router.navigate(42 as never));
    await outcome("V4 navigate('')", () => router.navigate(""));
    await outcome("V5 bad opts (string)", () =>
      router.navigate("user", { id: "1" }, undefined, "nope" as never),
    );
    expect(true).toBe(true);
  });
});
