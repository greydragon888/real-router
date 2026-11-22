import { describe, expect, it, vi } from "vitest";

import {
  LoaderNotFound,
  LoaderRedirect,
  LoaderTimeout,
  withTimeout,
} from "@real-router/ssr-utils";

import type * as SsrUtils from "@real-router/ssr-utils";

/**
 * The loader errors and `withTimeout` (#598, #2977).
 *
 * `instanceof` against each class admits a value that carries the class's mark,
 * besides what the prototype chain admits, so it holds between copies of this
 * package. A copy here is one more evaluation of the package, made with
 * `vi.resetModules()`; the smoke test of the packed packages holds the same
 * between the ESM and CJS builds.
 */

type Package = typeof SsrUtils;

type Family = Pick<
  Package,
  "LoaderNotFound" | "LoaderRedirect" | "LoaderTimeout"
>;

/** One evaluation of the package, apart from every other. */
const loadCopy = async (): Promise<Package> => {
  vi.resetModules();

  return import("@real-router/ssr-utils");
};

const FAMILY = [
  {
    name: "LoaderRedirect",
    code: "LOADER_REDIRECT",
    of: (copy: Family) => copy.LoaderRedirect,
    make: (copy: Family) => new copy.LoaderRedirect("/login"),
  },
  {
    name: "LoaderNotFound",
    code: "LOADER_NOT_FOUND",
    of: (copy: Family) => copy.LoaderNotFound,
    make: (copy: Family) => new copy.LoaderNotFound("product:42"),
  },
  {
    name: "LoaderTimeout",
    code: "LOADER_TIMEOUT",
    of: (copy: Family) => copy.LoaderTimeout,
    make: (copy: Family) => new copy.LoaderTimeout("users", 250),
  },
] as const;

/** The copy every other test of the package runs against. */
const THIS_COPY: Family = { LoaderNotFound, LoaderRedirect, LoaderTimeout };

describe("loader error classes", () => {
  it("LoaderRedirect defaults to status 302 and carries the target", () => {
    const err = new LoaderRedirect("/login");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("LOADER_REDIRECT");
    expect(err.name).toBe("LoaderRedirect");
    expect(err.target).toBe("/login");
    expect(err.status).toBe(302);
    expect(err.message).toBe("Redirect to /login");
  });

  it("LoaderRedirect accepts an explicit permanent-redirect status", () => {
    const err = new LoaderRedirect("/moved", 308);

    expect(err.status).toBe(308);
  });

  it("LoaderNotFound carries the missing resource and 404 code", () => {
    const err = new LoaderNotFound("product:42");

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("LOADER_NOT_FOUND");
    expect(err.name).toBe("LoaderNotFound");
    expect(err.resource).toBe("product:42");
    expect(err.message).toBe("Resource not found: product:42");
  });

  it("LoaderTimeout carries the route and the deadline", () => {
    const err = new LoaderTimeout("users", 250);

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("LOADER_TIMEOUT");
    expect(err.name).toBe("LoaderTimeout");
    expect(err.route).toBe("users");
    expect(err.ms).toBe(250);
    expect(err.message).toBe('Loader for "users" exceeded 250ms');
  });
});

