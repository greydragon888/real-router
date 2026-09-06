// Census-completeness probe: `RouterError.constructor·options` is censused; the
// two mutators on the same public class — `setAdditionalFields(fields)` (a
// caller bag walked by objectEntries + putField) and `setErrorInstance(err)`
// (three named reads off the caller's Error, `cause` kept by reference) — are
// separate entry points with no id.
import { RouterError } from "@real-router/core";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

// CENSUSED control: constructor options bag.
const ctorBag = countingBag({ message: "hi", segment: "s", path: "/p", extra: 1 });
const err = new RouterError("X", ctorBag.bag as never);
const ctor = { reads: ctorBag.reads, extra: (err as unknown as { extra: unknown }).extra };

// setAdditionalFields
const fields = countingBag({ userId: "u1", role: "admin" });
err.setAdditionalFields(fields.bag as never);
const additional = {
  reads: fields.reads,
  landed: { userId: (err as unknown as { userId: unknown }).userId, role: (err as unknown as { role: unknown }).role },
};

// setErrorInstance — a caller Error whose members are accessors
const reads = { message: 0, cause: 0, stack: 0 };
const foreign = new Error("orig");
const causeLeaf = { why: "leaf" };
Object.defineProperty(foreign, "message", { get: () => { reads.message++; return "swapped"; } });
Object.defineProperty(foreign, "cause", { get: () => { reads.cause++; return causeLeaf; } });
Object.defineProperty(foreign, "stack", { get: () => { reads.stack++; return "STACK"; } });
err.setErrorInstance(foreign);
const instance = {
  reads,
  message: err.message,
  causeIsCallersLeafByReference: (err as unknown as { cause: unknown }).cause === causeLeaf,
  stack: err.stack,
};

console.log(JSON.stringify({ ctor, additional, instance }, null, 1));
