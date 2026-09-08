import type { RouterLogger } from "@real-router/core/types";

/**
 * Captured at module load: `entries`.
 *
 * ⚑ A comparison is only as honest as the intrinsic it reads WHEN IT RUNS, and
 * an application can re-point `Object.entries` after boot. This one decides
 * whether a bag MOVED, so a re-pointed reader could answer "unchanged" for a bag
 * that changed — silencing the very report this module exists to make.
 *
 * ⚠ It does NOT close a shim evaluated BEFORE this module, the ordinary polyfill
 * order. Same limit `OptionsNamespace` states for its own capture.
 */
const objectEntries = Object.entries;

const LOGGER_CTX = "router.navigateToDefault";

/** The two slots whose late mutation changes nothing and says nothing (#2148). */
const WATCHED = ["defaultParams", "defaultSearch"] as const;

type Slot = (typeof WATCHED)[number];

/**
 * A snapshot of one bag AS THE APPLICATION HANDED IT.
 *
 * ⚠ The baseline is this, never core's adopted copy. That copy is normalised —
 * `dropUnsafeKey` takes an own `__proto__` out of it on the way in (#1957) — so
 * comparing against it reports a bag nobody touched. Measured: a caller bag
 * spelling `id,__proto__,extra` becomes `id,extra` in core, which a naive
 * comparison reads as two mutations before the application has done anything.
 */
type Snapshot = ReadonlyMap<string, unknown>;

const snapshot = (bag: object): Snapshot =>
  new Map(objectEntries(bag as Record<string, unknown>));

/**
 * Did this bag move since the snapshot?
 *
 * ⚠ One level, matching adoption's own depth. A deeper walk would report a
 * change core never had a chance to take either way, and this message is about
 * what the router DID read — the level it copied.
 */
const moved = (bag: object, before: Snapshot): boolean => {
  const now = objectEntries(bag as Record<string, unknown>);

  if (now.length !== before.size) {
    return true;
  }

  return now.some(
    ([key, value]) => !before.has(key) || !Object.is(before.get(key), value),
  );
};

/**
 * Reports, once, that a defaults bag was mutated after `createRouter()`.
 *
 * ⚑ **The failure this exists for is silence.** Since #2171 core copies these
 * bags at construction, so an application that mutates one afterwards keeps
 * running and simply stops having any effect — no throw, no warning, no type
 * error. Core cannot speak here: it is the layer that degrades, and this is the
 * layer that reports (`packages/core/CLAUDE.md` › Supported Input Shapes).
 *
 * ⚠ The replacement it names is not a workaround. `defaultParams` and
 * `defaultSearch` already accept a CALLBACK, resolved at the point of use, so an
 * application that wants a live value has a supported mechanism rather than a
 * compromise.
 *
 * ⚠ ONCE per slot, and the flag is why. This runs on every
 * `navigateToDefault`, and a report that repeated would turn a real diagnostic
 * into the noise an application learns to filter.
 */
export class DefaultsMutationWatch {
  /**
   * ⚠ ONE map, not a pair keyed alike. Two maps make `before` look optional at
   * every read — a branch that cannot be taken, because both are written in the
   * same iteration, and an untakeable branch is coverage nobody can earn.
   */
  readonly #watched = new Map<
    Slot,
    { readonly ref: WeakRef<object>; readonly before: Snapshot }
  >();
  readonly #reported = new Set<Slot>();

  /**
   * ⚠ Takes the snapshot AT INSTALL, which is the earliest this layer exists.
   * A mutation between `createRouter()` and `usePlugin()` is therefore invisible
   * — and correctly so: it happened while the plugin was not there to be asked,
   * and reporting it would be a claim about a window this code never saw.
   */
  watch(origins: Readonly<Partial<Record<Slot, WeakRef<object>>>>): void {
    for (const slot of WATCHED) {
      const ref = origins[slot];
      const bag = ref?.deref();

      if (ref === undefined || bag === undefined) {
        continue;
      }

      this.#watched.set(slot, { ref, before: snapshot(bag) });
    }
  }

  check(logger: RouterLogger): void {
    for (const [slot, { ref, before }] of this.#watched) {
      if (this.#reported.has(slot)) {
        continue;
      }

      const bag = ref.deref();

      // ⚠ A collected bag is the RIGHT silence, not a missed report: the
      // application no longer holds it, so there is no mutation left to make.
      if (bag === undefined) {
        continue;
      }

      if (!moved(bag, before)) {
        continue;
      }

      this.#reported.add(slot);
      logger.warn(
        LOGGER_CTX,
        `mutating \`${slot}\` after createRouter() no longer affects routing — ` +
          `the router copied it at construction. Use the callback form ` +
          `(\`${slot}: () => ({ … })\`), which is resolved at the point of use.`,
      );
    }
  }
}