describe("instanceof between two copies of the package (#2977)", async () => {
  const one = await loadCopy();
  const two = await loadCopy();

  it("CONTROL — the copies hold different classes, and the prototype chain tells them apart", () => {
    for (const member of FAMILY) {
      expect(member.of(one)).not.toBe(member.of(two));
      expect(
        Object.prototype.isPrototypeOf.call(
          member.of(two).prototype,
          member.make(one),
        ),
      ).toBe(false);
    }
  });

  it.each(FAMILY)(
    "$name of either copy is an instance of the other copy's $name",
    (member) => {
      expect(member.make(one)).toBeInstanceOf(member.of(two));
      expect(member.make(two)).toBeInstanceOf(member.of(one));
    },
  );

  it.each(FAMILY)(
    "$name is an instance of no other class of the family, in either copy",
    (member) => {
      for (const other of FAMILY) {
        if (other === member) {
          continue;
        }

        expect(member.make(one)).not.toBeInstanceOf(other.of(one));
        expect(member.make(one)).not.toBeInstanceOf(other.of(two));
      }
    },
  );

  it.each(FAMILY)(
    "a plain Error, an object with the $code code and no mark, and a primitive are not a $name",
    (member) => {
      const family = member.of(one);

      expect(new Error("x")).not.toBeInstanceOf(family);
      expect({ code: member.code }).not.toBeInstanceOf(family);
      expect(null).not.toBeInstanceOf(family);
      expect(member.code).not.toBeInstanceOf(family);
    },
  );

  it.each(FAMILY)(
    "a $name built on the class's prototype without its constructor is an instance in its own copy alone",
    (member) => {
      const revived: object = Object.assign(
        Object.create(member.of(one).prototype) as object,
        { code: member.code },
      );

      expect(revived).toBeInstanceOf(member.of(one));
      expect(revived).not.toBeInstanceOf(member.of(two));
    },
  );

  it("an application's subclass does not admit an instance of the class it extends", () => {
    class ProductNotFound extends one.LoaderNotFound {
      readonly page = "products";
    }

    expect(new one.LoaderNotFound("x")).not.toBeInstanceOf(ProductNotFound);
    expect(new two.LoaderNotFound("x")).not.toBeInstanceOf(ProductNotFound);
    expect(new ProductNotFound("x")).toBeInstanceOf(ProductNotFound);
  });

  it("an instance of an application's subclass is an instance of the class it extends, in either copy", () => {
    class ProductNotFound extends one.LoaderNotFound {}

    expect(new ProductNotFound("x")).toBeInstanceOf(one.LoaderNotFound);
    expect(new ProductNotFound("x")).toBeInstanceOf(two.LoaderNotFound);
    expect(new ProductNotFound("x")).not.toBeInstanceOf(two.LoaderRedirect);
  });

  it("withTimeout of either copy rejects with an instance of the other copy's LoaderTimeout", async () => {
    for (const [from, to] of [
      [one, two],
      [two, one],
    ] as const) {
      const reason: unknown = await from
        .withTimeout("slow", 1, () => new Promise<never>(() => {}))
        .catch((error: unknown) => error);

      expect(reason).toBeInstanceOf(to.LoaderTimeout);
    }
  });
});

describe("the mark is the contract between versions (#2977)", () => {
  it.each(FAMILY)(
    "a $name carries its code under the pinned key, as a hidden own property",
    (member) => {
      expect(
        Object.getOwnPropertyDescriptor(
          member.make(THIS_COPY),
          Symbol.for("@real-router/ssr-utils/loader-error"),
        ),
      ).toStrictEqual({
        value: member.code,
        writable: false,
        enumerable: false,
        configurable: false,
      });
    },
  );

  it.each(FAMILY)(
    "an error another version marked with the same key and code is a $name",
    (member) => {
      const foreign: object = Object.defineProperty(
        new Error("from another version"),
        Symbol.for("@real-router/ssr-utils/loader-error"),
        { value: member.code },
      );

      expect(foreign).toBeInstanceOf(member.of(THIS_COPY));
    },
  );
});

