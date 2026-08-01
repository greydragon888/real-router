import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { createIsomorphicConfig } from "../../tsdown.base.js";

// Core builds in TWO PASSES, selected by `RR_DTS_PASS` and sequenced by the
// `bundle` script — never both at once, which is the whole point (see below).
//
// Pass 1 (`RR_DTS_PASS=1`) — declarations, emitted UNBUNDLED.
// Pass 2 (default)         — the bundled JS, plus publint/attw from the base.
//
// Why declarations are unbundled: plugins augment `@real-router/core/types`
// via `declare module`, and TS merges such an augmentation only when the
// resolved module is the interface's LEXICAL declaration-site — a re-export
// barrel of any form is a silent no-op (#1519). Bundled dts hoists
// `StateContext` / `NavigationOptions` into a shared chunk (the entry becomes
// exactly that barrel), silently breaking every plugin's context/options
// typing for external dist-resolving consumers (#1540, regressed by the #1520
// fold). `scripts/check-dts-augment-targets.mjs` enforces it after the bundle.
//
// Why SEQUENTIAL passes rather than one config array: tsdown runs every config
// in a single `Promise.all`, and pass 1 cannot be stopped from emitting JS for
// CJS — `emitDtsOnly` covers ESM, where declarations and JS come from one
// build, but CJS declarations are a SEPARATE build (`buildSingle`:
// `format === "cjs" && dts` pushes an extra `cjsDts` config), so the ordinary
// CJS build still runs. Both passes therefore wrote `dist/cjs/index.js` &
// friends with no ordering: last writer won, and it was usually pass 1 — the
// published CJS entries were unbundled with the real chunks orphaned beside
// them, at 334 files / 3.2 MB instead of 168 / 2.2 MB.

/**
 * Deletes the JS pass 1 emits as a side effect, leaving only declarations.
 *
 * Scoped to ONE outDir and run from that config's own `build:done`, so the
 * concurrent ESM and CJS passes never touch each other's output. It is a no-op
 * for ESM (there `emitDtsOnly` really does suppress JS), which is also why
 * matching on extension is safe rather than heuristic: the only `.js` under
 * `dist` at this point is the CJS graph being discarded — declarations are
 * `.d.ts` / `.d.mts`.
 *
 * Returns whether the directory ended up empty, so emptied directories go too.
 */
const dropStrayJs = (dir: string): boolean => {
  let empty = true;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (dropStrayJs(full)) rmSync(full, { recursive: true });
      else empty = false;
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".js.map")) {
      rmSync(full);
    } else {
      empty = false;
    }
  }

  return empty;
};

const entry = {
  index: "src/index.ts",
  types: "src/types/index.ts",
  api: "src/api/index.ts",
  validation: "src/validation.ts",
};

export default process.env.RR_DTS_PASS
  ? createIsomorphicConfig({
      custom: {
        entry,
        unbundle: true,
        dts: { sourcemap: true, emitDtsOnly: true },
        // Pass 1 owns the cleanup for the whole build — it wipes both outDirs
        // before writing, so the `bundle` script needs no `rm -rf dist`.
        // Pass 2 runs `clean: false` so it cannot wipe these declarations.
        clean: true,
        // publint/attw inspect a packed tarball; at this point `dist` has no
        // JS at all, so they belong to pass 2, which sees the finished package.
        publint: false,
        attw: false,
        hooks: {
          "build:done": ({ options }) => {
            dropStrayJs(options.outDir);
          },
        },
      },
    })
  : createIsomorphicConfig({ custom: { entry, dts: false, clean: false } });
