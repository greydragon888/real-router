// probe-02: the flat-dotted-name seam of add() — depth probe for probe-01/Q1-Q2.
//
// Two dot-semantics disagree inside core:
//   matcher namespace (assertAddable, routesStore.ts:532/538) — a dotted name is
//     whatever route-tree registered (single node OR nested);
//   definitions-walk (insertAddedDefinitions routesStore.ts:350-376,
//     removeFromDefinitions helpers.ts:145) — a dot ALWAYS means nesting.
//
// Questions:
//   A. constructor/add of a FLAT "a.c" while nested "a" EXISTS — does route-tree
//      nest it under "a" (router5-style) or keep a standalone dotted node?
//      What are buildPath / matchPath / transition-segments semantics?
//   B. remove("a") afterwards — is "a.c" removed with the parent (contract:
//      "Removes a route and all its children") or does it survive as a zombie?
//   C. probe-01/Q2 aftermath: after the silent drop of add(kid, {parent}), does
//      TREE_CHANGED still emit added:[kid] (an event for a mutation that did not
//      happen)? Were the kid's guards compiled/registered (phantom guard)?
//
// Structural probe — battery-safe.
// NB: ALL imports must be static. A dynamic `await import("@real-router/core/api")`
// under the plain (dist) resolution loads a SECOND module instance (dual-package
// hazard: CJS vs ESM condition split) whose `internals` WeakMap does not know this
// router — getLifecycleApi then throws "Invalid router instance". Probe artifact,
// caught on the 2026-07-03 run; not a router defect.
import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

const line = (q: string, verdict: string): void => {
  console.log(`${q}: ${verdict}`);
};

