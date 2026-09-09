// #2141 — the plugin `buildUrl` asks the caller's options for the fragment
// slot, then takes it from a second read.
//
// `createPluginBuildUrl` gates on `opts?.hash === undefined` and then normalises
// `opts.hash`. Two reads of a slot on an object the APPLICATION owns, so a
// value that answers differently between them is gated on one and printed from
// the other — the #1899 ask-then-take shape, on the URL a plugin hands back.
import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { createPluginBuildUrl } from "../../../src/browser-env/plugin-utils";
import { routerConfig } from "../../helpers/testUtils";

import type { Router } from "@real-router/core";

describe("#2141 — the fragment slot is gated and printed from one read", () => {
  const driftingOpts = (counter: { n: number }): { hash?: string } =>
    new Proxy(
      {},
      {
        get(target, key, receiver): unknown {
          if (key === "hash") {
            counter.n += 1;

            return counter.n === 1 ? "FIRST" : "SECOND";
          }

          return Reflect.get(target, key, receiver) as unknown;
        },
      },
    );

  it("prints the fragment the gate admitted", () => {
    const router: Router = createRouter(routerConfig, {});
    const buildUrl = createPluginBuildUrl(router, "");
    const counter = { n: 0 };
    const url = buildUrl("users.list", {}, {}, driftingOpts(counter));

    expect({ url, reads: counter.n }).toStrictEqual({
      url: "/users/list#FIRST",
      reads: 1,
    });
  });

  it("CONTROL — an absent slot still prints no fragment, and a real one prints", () => {
    // Without this the row above passes on a `buildUrl` that stopped consulting
    // the slot at all.
    const router: Router = createRouter(routerConfig, {});
    const buildUrl = createPluginBuildUrl(router, "");

    expect({
      absent: buildUrl("users.list", {}, {}, undefined),
      empty: buildUrl("users.list", {}, {}, {}),
      real: buildUrl("users.list", {}, {}, { hash: "section" }),
    }).toStrictEqual({
      absent: "/users/list",
      empty: "/users/list",
      real: "/users/list#section",
    });
  });
});
