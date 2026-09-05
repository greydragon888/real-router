import { createHash } from "node:crypto";
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The census ledger for #2092 — which files have had every `⚠`/`⚑` claim READ,
 * and a tripwire that takes a file back off the list when its claims change.
 *
 * ⚑ **The census is COMPLETE, and this is what keeps it complete.** Every file
 * in the scan set carrying a `⚠`/`⚑` has been read once, for the five shapes
 * #2092 names. The ledger is now a tripwire rather than a to-do list: a file
 * whose claims change drops off it and has to be read again, which is exactly
 * the event that reintroduces the class.
 *
 * ⚠ **A NEW file with claims reds the remainder cell**, and that is deliberate.
 * The alternative — a count with slack in it — would let the corpus grow
 * unread, which is how it got here.
 *
 * ⚠ **The hash covers the CLAIM LINES, not the file.** A file whose code
 * changes but whose claims do not stays verified — re-reading prose that did
 * not move buys nothing. A file whose claims change drops out and must be read
 * again, which is exactly the event that reintroduces the class.
 *
 * ⚠ **Being on this list is not a promise the claims are TRUE.** Eight audit
 * rounds established that sampling for truth converges on the wrong answer —
 * 36 of 36 claims held while 48 sites in the same files had stopped describing
 * the code. What the list records is that someone read the file for the five
 * shapes #2092 names: tense, pointers, numbers, absolutes, falsifiability.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/** The scan set #2092 states, and the same reach the historiography table takes. */
const scanned = (): string[] =>
  [
    ...globSync("packages/*/src/**/*.{ts,tsx,svelte}", { cwd: REPO_ROOT }),
    ...globSync("shared/**/*.ts", { cwd: REPO_ROOT }),
  ]
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !/node_modules|dist/.test(file))
    .toSorted((a, b) => a.localeCompare(b));

/** The opening of the intrinsic-capture caveat — the one claim allowed to travel. */
const CAVEAT_OPENING = " * \u26A0 Capture narrows the window";

/** Where that caveat ends. Its absence is a drift the cell below must SEE. */
const CAVEAT_CLOSING = "(#1798";

const claimLines = (file: string): string[] =>
  readFileSync(path.join(REPO_ROOT, file), "utf8")
    .split("\n")
    .filter((line) => /[⚠⚑]/.test(line));

/**
 * A comment line carrying Cyrillic PROSE, which is the defect — as opposed to a
 * Cyrillic PATH example, which is the data a non-ASCII segment test is about.
 */
const isCyrillicProse = (line: string): boolean =>
  /^\s*(\*|\/\/|\/\*)/.test(line) &&
  /[а-яА-ЯёЁ]/.test(line) &&
  !line.includes("/меню");

const claimHash = (file: string): string =>
  createHash("sha1")
    .update(claimLines(file).join("\n"))
    .digest("hex")
    .slice(0, 12);

/**
 * Files read in full, against the claim-hash they carried when read.
 *
 * Add an entry only after reading EVERY claim in the file. Refresh one only
 * after re-reading the claims that changed — updating a hash to silence this
 * table is the one move that makes the ledger a lie.
 */
