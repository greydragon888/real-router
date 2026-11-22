// loader-error-identity.mjs — checks the loader errors of
// `@real-router/ssr-utils`, and `instanceof` of them, across the modules that
// load them.
//
// The smoke test (`scripts/smoke-test-packages.sh`, Phase 4) loads the loader
// errors from several places of one consumer — the package and the `./errors`
// subpath of each SSR plugin, each through `import` and through `require`, one
// plugin under a second copy of the package — and hands them to
// `loaderErrorFailures`. `scripts/tests/loader-error-identity.test.mjs` holds
// each line it reports.

/** The exports of `errors.ts` in `@real-router/ssr-utils`, each a function. */
export const NAMES = [
  "LoaderNotFound",
  "LoaderRedirect",
  "LoaderTimeout",
  "withTimeout",
];

/** The classes of the family, each with arguments its constructor takes. */
const FAMILY = [
  ["LoaderNotFound", ["product:42"]],
  ["LoaderRedirect", ["/login"]],
  ["LoaderTimeout", ["users", 250]],
];

/**
 * @typedef {object} Place
 * @property {string} label  where the module came from, as a failure names it
 * @property {Record<string, any>} module  what the place exports
 */

/**
 * What goes wrong with the loader errors among the places.
 *
 * Every place exports each of `NAMES`; a place that lacks one is reported, and
 * then nothing else is judged. Every instance of a class passes `instanceof`
 * against that class of every place, a subclass's instance too, and fails it
 * against every other class of the family; a subclass admits its own instances
 * and no instance of the class it extends; an `Error` and an object with the
 * class's `code` are no instance; `withTimeout` of every place rejects with an
 * instance of `LoaderTimeout` of every place.
 *
 * @param {Place[]} places  two or more
 * @param {{ distinct: number, settleMs?: number }} expected  `distinct` is how
 *   many different `LoaderTimeout` classes the places hold, so a place that
 *   loads another copy than the one it names fails rather than compares a
 *   class with itself; `settleMs` is how long a `withTimeout` gets to reject
 * @returns {Promise<string[]>} one line per failure, none when all of it holds
 */
export async function loaderErrorFailures(
  places,
  { distinct, settleMs = 5000 },
) {
  if (places.length < 2) {
    throw new Error(
      `loaderErrorFailures compares two places or more, and got ${places.length}`,
    );
  }
  if (!Number.isInteger(distinct) || distinct < 1) {
    throw new Error(
      `loaderErrorFailures needs the number of distinct classes, and got ${String(distinct)}`,
    );
  }

  const missing = places.flatMap(({ label, module }) =>
    NAMES.filter((name) => typeof module[name] !== "function").map(
      (name) => `${label}: no ${name}`,
    ),
  );
  if (missing.length > 0) {
    return missing;
  }

  /** @type {string[]} */
  const failures = [];
  const held = new Set(places.map(({ module }) => module.LoaderTimeout)).size;
  if (held !== distinct) {
    failures.push(
      `expected ${distinct} different LoaderTimeout classes among the places, found ${held}`,
    );
  }

  for (const a of places) {
    for (const [name, args] of FAMILY) {
      const Class = a.module[name];
      const instance = new Class(...args);
      class Subclass extends Class {}
      const ofSubclass = new Subclass(...args);

      if (!(ofSubclass instanceof Subclass)) {
        failures.push(
          `an instance of a subclass of ${name} of ${a.label} is not an instance of that subclass`,
        );
      }
      if (new Error(name) instanceof Class) {
        failures.push(`an Error is an instance of ${name} of ${a.label}`);
      }
      if ({ code: instance.code } instanceof Class) {
        failures.push(
          `an object with the code ${instance.code} is an instance of ${name} of ${a.label}`,
        );
      }

      for (const b of places) {
        if (!(instance instanceof b.module[name])) {
          failures.push(
            `${name} of ${a.label} is not an instance of ${name} of ${b.label}`,
          );
        }
        if (!(ofSubclass instanceof b.module[name])) {
          failures.push(
            `an instance of a subclass of ${name} of ${a.label} is not an instance of ${name} of ${b.label}`,
          );
        }
        if (new b.module[name](...args) instanceof Subclass) {
          failures.push(
            `${name} of ${b.label} is an instance of a subclass of ${name} of ${a.label}`,
          );
        }
        for (const [other] of FAMILY) {
          if (other !== name && instance instanceof b.module[other]) {
            failures.push(
              `${name} of ${a.label} is an instance of ${other} of ${b.label}`,
            );
          }
        }
      }
    }
  }

  for (const a of places) {
    const settled = await rejection(
      a.module.withTimeout("smoke", 1, () => new Promise(() => {})),
      settleMs,
    );
    if (settled === undefined) {
      failures.push(
        `withTimeout of ${a.label} has not rejected in ${settleMs} ms`,
      );
      continue;
    }
    for (const b of places) {
      if (!(settled.reason instanceof b.module.LoaderTimeout)) {
        failures.push(
          `withTimeout of ${a.label} rejects with no instance of LoaderTimeout of ${b.label}`,
        );
      }
    }
  }

  return failures;
}

/**
 * The reason `value` rejects with inside `ms`; `undefined` when it fulfils or
 * stays pending.
 *
 * @param {unknown} value
 * @param {number} ms
 * @returns {Promise<{ reason: unknown } | undefined>}
 */
async function rejection(value, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(value).then(
        () => undefined,
        (reason) => ({ reason }),
      ),
      new Promise((resolve) => {
        timer = setTimeout(resolve, ms, undefined);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
