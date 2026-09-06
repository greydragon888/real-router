// Cost arm for the CANNOT-AFFORD bucket: what would strategy (а) cost at the
// tree handout? Two shapes are measured against today's `getTree()`:
//   - per-CALL snapshot: rebuild every node + a fresh Map per node on each
//     `getTree()` (what a naive copy-at-the-door would pay on every adapter
//     render and every search-schema validation);
//   - per-REBUILD snapshot: the same copy paid once when the tree is rebuilt,
//     then handed out by reference — identity stable across calls, which is
//     what `getRouteUtils`' WeakMap, Solid's `cached.tree === tree` and
//     search-schema's `tree !== #cachedTree` rely on.
// Third arm: a read-only Map facade (own `set`/`delete`/`clear` throwing,
// installed BEFORE freeze) built per rebuild — the shape that keeps identity
// AND closes `Map.prototype.set` without a copy.
import { bench, run, summary, do_not_optimize } from "mitata";
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

type Node = {
  name: string;
  path: string;
  absolute: boolean;
  children: ReadonlyMap<string, Node>;
  paramMeta: unknown;
  parent: Node | null;
  nonAbsoluteChildren: readonly Node[];
  fullName: string;
  paramTypeMap: unknown;
};

const routesOf = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `r${i}`,
    path: `/r${i}/:id?q${i}`,
    children: [
      { name: "a", path: "/a/:aid" },
      { name: "b", path: "/b", children: [{ name: "x", path: "/x" }] },
    ],
  }));

function snapshot(node: Node, parent: Node | null): Node {
  const copy: Node = {
    name: node.name,
    path: node.path,
    absolute: node.absolute,
    children: undefined as unknown as ReadonlyMap<string, Node>,
    paramMeta: node.paramMeta,
    parent,
    nonAbsoluteChildren: undefined as unknown as readonly Node[],
    fullName: node.fullName,
    paramTypeMap: node.paramTypeMap,
  };
  const children = new Map<string, Node>();
  const nonAbs: Node[] = [];
  for (const child of node.children.values()) {
    const c = snapshot(child, copy);
    children.set(c.name, c);
    if (!c.absolute) nonAbs.push(c);
  }
  copy.children = Object.freeze(children);
  copy.nonAbsoluteChildren = Object.freeze(nonAbs);
  return Object.freeze(copy);
}

const refuse = () => {
  throw new TypeError("read-only");
};

function facade(node: Node, parent: Node | null): Node {
  const children = new Map<string, Node>();
  Object.defineProperty(children, "set", { value: refuse });
  Object.defineProperty(children, "delete", { value: refuse });
  Object.defineProperty(children, "clear", { value: refuse });
  const copy: Node = { ...node, parent, children: Object.freeze(children) };
  for (const child of node.children.values()) {
    // own `set` is the refuser; populate through the prototype method
    Map.prototype.set.call(children, child.name, facade(child, copy));
  }
  return Object.freeze(copy);
}

let sink: unknown;

async function main(): Promise<void> {
  // self-check: the facade refuses what the live Map accepts
  const probeRouter = createRouter(routesOf(1) as never, {} as never);
  const live = getPluginApi(probeRouter).getTree() as unknown as Node;
  const guarded = facade(live, null);
  let refused = "no-throw";
  try {
    (guarded.children as Map<string, Node>).set("x", live);
  } catch (error) {
    refused = `throw:${(error as Error).constructor.name}`;
  }
  console.log(
    JSON.stringify({
      facade_children_isFrozen: Object.isFrozen(guarded.children),
      facade_set_refused: refused,
      facade_get_works: guarded.children.get("r0")?.name,
      facade_size: guarded.children.size,
    }),
  );
  probeRouter.dispose();

  for (const n of [10, 50, 200]) {
    const router = createRouter(routesOf(n) as never, {} as never);
    const api = getPluginApi(router);
    const tree = api.getTree() as unknown as Node;
    let nodes = 0;
    const count = (x: Node) => {
      nodes++;
      for (const c of x.children.values()) count(c);
    };
    count(tree);
    summary(() => {
      bench(`getTree() today · ${n} routes (${nodes} nodes)`, () => {
        sink = do_not_optimize(api.getTree());
      });
      bench(`snapshot per CALL · ${n} routes (${nodes} nodes)`, () => {
        sink = do_not_optimize(snapshot(api.getTree() as unknown as Node, null));
      });
      bench(`read-only Map facade per REBUILD · ${n} routes (${nodes} nodes)`, () => {
        sink = do_not_optimize(facade(api.getTree() as unknown as Node, null));
      });
      // the rebuild the per-REBUILD arms would ride on: tree + matcher, today
      let flip = false;
      bench(`rebuild today (setRootPath toggle) · ${n} routes (${nodes} nodes)`, () => {
        flip = !flip;
        api.setRootPath(flip ? "/a" : "/b");
        sink = do_not_optimize(api.getTree());
      });
    });
  }

  await run();
  void sink;
}

void main();
