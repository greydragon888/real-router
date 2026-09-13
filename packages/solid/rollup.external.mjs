/**
 * The Solid bundle's `external` rule, built from its manifest: every package
 * declared as a dependency or a peer stays an import, subpaths included — the
 * rule tsdown applies to the other adapters. Rollup copies anything else into
 * `dist` without a word, so a specifier this rule misses ships that package's
 * built code (#2300).
 *
 * @param {{ dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }} manifest
 * @returns {(id: string) => boolean}
 */
export function externalFrom(manifest) {
  const declared = Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  });

  return (id) =>
    declared.some((name) => id === name || id.startsWith(`${name}/`));
}
