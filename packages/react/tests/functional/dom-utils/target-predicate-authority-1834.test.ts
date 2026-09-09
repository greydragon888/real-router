import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Which call site asks the target question in which form, derived rather than
 * written down (#1834).
 *
 * The two forms are not interchangeable: the VALUE form is for sites where the
 * element is guaranteed to be an anchor — the five `<Link>` components render
 * one, Angular's directive selects `a[realLink]` — and the ELEMENT form is for
 * the three that attach to whatever the consumer wrote. A site that swaps forms
 * either asks about an element it cannot assume is an anchor, or narrows one it
 * already knows is.
 *
 * ⚠ The counts this replaces went stale inside a single branch: a round moved
 * the directives onto the element form and left three prose sentences naming
 * the old arrangement. Prose has no oracle; this does.
 */

const REPO_ROOT = path.resolve(__dirname, "../../../../..");

/** Call sites, by form. The angular copy of `shared/dom-utils` is the same
 *  source twice and would double every count. */
const callSites = (callee: string): string[] =>
  globSync("packages/*/src/**/*.{ts,tsx,svelte}", { cwd: REPO_ROOT })
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => !file.startsWith("packages/angular/src/dom-utils/"))
    .filter((file) =>
      readFileSync(path.join(REPO_ROOT, file), "utf8")
        .split("\n")
        .some(
          (line) =>
            line.includes(`${callee}(`) &&
            !line.trimStart().startsWith("*") &&
            !line.trimStart().startsWith("//") &&
            !line.includes("export function"),
        ),
    )
    .toSorted((left, right) => left.localeCompare(right));

describe("the target predicate's two forms have disjoint homes (#1834)", () => {
  const byValue = callSites("targetsAnotherContext");
  const byElement = callSites("anchorTargetsAnotherContext");

  it("the VALUE form is asked only where the element is guaranteed to be an anchor", () => {
    // `<Link>` renders the anchor; Angular's selector is `a[realLink]`.
    expect(byValue).toStrictEqual([
      "packages/angular/src/directives/RealLink.ts",
      "packages/preact/src/components/Link.tsx",
      "packages/react/src/components/Link.tsx",
      "packages/solid/src/components/Link.tsx",
      "packages/svelte/src/components/Link.svelte",
      "packages/vue/src/components/Link.ts",
    ]);
  });

  it("the ELEMENT form is asked only where the element is whatever the consumer wrote", () => {
    expect(byElement).toStrictEqual([
      "packages/solid/src/directives/link.tsx",
      "packages/svelte/src/actions/link.svelte.ts",
      "packages/vue/src/directives/vLink.ts",
    ]);
  });

  it("CONTROL — the scan finds sites at all, and no file asks both ways", () => {
    // A scan that matched nothing would satisfy both cells above only if their
    // literals were emptied too, but it would satisfy a THRESHOLD silently —
    // which is why the cells are exact lists and this cell is here.
    expect(byValue.length).toBeGreaterThan(0);
    expect(byElement.length).toBeGreaterThan(0);
    expect(byValue.filter((file) => byElement.includes(file))).toStrictEqual(
      [],
    );
  });

  it("CONTROL — every element-form home narrows by tagName, never by instanceof", () => {
    // `instanceof HTMLAnchorElement` resolves the constructor in the realm this
    // module loaded in, so a real anchor from an iframe `contentDocument` fails
    // it. The narrowing lives in `anchorTargetsAnotherContext`; a call site that
    // re-adds its own `instanceof` gate in front of it puts the defect back.
    const offenders = byElement.filter((file) =>
      readFileSync(path.join(REPO_ROOT, file), "utf8")
        .split("\n")
        .some(
          (line) =>
            line.includes("instanceof HTMLAnchorElement") &&
            line.includes("anchorTargetsAnotherContext"),
        ),
    );

    expect(offenders).toStrictEqual([]);
  });
});
