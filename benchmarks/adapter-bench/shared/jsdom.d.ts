/** Minimal ambient typing — jsdom ships no types; the PoC uses two members. */
declare module "jsdom" {
  export class JSDOM {
    constructor(
      html?: string,
      options?: { url?: string; pretendToBeVisual?: boolean },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window: any;
  }
}
