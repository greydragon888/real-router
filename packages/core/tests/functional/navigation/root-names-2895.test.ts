import { afterEach, describe, expect, it } from "vitest";

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { installSpyValidator } from "../../helpers/spyValidator";

import type { Params, Router, SearchParams, State } from "@real-router/core";

/**
 * A name the ROOT declares — a path slot or a `?query` name `setRootPath` adds —
 * belongs to no segment (#2895, decided). The root is not among the segments a
 * transition compares, so a change of such a name alone re-enters nothing: the
 * route's guards do not run, `transition.segments` lists no segment, and no
 * node between the root and the route is told. A slot the route's own segment
 * declares is the control: it re-enters that segment.
 */
const ROUTES = [
  { name: "home", path: "/home" },
  {
    name: "users",
    path: "/users/:uid",
    children: [{ name: "view", path: "/view" }],
  },
];

interface Case {
  label: string;
  rootPath: string;
  from: string;
  params: Params;
  search?: SearchParams;
  to: string;
  homeParams: Params;
  homeSearch?: SearchParams;
}

const CASES: Case[] = [
  {
    label: "a root path slot",
    rootPath: "/app/:tenant",
    from: "/app/a/users/1/view",
    params: { tenant: "b", uid: "1" },
    to: "/app/b/users/1/view",
    homeParams: { tenant: "b" },
  },
  {
    label: "a root ?query name",
    rootPath: "?lang",
    from: "/users/1/view?lang=en",
    params: { uid: "1" },
    search: { lang: "fr" },
    to: "/users/1/view?lang=fr",
    homeParams: {},
    homeSearch: { lang: "fr" },
  },
];

const NO_SEGMENT = {
  deactivated: [],
  activated: [],
  intersection: "users.view",
};

let router: Router | undefined;

async function startUnder(rootPath: string, path: string): Promise<Router> {
  const instance = createRouter(ROUTES);

  getPluginApi(instance).setRootPath(rootPath);
  router = instance;
  await instance.start(path);

  return instance;
}

function segmentsOf(state: State) {
  const { deactivated, activated, intersection } = state.transition.segments;

  return {
    deactivated: [...deactivated],
    activated: [...activated],
    intersection,
  };
}

function recordGuards(instance: Router): string[] {
  const calls: string[] = [];
  const lifecycle = getLifecycleApi(instance);

  for (const name of ["users", "users.view"]) {
    lifecycle.addActivateGuard(name, () => () => {
      calls.push(`activate ${name}`);

      return true;
    });
    lifecycle.addDeactivateGuard(name, () => () => {
      calls.push(`deactivate ${name}`);

      return true;
    });
  }

  return calls;
}

describe("a name the root declares belongs to no segment (#2895)", () => {
  afterEach(() => {
    router?.dispose();
    router = undefined;
  });

  it("covers both kinds of root name", () => {
    expect(CASES).toHaveLength(2);
  });

  describe.each(CASES)("$label", (c) => {
    it("re-enters no segment: no guard runs and transition.segments lists none", async () => {
      const r = await startUnder(c.rootPath, c.from);
      const calls = recordGuards(r);

      const to = await r.navigate("users.view", c.params, c.search);

      expect(to.path).toBe(c.to);
      expect(calls).toStrictEqual([]);
      expect(segmentsOf(to)).toStrictEqual(NO_SEGMENT);
    });

    it("lets a refusing guard through on the same route and refuses from another route", async () => {
      const r = await startUnder(c.rootPath, c.from);

      getLifecycleApi(r).addActivateGuard("users", () => () => false);

      expect(r.canNavigateTo("users.view", c.params, c.search)).toBe(true);
      await expect(
        r.navigate("users.view", c.params, c.search),
      ).resolves.toMatchObject({ path: c.to });

      await r.navigate("home", c.homeParams, c.homeSearch);

      expect(r.canNavigateTo("users.view", c.params, c.search)).toBe(false);
      await expect(
        r.navigate("users.view", c.params, c.search),
      ).rejects.toMatchObject({
        code: errorCodes.CANNOT_ACTIVATE,
        segment: "users",
      });
    });

    it("tells no node between the root and the route: shouldUpdateNode answers false there", async () => {
      const r = await startUnder(c.rootPath, c.from);
      const from = r.getState()!;

      const to = await r.navigate("users.view", c.params, c.search);

      expect(r.shouldUpdateNode("users")(to, from)).toBe(false);
      // The route itself is the intersection, and the root node updates on
      // every transition (#519).
      expect(r.shouldUpdateNode("users.view")(to, from)).toBe(true);
      expect(r.shouldUpdateNode("")(to, from)).toBe(true);
    });

    it("keeps the default areStatesEqual blind to the change, and ignoreQueryParams: false sees it", async () => {
      const r = await startUnder(c.rootPath, c.from);
      const from = r.getState()!;

      const to = await r.navigate("users.view", c.params, c.search);

      expect(r.areStatesEqual(to, from)).toBe(true);
      expect(r.areStatesEqual(to, from, false)).toBe(false);
    });
  });

  it("re-enters the segment whose own slot changes (control)", async () => {
    const r = await startUnder("/app/:tenant", "/app/a/users/1/view");
    const calls = recordGuards(r);
    const from = r.getState()!;

    const to = await r.navigate("users.view", { tenant: "a", uid: "2" });

    expect(calls).toStrictEqual([
      "deactivate users.view",
      "deactivate users",
      "activate users",
      "activate users.view",
    ]);
    expect(segmentsOf(to)).toStrictEqual({
      deactivated: ["users.view", "users"],
      activated: ["users", "users.view"],
      intersection: "",
    });
    expect(r.shouldUpdateNode("users")(to, from)).toBe(true);
    expect(r.areStatesEqual(to, from)).toBe(false);
  });

  it("re-enters from the segment that declares the root's query name itself (control)", async () => {
    const instance = createRouter([
      {
        name: "users",
        path: "/users/:uid?lang",
        children: [{ name: "view", path: "/view" }],
      },
    ]);

    getPluginApi(instance).setRootPath("?lang");
    router = instance;
    await instance.start("/users/1/view?lang=en");

    const to = await instance.navigate(
      "users.view",
      { uid: "1" },
      { lang: "fr" },
    );

    expect(to.path).toBe("/users/1/view?lang=fr");
    expect(segmentsOf(to)).toStrictEqual({
      deactivated: ["users.view", "users"],
      activated: ["users", "users.view"],
      intersection: "",
    });
  });

  it("counts a root slot as declared in the undeclared-key diagnostic", async () => {
    const r = await startUnder("/app/:tenant", "/app/a/users/1/view");
    const validator = installSpyValidator(r);

    await r.navigate("users.view", { tenant: "b", uid: "1" });

    expect(validator.state.reportUndeclaredParamKey).not.toHaveBeenCalled();

    // A key declared nowhere is still reported beside it.
    await r.navigate("users.view", { tenant: "c", uid: "1", extra: "e" });

    expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledTimes(1);
    expect(validator.state.reportUndeclaredParamKey).toHaveBeenCalledWith(
      "users.view",
      "extra",
    );
  });
});
