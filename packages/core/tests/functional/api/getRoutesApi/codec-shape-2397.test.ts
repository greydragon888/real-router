import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { ParamsSearch, Route } from "@real-router/core";

/**
 * A truthy `decodeParams` / `encodeParams` is a function, and every registration
 * door refuses any other truthy value (#2397).
 *
 * ⚑ The refusal belongs at registration because the failure otherwise waits for
 * the first read of the route. Registration wraps the codec in a closure, and a
 * closure over a non-function makes `matchPath` throw and `start` reject with
 * `decode is not a function` (`encode …` for an encoder, which breaks
 * `buildPath` as well), naming neither the route nor the field. #2394 closed the
 * same hole for `forwardTo`.
 *
 * ⚠ Two values are NOT refused, and the controls pin both so the refusal cannot
 * widen into them unnoticed: a FALSY codec, which every door drops (#1797) —
 * `null` on `update` removes the codec instead — and an ASYNC codec, which bare
 * core admits and calls (#2348).
 */

type Router = ReturnType<typeof createRouter>;

type Field = "decodeParams" | "encodeParams";

type Codec = (channels: ParamsSearch) => ParamsSearch;

interface Reading {
  matched: unknown;
  built: string;
}

const FIELDS: Field[] = ["decodeParams", "encodeParams"];

const NOT_A_CODEC: [label: string, value: unknown][] = [
  ["a number", 42],
  ["an object", { x: 1 }],
  ["true", true],
  ["an array of a function", [(channels: ParamsSearch) => channels]],
  ["a symbol", Symbol("codec")],
  ["a string", "decode"],
];

/** Falsy values: every door drops them before anything is stored. */
const DROPPED: [label: string, value: unknown][] = [
  ["0", 0],
  ["false", false],
  ["NaN", Number.NaN],
  ['""', ""],
];

const messageFor = (route: string, field: Field): string =>
  `[router] Route "${route}" ${field} must be a function`;

/**
 * Codecs whose effect is visible: the decoder marks the matched `id` with
 * `mark`, the encoder marks the built one.
 */
const marking = (mark: string): Record<Field, Codec> => ({
  decodeParams: ({ params, search }) => ({
    params: { ...params, id: `${mark}${params.id as string}` },
    search,
  }),
  encodeParams: ({ params, search }) => ({
    params: { ...params, id: `${mark}${params.id as string}` },
    search,
  }),
});

/** What the route reads with {@link marking}'s codec in the field. */
const markedReading = (mark: string): Record<Field, Reading> => ({
  decodeParams: { matched: `${mark}1`, built: "/u/1" },
  encodeParams: { matched: "1", built: `/u/${mark}1` },
});

const WORKING = marking("w");

const WITH_WORKING = markedReading("w");

/**
 * The codec `update` starts from. It is not {@link WORKING}'s, so an update
 * that installs nothing reads differently from one that installs the codec.
 */
const PRIOR = marking("p");

const WITH_PRIOR = markedReading("p");

/** What the route reads: the matched `id` and the built path. */
const read = (router: Router): Reading => ({
  matched: getPluginApi(router).matchPath("/u/1")?.params.id,
  built: router.buildPath("u", { id: "1" }),
});

const PLAIN: Reading = { matched: "1", built: "/u/1" };

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

const home: Route = { name: "home", path: "/" };

const withCodec = (field: Field, value: unknown): Route => ({
  name: "u",
  path: "/u/:id",
  [field]: value,
});

/**
 * A door, and the reading the route gives before the door is asked. `update`
 * runs on a route that already carries {@link PRIOR}'s codec, so a refused or
 * dropped value shows up as that codec surviving.
 */
type Door = [
  name: string,
  register: (field: Field, value: unknown) => Router,
  prior: (field: Field) => Reading,
];

const DOORS: Door[] = [
  [
    "createRouter",
    (field, value) => createRouter([home, withCodec(field, value)]),
    () => PLAIN,
  ],
  [
    "add",
    (field, value) => {
      const router = createRouter([home]);

      getRoutesApi(router).add(withCodec(field, value));

      return router;
    },
    () => PLAIN,
  ],
  [
    "replace",
    (field, value) => {
      const router = createRouter([home, { name: "u", path: "/u/:id" }]);

      getRoutesApi(router).replace([home, withCodec(field, value)]);

      return router;
    },
    () => PLAIN,
  ],
  [
    "update",
    (field, value) => {
      const router = createRouter([home, withCodec(field, PRIOR[field])]);

      getRoutesApi(router).update("u", { [field]: value });

      return router;
    },
    (field) => WITH_PRIOR[field],
  ],
];