void (async () => {
  // --- A0: the VERBATIM wiki addRoute.md batch example ("preferred over loop") ---
  // wiki lines 37-42: add([{users,/users},{users.view,/:id},{users.edit,/:id/edit}])
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);
    const p = getPluginApi(r);

    try {
      api.add([
        { name: "users", path: "/users" },
        { name: "users.view", path: "/:id" },
        { name: "users.edit", path: "/:id/edit" },
      ]);
      line(
        "A0 wiki batch example",
        `NO THROW; buildPath('users.view',{id:'1'})=${(() => {
          try {
            return r.buildPath("users.view", { id: "1" });
          } catch (e) {
            return `THROW ${(e as Error).message}`;
          }
        })()} (wiki intent: /users/1) matchPath('/users/1')=${String(p.matchPath("/users/1")?.name)} matchPath('/1')=${String(p.matchPath("/1")?.name)}`,
      );
      // A0b: did the EXPLICIT sibling "users" keep its own URL?
      line(
        "A0b explicit 'users' after the batch",
        `buildPath('users')=${(() => {
          try {
            return r.buildPath("users");
          } catch (e) {
            return `THROW ${(e as Error).message}`;
          }
        })()} matchPath('/users')=${String(p.matchPath("/users")?.name)} get('users')=${JSON.stringify(api.get("users"))}`,
      );
    } catch (e) {
      line("A0 wiki batch example", `THROW: ${(e as Error).message}`);
    }
  }

  // --- A1: constructor with nested "a" + flat "a.c" in ONE array ---
  {
    try {
      const r = createRouter(
        [
          { name: "home", path: "/" },
          { name: "a", path: "/a", children: [{ name: "b", path: "/b" }] },
          { name: "a.c", path: "/c" },
        ],
        { allowNotFound: false },
      );
      const p = getPluginApi(r);

      line(
        "A1 createRouter([nested a, flat 'a.c'])",
        `NO THROW; buildPath('a.c')=${(() => {
          try {
            return r.buildPath("a.c");
          } catch (e) {
            return `THROW ${(e as Error).message}`;
          }
        })()} matchPath('/a/c')=${String(p.matchPath("/a/c")?.name)} matchPath('/c')=${String(p.matchPath("/c")?.name)}`,
      );
    } catch (e) {
      line("A1 createRouter([nested a, flat 'a.c'])", `THROW: ${(e as Error).message}`);
    }
  }

  // --- A2: add() of flat "a.c" while nested "a" exists ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "a", path: "/a", children: [{ name: "b", path: "/b" }] },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);
    const p = getPluginApi(r);

    try {
      api.add({ name: "a.c", path: "/c" });
      line(
        "A2 add({name:'a.c'}) with nested 'a' present",
        `NO THROW; has('a.c')=${api.has("a.c")} buildPath('a.c')=${(() => {
          try {
            return r.buildPath("a.c");
          } catch (e) {
            return `THROW ${(e as Error).message}`;
          }
        })()} matchPath('/a/c')=${String(p.matchPath("/a/c")?.name)} matchPath('/c')=${String(p.matchPath("/c")?.name)}`,
      );

      // A2b: does navigating to the flat "a.c" run a guard mounted on REAL "a"?
      let aGuardRan = false;

      // external guard on the nested "a"
      getLifecycleApi(r).addActivateGuard("a", () => () => {
        aGuardRan = true;
        return true;
      });

      await r.start("/");
      await r.navigate("a.c");
      line(
        "A2b navigate('a.c') transition semantics",
        `landed='${String(r.getState()?.name)}' state.path='${String(r.getState()?.path)}' guardOnRealA ran=${String(aGuardRan)}`,
      );

      // --- B: remove("a") — does flat "a.c" survive as a zombie? ---
      await r.navigate("home"); // navigate away so remove("a") is not blocked
      api.remove("a");
      line(
        "B remove('a') after flat 'a.c' add",
        `has('a')=${api.has("a")} has('a.b')=${api.has("a.b")} has('a.c')=${api.has("a.c")} ` +
          `matchPath('/c')=${String(p.matchPath("/c")?.name)} ` +
          `<-- zombie if has('a.c')=true while contract says children removed`,
      );
    } catch (e) {
      line("A2 add({name:'a.c'})", `THROW: ${(e as Error).message}`);
    }
  }

  // --- C: silent-drop aftermath — lying TREE_CHANGED + phantom guard compile ---
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);
    const events: string[] = [];

    api.add({ name: "flat.leaf", path: "/flat-leaf" });

    api.subscribeChanges((e) => {
      if (e.op === "add") {
        events.push(`add:[${e.added.map((x) => x.name).join(",")}] parent=${String(e.parent)}`);
      }
    });

    let factoryCompiled = 0;

    try {
      api.add(
        {
          name: "kid",
          path: "/kid",
          canActivate: () => {
            factoryCompiled++;
            return () => true;
          },
        },
        { parent: "flat.leaf" },
      );
    } catch (e) {
      line("C add(kid,{parent:'flat.leaf'})", `THREW: ${(e as Error).message}`);
    }

    line(
      "C silent-drop aftermath",
      `has('flat.leaf.kid')=${api.has("flat.leaf.kid")} TREE_CHANGED=${JSON.stringify(events)} ` +
        `guardFactoryCompiled=${factoryCompiled}x ` +
        `<-- event emitted + factory ran for a route that was never added?`,
    );
  }

  // --- D: has() vs get() split for a flat dotted node ---
  // getRoute → matcher.getSegmentsByName walks children by dot-SEGMENTS
  // (route-tree query.ts:41), while has() answers from the flat name index.
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);

    api.add({ name: "flat.leaf", path: "/flat-leaf" });
    line(
      "D has() vs get() for flat 'flat.leaf'",
      `has=${api.has("flat.leaf")} get=${JSON.stringify(api.get("flat.leaf")) ?? "undefined"} ` +
        `<-- split-brain if has=true and get=undefined`,
    );
    // D2: the auto-created intermediate node "flat" — phantom via get()?
    line(
      "D2 phantom intermediate 'flat'",
      `has('flat')=${api.has("flat")} get('flat')=${JSON.stringify(api.get("flat")) ?? "undefined"} ` +
        `<-- fabricated route if has=false but get returns a node`,
    );
  }

  console.log("probe-02 done");
})();
