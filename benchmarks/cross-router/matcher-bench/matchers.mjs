// matcher-bench — isolated-matcher registry for the cross-router "wide table match"
// scenario (matcher WIDTH scaling), measured in pure Node with no browser/render.
//
// Why this exists: the Playwright wide-config scenario measures ΔTaskDuration of one
// full nav (click → framework render → settle). At sub-millisecond magnitudes the match
// is a thin rider on a ~1 ms render/settle floor that wobbles with background load, so
// the charted curve shows load-noise "waves" instead of the matcher's true complexity —
// and even inverts the story (tanstack looks like the slow wavy line, but its matcher is
// O(1)). This harness isolates each router's PURE matcher and loops it, so the curve is
// 100% matching: real-router + tanstack read as flat O(1), the scanners as clean O(N).
//
// Contract (apples-to-apples): "URL pathname -> matched route(s)". Each engine's own
// pure match entry point; under each N we build EXACTLY N sibling routes (true WIDTH,
// unlike the app which builds a fixed 1024 table and navigates to position N). Target =
// the LAST route (worst case for an order-preserving scan).
//
// Resolution note: framework-coupled packages (@solidjs/router, sv-router) are
// client-only at their INDEX but expose a pure matcher in an internal file — imported
// directly from the pnpm store (hash-free glob). Standalone packages resolve normally.
//
// Holdouts (see HOLDOUTS): @angular/router (needs JIT/platform headless) and
// @mateothegreat/svelte5-router (matcher is a Svelte-runes class method). Both are O(N)
// — angular proven in the browser card, mateo by source (iterate routes + route.test()).
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import fs from "fs";
import path from "path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CROSS_ROOT = path.resolve(HERE, ".."); // benchmarks/cross-router
const PNPM = path.resolve(HERE, "../../../node_modules/.pnpm"); // repo-root store
const rootReq = createRequire(CROSS_ROOT + "/");
const impAbs = (p) => import(pathToFileURL(p).href);
const impPkg = (spec) => impAbs(rootReq.resolve(spec));

// Hash-free locator: pnpm store dirs are "<pkg-flat>@<version>_<peerhash>"; glob by the
// name prefix and take the first variant that actually contains the target file (source
// is identical across peer-hash variants of the same version).
function storeFile(pkg, sub) {
  const flat = pkg.replace("/", "+");
  const dirs = fs.readdirSync(PNPM).filter((d) => d.startsWith(flat + "@"));
  for (const d of dirs) {
    const f = path.join(PNPM, d, "node_modules", pkg, sub);
    if (fs.existsSync(f)) return f;
  }
  throw new Error(`matcher-bench: cannot locate ${pkg}/${sub} under ${PNPM}`);
}

// wide-config deck shows powers of 4 [4,16,64,256] (linearity proven → few points suffice),
// so the isolated runner measures exactly those — no unused points. (Full-sweep scaling to
// 1024, e.g. react-router 185× / @angular 219×, lives in git history + the standalone probe.)
export const N_SWEEP = [4, 16, 64, 256];
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
export const URL_OF = (n) => `/catalog/item-${n}`; // worst-case target = the last route

// deep-config isolation — matcher DEPTH scaling. Mirrors apps/*/_shared/deep-spec.ts:
// a SINGLE nested chain /deep/l1/.../l90 (DEEP_DEPTH) with one child per level, matched
// at each target depth. The browser deep-config card times matcher + nested-layout RENDER
// (ms); isolated here the pure matcher reads in µs — revealing whether react-router's
// #15249 parabola is a real matcher artifact or was render-dominated. Same build(d) =>
// zero-arg match-closure contract as the wide loaders, so run.mjs sweeps both identically.
export const DEPTH_SWEEP = [3, 30, 60, 90]; // = deep-spec DEEP_TARGETS (the deck's deep points)
const DEEP_DEPTH = Math.max(...DEPTH_SWEEP); // = deep-spec DEEP_DEPTH, DERIVED from the sweep (audit 07-18 K19)
const deepPath = (d) => {
  let p = "/deep";
  for (let i = 1; i <= d; i++) p += `/l${i}`;
  return p;
};

