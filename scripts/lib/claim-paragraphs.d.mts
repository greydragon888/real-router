/**
 * Types for the census parser. The implementation is plain ESM in `scripts/`
 * (repo tooling lives outside any package's `src/`), and the census test is
 * TypeScript — so the contract is declared here rather than inferred as `any`.
 */

/** Every claim in `text` as its whole paragraph, in source order. */
export function claimParagraphs(text: string, markdown: boolean): string[];

/** The 12-hex identity of one claim paragraph. */
export function hashClaim(paragraph: string): string;

/** The claim hashes of `text`, in source order. */
export function claimHashes(text: string, markdown: boolean): string[];

/** Does this path get markdown paragraph rules? */
export function isMarkdown(file: string): boolean;
