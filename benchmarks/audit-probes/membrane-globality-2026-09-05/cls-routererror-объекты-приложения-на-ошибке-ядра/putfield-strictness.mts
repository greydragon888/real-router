// Why `setAdditionalFields` on a FROZEN thrown error neither throws nor lands:
// isolate `putField` itself, in real ESM (strict). Positive control = an OPEN
// target through the same primitive.
import { putField } from "@real-router/core/utils";

const attempt = (run: () => void): string => {
  try {
    run();

    return "no throw";
  } catch (error) {
    return String(error);
  }
};

const frozenPlain = Object.freeze({} as Record<string, unknown>);

console.log(
  JSON.stringify(
    {
      probeFileIsStrict: attempt(() => {
        frozenPlain.x = 1;
      }),
      putFieldOnFrozen: attempt(() => {
        putField(frozenPlain, "x", 1);
      }),
      landedOnFrozen: Object.hasOwn(frozenPlain, "x"),
      openTargetControl: (() => {
        const o: Record<string, unknown> = {};

        putField(o, "z", 3);

        return o.z;
      })(),
    },
    null,
    1,
  ),
);
