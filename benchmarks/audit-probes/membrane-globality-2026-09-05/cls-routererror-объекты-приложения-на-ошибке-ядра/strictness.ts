// Strictness control for the family matrix: is the probe running core's writes
// in STRICT mode? A silent no-op on a frozen target and a thrown TypeError are
// the same code under different modes, so every P3/P4 line that reports "no
// throw" needs this control before it can be read.
//
// Three arms:
//   1. the probe file's own strictness (a sloppy-mode assignment to a frozen
//      object is silent; strict throws) — this file is ESM;
//   2. core's strictness, exercised through `RouterError.setAdditionalFields`
//      on a frozen instance (the write goes through `utils/ingest.ts · putField`);
//   3. core's strictness, exercised through `RouterError.setErrorInstance`
//      (plain assignment in `RouterError.ts`).
import { RouterError } from "@real-router/core";

const out: Record<string, unknown> = {};
const rd = (o: object, k: string): unknown => (o as Record<string, unknown>)[k];

// 1. this file
{
  const frozen = Object.freeze({} as Record<string, unknown>);
  let threw: string | null = null;

  try {
    frozen.x = 1;
  } catch (error) {
    threw = String(error);
  }

  out.probeFileStrict = { threw, landed: Object.hasOwn(frozen, "x") };
}

// 2. core's putField on a frozen target — POSITIVE CONTROL first: the same call
//    on an UNFROZEN instance must land the field.
{
  const warm = new RouterError("CTRL");

  warm.setAdditionalFields({ note: "warm" });

  const frozenErr = Object.freeze(new RouterError("FROZEN"));
  let threw: string | null = null;

  try {
    frozenErr.setAdditionalFields({ note: "cold" });
  } catch (error) {
    threw = String(error);
  }

  out.putFieldOnFrozen = {
    control: rd(warm, "note"),
    threw,
    landed: Object.hasOwn(frozenErr, "note"),
  };
}

// 3. plain assignment in RouterError.ts on a frozen target
{
  const frozenErr = Object.freeze(new RouterError("FROZEN2"));
  let threw: string | null = null;

  try {
    frozenErr.setErrorInstance(new Error("late"));
  } catch (error) {
    threw = String(error);
  }

  out.assignmentOnFrozen = { threw, message: frozenErr.message };
}

console.log(JSON.stringify(out, null, 1));