const VERIFIED: Readonly<Record<string, string>> = {
  "packages/angular/src/dom-utils/link-utils.ts": "08c43b9a8302",
  "packages/angular/src/dom-utils/scroll-restore.ts": "f6b12b6a66cf",
  "packages/core/src/Router.ts": "1a2e330d3687",
  "packages/core/src/RouterError.ts": "8dbdde0b5f95",
  "packages/core/src/api/cloneRouter.ts": "48bcc7d9a471",
  "packages/core/src/api/getDependenciesApi.ts": "c3bdf79992c8",
  "packages/core/src/api/getPluginApi.ts": "0f154c776ace",
  "packages/core/src/api/getRoutesApi.ts": "04367f297365",
  "packages/core/src/api/helpers.ts": "e5740d44e0d7",
  "packages/core/src/channels/defaults.ts": "19e6fe9a6a5b",
  "packages/core/src/channels/guard.ts": "0873315eab73",
  "packages/core/src/channels/modeGate.ts": "f985e0871af2",
  "packages/core/src/constants.ts": "7f51306c9d17",
  "packages/core/src/engine/createMatcher.ts": "5cd6be664e4c",
  "packages/core/src/engine/path-matcher/SegmentMatcher.ts": "3bc1ba3c12e4",
  "packages/core/src/engine/path-matcher/pathUtils.ts": "514ad0b48668",
  "packages/core/src/engine/path-matcher/registration/buildParts.ts":
    "7018d27b5137",
  "packages/core/src/engine/path-matcher/registration/errors.ts":
    "4da2a77d5572",
  "packages/core/src/engine/path-matcher/registration/index.ts": "2ef6984773a3",
  "packages/core/src/engine/path-matcher/registration/trie.ts": "e4ac22c44c2d",
  "packages/core/src/engine/search-params/encode.ts": "c20b170c63d2",
  "packages/core/src/engine/search-params/searchParams.ts": "732ad0a371f7",
  "packages/core/src/engine/search-params/strategies/array.ts": "84fbf205bb06",
  "packages/core/src/engine/search-params/strategies/index.ts": "3cfaa4b7a05b",
  "packages/core/src/engine/validation/route-batch.ts": "5bae3ec4acf7",
  "packages/core/src/engine/validation/route-name.ts": "46f907b832ec",
  "packages/core/src/engine/validation/routes.ts": "918d3af077a5",
  "packages/core/src/guards.ts": "fc0083c7c18d",
  "packages/core/src/helpers.ts": "737baf98afa3",
  "packages/core/src/internals.ts": "3a873403b34f",
  "packages/core/src/limits.ts": "4c5aa25ea814",
  "packages/core/src/namespaces/DependenciesNamespace/dependenciesStore.ts":
    "765916c5708b",
  "packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts":
    "deefa0a86f10",
  "packages/core/src/namespaces/EventBusNamespace/types.ts": "3ac70c2a73ab",
  "packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts":
    "49a9e6fcf703",
  "packages/core/src/namespaces/NavigationNamespace/transition/completeTransition.ts":
    "b3f8cc63e17b",
  "packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts":
    "9a88b7c5d397",
  "packages/core/src/namespaces/NavigationNamespace/transition/executeNavigation.ts":
    "011484c17c25",
  "packages/core/src/namespaces/NavigationNamespace/transition/guardPhase.ts":
    "08066ec9c908",
  "packages/core/src/namespaces/NavigationNamespace/transition/navigateToNotFound.ts":
    "9962367e693c",
  "packages/core/src/namespaces/NavigationNamespace/types.ts": "914da9d7ed01",
  "packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts":
    "b0e6e817455c",
  "packages/core/src/namespaces/PluginsNamespace/constants.ts": "569795942563",
  "packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts":
    "2f2823e08756",
  "packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts":
    "aa933f29d10d",
  "packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts":
    "ed3d218b1b6f",
  "packages/core/src/namespaces/RoutesNamespace/constants.ts": "d2a513530978",
  "packages/core/src/namespaces/RoutesNamespace/forwardChain.ts":
    "f29a6a025f0a",
  "packages/core/src/namespaces/RoutesNamespace/helpers.ts": "cd563c617f4b",
  "packages/core/src/namespaces/RoutesNamespace/routeGuards.ts": "3585e6a0f66b",
  "packages/core/src/namespaces/RoutesNamespace/routesStore.ts": "7e9dfefe2609",
  "packages/core/src/namespaces/RoutesNamespace/types.ts": "be4ecad438e3",
  "packages/core/src/namespaces/StateNamespace/StateNamespace.ts":
    "8004be72a3ea",
  "packages/core/src/pipeline/canonicalize.ts": "044f99e3d022",
  "packages/core/src/pipeline/materialize.ts": "e729a8e6885c",
  "packages/core/src/pipeline/port.ts": "a073ff9e8015",
  "packages/core/src/routerFSM.ts": "da9a89fb5ce4",
  "packages/core/src/transitionPath.ts": "569795942563",
  "packages/core/src/types/api.ts": "02a6fedc9e13",
  "packages/core/src/types/base.ts": "b9dd77d77773",
  "packages/core/src/types/index.ts": "30c778c3a949",
  "packages/core/src/types/route-node-types.ts": "1713e14ec4ea",
  "packages/core/src/types/router.ts": "53ad83c2efe8",
  "packages/core/src/types/tree-changed.ts": "a5bfdf3002df",
  "packages/core/src/utils.ts": "e7c52f98dcd9",
  "packages/core/src/utils/fsm/fsm.ts": "85cddcb988fe",
  "packages/core/src/utils/fsm/types.ts": "ad58eef72966",
  "packages/core/src/utils/ingest.ts": "198a0f535b8f",
  "packages/core/src/utils/logger/RouterLogger.ts": "007ad079eb69",
  "packages/core/src/wiring/wireNamespaces.ts": "06dc27ff18fd",
  "packages/hash-plugin/src/factory.ts": "569795942563",
  "packages/logger-plugin/src/internal/params-diff.ts": "c29a5bbb3e93",
  "packages/navigation-plugin/src/plugin.ts": "46dfb496af11",
  "packages/persistent-params-plugin/src/factory.ts": "1852fae439a2",
  "packages/persistent-params-plugin/src/param-utils.ts": "47a62f1b45ef",
  "packages/persistent-params-plugin/src/plugin.ts": "4745f5251081",
  "packages/persistent-params-plugin/src/validation.ts": "26081e6170f2",
  "packages/preact/src/hooks/useRouteEnter.tsx": "e4a358f9bbd0",
  "packages/preact/src/hooks/useRouteExit.tsx": "1aea680b1c88",
  "packages/react/src/hooks/useRouteEnter.tsx": "e4a358f9bbd0",
  "packages/react/src/hooks/useRouteExit.tsx": "1aea680b1c88",
  "packages/rsc-server-plugin/src/invalidate.ts": "ddf4308df618",
  "packages/search-schema-plugin/src/helpers.ts": "569795942563",
  "packages/search-schema-plugin/src/plugin.ts": "7113c717c98f",
  "packages/solid/src/hooks/useRouteEnter.tsx": "e4a358f9bbd0",
  "packages/solid/src/hooks/useRouteExit.tsx": "1aea680b1c88",
  "packages/sources/src/canonicalJson.ts": "569795942563",
  "packages/sources/src/createActiveRouteSource.ts": "a70fef9ca420",
  "packages/ssr-data-plugin/src/invalidate.ts": "ddf4308df618",
  "packages/ssr-data-plugin/src/server.ts": "569795942563",
  "packages/ssr-utils/src/getStaticPaths.ts": "569795942563",
  "packages/ssr-utils/src/serializeRouterState.ts": "e8c28924268f",
  "packages/svelte/src/components/RouteView.helpers.ts": "569795942563",
  "packages/svelte/src/composables/useRouteExit.svelte.ts": "1aea680b1c88",
  "packages/validation-plugin/src/helpers.ts": "b782d757d066",
  "packages/validation-plugin/src/type-guards/guards/params.ts": "f8677f51e8ea",
  "packages/validation-plugin/src/validators/dependencies.ts": "044e17ad6e46",
  "packages/validation-plugin/src/validators/forwardTo.ts": "27bc214bc2ee",
  "packages/validation-plugin/src/validators/navigation.ts": "f6bc6f61e549",
  "packages/validation-plugin/src/validators/options.ts": "d78ba2f0e939",
  "packages/validation-plugin/src/validators/plugins.ts": "569795942563",
  "packages/validation-plugin/src/validators/retrospective.ts": "b8eb3720fb19",
  "packages/validation-plugin/src/validators/routes.ts": "76f933c09b5f",
  "packages/validation-plugin/src/validators/state.ts": "4dcd3703893c",
  "packages/vue/src/composables/useRouteEnter.ts": "e4a358f9bbd0",
  "packages/vue/src/composables/useRouteExit.ts": "1aea680b1c88",
  "shared/browser-env/plugin-utils.ts": "990713a20c0c",
  "shared/browser-env/popstate-handler.ts": "8c6ad4b64e96",
  "shared/browser-env/popstate-utils.ts": "e831a1b13c09",
  "shared/browser-env/state-guard.ts": "1c50596cee70",
  "shared/browser-env/url-parsing.ts": "9fa5b0e2add6",
  "shared/browser-env/utils.ts": "54c88b102863",
  "shared/browser-env/validation.ts": "24edd475ae6c",
  "shared/dom-utils/link-utils.ts": "08c43b9a8302",
  "shared/dom-utils/scroll-restore.ts": "f6b12b6a66cf",
  "shared/ssr/createLoadersValidator.ts": "84b9feba3e3f",
  "shared/ssr/createSsrLoaderPlugin.ts": "fa730f508389",
  "shared/ssr/defer.ts": "180f74b6e11b",
  "shared/ssr/deferWireFormat.ts": "01070b8aa4a7",
  "shared/ssr/errors.ts": "25de1fbef10e",
};