describe("decodeParams / encodeParams are functions at every registration door (#2397)", () => {
  describe.each(DOORS)("%s", (_door, register, prior) => {
    describe.each(FIELDS)("%s", (field) => {
      it.each(NOT_A_CODEC)("refuses %s", (_label, value) => {
        const error = thrown(() => register(field, value));

        expect(error).toBeInstanceOf(TypeError);
        expect((error as Error).message).toBe(messageFor("u", field));
      });

      it("CONTROL — admits a function, and the codec runs", () => {
        expect(read(register(field, WORKING[field]))).toStrictEqual(
          WITH_WORKING[field],
        );
      });

      it("CONTROL — admits an async function, and calls it (#2348 owns its result)", () => {
        // A NATIVE async function: `vi.fn(async …)` is a plain function that
        // returns a promise, and a check on `constructor.name` passes it.
        const calls: ParamsSearch[] = [];
        const codec = async (channels: ParamsSearch): Promise<ParamsSearch> => {
          calls.push(channels);

          return channels;
        };
        const router = register(field, codec);

        thrown(() => read(router));

        expect(codec.constructor.name).toBe("AsyncFunction");
        expect(calls).not.toHaveLength(0);
      });

      it.each(DROPPED)(
        "CONTROL — drops the falsy %s instead of refusing it",
        (_label, value) => {
          expect(read(register(field, value))).toStrictEqual(prior(field));
        },
      );
    });
  });

  it("the table reaches every door, field and value", () => {
    // Anti-vacuum: an emptied table registers no cell and passes silently.
    expect(DOORS).toHaveLength(4);
    expect(FIELDS).toHaveLength(2);
    expect(NOT_A_CODEC).toHaveLength(6);
    expect(DROPPED).toHaveLength(4);
    expect(DOORS.map(([name]) => name)).toStrictEqual([
      "createRouter",
      "add",
      "replace",
      "update",
    ]);

    // The readings differ, so a control comparing against any of them can fail.
    for (const field of FIELDS) {
      expect(WITH_WORKING[field]).not.toStrictEqual(PLAIN);
      expect(WITH_WORKING[field]).not.toStrictEqual(WITH_PRIOR[field]);
    }
  });

  it.each(FIELDS)(
    "names the full dotted route of a nested definition: %s",
    (field) => {
      const child = withCodec(field, 42);
      const expected = messageFor("p.u", field);

      expect(
        (
          thrown(() =>
            createRouter([{ name: "p", path: "/p", children: [child] }]),
          ) as Error
        ).message,
      ).toBe(expected);
      expect(
        (
          thrown(() => {
            getRoutesApi(createRouter([{ name: "p", path: "/p" }])).add(
              [child],
              { parent: "p" },
            );
          }) as Error
        ).message,
      ).toBe(expected);
      expect(
        (
          thrown(() => {
            getRoutesApi(
              createRouter([
                {
                  name: "p",
                  path: "/p",
                  children: [{ name: "u", path: "/u/:id" }],
                },
              ]),
            ).update("p.u", { [field]: 42 });
          }) as Error
        ).message,
      ).toBe(expected);
    },
  );

  it.each(FIELDS)(
    "refuses %s before warning that a forward overrides the route's guard",
    (field) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const guarded = (value: unknown): Route[] => [
        home,
        {
          name: "r",
          path: "/r",
          forwardTo: "home",
          canActivate: () => () => true,
          [field]: value,
        },
      ];

      try {
        // CONTROL — the warning reaches this spy for a route that registers.
        createRouter(guarded(WORKING[field]));

        expect(warn).toHaveBeenCalledTimes(1);

        warn.mockClear();

        expect(thrown(() => createRouter(guarded(42)))).toBeInstanceOf(
          TypeError,
        );
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each(FIELDS)(
    "refuses %s before `forwardTo`, on the build path and on `update`",
    (field) => {
      const onBuild = (fields: object): unknown =>
        thrown(() =>
          createRouter([home, { name: "u", path: "/u/:id", ...fields }]),
        );
      const onUpdate = (fields: object): unknown =>
        thrown(() => {
          getRoutesApi(
            createRouter([home, { name: "u", path: "/u/:id" }]),
          ).update("u", fields);
        });

      for (const door of [onBuild, onUpdate]) {
        // CONTROL — `forwardTo: 42` alone is refused too, so which of the two
        // refusals wins is observable.
        expect((door({ forwardTo: 42 }) as Error).message).toContain(
          "forwardTo must be a string or function",
        );
        expect((door({ forwardTo: 42, [field]: 42 }) as Error).message).toBe(
          messageFor("u", field),
        );
      }
    },
  );

  it("names the encoder first when both codecs are wrong, at every door", () => {
    const both = {
      name: "u",
      path: "/u/:id",
      decodeParams: 42,
      encodeParams: 42,
    } as unknown as Route;
    const expected = messageFor("u", "encodeParams");

    expect((thrown(() => createRouter([home, both])) as Error).message).toBe(
      expected,
    );
    expect(
      (
        thrown(() => {
          getRoutesApi(createRouter([home])).add(both);
        }) as Error
      ).message,
    ).toBe(expected);
    expect(
      (
        thrown(() => {
          getRoutesApi(
            createRouter([home, { name: "u", path: "/u/:id" }]),
          ).replace([home, both]);
        }) as Error
      ).message,
    ).toBe(expected);
    expect(
      (
        thrown(() => {
          getRoutesApi(
            createRouter([home, { name: "u", path: "/u/:id" }]),
          ).update("u", { decodeParams: 42, encodeParams: 42 } as never);
        }) as Error
      ).message,
    ).toBe(expected);
  });

  describe.each(FIELDS)("update refusing %s", (field) => {
    it.each(NOT_A_CODEC)(
      "leaves the route as it was when refusing %s",
      (_label, value) => {
        const router = createRouter([home, withCodec(field, WORKING[field])]);
        const routes = getRoutesApi(router);

        routes.update("u", { label: "before" } as never);

        expect(
          thrown(() => {
            routes.update("u", { [field]: value, label: "after" } as never);
          }),
        ).toBeInstanceOf(TypeError);

        expect(read(router)).toStrictEqual(WITH_WORKING[field]);
        expect(getPluginApi(router).getRouteConfig("u")).toStrictEqual({
          label: "before",
        });
      },
    );

    it("CONTROL — null still removes the codec", () => {
      const router = createRouter([home, withCodec(field, WORKING[field])]);

      expect(read(router)).toStrictEqual(WITH_WORKING[field]);

      getRoutesApi(router).update("u", { [field]: null });

      expect(read(router)).toStrictEqual(PLAIN);
    });
  });
});