describe("withTimeout (#598)", () => {
  it("invokes the loader with { signal: AbortSignal }", async () => {
    let received: AbortSignal | undefined;

    const value = await withTimeout("r", 1000, ({ signal }) => {
      received = signal;

      return Promise.resolve(42);
    });

    expect(value).toBe(42);
    expect(received).toBeInstanceOf(AbortSignal);
    expect(received?.aborted).toBe(false);
  });

  it("aborts the signal before the race rejects on timeout, with the rejection as its reason", async () => {
    const abortSpy = vi.fn();
    let signalRef: AbortSignal | undefined;

    const promise = withTimeout(
      "slow",
      20,
      ({ signal }) =>
        new Promise<never>((_, reject) => {
          signalRef = signal;
          signal.addEventListener("abort", () => {
            abortSpy();
            reject(new Error("loader-saw-abort"));
          });
        }),
    );

    await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);

    const rejection: unknown = await promise.catch((error: unknown) => error);

    expect(abortSpy).toHaveBeenCalledTimes(1);
    // Pin signalRef to a real AbortSignal first: without this, a regression
    // where the loader never sees `{ signal }` (signalRef stays undefined)
    // would still pass the `?.aborted === true` short-circuit (`undefined`
    // would just stay falsy and the assertion never asks for `true`).
    expect(signalRef).toBeInstanceOf(AbortSignal);
    expect(signalRef!.aborted).toBe(true);
    expect(signalRef!.reason).toBe(rejection);
  });

  it("fail-fasts when upstreamSignal is already aborted (no loader, no timer)", async () => {
    vi.useFakeTimers();
    try {
      const upstream = new AbortController();

      upstream.abort(new Error("pre-aborted"));

      const loaderSpy = vi.fn();

      await expect(
        withTimeout("r", 1000, loaderSpy, {
          upstreamSignal: upstream.signal,
        }),
      ).rejects.toThrow("pre-aborted");

      expect(loaderSpy).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to a fresh AbortError when an aborted upstream has no reason", async () => {
    // A duck-typed `{ aborted: true, reason: undefined }` cast to
    // `AbortSignal` carries no reason; a platform signal reaches the same
    // fallback through `abort(null)` (next cell).
    const bareAbortedSignal = {
      aborted: true,
      reason: undefined,
    } as unknown as AbortSignal;

    const loader = vi.fn();

    await expect(
      withTimeout("users", 50, loader, {
        upstreamSignal: bareAbortedSignal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("falls back to a fresh AbortError when the upstream was aborted with a null reason", async () => {
    const upstream = new AbortController();

    upstream.abort(null);

    const loader = vi.fn();

    await expect(
      withTimeout("users", 50, loader, { upstreamSignal: upstream.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(loader).not.toHaveBeenCalled();
  });

  it.each([0, "", false])(
    "rejects with a falsy upstream reason (%j) as is",
    async (reason) => {
      const upstream = new AbortController();

      upstream.abort(reason);

      await expect(
        withTimeout("users", 50, vi.fn(), { upstreamSignal: upstream.signal }),
      ).rejects.toBe(reason);
    },
  );

  it("upstream wins composed race (rejects with loader's error, not LoaderTimeout)", async () => {
    const upstream = new AbortController();

    const promise = withTimeout(
      "r",
      5000,
      ({ signal }) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("aborted-by-upstream", "AbortError"));
          });
        }),
      { upstreamSignal: upstream.signal },
    );

    setTimeout(() => {
      upstream.abort();
    }, 20);

    await expect(promise).rejects.toMatchObject({
      name: "AbortError",
      message: "aborted-by-upstream",
    });
  });

  it("timeout wins composed race (LoaderTimeout) when upstream stays alive", async () => {
    const upstream = new AbortController();

    const promise = withTimeout(
      "r",
      20,
      ({ signal }) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => {
            reject(new Error("loader-saw-abort"));
          });
        }),
      { upstreamSignal: upstream.signal },
    );

    await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);
    expect(upstream.signal.aborted).toBe(false);
  });

  it("clears the timer when the loader settles early (no setTimeout leak)", async () => {
    vi.useFakeTimers();
    try {
      let timersAfterSettle = -1;

      const promise = withTimeout("r", 10_000, () => Promise.resolve("ok"));

      await promise.then(() => {
        timersAfterSettle = vi.getTimerCount();
      });

      expect(timersAfterSettle).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not produce unhandledRejection when the loader settles late", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);

    process.on("unhandledRejection", onUnhandled);

    try {
      const promise = withTimeout(
        "r",
        20,
        () =>
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error("late-loader-rejection"));
            }, 100);
          }),
      );

      await expect(promise).rejects.toBeInstanceOf(LoaderTimeout);

      // Wait long enough for the loader's late rejection to settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