describe("the #2092 claim census, as a ledger rather than a sweep", () => {
  it("every verified file still carries the claims it was verified against", () => {
    const drifted = Object.entries(VERIFIED)
      .filter(([file, hash]) => claimHash(file) !== hash)
      .map(([file]) => file);

    expect(drifted).toStrictEqual([]);
  });

  it("every verified file still exists in the scan set", () => {
    // A file that moves or is deleted must red rather than quietly leave the
    // ledger describing nothing — the same failure a renamed symbol causes in
    // the pointer class this census checks for.
    const set = new Set(scanned());

    expect(
      Object.keys(VERIFIED).filter((file) => !set.has(file)),
    ).toStrictEqual([]);
  });

  it("reports the remainder, and the remainder is the work", () => {
    const withClaims = scanned().filter((file) => claimLines(file).length > 0);
    const remaining = withClaims.filter((file) => !(file in VERIFIED));

    // ⚑ ZERO, not a threshold. The census is finished, so an unread file is a
    // file someone added claims to without reading it — the one event that
    // restarts the rot this table exists to stop.
    expect(remaining).toStrictEqual([]);

    // Visible in the run's output without failing it.
    console.log(
      `[#2092] read ${String(Object.keys(VERIFIED).length)} of ${String(
        withClaims.length,
      )} files carrying claims; ${String(remaining.length)} remain`,
    );
  });

  it("no source comment carries a Cyrillic homoglyph of a Latin pointer", () => {
    // ⚑ Found by this census, and it is a POINTER defect rather than a
    // language one: `О-7` and `В1.3` were written with Cyrillic `О` and `В`,
    // visually identical to the Latin letters. Measured — `grep "O-7"` returned
    // nothing while `grep "О-7"` returned two, so the reference was invisible
    // to anyone who searched for it in the alphabet it appears to be written in.
    //
    // ⚠ `/меню` beside `/café` is EXEMPT and must stay: those are Unicode PATH
    // examples, the data a non-ASCII segment test is about, not prose.
    const offenders = scanned().flatMap((file) =>
      readFileSync(path.join(REPO_ROOT, file), "utf8")
        .split("\n")
        .map((line, index) => ({ line, at: `${file}:${String(index + 1)}` }))
        .filter((row) => isCyrillicProse(row.line))
        .map((row) => row.at),
    );

    expect(offenders).toStrictEqual([]);
  });

  it("the travelling caveat has ONE spelling, in a bound set of owners", () => {
    // ⚑ Some claims are SUPPOSED to travel. The intrinsic-capture caveat is
    // orientation rather than a measurement, and collapsing it to a
    // cross-package pointer would send a reader of `hash-plugin` into core
    // internals for three lines. What must NOT travel is a hand-copy: measured
    // 2026-09-05, it stood in FOUR spellings (31 / 7 / 2 / 1), which is what a
    // claim looks like when it is pasted rather than owned.
    //
    // ⚠ The discriminator is the MEASUREMENT, not the length. A caveat carries
    // none and may repeat; a claim with a number in it is a promise to
    // re-measure and gets one owner — which is why the duplicate in
    // `RouterError` and the one in `tree-changed` were collapsed and this one
    // was not.
    //
    // ⚠ **The counts live HERE rather than in the prose, because the prose got
    // them wrong.** The first form of this cell said "41 files across 12
    // packages" and bound neither number. The file count was right; the owner
    // count was wrong under either reading — eleven packages, or fourteen
    // counting the three `shared/` layers. An unbound number inside the cell
    // that exists to bind numbers is the very class this file is about.
    const files = scanned().filter((file) =>
      readFileSync(path.join(REPO_ROOT, file), "utf8").includes(CAVEAT_OPENING),
    );

    const spellings = new Set(
      files.map((file) => {
        const text = readFileSync(path.join(REPO_ROOT, file), "utf8");
        const opening = text.indexOf(CAVEAT_OPENING);
        const closing = text.indexOf(CAVEAT_CLOSING, opening);

        return closing === -1
          ? ""
          : text
              .slice(opening, text.indexOf("\n", closing))
              .replaceAll(/\s+/g, " ");
      }),
    );

    // ⚑ **The non-emptiness is the load-bearing half, and it was missing.**
    // Mutating `CAVEAT_CLOSING` to a marker no file carries left this cell GREEN
    // at an unchanged test count: every slice collapsed to "", the set became a
    // set of one EMPTY string, and a length check cannot tell that from
    // agreement. A set of one says nothing until the one is shown to be the
    // caveat.
    expect([...spellings]).toHaveLength(1);
    expect([...spellings][0]).toContain(CAVEAT_OPENING.trim());
    expect([...spellings][0]).toContain(CAVEAT_CLOSING);

    const owners = files.map((file) =>
      file.startsWith("shared/")
        ? file.split("/").slice(0, 2).join("/")
        : file.split("/", 2)[1],
    );

    expect(files).toHaveLength(41);
    expect(
      [...new Set(owners)].toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual([
      "angular",
      "core",
      "hash-plugin",
      "logger-plugin",
      "persistent-params-plugin",
      "search-schema-plugin",
      "shared/browser-env",
      "shared/dom-utils",
      "shared/ssr",
      "sources",
      "ssr-data-plugin",
      "ssr-utils",
      "svelte",
      "validation-plugin",
    ]);
  });

  /**
   * The SECOND corpus (#2111). `.md` files were outside #2092s scan set by
   * declaration, and the remainder measured 2102 claims against the 819 that set
   * holds — `tests/` alone carries more than `src` and `shared/` combined.
   *
   * ⚠ **A separate map, deliberately, rather than a wider `scanned()`.**
   * Widening the first one reds `remaining === []` for every unread file the
   * moment the glob grows, which blocks a corpus that IS complete on one that is
   * not. Two corpora, two ratchets, each finished on its own schedule.
   *
   * ⚠ Same rule as above: an entry means someone READ every claim in the file
   * for the five shapes #2092 names. It does not mean the claims are true.
   */
  const scannedDocuments = (): string[] =>
    [
      ...globSync("packages/*/*.md", { cwd: REPO_ROOT }),
      ...globSync("packages/*/src/**/*.md", { cwd: REPO_ROOT }),
      ...globSync("shared/**/*.md", { cwd: REPO_ROOT }),
      ...globSync("*.md", { cwd: REPO_ROOT }),
    ]
      .map((file) => file.split(path.sep).join("/"))
      .filter(
        (file) => !/node_modules|dist|CHANGELOG\.md|\/\.claude\//.test(file),
      )
      .toSorted((a, b) => a.localeCompare(b));

  const VERIFIED_DOCS: Readonly<Record<string, string>> = {
    "ARCHITECTURE.md": "76fa7ed02feb",
    "CLAUDE.md": "43bd6fc768c2",
    "IMPLEMENTATION_NOTES.md": "dafcf4740a0d",
    "packages/browser-plugin/CLAUDE.md": "0839e74ec038",
    "packages/browser-plugin/INVARIANTS.md": "407e3b75ce2f",
    "packages/core/ARCHITECTURE.md": "9bb517f00278",
    "packages/core/CLAUDE.md": "5627154e7f6d",
    "packages/core/INVARIANTS.md": "07684ed0b99d",
    "packages/core/README.md": "89cd2d602157",
    "packages/core/src/channels/CLAUDE.md": "a1d0fc2360f1",
    "packages/core/src/channels/README.md": "46ed6a9d3b1d",
    "packages/core/src/engine/CLAUDE.md": "b2456029819b",
    "packages/core/src/engine/INVARIANTS.md": "89abc87070e2",
    "packages/core/src/engine/README.md": "46ed6a9d3b1d",
    "packages/core/src/namespaces/NavigationNamespace/CLAUDE.md":
      "89f7c6588196",
    "packages/core/src/namespaces/RoutesNamespace/CLAUDE.md": "a72977114e8f",
    "packages/core/src/pipeline/CLAUDE.md": "6ea00fecca1c",
    "packages/core/src/pipeline/README.md": "46ed6a9d3b1d",
    "packages/core/src/utils/fsm/ARCHITECTURE.md": "c95328f7da8d",
    "packages/core/src/utils/fsm/CLAUDE.md": "14288aaf7ebe",
    "packages/core/src/utils/logger/INVARIANTS.md": "0c22d7a8ba2d",
    "packages/hash-plugin/CLAUDE.md": "0839e74ec038",
    "packages/persistent-params-plugin/CLAUDE.md": "9f76564697cc",
    "packages/rsc-server-plugin/CLAUDE.md": "c049284af4b1",
    "packages/search-schema-plugin/ARCHITECTURE.md": "3a1709bc2092",
    "packages/ssr-data-plugin/CLAUDE.md": "e420e81279b3",
    "packages/ssr-utils/ARCHITECTURE.md": "c892646d6175",
    "packages/ssr-utils/CLAUDE.md": "a9692cc922b9",
    "packages/validation-plugin/CLAUDE.md": "d023af647deb",
  };

  it("every verified DOC still carries the claims that were read", () => {
    const drifted = Object.entries(VERIFIED_DOCS)
      .filter(([file]) => existsSync(path.join(REPO_ROOT, file)))
      .filter(([file, hash]) => claimHash(file) !== hash)
      .map(([file]) => file);

    expect(drifted).toStrictEqual([]);
  });

  it("reports the DOC remainder, and the remainder is the work", () => {
    const remaining = scannedDocuments()
      .filter((file) => claimLines(file).length > 0)
      .filter((file) => !(file in VERIFIED_DOCS));

    expect(remaining).toStrictEqual([]);
  });

  it("CONTROL — the doc corpus is real, and it is not the first one", () => {
    // ⚑ Non-vacuity, both ways. An empty scan would satisfy the remainder cell
    // silently, and a scan that happened to return the FIRST corpus would make
    // this ledger a duplicate wearing a second name.
    const files = Object.keys(VERIFIED_DOCS);

    expect(files.length).toBeGreaterThan(20);
    expect(
      files.reduce((sum, file) => sum + claimLines(file).length, 0),
    ).toBeGreaterThan(150);
    expect(files.every((file) => file.endsWith(".md"))).toBe(true);
    expect(files.some((file) => file in VERIFIED)).toBe(false);
  });

  it("CONTROL — the hash moves when a claim moves, and not otherwise", () => {
    const file = "packages/core/src/limits.ts";
    const claims = claimLines(file);

    expect(claims.length).toBeGreaterThan(0);

    const base = createHash("sha1")
      .update(claims.join("\n"))
      .digest("hex")
      .slice(0, 12);
    const edited = createHash("sha1")
      .update(
        [...claims.slice(1), "  // ⚠ a claim that was not there"].join("\n"),
      )
      .digest("hex")
      .slice(0, 12);

    expect(base).toBe(VERIFIED[file]);
    expect(edited).not.toBe(base);
  });
});
