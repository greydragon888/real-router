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
 * ⚠ **The hash covers the claim PARAGRAPHS, not the file** (#2120). A file whose
 * code changes but whose claims do not stays verified — re-reading prose that
 * did not move buys nothing. A file whose claims change drops out and must be
 * read again, which is exactly the event that reintroduces the class, and
 * "change" reaches every line of the claim rather than the marker line alone.
 *
 * ⚠ **Being on this list is not a promise the claims are TRUE.** Sampling for
 * truth converges on the wrong answer: every claim in a sample can hold while
 * sites in the same files have stopped describing the code. What the list
 * records is that someone read the file for the five shapes #2092 names: tense,
 * pointers, numbers, absolutes, falsifiability.
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
 * Each claim as its WHOLE paragraph — the marker line and everything wrapped
 * under it.
 *
 * ⚑ **The marker line is one line of a claim, and keying on it left the rest
 * unwatched (#2120).** Claims here are wrapped paragraphs, so the issue
 * reference, the numbers, the verbs and the conclusion all sit BELOW the
 * marker: measured over the scan set, 822 lines carried a marker and 3 678 more
 * belonged to those claims, so 18.3 % of the prose was under the tripwire. That
 * is not a hypothetical either — a wrong `(#1971)` shipped through review on a
 * continuation line, and the ledger entry was byte-identical before and after
 * the correction.
 *
 * ⚠ A paragraph ends at the first thing that is not more of it: a blank comment
 * line, the next marker, the end of the comment, or a JSDoc tag. Measured, the
 * tag stop changes no number — it is there because a `@param` under a claim is
 * a different kind of sentence, not because it moved the count.
 */
function claimParagraphs(file: string): string[] {
  const lines = readFileSync(path.join(REPO_ROOT, file), "utf8").split("\n");
  const markdown = file.endsWith(".md");

  return lines.flatMap((line, index) =>
    /[⚠⚑]/.test(line)
      ? [[line, ...wrappedUnder(lines, index, markdown)].join("\n")]
      : [],
  );
}

/** The lines belonging to the marker at `index`, up to the first that is not. */
function wrappedUnder(
  lines: readonly string[],
  index: number,
  markdown: boolean,
): string[] {
  const rest = lines.slice(index + 1);
  const stop = rest.findIndex(
    (line) => /[⚠⚑]/.test(line) || !continues(line, markdown),
  );

  return rest.slice(0, stop === -1 ? rest.length : stop);
}

/** Is this line more of the paragraph above it? */
function continues(line: string, markdown: boolean): boolean {
  const body = line.replace(/^\s*(?:\*|\/\/)/, "").trim();

  return markdown
    ? line.trim() !== ""
    : /^\s*(\*|\/\/)/.test(line) &&
        !line.includes("*/") &&
        body !== "" &&
        !body.startsWith("@");
}

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
    .update(claimParagraphs(file).join("\n"))
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
  "packages/angular/src/dom-utils/link-utils.ts": "71579bbbae52",
  "packages/angular/src/dom-utils/scroll-restore.ts": "f7e27ecb9bb4",
  "packages/core/src/Router.ts": "785266f252b0",
  "packages/core/src/RouterError.ts": "3d3aa983f664",
  "packages/core/src/api/cloneRouter.ts": "6f64204e922c",
  "packages/core/src/api/getDependenciesApi.ts": "f81caf7637bb",
  "packages/core/src/api/getPluginApi.ts": "786ba135a732",
  "packages/core/src/api/getRoutesApi.ts": "dd7e51e5f77c",
  "packages/core/src/api/helpers.ts": "d8df6dae327e",
  "packages/core/src/channels/defaults.ts": "523a94b5e932",
  "packages/core/src/channels/guard.ts": "64f73b258326",
  "packages/core/src/channels/modeGate.ts": "424584a2a527",
  "packages/core/src/constants.ts": "1784db8bf187",
  "packages/core/src/engine/createMatcher.ts": "1d937339b540",
  "packages/core/src/engine/path-matcher/SegmentMatcher.ts": "b1f3b655f22e",
  "packages/core/src/engine/path-matcher/pathUtils.ts": "ac56ab9cdd69",
  "packages/core/src/engine/path-matcher/registration/buildParts.ts":
    "0ed6eaa69f59",
  "packages/core/src/engine/path-matcher/registration/errors.ts":
    "a51744152b57",
  "packages/core/src/engine/path-matcher/registration/index.ts": "952aee0c348c",
  "packages/core/src/engine/path-matcher/registration/trie.ts": "5763231f3d42",
  "packages/core/src/engine/search-params/encode.ts": "3c0ba11e75a6",
  "packages/core/src/engine/search-params/searchParams.ts": "49291d5c7a07",
  "packages/core/src/engine/search-params/strategies/array.ts": "8afc930461f2",
  "packages/core/src/engine/search-params/strategies/index.ts": "add3becfc181",
  "packages/core/src/engine/validation/route-batch.ts": "393383fa8e51",
  "packages/core/src/engine/validation/route-name.ts": "4cb11c300c62",
  "packages/core/src/engine/validation/routes.ts": "7983a598300f",
  "packages/core/src/guards.ts": "80690f9a4eb7",
  "packages/core/src/helpers.ts": "de74d03e28bb",
  "packages/core/src/internals.ts": "e1b42774834a",
  "packages/core/src/limits.ts": "d83d3e732b18",
  "packages/core/src/namespaces/DependenciesNamespace/dependenciesStore.ts":
    "f160d558fcc7",
  "packages/core/src/namespaces/EventBusNamespace/EventBusNamespace.ts":
    "ff2ed045a3ce",
  "packages/core/src/namespaces/EventBusNamespace/types.ts": "25d7fcacd30e",
  "packages/core/src/namespaces/NavigationNamespace/NavigationNamespace.ts":
    "b9c9d56f5fb0",
  "packages/core/src/namespaces/NavigationNamespace/transition/completeTransition.ts":
    "f7a0d5b79bcf",
  "packages/core/src/namespaces/NavigationNamespace/transition/errorHandling.ts":
    "8006b7681b2d",
  "packages/core/src/namespaces/NavigationNamespace/transition/executeNavigation.ts":
    "6a08dcdace94",
  "packages/core/src/namespaces/NavigationNamespace/transition/guardPhase.ts":
    "e7db988f5bd1",
  "packages/core/src/namespaces/NavigationNamespace/transition/navigateToNotFound.ts":
    "321e0c8e26fe",
  "packages/core/src/namespaces/NavigationNamespace/types.ts": "70691fa070cd",
  "packages/core/src/namespaces/OptionsNamespace/OptionsNamespace.ts":
    "e43a4bc75d39",
  "packages/core/src/namespaces/PluginsNamespace/constants.ts": "92989e124c14",
  "packages/core/src/namespaces/RouteLifecycleNamespace/RouteLifecycleNamespace.ts":
    "c1bada628bf4",
  "packages/core/src/namespaces/RouterLifecycleNamespace/RouterLifecycleNamespace.ts":
    "8fb6b49fe768",
  "packages/core/src/namespaces/RoutesNamespace/RoutesNamespace.ts":
    "52e5a0f799cc",
  "packages/core/src/namespaces/RoutesNamespace/constants.ts": "9b9f274fb552",
  "packages/core/src/namespaces/RoutesNamespace/forwardChain.ts":
    "face911cda8c",
  "packages/core/src/namespaces/RoutesNamespace/helpers.ts": "f3b6b212a373",
  "packages/core/src/namespaces/RoutesNamespace/routeGuards.ts": "71000ab0c7bd",
  "packages/core/src/namespaces/RoutesNamespace/routesStore.ts": "a247df3e492f",
  "packages/core/src/namespaces/RoutesNamespace/types.ts": "bab039a74c0a",
  "packages/core/src/namespaces/StateNamespace/StateNamespace.ts":
    "a3e5101f57b4",
  "packages/core/src/pipeline/canonicalize.ts": "43cc13ccd8c1",
  "packages/core/src/pipeline/materialize.ts": "9c5f8fcae37d",
  "packages/core/src/pipeline/port.ts": "f6a0dcb63b5a",
  "packages/core/src/routerFSM.ts": "b95a49cce867",
  "packages/core/src/transitionPath.ts": "92989e124c14",
  "packages/core/src/types/api.ts": "9cdc9294083a",
  "packages/core/src/types/base.ts": "52557ea2ffd9",
  "packages/core/src/types/index.ts": "999f7a9bf2f9",
  "packages/core/src/types/route-node-types.ts": "8b92c962abd2",
  "packages/core/src/types/router.ts": "49eac471666e",
  "packages/core/src/types/tree-changed.ts": "4c5dc6106fb6",
  "packages/core/src/utils.ts": "989d154943de",
  "packages/core/src/utils/fsm/fsm.ts": "1fe3149235f7",
  "packages/core/src/utils/fsm/types.ts": "3c9b962b1890",
  "packages/core/src/utils/ingest.ts": "43826a6ff75b",
  "packages/core/src/utils/logger/RouterLogger.ts": "dce83e1ffe79",
  "packages/core/src/wiring/wireNamespaces.ts": "206b294821e3",
  "packages/hash-plugin/src/factory.ts": "92989e124c14",
  "packages/logger-plugin/src/internal/params-diff.ts": "91fa6d6b1d83",
  "packages/navigation-plugin/src/plugin.ts": "3c22f7dc1e06",
  "packages/persistent-params-plugin/src/factory.ts": "3faa56c41aac",
  "packages/persistent-params-plugin/src/param-utils.ts": "94fd13f4c45d",
  "packages/persistent-params-plugin/src/plugin.ts": "3bc1ca991b28",
  "packages/persistent-params-plugin/src/validation.ts": "1e160545fded",
  "packages/preact/src/hooks/useRouteEnter.tsx": "36afe906c067",
  "packages/preact/src/hooks/useRouteExit.tsx": "117882e62801",
  "packages/react/src/hooks/useRouteEnter.tsx": "36afe906c067",
  "packages/react/src/hooks/useRouteExit.tsx": "117882e62801",
  "packages/rsc-server-plugin/src/invalidate.ts": "79967b8c17dd",
  "packages/rx/src/RxObservable.ts": "9896486f9670",
  "packages/search-schema-plugin/src/helpers.ts": "92989e124c14",
  "packages/search-schema-plugin/src/plugin.ts": "3a238c235a4a",
  "packages/solid/src/hooks/useRouteEnter.tsx": "5e4cd13e6b7b",
  "packages/solid/src/hooks/useRouteExit.tsx": "117882e62801",
  "packages/sources/src/canonicalJson.ts": "92989e124c14",
  "packages/sources/src/createActiveRouteSource.ts": "8f4d5863b649",
  "packages/sources/src/createActiveSource.ts": "c5f4d754107c",
  "packages/ssr-data-plugin/src/invalidate.ts": "7e4e71b79eea",
  "packages/ssr-data-plugin/src/server.ts": "92989e124c14",
  "packages/ssr-utils/src/createRequestScope.ts": "02afdc856d91",
  "packages/ssr-utils/src/getStaticPaths.ts": "92989e124c14",
  "packages/ssr-utils/src/serializeRouterState.ts": "bda54f98bd6a",
  "packages/svelte/src/components/RouteView.helpers.ts": "92989e124c14",
  "packages/svelte/src/composables/useRouteExit.svelte.ts": "117882e62801",
  "packages/validation-plugin/src/helpers.ts": "56b22e4f8dd5",
  "packages/validation-plugin/src/type-guards/guards/params.ts": "1d351d24f26b",
  "packages/validation-plugin/src/validators/dependencies.ts": "e1e8ec158db5",
  "packages/validation-plugin/src/validators/forwardTo.ts": "3e5919711fb1",
  "packages/validation-plugin/src/validators/navigation.ts": "12f157013f8f",
  "packages/validation-plugin/src/validators/options.ts": "1491484e2361",
  "packages/validation-plugin/src/validators/plugins.ts": "92989e124c14",
  "packages/validation-plugin/src/validators/retrospective.ts": "3ac58e3c921a",
  "packages/validation-plugin/src/validators/routes.ts": "429eeaab9121",
  "packages/validation-plugin/src/validators/state.ts": "acf9cb3e010e",
  "packages/vue/src/composables/useRouteEnter.ts": "1f43b0061665",
  "packages/vue/src/composables/useRouteExit.ts": "117882e62801",
  "shared/browser-env/plugin-utils.ts": "ace42f4bfec2",
  "shared/browser-env/popstate-handler.ts": "5649c37238fc",
  "shared/browser-env/popstate-utils.ts": "0c17b3814781",
  "shared/browser-env/state-guard.ts": "1652a532e24b",
  "shared/browser-env/url-parsing.ts": "2278f35d46d8",
  "shared/browser-env/utils.ts": "c53a8ecaf15b",
  "shared/browser-env/validation.ts": "d2e3bf73b84b",
  "shared/dom-utils/link-utils.ts": "71579bbbae52",
  "shared/dom-utils/scroll-restore.ts": "f7e27ecb9bb4",
  "shared/ssr/createLoadersValidator.ts": "30a7ee02991e",
  "shared/ssr/createSsrLoaderPlugin.ts": "d6bfc82577e8",
  "shared/ssr/defer.ts": "358140831f69",
  "shared/ssr/deferWireFormat.ts": "b07ec747d67c",
  "shared/ssr/errors.ts": "287b321d70fd",
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
    // ⚠ **The counts live in the assertions below, not in this prose.** An
    // unbound number inside the cell that exists to bind numbers is the very
    // class this file is about.
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
    "CLAUDE.md": "c09476ae2e02",
    "IMPLEMENTATION_NOTES.md": "351cadba54c0",
    "packages/browser-plugin/CLAUDE.md": "097ec3f7ea70",
    "packages/browser-plugin/INVARIANTS.md": "407e3b75ce2f",
    "packages/core/ARCHITECTURE.md": "af035148266d",
    "packages/core/CLAUDE.md": "884b82e79620",
    "packages/core/INVARIANTS.md": "6ea5ed72a261",
    "packages/core/README.md": "a871e986236e",
    "packages/core/src/channels/CLAUDE.md": "40d9743e403c",
    "packages/core/src/channels/README.md": "46ed6a9d3b1d",
    "packages/core/src/engine/CLAUDE.md": "b2456029819b",
    "packages/core/src/engine/INVARIANTS.md": "89abc87070e2",
    "packages/core/src/engine/README.md": "46ed6a9d3b1d",
    "packages/core/src/namespaces/NavigationNamespace/CLAUDE.md":
      "1ec9dff9677a",
    "packages/core/src/namespaces/RoutesNamespace/CLAUDE.md": "50297a0cf34c",
    "packages/core/src/pipeline/CLAUDE.md": "905550ee1d36",
    "packages/core/src/pipeline/README.md": "46ed6a9d3b1d",
    "packages/core/src/utils/fsm/ARCHITECTURE.md": "168bf4aea55c",
    "packages/core/src/utils/fsm/CLAUDE.md": "7f4e1d3e9edf",
    "packages/core/src/utils/logger/INVARIANTS.md": "af432506a5f7",
    "packages/hash-plugin/CLAUDE.md": "097ec3f7ea70",
    "packages/persistent-params-plugin/CLAUDE.md": "9f76564697cc",
    "packages/rsc-server-plugin/CLAUDE.md": "bf1d91f6f3f6",
    "packages/rx/ARCHITECTURE.md": "372e8687f84f",
    "packages/rx/CLAUDE.md": "9e6bf490ea58",
    "packages/search-schema-plugin/ARCHITECTURE.md": "3a1709bc2092",
    "packages/ssr-data-plugin/CLAUDE.md": "02170ee9cccb",
    "packages/ssr-utils/ARCHITECTURE.md": "673f077f6b9f",
    "packages/ssr-utils/CLAUDE.md": "b39e80742926",
    "packages/validation-plugin/CLAUDE.md": "74701b2ed45b",
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

  it("CONTROL — the hash covers the whole claim, not the marker line (#2120)", () => {
    const digest = (parts: readonly string[]): string =>
      createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 12);
    const markersIn = (text: string): string[] =>
      text.split("\n").filter((line) => /[⚠⚑]/.test(line));

    const file = "packages/core/src/limits.ts";
    const paragraphs = claimParagraphs(file);

    // Positive control: the ledger really is keyed on paragraphs, and this
    // file's claims really do wrap — a single-line corpus would make the
    // arms below pass while proving nothing.
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.some((claim) => claim.includes("\n"))).toBe(true);
    expect(digest(paragraphs)).toBe(VERIFIED[file]);

    // Synthetic, so the cell does not depend on which real file happens to
    // wrap where.
    const marker = " * ⚠ A claim whose argument continues below, and the";
    const before = [
      marker,
      " * continuation carries the issue reference (#1).",
    ];
    const after = [marker, " * continuation now says something else entirely."];

    // What the ledger keys on today: the rewrite moves it.
    expect(digest([before.join("\n")])).not.toBe(digest([after.join("\n")]));

    // What it keyed on before #2120: the marker line, IDENTICAL across the
    // rewrite. This arm is the blindness itself, kept as a cell so a
    // regression to line-keying cannot pass quietly.
    expect(markersIn(before.join("\n"))).toStrictEqual(
      markersIn(after.join("\n")),
    );

    // The older guarantee is not traded away: a changed MARKER still moves it.
    expect(digest([before.join("\n")])).not.toBe(
      digest([[" * ⚠ A different claim entirely.", before[1]].join("\n")]),
    );
  });
});
