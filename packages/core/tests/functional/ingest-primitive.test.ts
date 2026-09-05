import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * The two doors that now ingest through one primitive (#1901).
 *
 * ⚑ Public API only, no `src/*` import — the primitive is internal and the
 * white-box boundary in `eslint.config.mjs` is right to refuse one. Every cell
 * carries its CONTROL in the same cell, because "green" says nothing unless the
 * shape the primitive replaces is red on that same input.
 */
describe("#1825 — the declared param list and the type registry agree", () => {
  it("a __proto__ param gets a real entry in the registry", () => {
    const router = createRouter(
      [
        { name: "q", path: "/q?__proto__&keep" },
        { name: "s", path: "/s/:__proto__" },
        { name: "ok", path: "/o/:id" },
      ],
      {},
    );
    const tree = getPluginApi(router).getTree() as unknown as {
      children: Map<
        string,
        {
          paramMeta: {
            queryParams: string[];
            urlParams: string[];
            paramTypeMap: object;
          };
        }
      >;
    };
    const meta = (name: string) => tree.children.get(name)!.paramMeta;

    expect({
      q: [meta("q").queryParams, Object.keys(meta("q").paramTypeMap)],
      s: [meta("s").urlParams, Object.keys(meta("s").paramTypeMap)],
      // CONTROL: an ordinary route was never affected, so the cell cannot pass
      // by emptying every registry.
      ok: [meta("ok").urlParams, Object.keys(meta("ok").paramTypeMap)],
    }).toStrictEqual({
      q: [
        ["__proto__", "keep"],
        ["__proto__", "keep"],
      ],
      s: [["__proto__"], ["__proto__"]],
      ok: [["id"], ["id"]],
    });

    router.dispose();
  });

  it("the published registry keeps the ORDINARY prototype", () => {
    // ⚑ Not cosmetic. A prototype-less record is not a drop-in at a published
    // surface — `paramTypeMap` goes out through `getTree()`, and wiring the
    // private build target straight through reds existing cells that compare it
    // with `toStrictEqual`, which compares prototypes. Build private, publish
    // plain.
    const router = createRouter([{ name: "ok", path: "/o/:id" }], {});
    const tree = getPluginApi(router).getTree() as unknown as {
      children: Map<string, { paramMeta: { paramTypeMap: object } }>;
    };
    const map = tree.children.get("ok")!.paramMeta.paramTypeMap;

    expect(Object.getPrototypeOf(map)).toBe(Object.prototype);

    router.dispose();
  });

  it("an ambient accessor named like a param cannot hijack registration", () => {
    // #1852's precondition, reached through the public door: the key's
    // provenance is irrelevant — `id` comes from the ROUTE TABLE — so a
    // name-based skip cannot close this and a prototype-less build target can.
    Object.defineProperty(Object.prototype, "id", {
      get: () => "X",
      configurable: true,
    });

    try {
      const router = createRouter([{ name: "ok", path: "/o/:id" }], {});
      const tree = getPluginApi(router).getTree() as unknown as {
        children: Map<string, { paramMeta: { paramTypeMap: object } }>;
      };

      expect(
        Object.keys(tree.children.get("ok")!.paramMeta.paramTypeMap),
      ).toStrictEqual(["id"]);

      router.dispose();
    } finally {
      delete (Object.prototype as Record<string, unknown>).id;
    }
  });
});
