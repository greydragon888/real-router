// packages/core/src/utils/thenable.ts

/**
 * Consumes what application code returned through a `void` slot (#2836): a
 * thenable is settled into a promise core holds, and its rejection goes to
 * `onRejected`. Answers whether `value` was a thenable.
 *
 * A THENABLE, not `Promise.prototype` (#2251): a promise from another realm, or
 * any object with a callable `then`, is consumed the same way.
 *
 * `then` is read ONCE, and the function read is the function called (#2136). A
 * `then` that throws on that read throws out of this call.
 *
 * `onRejected` never runs inside the caller's `try`: it is a reaction of the
 * promise built here, so it runs on a later microtask.
 */
export function consumeThenable(
  value: unknown,
  onRejected: (reason: unknown) => void,
): boolean {
  const then: unknown = (value as { then?: unknown } | null | undefined)?.then;

  if (typeof then !== "function") {
    return false;
  }

  new Promise<unknown>((resolve, reject) => {
    Reflect.apply(then as (...args: unknown[]) => unknown, value, [
      resolve,
      reject,
    ]);
  }).catch(onRejected);

  return true;
}