// Each loader returns { build(n) => matchFn, check(result) => bool }. build() constructs
// exactly-N routes and returns a zero-arg closure running one pure match of the target.
const LOADERS = {
  "real-router": async () => {
    const core = await impPkg("@real-router/core");
    const { getPluginApi } = await impPkg("@real-router/core/api");
    return {
      build(n) {
        const routes = [
          { name: "home", path: "/" },
          ...range(n).map((i) => ({ name: `item${i}`, path: URL_OF(i) })),
        ];
        const api = getPluginApi(
          core.createRouter(routes, { defaultRoute: "home", allowNotFound: true }),
        );
        const url = URL_OF(n);
        return () => api.matchPath(url);
      },
      buildDeep(d) {
        const mk = (k) => ({
          name: `l${k}`,
          path: `/l${k}`,
          children: k < DEEP_DEPTH ? [mk(k + 1)] : [],
        });
        const routes = [
          { name: "home", path: "/" },
          { name: "deep", path: "/deep", children: [mk(1)] },
        ];
        const api = getPluginApi(
          core.createRouter(routes, { defaultRoute: "home", allowNotFound: true }),
        );
        return () => api.matchPath(deepPath(d));
      },
      check: (r) => r != null,
    };
  },
  // Data-mode parity (audit 07-18 K6): the bench app is a `createBrowserRouter` DATA
  // router — it builds its ranked branches ONCE in the constructor and matches every
  // navigation with them precomputed. The public `matchRoutes(routes, url)` instead
  // re-runs flatten+rank on EVERY call — timing it charged react-router a per-call
  // construct phase no browser navigation actually pays (75–98 % of the old figures;
  // the deep "~2000×" read ~40× amortized). So the timed closure matches the way the
  // bench app's router does: branches prebuilt via the same internal the router uses
  // (`flattenAndRankRoutes` + `matchRoutesImpl` live in `lib/router/utils.js` next to
  // the package index — no public prebuild API exists; recipe validated by the audit's
  // A/B probe). The construct stays in build() — excluded from timing like every other
  // engine's router construction.
  "react-router": async () => {
    const idx = rootReq.resolve("react-router");
    const { matchRoutes } = await impAbs(idx);
    const { flattenAndRankRoutes, matchRoutesImpl } = await impAbs(
      path.join(path.dirname(idx), "lib/router/utils.js"),
    );
    return {
      build(n) {
        const routes = [
          {
            path: "/",
            children: [
              { index: true },
              ...range(n).map((i) => ({ path: `catalog/item-${i}` })),
            ],
          },
        ];
        const branches = flattenAndRankRoutes(routes);
        const url = URL_OF(n);
        return () => matchRoutesImpl(routes, url, "/", false, branches);
      },
      buildDeep(d) {
        const mk = (k) => {
          const children = [{ index: true }];
          if (k < DEEP_DEPTH) children.push(mk(k + 1));
          return { path: `l${k}`, children };
        };
        const routes = [
          { path: "/", children: [{ index: true }, { path: "deep", children: [mk(1)] }] },
        ];
        const branches = flattenAndRankRoutes(routes);
        return () => matchRoutesImpl(routes, deepPath(d), "/", false, branches);
      },
      // Kept importable for parity probes: the public per-call entry this extraction
      // deliberately does NOT time (it re-flattens per call).
      matchRoutesPublic: matchRoutes,
      check: (r) => Array.isArray(r) && r.length > 0,
    };
  },
  // tanstack matcher lives in @tanstack/router-core, shared byte-for-byte across the
  // react/vue/solid framework packages; @tanstack/react-router is the headless-clean one.
  tanstack: async () => {
    const T = await impPkg("@tanstack/react-router");
    return {
      build(n) {
        const root = T.createRootRoute({});
        const kids = range(n).map((i) =>
          T.createRoute({ getParentRoute: () => root, path: URL_OF(i) }),
        );
        const router = T.createRouter({
          routeTree: root.addChildren([...kids]),
          history: T.createMemoryHistory({ initialEntries: ["/"] }),
        });
        const p = URL_OF(n);
        const loc = { pathname: p, search: {}, hash: "", href: p, searchStr: "" };
        return () => router.matchRoutes(loc);
      },
      buildDeep(d) {
        const root = T.createRootRoute({});
        const deep = T.createRoute({ getParentRoute: () => root, path: "deep" });
        const levels = [];
        let parent = deep;
        for (let k = 1; k <= DEEP_DEPTH; k++) {
          // Capture parent per-iteration: `() => parent` over the mutated `let` late-binds
          // EVERY level to levels[89] → the tree never builds, matchRoutes fuzzy-matches to
          // /deep (2 matches) at any depth → a false "O(1) flat ~1 µs". Each level must close
          // over ITS OWN parent (const).
          const parentRoute = parent;
          const lvl = T.createRoute({ getParentRoute: () => parentRoute, path: `l${k}` });
          levels.push(lvl);
          parent = lvl;
        }
        let tree = levels[DEEP_DEPTH - 1];
        for (let k = DEEP_DEPTH - 2; k >= 0; k--) tree = levels[k].addChildren([tree]);
        const router = T.createRouter({
          routeTree: root.addChildren([deep.addChildren([tree])]),
          history: T.createMemoryHistory({ initialEntries: ["/"] }),
        });
        const p = deepPath(d);
        const loc = { pathname: p, search: {}, hash: "", href: p, searchStr: "" };
        return () => router.matchRoutes(loc);
      },
      check: (r) => Array.isArray(r) && r.length > 0,
    };
  },
  "vue-router": async () => {
    const V = await impPkg("vue-router");
    return {
      build(n) {
        const routes = [
          { path: "/", component: {} },
          ...range(n).map((i) => ({ path: URL_OF(i), component: {} })),
        ];
        const router = V.createRouter({ history: V.createMemoryHistory(), routes });
        const url = URL_OF(n);
        return () => router.resolve(url);
      },
      buildDeep(d) {
        const mk = (k) => ({
          path: `l${k}`,
          component: {},
          children: k < DEEP_DEPTH ? [mk(k + 1)] : [],
        });
        const routes = [
          { path: "/", component: {} },
          { path: "/deep", component: {}, children: [mk(1)] },
        ];
        const router = V.createRouter({ history: V.createMemoryHistory(), routes });
        return () => router.resolve(deepPath(d));
      },
      check: (r) => r && (r.matched?.length > 0 || r.name != null),
    };
  },
  // @solidjs/router index is client-only; the matcher (createBranches/getRouteMatches)
  // lives in dist/routing.js and is pure.
  "solid-router": async () => {
    const S = await impAbs(storeFile("@solidjs/router", "dist/routing.js"));
    return {
      build(n) {
        const routes = [{ path: "/" }, ...range(n).map((i) => ({ path: URL_OF(i) }))];
        const branches = S.createBranches(routes);
        const url = URL_OF(n);
        return () => S.getRouteMatches(branches, url);
      },
      buildDeep(d) {
        const mk = (k) => {
          const children = [{ path: "/" }];
          if (k < DEEP_DEPTH) children.push(mk(k + 1));
          return { path: `l${k}`, children };
        };
        const routes = [{ path: "/" }, { path: "/deep", children: [mk(1)] }];
        const branches = S.createBranches(routes);
        return () => S.getRouteMatches(branches, deepPath(d));
      },
      check: (r) => Array.isArray(r) && r.length > 0,
    };
  },
  // sv-router ships source; matchRoute(pathname, routes) is pure (routes = flat object).
  "sv-router": async () => {
    const M = await impAbs(storeFile("sv-router", "src/helpers/match-route.js"));
    return {
      build(n) {
        // Mark each route's component fn with its path. sv-router's matchRoute returns the
        // matched route's component fn as `.match` — otherwise anonymous and structurally
        // indistinguishable, so the wide correctness gate can't tell a target-hit from a
        // fuzzy match. The marker lets the gate assert `.match.__path === target` (audit Q4).
        const mark = (p) => Object.assign(() => {}, { __path: p });
        const routes = {
          "/": mark("/"),
          ...Object.fromEntries(range(n).map((i) => [URL_OF(i), mark(URL_OF(i))])),
        };
        const url = URL_OF(n);
        return () => M.matchRoute(url, routes);
      },
      buildDeep(d) {
        const mk = (k) => {
          const node = { layout: () => {}, "/": () => {} };
          if (k < DEEP_DEPTH) node[`/l${k + 1}`] = mk(k + 1);
          return node;
        };
        const routes = { "/": () => {}, "/deep": { "/l1": mk(1) } };
        return () => M.matchRoute(deepPath(d), routes);
      },
      check: (r) => r && r.match !== undefined && !!r.match,
    };
  },
  // @angular/router's index needs the JIT compiler for its decorators, so load
  // @angular/compiler first (what platform-browser-dynamic does), from the angular app
  // dir where @angular/* resolve. recognize() is not public; its core is: parse the URL,
  // then walk the config calling the public defaultUrlMatcher until a route consumes ALL
  // segments (the recognizer rejects partial/leftover matches). Faithful O(N); the
  // absolute is a lower bound on the full recognizer (which adds per-route snapshot/guard
  // work on top of the path match).
  "angular-router": async () => {
    const ngReq = createRequire(
      path.join(CROSS_ROOT, "apps/angular/angular-router/wide") + "/",
    );
    const ngImp = (p) => import(pathToFileURL(ngReq.resolve(p)).href);
    await ngImp("@angular/compiler"); // side-effect: install JIT
    const R = await ngImp("@angular/router");
    const PRIMARY = R.PRIMARY_OUTLET ?? "primary";
    const ser = new R.DefaultUrlSerializer();
    const { defaultUrlMatcher } = R;
    return {
      build(n) {
        const routes = [
          { path: "" },
          ...range(n).map((i) => ({ path: `catalog/item-${i}` })),
        ];
        const tree = ser.parse(URL_OF(n));
        const group = tree.root.children[PRIMARY] ?? tree.root;
        const segs = group.segments;
        return () => {
          for (const route of routes) {
            const m = defaultUrlMatcher(segs, group, route);
            if (m && m.consumed.length === segs.length) return m;
          }
          return null;
        };
      },
      check: (r) => r != null,
    };
  },
};

