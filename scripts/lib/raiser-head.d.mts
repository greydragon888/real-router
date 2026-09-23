/**
 * Types for the shared raiser-head parse. The implementation is plain ESM in
 * `scripts/lib/` so the scripts and the TypeScript authorities read one copy.
 */
import type * as ts from "typescript";

/** What one `raiser(receiver, door?)` call names. */
export interface RaiserParts {
  /** The receiver, when it is a string literal. */
  readonly receiver: string | undefined;
  /** The door, when one is passed as a string literal. */
  readonly door: string | undefined;
  /** A door was passed, and it is not a string literal. */
  readonly dynamic: boolean;
}

export function raiserCallParts(call: ts.CallExpression): RaiserParts;

export function raiserBindingOf(
  node: ts.Node,
): { readonly name: string; readonly parts: RaiserParts } | undefined;

export function raiserTagOf(
  node: ts.Node,
): { readonly base: string; readonly member: string } | undefined;

export function raiserPartsAt(
  node: ts.Node,
  name: string,
): RaiserParts | undefined;
