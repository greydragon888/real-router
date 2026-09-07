---
"@real-router/core": patch
---

Drop dead re-exports from the intermediate barrels (#2150)

Internal refactor with no published API change: the intermediate `index.ts` /
`types.ts` barrels under `src/engine`, `src/namespaces`, `src/pipeline` and
`src/utils` re-exported 46 symbols that every consumer already reaches by
another path. `knip` 6.28.0 stopped hiding them behind
`ignoreExportsUsedInFile`, and they are removed rather than suppressed. The
package entry's export list is unchanged.