// real-router + tanstack are framework-agnostic matchers → measured in every cohort as
// the O(1) anchors (also a cross-cohort consistency check). Competitors are per-cohort.
export const COHORTS = {
  react: ["real-router", "react-router", "tanstack"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router"],
  angular: ["real-router", "angular-router"],
};

// Competitors whose matcher can't be isolated headless — surfaced in output so the deck
// keeps their O(N) verdict from the browser card instead of pretending they were measured.
export const HOLDOUTS = {
  svelte: [
    {
      id: "mateo-router",
      class: "O(N)",
      reason:
        "matcher is a Svelte-runes RouterInstance method; O(N) by source (iterate routes + route.test(path))",
    },
  ],
};

// deep-config isolation — react cohort first (the #15249 headline). real-router + tanstack
// are the cross-cohort anchor matchers (measured in every deep cohort as they are for wide);
// per-cohort competitors (vue-router, solid-router, sv-router, angular-router) are added as
// each nested matcher is verified. Engines absent here keep their browser deep-config verdict.
export const DEEP_COHORTS = {
  react: ["real-router", "react-router", "tanstack"],
  vue: ["real-router", "vue-router", "tanstack"],
  solid: ["real-router", "solid-router", "tanstack"],
  svelte: ["real-router", "sv-router"],
  angular: ["real-router"],
};
// Deep holdouts — matchers whose nested match can't be faithfully isolated headless.
// mateo: Svelte-runes RouterInstance method (same as its wide holdout). angular-router:
// the recognizer's recursive nested descent (empty-path routes, per-level segment
// consumption + guard/snapshot work) can't be replicated the way the flat wide scan was —
// its deep verdict stays the browser card's O(depth) (~1.5→6.8 ms @90).
export const DEEP_HOLDOUTS = {
  svelte: [
    {
      id: "mateo-router",
      class: "O(N·depth)",
      reason: "matcher is a Svelte-runes RouterInstance method; not isolatable (as for wide)",
    },
  ],
  angular: [
    {
      id: "angular-router",
      class: "O(depth)",
      reason:
        "recognizer's recursive nested descent isn't faithfully isolatable; O(depth) by the browser card",
    },
  ],
};

export async function loadEngine(id) {
  const loader = LOADERS[id];
  if (!loader) throw new Error(`matcher-bench: unknown engine "${id}"`);
  return loader();
}
