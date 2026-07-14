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

export const N_SWEEP = [4, 8, 16, 32, 64, 128, 256, 512, 1024];
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const URL_OF = (n) => `/catalog/item-${n}`; // worst-case target = the last route

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
      check: (r) => r != null,
    };
  },
  "react-router": async () => {
    const { matchRoutes } = await impPkg("react-router");
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
        const url = URL_OF(n);
        return () => matchRoutes(routes, url);
      },
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
      check: (r) => Array.isArray(r) && r.length > 0,
    };
  },
  // sv-router ships source; matchRoute(pathname, routes) is pure (routes = flat object).
  "sv-router": async () => {
    const M = await impAbs(storeFile("sv-router", "src/helpers/match-route.js"));
    return {
      build(n) {
        const routes = {
          "/": () => {},
          ...Object.fromEntries(range(n).map((i) => [URL_OF(i), () => {}])),
        };
        const url = URL_OF(n);
        return () => M.matchRoute(url, routes);
      },
      check: (r) => r && r.match !== undefined && !!r.match,
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
  angular: ["real-router"],
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
  angular: [
    {
      id: "angular-router",
      class: "O(N)",
      reason:
        "needs Angular JIT/platform to run headless; O(N) already clean in the browser card (0.56→2.96 ms, rme ~1%)",
    },
  ],
};

export async function loadEngine(id) {
  const loader = LOADERS[id];
  if (!loader) throw new Error(`matcher-bench: unknown engine "${id}"`);
  return loader();
}
